// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

const { Gtk, Gdk, Gio, GLib, Clutter } = imports.gi
const ByteArray = imports.byteArray

const keys  = Object.keys
const items = (o) => keys(o).map((k) => [k, o[k]])
const toPath = (...args) => GLib.build_filenamev(args)
const readFile = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

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

let add = (parent, widget) => { parent.append(widget); return widget }

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
}

var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, viewHandler=null}) {
        this.window      = window       
        this.data        = data
        this.callbacks   = callbacks
        this.dialogs     = dialogs
        this.viewHandler = viewHandler
        this.bindings    = bindAll(data)
    }
    showView(name) {
        if (!this.viewHandler) throw new Error(`Controller.viewHandler not set`)
        this.viewHandler(name)
    }
    callBack(name) {
        if(name in this.callbacks) return this.callbacks[name]()
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
        if (!b) {
            throw new Error(`missing binding ${name}`)
        }
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

var poly = {
    isGtk3: () => Gtk.MAJOR_VERSION < 4,
    append: (container, o) => {
        if (container.append) return container.append(o)
        // No append available, must try other ways!
        if (container instanceof Gtk.Box) {
            return box.pack_start(o, true, false, '1.0')
        }
        throw new Error(`append(widget) not implemented for ${container}`)
    },
    runDialog: (dia, cb=null, close=true) => {
        dia.show()
        dia.connect('response', (o, id) => {            
            if (cb) cb(id, gtkToNoguiResponseCode(id))
            if (id != Gtk.ResponseType.CLOSE && close) dia.close()
        })
    },
    getDisplay: () => Gdk.Display.get_default(),
    getScreen:  () => poly.getDisplay().get_default_screen(),
    getTheme:   () => {
        const T = Gtk.IconTheme
        if (T.get_for_display) return T.get_for_display(poly.getDisplay())
        if (T.get_for_screen)  return T.get_for_screen(poly.getScreen())
        return Gtk.IconTheme.get_default()
    },
    addIconPath: (path) => {
        const theme = poly.getTheme()
        if (theme.add_search_path)    theme.add_search_path(path)
        if (theme.append_search_path) theme.append_search_path(path)
    }
}

function buildIcons(icons, path) {
    // allow finding icons by name
    poly.addIconPath(path)

    return items(icons).map(([k,spec]) => {        
        const str = JSON.stringify(spec)
        let img        
        if (spec.name) {
            img = new Gtk.Image({ icon_name: spec.name, use_fallback: true })
        }
        else if (spec.file) {
            let icon_path = toPath(path, ...spec.file)
            log(`load icon: ${str} from ${icon_path}`)
            const gicon = Gio.FileIcon.new(Gio.File.new_for_path(icon_path))
            img = new Gtk.Image({gicon: gicon, use_fallback: true})
        }
        if (img == null) {            
            img = Gtk.Image({ icon_name: "image-missing", use_fallback: true })
            logError(new Error(`failed to load icon ${k}: ${str}`), 'using placeholder')
        } else {
            log(`loaded icon ${k}: ${str}`)
        }
        return img
    })
}

function loadDialogFile(file, path, formatter=null) {
    if (typeof file == 'string') file = [file]
    let text = readFile(toPath(path, ...file))
    if (formatter != null) text = formatter.format(text)
    return text
}

function buildDialogs(dialogs, path, formatters) {
    // const flags = Gtk.DIALOG_DESTROY_WITH_PARENT | GTK_DIALOG_MODAL;
    return items(dialogs).map(([k,spec]) => {
        const str = JSON.stringify(spec)
        let fmt = (spec.fmt && formatters && formatters[spec.fmt]) || null
        const createDialog = (window) => {
            const w = new Gtk.Window()          
            const dialog = new Gtk.MessageDialog({
                // flags: Gtk.DialogFlags.DESTROY_WITH_PARENT,
                title: spec.title,
                text: loadDialogFile(spec.file, path, fmt),
                buttons: [Gtk.ButtonsType.OK],
                use_markup: true,
                modal: false,
                transient_for: window,
                message_type: Gtk.MessageType.OTHER,
            })
            // make dialog movable by adding a title bar
            const hdr = new Gtk.HeaderBar({ decoration_layout: 'icon:close' })
            dialog.set_titlebar(hdr)
            log(`loaded dialog ${k}: ${str}`)
            return dialog
        }
        let run = (window) => poly.runDialog(createDialog(window))
        log(`setup dialog ${k}: ${str}`)
        return { spec, name:k, run:run }
    })
}

/**
 * 
 * @param {Object} views 
 * @param {Controller} ctrl 
 * @returns {{name:string, widget:Gtk.Box}[]}
 */
function buildViews(views, ctrl) {

    return items(views).map(([k, spec]) => {
        // TODO: add icons from "icon" property

        let box = new Gtk.Box(V)
        for (const row of spec) {
            if      (row.title)  {
                let l = add(box, new Gtk.Label({label:row.title}))
                addStyles(l, 'label {padding: 5px;}')
            }
            else if (row.action) {
                let b = add(box, new Gtk.Button({label:row.action}))                
                if (row.call)   b.connect('clicked', () => ctrl.callBack(row.call))
                if (row.dialog) b.connect('clicked', () => ctrl.openDialog(row.dialog))
                if (row.view)   b.connect('clicked', () => ctrl.showView(row.view))
                addStyles(b, 'button {margin: 5px;}')
            }
            else if (row.switch) {
                let lane = add(box, new Gtk.Box(H))
                let l    = add(lane, new Gtk.Label({label:row.switch}))
                let sw   = add(lane, new Gtk.Switch())
                if (row.call)   sw.connect('state-set', () => ctrl.callBack(row.call))
                if (row.dialog) sw.connect('state-set', () => ctrl.openDialog(row.dialog))
                if (row.view)   sw.connect('state-set', () => ctrl.showView(row.view))
                if (row.bind) {
                    let onChange = (value) => value? sw.set_state(true) : sw.set_state(false)
                    let {id, setter} = ctrl.bindProperty(row.bind, onChange)
                    sw.connect('state-set', (sw, state) => setter(state))
                    sw.connect('unrealize', (sw) => ctrl.unbindProperty(row.bind, id))
                }

                // add some padding and nice alignment
                addStyles(lane, 'box {padding: 5px;}')
                l.set_hexpand(true)
                l.set_halign(Gtk.Align.START)
                sw.set_halign(Gtk.Align.END)
            }
        }
        return { name:k, widget:box }
    })
}

/** Spec defines a user interface */
class Spec {
    /** @type {Object<string,Object>} - named symbolic of file icons */
    icons
    /** @type {Object<string,Object>} - named dialogs with static content */
    dialogs
    /** @type {Object<string,Object>} - named views of the app */
    views
    /** @type {string} - ID of the main view in the `views` */
    main
    /** @type {string} - asset path for icons and docs*/
    path    

    /** @param {object} spec - defines the UI as plain JS object */
    constructor({icons, dialogs, views, main="main", path="."}={}) {
        this.icons   = icons
        this.dialogs = dialogs
        this.views   = views
        this.main    = main
        this.path    = path
    }
}

/**

  buildWidgets builds a GTK widget tree from the given nogui spec.
  
  @param {Spec}   spec        - parsed nogui object tree to be rendered
  @param {str}    path        - path prefix used for all referenced gui resources (icons, docs, etc.)  
  @param {object} data        - data object used to bind fields and handlers
  @param {object} formatters  - named formatters that will be used to format text and documents

*/
function buildWidgets(spec, ctrl=null, path='.', formatters=null) {
    log(`building widgets from ${spec} with asset path ${path}`)
    const icons = buildIcons(spec.icons, path)
    const dialogs = buildDialogs(spec.dialogs, path, formatters)
    const views = buildViews(spec.views, ctrl)
    if (ctrl != null) {
        ctrl._add_dialogs(dialogs)
    }
    return { icons, views, dialogs }
}
