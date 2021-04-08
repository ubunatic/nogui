// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

const { Gtk, Gdk, Gio, GLib, Clutter } = imports.gi
const ByteArray = imports.byteArray

const md2pango = require('md2pango')
const json5    = require('json5')

const defaultFormatters = {
    md: { format: (s) => md2pango.convert(s) }
}

const items = (o) => Object.keys(o).map((k) => [k, o[k]])
const findByName = (l, s) => s == null ? null : l.find(item => item.name == s)

const toPath      = (...s) => GLib.build_filenamev(s)
const toPathArray = (path) => (typeof path == 'string')? [path] : path
const fileExt     = (file) => GLib.build_filenamev(toPathArray(file)).split('.').pop()
const readFile    = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

let verbose = false
export const setVerbose = (v) => verbose = v
const log = (...args) => { if (verbose) window.log(...args) }

// RESPONSE_TYPE defines nogui-dialog response types.
// The response types are more generic than `Gtk.ResponseType` codes
// and are passed additional argument to `Gtk.Dialog` callbacks.
// Also see https://gjs-docs.gnome.org/gtk40~4.0.3/gtk.responsetype
// and `gtkToNoguiResponseCode`.
export const RESPONSE_TYPE = {
    HELP:   'HELP',  // HELP 
    OK:     'OK',
    NOT_OK: 'NOT_OK',
    OTHER:  'OTHER',
}

const V = {'orientation': Gtk.Orientation.VERTICAL}
const H = {'orientation': Gtk.Orientation.HORIZONTAL}
const CENTER = Gtk.Align.CENTER

let add = (parent, widget, ...styles) => {
    addStyles(widget, ...styles)
    parent.append(widget)
    return widget
}

export const addStyles = (w, ...styles) => {
    const ctx = w.get_style_context()
    styles.forEach((obj) => {
        if (obj == null) return
        if(typeof obj == 'string') {
            const cp = new Gtk.CssProvider()
            cp.load_from_data(obj)
            obj = cp
        }
        ctx.add_provider(obj, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    })
    return w
}

const css = addStyles

const gtkToNoguiResponseCode = (response_code) => {
    // see: https://gjs-docs.gnome.org/gtk40~4.0.3/gtk.responsetype
    switch(response_code) {
        case Gtk.ResponseType.APPLY:
        case Gtk.ResponseType.YES:
        case Gtk.ResponseType.OK:     return RESPONSE_TYPE.OK
        case Gtk.ResponseType.CANCEL: 
        case Gtk.ResponseType.NO:     
        case Gtk.ResponseType.CLOSE:  return RESPONSE_TYPE.NOT_OK
        case Gtk.ResponseType.HELP:   return RESPONSE_TYPE.HELP
        default:                      return RESPONSE_TYPE.OTHER
    }    
}

export var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        this.window      = window       
        this.data        = data
        this.callbacks   = callbacks
        this.dialogs     = dialogs
        this.showView    = showView
        this.bindings    = bindAll(data)
        this.template_bindings = {}
        this.next_template_binding_id = 0
    }
    showView(name) {
        throw new Error(`Controller.showView not set`)
    }
    callBack(name, ...args) {
        if(name in this.callbacks) return this.callbacks[name](...args)
        logError(new Error(`callback '${name}' not found`))
    }
    openDialog(name)  {        
        if(name in this.dialogs) {
            return this.dialogs[name].run(this.window)
        }
        logError(new Error(`dialog '${name}' not found`))
    }
    /**
    * @callback valueSetter
    * @param {*} value - the changed value
    */
    /**
     * @param {string} name 
     * @param {valueSetter} onChange
     * @returns {{id: number, setter: valueSetter}}
     */
    bindProperty(name, onChange) {
        let b = this.bindings[name]
        if (!b) throw new Error(`missing binding ${name}`)
        const id = b.connect(onChange)
        return {id, setter:b.setter}
    }
    unbindProperty(name, id) {
        let b = this.bindings[name]
        if (b) b.disconnect(id)
    }
    getBindingValue(name) {
        return this.bindings[name].value
    }
    bindTemplate(tpl, onChange) {
        let { fields, setter, getter } = Binding.parse_template(tpl)
        if (fields == null) return null

        // ensure we keep track of all bindings
        let bindings = []
        let binding_id = this.next_template_binding_id++
        this.template_bindings[binding_id] = bindings

        for (const name in fields) {                                
            let { id } = this.bindProperty(name, (v) => {
                if (setter(name, v)) onChange(getter())
            })
            let val = this.getBindingValue(name)
            log(`setting default value for ${name}: ${val}`)
            setter(name, val)
            bindings.push({name, id})
        }
        onChange(getter())  // update template once to avoid weird values
        return binding_id
    }
    unbindTemplate(id) {
        let bindings = this.template_bindings[id]
        if (bindings) for (const {name,id} of bindings) {
            this.unbindProperty(name, id)
        }
        delete this.template_bindings[id]
    }
    _add_dialogs(dialogs) {
        dialogs.forEach(d => this.dialogs[d.name] = d)
    }    
}

