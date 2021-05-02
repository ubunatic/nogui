// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

const { Gtk, Gdk, Gio } = imports.gi

// setup polyfills based on Gtk version
const poly = require('./poly').getPoly()

// use webpack `require` for all (local) imports
const md2pango   = require('md2pango')
const json5      = require('json5')
const binding    = require('./binding')
const expr       = require('./expr')
const logging    = require('./logging')
const styling    = require('./styling.js')
const system     = require('./system')
const dialog     = require('./dialog')
const controller = require('./controller')

const { toPath, toPathArray, fileExt, readFile } = system
const { gtkToNoguiResponseCode, RESPONSE_TYPE } = dialog
const { Controller } = controller
const { Bindable }   = binding

// styling shortcuts and functions
const { CENTER, FILL, Options, add, css } = styling
const { V, H } = Options

// setup logging
const logger = logging.getLogger('nogui')
const { log, debug } = logger
logger.connect(l => poly.log_level = l)

// formatters for external content
const defaultFormatters = {
    md: { format: (s) => md2pango.convert(s) }
}

const items = (o) => Object.keys(o).map((k) => [k, o[k]])
const str = logging.str

function loadDialogFile(file, formatter=null) {
    let text = readFile(file)
    if (formatter != null) text = formatter.format(text)
    return text
}

function ensureBindable(data, ...labels) {
    if (data instanceof binding.Bindable) {
        // debug(`ensureBindable[${labels.join(', ')}](${str(data)})`)
    } else {
        throw new Error(`[${labels.join(', ')}]data model is broken , expected Bindable, got ${str(data)}`)
    }
    return data
}

function isLiteral(o) {
    const T = typeof o
    if (T == 'string')  return true
    if (T == 'number')  return true
    if (T == 'boolean') return true
    return false
}

