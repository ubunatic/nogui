// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

// setup polyfills based on Gtk version
const poly = require('./poly').getPoly()

const { Gtk, Gdk, Gio } = imports.gi

// import common imports after setting up thr polyfill
// to avoid "multiple version" warnings
// const gi = imports.gi

// use webpack `require` for all (local) imports
const md2pango   = require('md2pango')
const json5      = require('json5')
const binding    = require('./binding')
const expr       = require('./expr')
const logging    = require('./logging')
const styling    = require('./styling')
const sys        = require('./sys')
const dialog     = require('./dialog')
const controller = require('./controller')
const assert     = require('./assert')

const { gtkToNoguiResponseCode, RESPONSE_TYPE } = dialog
const { Controller } = controller
const { Binding, GetProxy, SymBinding } = binding

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
const notNull = (o) => o != null

function loadDialogFile(file, formatter=null) {
    let text = sys.readFile(file)
    if (formatter != null) text = formatter.format(text)
    return text
}

/** @returns {binding.Binding} */
function getBinding(data, ...labels) {
    if (data == null) {
        throw new Error(`[${labels.join(', ')}] cannot get 'Binding' from null`)
    }
    if (data[SymBinding] instanceof Binding) {
        return data[SymBinding]
    }
    throw new Error(`[${labels.join(', ')}] missing Binding for data=${str(data)}`)
}

function isLiteral(o) {
    const T = typeof o
    if (T == 'string')  return true
    if (T == 'number')  return true
    if (T == 'boolean') return true
    return false
}

