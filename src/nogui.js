// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

const { Gtk, Gdk, Gio, GLib, Clutter } = imports.gi
const ByteArray = imports.byteArray

const md2pango = require('md2pango')

const defaultFormatters = {
    md: { format: (s) => md2pango.convert(s) }
}

const items = (o) => Object.keys(o).map((k) => [k, o[k]])
const findByName = (l, s) => s == null ? null : l.find(item => item.name == s)

const toPath      = (...s) => GLib.build_filenamev(s)
const toPathArray = (path) => (typeof path == 'string')? [path] : path
const fileExt     = (file) => GLib.build_filenamev(toPathArray(file)).split('.').pop()
const readFile    = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

// RESPONSE_TYPE defines nogui-dialog response types.
// The response types are more generic than `Gtk.ResponseType` codes
// and are passed additional argument to `Gtk.Dialog` callbacks.
// Also see https://gjs-docs.gnome.org/gtk40~4.0.3/gtk.responsetype
// and `gtkToNoguiResponseCode`.
const RESPONSE_TYPE = {
    HELP:   'HELP',  // HELP 
    OK:     'OK',
    NOT_OK: 'NOT_OK',
    OTHER:  'OTHER',
}

let V = {'orientation': Gtk.Orientation.VERTICAL}
let H = {'orientation': Gtk.Orientation.HORIZONTAL}

let add = (parent, widget, ...styles) => {
    addStyles(widget, ...styles)
    parent.append(widget)
    return widget
}

const addStyles = (w, ...styles) => {
    const ctx = w.get_style_context()
    styles.forEach((obj) => {
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

var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        this.window      = window       
        this.data        = data
        this.callbacks   = callbacks
        this.dialogs     = dialogs
        this.showView    = showView
        this.bindings    = bindAll(data)
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
    _add_dialogs(dialogs) {
        dialogs.forEach(d => this.dialogs[d.name] = d)
    }    
}

var Binding = class Binding {
    constructor(obj, field) {
        this.targets = {}
        this.bind_id = 0
        this.field   = field
        this.obj     = obj
        this.value   = obj[field]  // read default value
        this.getter = () => obj[field]
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
        Object.values(this.targets).forEach(t => t(this.value))
        return this
    }
    connect(onChange){
        const id = (this.bind_id++)
        this.targets[id] = onChange
        return id
    }
    disconnect(id){
        delete this.targets[id]
    }
}

/**
 * bindAll creates a nogui.Binding for all properties of `data`.
 * 
 * @param {object} data 
 * @returns {Object.<string, Binding>}
 */
function bindAll(data) {
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
class Spec {
    static from_path(p) {
        let module = {} // protect the current module
        eval(readFile(p))
        return module.exports
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

var Builder = class Builder {
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
                    print(`dialog response gtk_code=${id} nogui_code=${code}`)
                    if (cb) return cb(id, code)                   
                }
                poly.runDialog(createDialog(window), handleResponse)
            }
            log(`setup dialog ${k}: ${str}`)
            return { spec, name:k, run:run }
        })
    }

    buildViews() {
        const ctl = this.controller
        this.views = items(this.spec.views).map(([k, spec]) => {
            // TODO: add icons from "icon" property

            let box = new Gtk.Box(V)            
            for (const row of spec) {
                let icon = this.findIcon(row.icon)
                let icons = []
                if (row.icons && row.icons.length > 0) {
                    icons[0] = this.findIcon(row.icons[0])
                    icons[1] = this.findIcon(row.icons[1])
                    // icon = icon || icons[0] || icons[1]
                }
                if      (row.title)  {
                    let lane = add(box, new Gtk.Box(H), 'box {padding: 5px;}')
                    // if (icon)  add(lane, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
                    let l =    add(lane, new Gtk.Label({label:row.title}), 'label {margin: 5px; font-weight:bold;}')
                    lane.set_halign(Gtk.Align.CENTER)
                }
                else if (row.action) {
                    let lane = new Gtk.Box(H)
                    if (icon)  add(lane, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
                    let l    = add(lane, new Gtk.Label({label:row.action}))

                    let b    = add(box, new Gtk.Button({child:lane}), 'button {margin: 5px;}')                    
                    if (row.call)   b.connect('clicked', () => ctl.callBack(row.call))
                    if (row.dialog) b.connect('clicked', () => ctl.openDialog(row.dialog))
                    if (row.view)   b.connect('clicked', () => ctl.showView(row.view))

                    lane.set_halign(Gtk.Align.CENTER)
                    // lane.set_hexpand(false)
                    // b.set_hexpand(false)
                }
                else if (row.switch) {
                    let toggle = null
                    let lane = add(box, new Gtk.Box(H), 'box {padding: 5px;}')
                    if (icon)  add(lane, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
                    else if (icons.length > 1) {
                        let ico1 = add(lane, new Gtk.Image(icons[0].opt), 'image {margin-right: 10px;}')
                        let ico2 = add(lane, new Gtk.Image(icons[1].opt), 'image {margin-right: 10px;}')
                        toggle = (state) => {                            
                            if (state) { ico2.show(), ico1.hide() }
                            else       { ico1.show(), ico2.hide() }
                        }
                        toggle(false)
                    }
                    let l    = add(lane, new Gtk.Label({label:row.switch}))
                    let sw   = add(lane, new Gtk.Switch())
                    if (row.call)   sw.connect('state-set', () => ctl.callBack(row.call))
                    if (row.dialog) sw.connect('state-set', () => ctl.openDialog(row.dialog))
                    if (row.view)   sw.connect('state-set', () => ctl.showView(row.view))
                    if (row.bind) {
                        let onChange = (value) => {
                            value? sw.set_state(true) : sw.set_state(false)
                            if(toggle) toggle(value)
                        }
                        let {id, setter} = ctl.bindProperty(row.bind, onChange)
                        sw.connect('state-set', (sw, state) => setter(state))
                        sw.connect('unrealize', (sw) => ctl.unbindProperty(row.bind, id))
                    }

                    // better alignment
                    l.set_hexpand(true)
                    l.set_halign(Gtk.Align.START)
                    sw.set_halign(Gtk.Align.END)
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

module.exports = { Builder, Controller, Binding, bindAll, addStyles, RESPONSE_TYPE }