export var Binding = class Binding {
    constructor(obj, field) {
        this.targets = {}
        this.bind_id = 0
        this.field   = field
        this.obj     = obj
        this.value   = obj[field]  // read default value
        this.getter = () => this.value
        this.setter = (val) => {
            if (val != this.value) {
                this.value = val
                this.notify()
            }
        }
        
        Object.defineProperty(obj, field, {
            get: this.getter,
            set: this.setter,
        })
    
        obj[field] = this.value
    }
    notify(){
        log(`notifying ${this.field}`)
        Object.values(this.targets).forEach(t => t(this.value))
        return this
    }
    connect(onChange){
        log(`connecting ${this.field}`)
        const id = (this.bind_id++)
        this.targets[id] = onChange
        return id
    }
    disconnect(id){
        delete this.targets[id]
    }

    /**
     * parse_template parses a template string an returns a template array,
     * the found template fields, and a setter for updating values.
     * 
     * @param {string} s  - template string with variable expressions
     */
    static parse_template(s) {
        let tpl = []
        let fields  = null
        let pos = 0
        while (pos < s.length) {            
            let f = s.slice(pos).match(/\$([a-zA-Z0_9_]+)/)
            // print('loop', s, s.length, pos, `['${tpl.join(',')}']`, f)
            if (!f) {
                tpl.push(s.slice(pos))            // add remainder of str to tpl and break
                break
            }
            if (f.index > 0) {
                tpl.push(s.slice(pos, pos + f.index))   // add anything before var to tpl
            }
            let name = f[1]                       // get field name
            if (fields == null) fields = {}       // create fields object only if needed
            if (!fields[name]) fields[name] = []  // setup store for indexes
            fields[name].push(tpl.length)         // add template index for the found field
            tpl.push(name)                        // default value is the var name

            // print('added field', name)

            pos = pos + f.index + f[0].length     // set remainder start pos to end of var            
        }
        // print('done', s, s.length, pos, `['${tpl.join(',')}']`)

        let getter = null, setter = null
        if (fields != null) {        
            getter = () => tpl.join('')
            /**
             * @param {string} field - name of variable to update
             * @param {string} val   - value to put in the template          
             * @returns {boolean}    - true if value changed, false otherwise
             */
            setter = (field, val) => {
                let changed = false
                let indexes = fields[field]
                if (indexes) for (const i of indexes) {
                    if (tpl[i] != val) {
                        tpl[i] = val
                        print('update', field, val)
                        changed = true
                    }
                }
                return changed
            }
        }
        return { fields, setter, getter }
    }
}

/**
 * bindAll creates a nogui.Binding for all properties of `data`.
 * 
 * @param {object} data 
 * @returns {Object.<string, Binding>}
 */