/** Spec defines a user interface */
var Spec = class Spec {
    static from_path(p) {
        // return new Spec(eval(readFile(p)))
        let str = readFile(p)
        if (p.endsWith('.js')) str = str.replace(/^module\.exports = \{$/m, '{')
        return new Spec(json5.parse(str))
    }
    /** @param {Object} spec - defines the UI as plain JS object */
    constructor({icons={}, dialogs={}, views={}, parts={}, main="main", path="."}={}) {
        this.icons   = icons
        this.dialogs = dialogs
        this.views   = views
        this.parts   = parts
        this.main    = main
        this.path    = path
    }
}

var Builder = class Builder {
    /**
        Builder allows building a widget tree from a nogui spec.

        @param {Controller}  controller  - controller for the UI
        @param {Bindable}    data        - bindable data model
        @param {Spec|string} spec        - the nogui Spec or path to the spec file
        @param {string}      path        - path prefix used for all referenced gui resources (icons, docs, etc.)
        @param {Object}      formatters  - named formatters that will be used to format text and documents
    */
    constructor(spec, controller, data, path='.', formatters=defaultFormatters) {
        this.controller = controller
        this.data = ensureBindable(data, 'builder')
        this.spec = (typeof spec == 'string')? Spec.from_path(spec) : new Spec(spec)
        this.path = path
        this.formatters = formatters
        this.icons = null
        this.dialogs = null
        this.views = null
        this.done = false
    }

    build() {
        if (this.done) throw new Error('cannot build Widget tree more than once')
        log(`building widgets from ${str(this.spec)} with asset path ${this.path}`)
        this.buildIcons()
        this.buildDialogs()
        this.buildViews()
        if (this.controller != null) {
            this.controller.addDialogs(this.dialogs)
        }
        this.done = true
        return this
    }

    buildIcons() {
        const {spec, path} = this
        // allow finding icons by name
        poly.addIconPath(path)

        this.icons = items(spec.icons).map(([k,spec]) => {
            const str = JSON.stringify(spec)
            let img
            let opt
            if (spec.name) {
                opt = { icon_name: spec.name, use_fallback: true }
                img = new Gtk.Image(opt)
            }
            else if (spec.file) {
                let icon_path = toPath(path, ...toPathArray(spec.file))
                debug(`load icon: ${str} from ${icon_path}`)
                const gicon = Gio.FileIcon.new(Gio.File.new_for_path(icon_path))
                opt = {gicon: gicon, use_fallback: true}
                img = new Gtk.Image(opt)
            }
            if (img == null) {
                opt = { icon_name: "image-missing", use_fallback: true}
                img = Gtk.Image(opt)
                logError(new Error(`failed to load icon ${k}: ${str}`), 'using placeholder')
            } else {
                debug(`loaded icon ${k}: ${str}`)
            }
            return {name:k, img, opt, spec}
        })
    }

    buildDialogs() {
        const {spec, path, formatters, controller} = this
        // const flags = Gtk.DIALOG_DESTROY_WITH_PARENT | GTK_DIALOG_MODAL;
        this.dialogs = items(spec.dialogs).map(([k,spec]) => {
            const str = JSON.stringify(spec)
            let fmt = (spec.fmt && formatters && formatters[spec.fmt])
            if (spec.file && formatters && fmt == null) {
                fmt = formatters[fileExt(spec.file)] || null
            }
            let icon = this.findIcon(spec.icon)
            let buttons = [Gtk.ButtonsType.OK]
            let title = spec.info
            if (spec.ask) {
                title = spec.ask
                buttons = [Gtk.ButtonsType.OK_CANCEL]
            }
            const createDialog = (window) => {
                const w = new Gtk.Window()
                let text = null
                if (spec.file) {
                    let file = toPath(path, ...toPathArray(spec.file))
                    text = loadDialogFile(file, fmt)
                }
                const dialog = new Gtk.MessageDialog({
                    title, text, buttons,
                    use_markup: true,
                    modal: false,
                    transient_for: window,
                    message_type: Gtk.MessageType.OTHER,
                })
                // make dialog movable by adding a title bar
                const hdr = new Gtk.HeaderBar({ decoration_layout: 'icon:close' })
                if (icon) hdr.pack_start(new Gtk.Image(icon.opt))
                dialog.set_titlebar(hdr)
                log(`loaded dialog ${k}: ${str}`)
                return dialog
            }
            let ctlFunc = null
            if (spec.call) {
                ctlFunc = (...args) => controller.callBack(spec.call, ...args)
            }
            let run = (window, cb=ctlFunc) => {
                const handleResponse = (id) => {
                    const code = gtkToNoguiResponseCode(id)
                    debug(`got dialog response gtk_code=${id} nogui_code=${code}`)
                    if (cb) return cb(id, code)
                }
                poly.runDialog(createDialog(window), handleResponse)
            }
            log(`setup dialog ${k}: ${str}`)
            return { spec, name:k, run:run }
        })
    }

    buildTableRow(row, data=this.data) {
        ensureBindable(data,'table','row')
        let rbox = css(new Gtk.Box(H), 'box {padding: 0px; margin: 0px;}')
        let icon = this.findIcon(row.icon)
        if (icon) add(rbox, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
        this.buildWidget(row, rbox, data)
        return rbox
    }

    buildTable(table, data=this.data) {
        ensureBindable(data,'table')
        // TODO: use Grid
        log(`building table: ${str(table)}`)
        let tbox = css(new Gtk.Box(V), 'box {padding: 5px;}')
        for (const i in table.table) {
            const row = table.table[i]
            debug(`buildTable.row: ${str(row)}`)
            if (row.repeat) {
                log(`building repeater: ${str(row)}`)

                /** @type {binding.Bindable[]} */
                let added = []
                let widgets = []
                let destroyed = false

                let onDestroy = (w) => {
                    // count to zero when widgets are destroyed
                    debug(`onDestroy: widgets=${widgets.length}`)
                    addItems()
                }

                let addItems = () => {
                    // if all previous widgets are destroyed, lets add new ones
                    if (widgets.length > 0 || added.length == 0 || destroyed) return
                    debug(`addItems: len=${added.length}`)
                    for (const b of added) {
                        let w = add(tbox, this.buildTableRow(row, b))
                        w.connect('destroy', onDestroy)
                        widgets.push(w)
                    }
                    added = []
                }

                let listChanged = (list) => {
                    debug(`listChanged: len=${list.length}, destroyed=${destroyed}, widgets=${widgets.length}`)
                    if (destroyed) return
                    while (widgets.length > 0) try {
                        debug(`remove widget #${widgets.length}`)
                        let w = widgets.shift()
                        poly.remove(w, tbox)
                    } catch (e) {
                        debug(`stopping listChanged on error: ${e}`)
                        logError(e)
                        return
                    }
                    added = list.map(o => binding.Bind(o, data))
                    addItems()
                }

                const { id } = data.bindExpr(row.repeat, listChanged)
                tbox.connect('destroy', () => {
                    debug(`tbox.destroy`)
                    destroyed = true
                    data.unbindExpr(id)
                })
                continue
            }
            add(tbox, this.buildTableRow(row, data))
        }
        return tbox
    }

    // returns a Separator or templated Label based on the given template `text`
    buildText({text, data=this.data, self=null}) {
        ensureBindable(data,'text')
        if (text.match(/^(---+|===+|###+|___+)$/)) {
            return new Gtk.Separator(H)
        }
        if (text == '|') {
            return new Gtk.Separator(V)
        }

        let l = css(new Gtk.Label({label:text}), 'label {margin-left: 5px; margin-right:5px;}')
        let id = data.bindTemplate(text, (v) => {
            // debug(`text updated ${text}: ${v}, self=${str(self)}`)
            // debug(`text updated data=${str(data.data)}`)
            l.set_label(v)
        }, self)
        if (id != null) {
            l.connect('destroy', (l) => {
                // debug(`unbinding ${text} ${id}`)
                data.unbindTemplate(id)
            })
        }
        return l
    }

    /**
     * @param {Object}        options        - lane options
     * @param {Object}        options.icon   - lane icon
     * @param {string|Object} options.text   - lane text
     * @param {string|Object} options.style  - lane text style
     * @param {boolean}       options.center - center lane
     * @param {boolean}       options.fill   - fill lane (H-expand text)
     * @param {Bindable}      options.data   - data model for lane
     * @param {Object}        options.self   - source of the lane (spec object)
     */
    buildLane({icon=null, text=null, style=null, center=false, fill=false, data=this.data, self=null}) {
        ensureBindable(data,'lane')
        let lane = new Gtk.Box(H)
        let icon_style = ''
        if (text) icon_style = 'image {margin-right: 10px;}'
        if (icon) {
            if (icon instanceof Gtk.Image) {
                add(lane, icon, icon_style)
            } else {
                add(lane, new Gtk.Image(icon.opt), icon_style)
            }
        }
        if (text) {
            style = style? `label ${style}` : null
            let l = null
            if (text instanceof Gtk.Label) l = text
            if (isLiteral(text))           l = this.buildText({text, data})
            if (l == null) throw new Error(`unsupported text value: ${str(text)}`)
            add(lane, l, style)
            if (fill) l.set_hexpand(true)
        }
        if (center) lane.set_halign(CENTER)
        return lane
    }

    buildAction({ text=null, tooltip=null, icon=null, call=null, dialog=null, view=null, margin=2,
                  data=this.data, self=null }) {
        ensureBindable(data,'action')
        const ctl = this.controller
        let l = css(this.buildLane({text, icon, center:true, data, self}), `box {margin: ${margin}px;}`)
        let b = css(new Gtk.Button({child:l, tooltip_text: tooltip}), `button {margin: 5px;}`)
        if (call)   b.connect('clicked', () => ctl.callBack(call))
        if (dialog) b.connect('clicked', () => ctl.openDialog(dialog))
        if (view)   b.connect('clicked', () => ctl.showView(view))
        return b
    }

    buildVis({vis, widget, data=this.data, self=null}){
        ensureBindable(data,'vis')

        let destroyed = false
        const onChange = (v) => {
            if (destroyed) { log(`destroyed!`); return }
            debug(`visUpdate data=${str(data.data)}`)
            debug(`visUpdate destroyed=${destroyed}`)
            if (v) poly.show(widget)
            else   poly.hide(widget)
        }

        const { id, expr } = data.bindExpr(vis, onChange, self)

        let destroy = (w) => {
            destroyed = true
            data.unbindExpr(id)
            debug(`visUnbind fields=${str(expr.fields)}`)
        }
        widget.connect('destroy', destroy)

        debug(`visBind fields=${expr.fields}`)
        onChange(expr.value)
    }

    buildViews() {
        this.views = items(this.spec.views).map(([k, spec]) => {
            let box = new Gtk.Box(V)
            for (const row of spec) {
                this.buildWidget(row, box)
            }
            return { name:k, widget:box }
        })
    }

    buildWidget(row, box, data=this.data) {
        ensureBindable(data,'widget')
        const ctl = this.controller

        if (typeof row == 'string') {
            add(box, this.buildText({text:row, data}))
            return
        }

        if (row instanceof Array) {
            let lane = add(box, new Gtk.Box(H), 'box {padding: 0px; margin:0px;}')
            for (const col of row) {
                this.buildWidget(col, lane, data)
            }
            return
        }

        if (row.use && row.use in this.spec.parts) {
            this.buildWidget(this.spec.parts[row.use], box, data)
            return
        }

        let icon = this.findIcon(row.icon)
        // items of repeated fields
        let images = []
        let labels = []
        let binds = []
        let toggleImage = null

        let icons = row.icons? row.icons : row.control? row.control.map(o => o.icon) : []

        if (icons && icons.length > 1) {
            for (const icon of icons) {
                let ico = this.findIcon(icon)
                images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
            }
        } else if (row.states && row.states.length > 0) {
            for (const state of row.states) {
                let ico = this.findIcon(state.icon)
                if (ico) images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
                if (state.label) labels.push(state.label)
                if (state.bind)  binds.push(state.bind)
            }
        }

        if (images.length > 1) {
            toggleImage = (state) => {
                poly.toggle(images[1], state)
                poly.toggle(images[0], !state)
            }
        }

        let w = null
        let fill = row.center || row.fill || row.title? true: false

        if (row.title) {
            let style = '{margin: 5px; font-weight:bold;}'
            w = add(box, this.buildLane({text:row.title, style, fill, data, self:row}))
        }
        else if (row.text) {
            let style = '{margin: 5px;}'
            w = add(box, this.buildLane({text:row.text, style, fill, data, self:row}))
        }
        else if (row.row) {
            for (const col of row.row) this.buildWidget(col, box, data)
        }
        else if (row.hfill && typeof row.hfill == 'number') {
            let margin = 15 * row.hfill
            let style = `label {margin-left: ${margin}px; margin-right: ${margin}px;}`
            w = add(box, new Gtk.Label({label: ''}, style))
        }
        else if (row.vfill && typeof row.vfill == 'number') {
            let margin = 15 * row.vfill
            let style = `label {margin-top: ${margin}px; margin-bottom: ${margin}px;}`
            w = add(box, new Gtk.Label({label: ''}, style))
        }
        else if (row.notify) {
            for (const i in binds) {
                print(`adding bind ${binds[i]}, img:${images[i]}`)
                const icon = images[i]
                const text = `$${binds[i]}`
                const style = '{margin: 5px;}'
                const l = add(box, this.buildLane({ text, icon, data, style, center:true, self:row }))
                const onChange = (v) => poly.toggle(l, v)
                data.bindProperty(binds[i], onChange)
                poly.show(icon)
                onChange(data.getBindingValue(binds[i]))
            }
        }
        else if (row.table) {
            w = add(box, this.buildTable(row, data))
        }
        else if (row.act != null || row.action != null) {
            const {call, dialog, view} = row
            const text = row.label || row.action
            w = add(box, this.buildAction({
                text, icon, call, dialog, view, data,
                tooltip: row.act,
                padding: 5,
            }))
        }
        else if (row.actions) {
            let bar = w = add(box, new Gtk.Box(H), 'box {padding: 5px;}')
            bar.set_halign(CENTER)
            for (const c of row.actions) {
                this.buildWidget(c, bar, data)
            }
        }
        else if (row.toggle) {
            // build complex button content
            let l = w = css(this.buildLane({icon, center:true, data, self:row}), 'box {padding: 5px;}')
            if (images && images.length > 1) {
                add(l, images[0])
                add(l, images[1])
                if(toggleImage) toggleImage(false)
            }
            let label = add(l, new Gtk.Label())
            let b = add(box, new Gtk.ToggleButton({child:l}), 'button {margin: 5px;}')

            // setup label logic
            let is_off  = `${row.toggle} is OFF`
            let is_on = `${row.toggle} is ON`
            if (labels.length > 1){
                is_off = labels[0]
                is_on = labels[1]
            }

            // connect bindings and either a callback or a binding setter
            if (row.call) b.connect('clicked', () => ctl.callBack(row.call))
            if (row.view) b.connect('clicked', () => ctl.showView(row.view))
            if (row.bind) {
                let onChange = (value) => {
                    b.set_active(value? true: false)
                    label.set_label(value? is_on : is_off)
                    if(toggleImage) toggleImage(value)
                }
                let {id, setter} = data.bindProperty(row.bind, onChange)
                if (!row.call) {
                    b.connect('toggled', (b) => setter(b.get_active()))
                }
                b.connect('destroy', (b) => data.unbindProperty(row.bind, id))
                onChange(data.getBindingValue(row.bind))
            }
        }
        else if (row.switch) {
            let box_style = 'box {padding: 5px; padding-left: 10px; padding-right: 10px;}'
            let l = w = add(box, this.buildLane({icon, data, self:row}), box_style)
            if (images && images.length > 1) {
                add(l, images[0])
                add(l, images[1])
            }
            let label_style = 'label {margin-left: 10px;}'
            let label = add(l, this.buildText({text:row.switch, data, self:row}), label_style)
            label.set_hexpand(true)
            label.set_halign(Gtk.Align.START)

            let sw  = add(l, new Gtk.Switch())
            sw.set_halign(Gtk.Align.END)

            // connect bindings and either a callback or a binding setter
            if (row.call) sw.connect('state-set', () => ctl.callBack(row.call))
            if (row.bind) {
                let onChange = (value) => {
                    // label.set_label()
                    sw.set_state(value? true : false)
                    if(toggleImage) toggleImage(value)
                }
                let {id, setter} = data.bindProperty(row.bind, onChange)
                if (!row.call) {
                    sw.connect('state-set', (sw, state) => setter(state))
                }
                sw.connect('destroy', (sw) => data.unbindProperty(row.bind, id))
                onChange(data.getBindingValue(row.bind))
            }
        }

        if (w && row.vis) {
            this.buildVis({vis:row.vis, widget:w, data, self:row})
        }
    }

    findIcon(name)   {
        if (name == null) return null
        return this.icons.find(item => item.name == name)
    }
    findDialog(name) {
        if (name == null) return null
        return this.dialogs.find(item => item.name == name)
    }
    findView(name)   {
        if (name == null) return null
        return this.views.find(item => item.name == name)
    }
}

module.exports = {
    Spec, Builder, Controller, RESPONSE_TYPE,
    poly,
    logging,
    expr,
    binding,
    styling,
}