/** Spec defines a user interface */
class Spec {
    static from_path(p) {
        // return new Spec(eval(sys.readFile(p)))
        let str = sys.readFile(p)
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

class Builder {
    /**
        Builder allows building a widget tree from a nogui spec.

        @param {Controller}  controller  - controller for the UI
        @param {Binding}     data        - bindable data model
        @param {Spec|string} spec        - the nogui Spec or path to the spec file
        @param {string}      path        - path prefix used for all referenced gui resources (icons, docs, etc.)
        @param {Object}      formatters  - named formatters that will be used to format text and documents
    */
    constructor(spec, controller, data, path='.', formatters=defaultFormatters) {
        this.controller = controller
        this.data = data
        this.binding = getBinding(data, 'builder')
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
                let icon_path = sys.toPath(path, ...sys.toPathArray(spec.file))
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
                // debug(`loaded icon ${k}: ${str}`)
            }
            return {name:k, img, opt, spec}
        })
    }

    buildDialogs() {
        const {spec, path, formatters, controller} = this
        // const flags = Gtk.DIALOG_DESTROY_WITH_PARENT | GTK_DIALOG_MODAL;
        this.dialogs = items(spec.dialogs).map(([k,spec]) => {
            const src = JSON.stringify(spec)
            let fmt = (spec.fmt && formatters && formatters[spec.fmt])
            if (spec.file && formatters && fmt == null) {
                fmt = formatters[sys.fileExt(spec.file)] || null
            }
            let icon = this.findIcon(spec.icon)

            let text  = null
            let texts = []
            let title = [spec.title, spec.info, spec.ask].filter(notNull).join(' ')
            let buttons = spec.ask? [Gtk.ButtonsType.OK_CANCEL] : [Gtk.ButtonsType.OK]
            let show_hdr = false
            let show_close = false

            if (title == '') title = null

            const loadContent = () => {
                // create main text from files and spec (once!)
                if (spec.file) {
                    let file = sys.toPath(path, ...sys.toPathArray(spec.file))
                    texts.push(loadDialogFile(file, fmt))
                }
                if (spec.text) {
                    texts.push(spec.text)
                }
                text = texts.join('\n')

                if (text == '') {
                    // main text is empty, let's show the title as main text
                    // otherwise the main dialog area will look empty
                    text = title
                    title = null
                }
                show_hdr   = (text.length > 100 || title != null)
                show_close = (spec.ask == null)  // questions must be answered!
            }

            const createDialog = (window) => {
                if (text == null) loadContent()

                const dialog = new Gtk.MessageDialog({
                    buttons,
                    modal: false,
                    transient_for: window,
                    message_type: Gtk.MessageType.OTHER,
                    text: show_hdr? null : title,  // "text" is actually the the title of the dialog window
                    use_markup: true,
                    secondary_text: text + '\n',   // "secondary_text" is the main content of the window
                    secondary_use_markup: true,
                })
                if (show_hdr) {
                    const hdr = new Gtk.HeaderBar({ decoration_layout: show_close? 'icon:close' : null })
                    if (poly.isGtk3() && show_close) hdr.set_show_close_button(true)

                    if (icon) hdr.pack_start(new Gtk.Image(icon.opt))

                    if (title) {
                        let l = new Gtk.Label({label:`<b>${title}</b>`, use_markup:true, visible:true})
                        poly.set_child(hdr, l)
                    }

                    dialog.set_titlebar(hdr)
                    hdr.show()
                }
                debug(`loaded dialog ${k}: ${src}`)
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
            log(`setup dialog ${k}: ${src}`)
            return { spec, name:k, run:run }
        })
    }

    buildTableRow(row, data=this.data) {
        const b = getBinding(data,'table','row')
        let rbox = css(new Gtk.Box(H), 'box {padding: 0px; margin: 0px;}')
        let icon = this.findIcon(row.icon)
        if (icon) add(rbox, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
        this.buildWidget(row, rbox, data)
        rbox.show()
        return rbox
    }

    buildTable(table, data=this.data) {
        const b = getBinding(data,'table')
        // TODO: use Grid
        log(`building table: ${str(table)}`)
        let tbox = css(new Gtk.Box(V), 'box {padding: 5px;}')
        for (const i in table.table) {
            const row = table.table[i]
            debug(`buildTable.row: ${str(row)}`)
            if (row.repeat) {
                log(`building repeater: ${str(row)}`)

                /** @type {Binding[]} */
                let added = []
                let num_widgets = 0

                let addItems = () => {
                    // only after all previous widgets have been destroyed, we should add new ones
                    if (num_widgets > 0 || added.length == 0 || !tbox) return
                    debug(`addItems: len=${added.length}`)
                    for (const b of added) {
                        add(tbox, this.buildTableRow(row, b))
                        num_widgets += 1
                    }
                    added = []
                }

                let listChanged = (i, v, list) => {
                    debug(`listChanged: len=${list.length}, destroyed=${!!tbox}, widgets=${num_widgets}`)
                    debug(`listChanged: i=${i}, v=${v}`)
                    if (!tbox) return
                    while (num_widgets > 0) try {
                        debug(`remove widget #${num_widgets}`)
                        let w = poly.get_last_child(tbox)
                        poly.remove(w, tbox)
                        num_widgets -= 1
                    } catch (e) {
                        debug(`stopping listChanged on error: ${e}`)
                        logError(e)
                        return
                    }
                    added = list.map(o => GetProxy(o, data))
                    addItems()
                }

                const { id } = b.bindObject(row.repeat, listChanged)
                tbox.connect('unrealize', () => {
                    debug(`buildTable: tbox.unrealize`)
                    tbox = null
                    b.unbind(id)
                })
                // cannot add more children after a data-driven list of elements
                break
            }
            add(tbox, this.buildTableRow(row, data))
        }
        tbox.show()
        return tbox
    }

    // returns a Separator or templated Label based on the given template `text`
    buildText({text, data=this.data, self=null}) {
        const b = getBinding(data, 'text')
        if (text.match(/^(---+|===+|###+|___+)$/)) {
            return new Gtk.Separator(H)
        }
        if (text == '|') {
            return new Gtk.Separator(V)
        }

        let label = css(new Gtk.Label({label:text}), 'label {margin-left: 5px; margin-right:5px;}')
        let { id } = b.bindTemplate(text, (v) => {
            // debug(`text updated data=${str(data)}`)
            if(label) label.set_label(v)
        }, self)
        if (id != null) {
            label.connect('unrealize', () => {
                // debug(`unbinding ${text} ${id}`)
                label = null
                b.unbind(id)
            })
        }
        return label
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
        const b = getBinding(data,'lane')
        let lane = new Gtk.Box(H)
        let icon_style = ''
        if (text) icon_style = 'image {margin-right: 10px;}'
        if (icon) {
            if (!(icon instanceof Gtk.Image)) {
                icon = new Gtk.Image(icon.opt)
            }
            add(lane, icon, icon_style)
            icon.show()
        }
        if (text) {
            style = style? `label ${style}` : null
            let l = null
            if (text instanceof Gtk.Label) l = text
            if (isLiteral(text))           l = this.buildText({text, data})
            if (l == null) throw new Error(`unsupported text value: ${str(text)}`)
            add(lane, l, style)
            if (fill) l.set_hexpand(true)
            l.show()
        }
        if (center) lane.set_halign(CENTER)
        lane.show()
        return lane
    }

    buildAction({ text=null, tooltip=null, icon=null, call=null, dialog=null, view=null, margin=2,
                  data=this.data, self=null }) {
        const b = getBinding(data,'action')
        const ctl = this.controller
        let l   = css(this.buildLane({text, icon, center:true, data, self}), `box {margin: ${margin}px;}`)
        let btn = css(new Gtk.Button({child:l, tooltip_text: tooltip}), `button {margin: 5px;}`)
        log(`buildAction ${str({call, dialog, view, text, tooltip, self})}`)
        if (call)   btn.connect('clicked', () => ctl.callBack(call))
        if (dialog) btn.connect('clicked', () => ctl.openDialog(dialog))
        if (view)   btn.connect('clicked', () => ctl.showView(view))
        btn.show()
        return btn
    }

    buildVis({vis, widget, data=this.data, self=null}){
        const b = getBinding(data,'vis')

        const onChange = (v) => {
            if (!widget) { debug(`buildVis: widget destroyed`); return }
            // debug(`visUpdate data=${str(data.data)}`)
            // debug(`visUpdate destroyed=${destroyed}`)
            if (v) poly.show(widget)
            else   poly.hide(widget)
        }

        const { id, expr } = b.bindExpr(vis, onChange, self)

        let unbind = (w) => {
            widget = null
            b.unbind(id)
            // debug(`visUnbind fields=${str(expr.fields)}`)
        }
        widget.connect('unrealize', unbind)

        // debug(`visBind fields=${expr.fields}`)
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
        const b = getBinding(data,'widget')
        const ctl = this.controller

        // debug(`build: row=${str(row)}, data=${str(data)}`)

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

        images.map(img => img.connect('unrealize', () => images = []))

        const toggleImage = (state) => {
            if(images.length > 1) {
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
                // debug(`adding bind ${binds[i]}, img:${images[i]}`)
                const icon = images[i]
                const text = `$${binds[i]}`
                const style = '{margin: 5px;}'
                const l = add(box, this.buildLane({ text, icon, data, style, center:true, self:row }))
                const onChange = (v) => poly.toggle(l, v)
                b.bindProperty(binds[i], onChange)
                poly.show(icon)
                onChange(b.getValue(binds[i]))
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
                toggleImage(false)
            }
            let label = add(l, new Gtk.Label())
            let btn = add(box, new Gtk.ToggleButton({child:l}), 'button {margin: 5px;}')

            // setup label logic
            let is_off  = `${row.toggle} is OFF`
            let is_on = `${row.toggle} is ON`
            if (labels.length > 1){
                is_off = labels[0]
                is_on = labels[1]
            }

            // connect bindings and either a callback or a binding setter
            if (row.view) btn.connect('clicked', () => ctl.showView(row.view))
            if (row.bind) {
                let onChange = (value) => {
                    if(btn)   btn.set_active(value? true: false)
                    if(label) label.set_label(value? is_on : is_off)
                    toggleImage(value)
                }
                let {id, setter} = b.bindProperty(row.bind, onChange)
                let onToggled = (btn) => {
                    if (row.call) ctl.callBack(row.call, btn.get_active())
                    else          setter(btn.get_active())
                }
                let unbind = () => {
                    btn = null
                    label = null
                    b.unbind(id)
                }
                btn.connect('toggled', onToggled)
                btn.connect('unrealize', unbind)
                label.connect('unrealize', unbind)
                onChange(b.getValue(row.bind))
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
                    if(sw) sw.set_state(value? true : false)
                    if(toggleImage) toggleImage(value)
                }
                let {id, setter} = b.bindProperty(row.bind, onChange)
                if (!row.call) {
                    sw.connect('state-set', (_, state) => setter(state))
                }
                sw.connect('unrealize', () => {
                    sw = null
                    b.unbind(id)
                })
                onChange(b.getValue(row.bind))
            }
        }

        if (w) w.show()

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

let ReservedProperties = []

const isReservedProperty     = (k) => ReservedProperties.indexOf(k) >=  0
const isNoneReservedProperty = (k) => ReservedProperties.indexOf(k) == -1

/**
 * convenience class to manage model properties and access them
 * directly through `this.prop`
*/
class Model {
    constructor(keys=[]) {
        binding.Bind(this, keys)
    }
    get binding()       { return     binding.GetBinding(this)      }
    addProperty(k)      {            binding.AddProperty(this, k)  }
    addProperties(...k) { k.map(k => binding.AddProperty(this, k)) }
    initProperties() {
        const keys = Object.keys(this).filter(isNoneReservedProperty)
        if (keys.length == 0) return
        log(`Model.initProperties keys={${keys.join(', ')}}`)
        this.addProperties(...keys)
    }
}

ReservedProperties = Object.keys(new Model())

module.exports = {
    Spec, Builder, Controller, Model, RESPONSE_TYPE,
    poly,
    logging,
    expr,
    binding,
    styling,
    sys,
    assert,
}