export function bindAll(data) {
    let bindings = {}
    for (const k in data) {
        if (typeof data[k] != 'function') bindings[k] = new Binding(data, k)
    }
    return bindings
}

const poly = require('./poly').getPoly({Gtk, Gdk})

function loadDialogFile(file, formatter=null) {
    let text = readFile(file)
    if (formatter != null) text = formatter.format(text)
    return text
}

/** Spec defines a user interface */
export class Spec {
    static from_path(p) {
        // return new Spec(eval(readFile(p)))
        let str = readFile(p)
        if (p.endsWith('.js')) str = str.replace(/^module\.exports = \{$/m, '{')
        return new Spec(json5.parse(str))
    }
    /** @param {Object} spec - defines the UI as plain JS object */
    constructor({icons, dialogs, views, main="main", path="."}={}) {
        this.icons   = icons
        this.dialogs = dialogs
        this.views   = views
        this.main    = main
        this.path    = path
    }
}

export var Builder = class Builder {
    /**
        Builder allows building a widget tree from a nogui spec.

        @param {Controller}  controller  - controller for the UI
        @param {Spec|string} spec        - the nogui Spec or path to the spec file
        @param {string}      path        - path prefix used for all referenced gui resources (icons, docs, etc.)
        @param {Object}      formatters  - named formatters that will be used to format text and documents
    */
    constructor(spec, controller, path='.', formatters=defaultFormatters) {
        this.controller = controller
        this.spec = (typeof spec == 'string')? Spec.from_path(spec) : spec
        this.path = path
        this.formatters = formatters
        this.icons = null
        this.dialogs = null
        this.views = null
        this.done = false
    }

    buildWidgets() {
        if (this.done) throw new Error('cannot build Widget tree more than once')
        log(`building widgets from ${this.spec} with asset path ${this.path}`)
        this.buildIcons()
        this.buildDialogs()
        this.buildViews()
        if (this.controller != null) {
            this.controller._add_dialogs(this.dialogs)
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
                log(`load icon: ${str} from ${icon_path}`)
                const gicon = Gio.FileIcon.new(Gio.File.new_for_path(icon_path))
                opt = {gicon: gicon, use_fallback: true}
                img = new Gtk.Image(opt)
            }
            if (img == null) {
                opt = { icon_name: "image-missing", use_fallback: true }
                img = Gtk.Image(opt)
                logError(new Error(`failed to load icon ${k}: ${str}`), 'using placeholder')
            } else {
                log(`loaded icon ${k}: ${str}`)
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
                    log(`got dialog response gtk_code=${id} nogui_code=${code}`)
                    if (cb) return cb(id, code)                   
                }
                poly.runDialog(createDialog(window), handleResponse)
            }
            log(`setup dialog ${k}: ${str}`)
            return { spec, name:k, run:run }
        })
    }

    buildTable(table) {        
        const ctl = this.controller
        // TODO: use Grid
        let tbox = css(new Gtk.Box(V), 'box {padding: 5px;}')
        for (const row of table) {                        
            let rbox = add(tbox, new Gtk.Box(H), 'box {padding: 5px;}')
            let icon = this.findIcon(row.icon)
            if (icon)  add(rbox, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
            for (const text of row.row) {
                add(rbox, this.buildText(text))
            }
        }
        return tbox
    }

    buildText(text) {
        let ctl = this.controller
        if (text.match(/^(---+|===+|###+|___+)$/)) {
            return new Gtk.Separator(H)
        } else if (text == '|') {
            return new Gtk.Separator(V)
        } else {
            let l = css(new Gtk.Label({label:text}), 'label {margin-left: 5px; margin-right:5px;}')
            let bind_id = ctl.bindTemplate(text, (v) => l.set_label(v))
            l.connect('unrealize', (l) => ctl.unbindTemplate(bind_id))
            return l
        }
    }

    buildLane({icon=null, text=null, style=null, center=false}={}, box_style=null) {
        let l = css(new Gtk.Box(H), box_style? `box ${box_style}` : null)
        if (icon)  add(l, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
        if (text)  add(l, new Gtk.Label({label:text}), style? `label ${style}` : null)
        if (center) l.set_halign(CENTER)
        return l
    }

    buildViews() {
        const ctl = this.controller
        this.views = items(this.spec.views).map(([k, spec]) => {
            // TODO: add icons from "icon" property

            let box = new Gtk.Box(V)            
            for (const row of spec) {
                if (typeof row == 'string') {
                    add(box, this.buildText(row))
                    continue
                }

                let icon = this.findIcon(row.icon)
                let images = []
                let labels = []
                let toggle = null                

                if (row.icons && row.icons.length > 1) {
                    for (const icon of row.icons) {
                        let ico = this.findIcon(icon)
                        images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
                    }
                } else if (row.states && row.states.length > 1) {
                    for (const state of row.states) {
                        let ico = this.findIcon(state.icon)                        
                        if (ico) images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
                        if (state.label) labels.push(state.label)
                    }
                }

                if (images.length > 1) {
                    toggle = (state) => {                            
                        if (state) { images[1].show(), images[0].hide() }
                        else       { images[0].show(), images[1].hide() }
                    }
                    toggle(false)
                }

                if (row.title) {                    
                    add(box, this.buildLane({text:row.title, style:'{margin: 5px; font-weight:bold;}', center:true}))
                }
                else if (row.table) {
                    add(box, this.buildTable(row.table))
                }
                else if (row.action) {
                    let l = this.buildLane({text:row.action, icon, center:true}, '{padding: 5px;}')
                    let b = add(box, new Gtk.Button({child:l}), 'button {margin: 5px;}')
                    if (row.call)   b.connect('clicked', () => ctl.callBack(row.call))
                    if (row.dialog) b.connect('clicked', () => ctl.openDialog(row.dialog))
                    if (row.view)   b.connect('clicked', () => ctl.showView(row.view))
                }
                else if (row.toggle) {
                    // build complex button content
                    let l  = this.buildLane({icon, center:true}, '{padding: 5px;}')
                    if (images && images.length > 1) {
                        add(l, images[0])
                        add(l, images[1])
                        if(toggle) toggle(false)
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
                    if (row.bind) {
                        let onChange = (value) => {
                            b.set_active(value? true: false)
                            label.set_label(value? is_on : is_off)
                            if(toggle) toggle(value)
                        }
                        let {id, setter} = ctl.bindProperty(row.bind, onChange)
                        if (!row.call) {
                            b.connect('toggled', (b) => setter(b.get_active()))
                        }
                        b.connect('unrealize', (b) => ctl.unbindProperty(row.bind, id))
                        onChange(ctl.getBindingValue(row.bind))
                    }
                }
                else if (row.switch) {
                    let l = add(box, this.buildLane({icon}, '{padding: 5px;}'))
                    if (images && images.length > 1) {
                        add(l, images[0])
                        add(l, images[1])
                    }
                    let label = add(l, new Gtk.Label({label:row.switch}))                    
                    label.set_hexpand(true)
                    label.set_halign(Gtk.Align.START)

                    let sw  = add(l, new Gtk.Switch())            
                    sw.set_halign(Gtk.Align.END)

                    // connect bindings and either a callback or a binding setter
                    if (row.call)   sw.connect('state-set', () => ctl.callBack(row.call))
                    if (row.bind) {
                        let onChange = (value) => {
                            sw.set_state(value? true : false)
                            if(toggle) toggle(value)
                        }
                        let {id, setter} = ctl.bindProperty(row.bind, onChange)
                        if (!row.call) {
                            sw.connect('state-set', (sw, state) => setter(state))
                        }
                        sw.connect('unrealize', (sw) => ctl.unbindProperty(row.bind, id))
                    }

                }
            }
            return { name:k, widget:box }
        })
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
