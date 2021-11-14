// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { GLib } = imports.gi

const PACK_START_ARGS = [
    true,  // expand
    false, // fill
    1,     // padding
]

var timeouts = {
    /** calls `func` after a `delay_ms` timeout and log potential errors */
    setTimeout(func, delay_ms=0, ...args) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay_ms, () => {
            try       { func(...args) }
            catch (e) { logError(e) }
            return GLib.SOURCE_REMOVE
        })
    },

    /** wrapper to `GLib.source_remove`
     * for removing a GLib `source` that was set with `setTimeout`.
     * @param {object} source
    */
    clearTimeout(source) { return GLib.source_remove(source) },

    /** returns a new `Promise` to be resolved or rejected with the result or error
     *  produced by calling `func` after a `delay_ms` timeout
     */
    asyncTimeout(func, delay_ms=0, ...args) {
        return new Promise((resolve, reject) => {
            return timeouts.setTimeout(() => {
                try       { resolve(func(...args)) }
                catch (e) { reject(e) }
            }, delay_ms)
        })
    }
}

var gtk = {
    /** manually handle defocus to manage non-modal popups, etc. */
    DefocusConnector(window) {
        const Gtk = imports.gi.Gtk
        let last_state = null
        let F = Gtk.StateFlags
        let Ignore = { DIR_LTR: true }
        let callback = null

        function handle(flag) {
            // let is_active = flag & (F.ACTIVE | F.FOCUSED | F.FOCUS_VISIBLE | F.FOCUS_WITHIN | F.SELECTED | F.PRELIGHT )? 1:0
            // let has_focus = flag & (F.FOCUS_WITHIN | F.ACTIVE)
            let is_backdrop = flag & F.BACKDROP
            // let pop_visible = pop.get_visible()
            let flags = Object.keys(F).filter(k => !(k in Ignore) && (F[k] & flag) > 0).join(':')
            let state = `${flags}+${is_backdrop}`

            if (last_state == state) return
            last_state = state

            if (is_backdrop && callback != null) callback()
        }

        let connect_id = null
        function connect(onDefocus) {
            callback = onDefocus
            disconnect()
            connect_id = window.connect('state-flags-changed', (_, flag) => handle(flag))
        }
        function disconnect() {
            if (connect_id == null) return
            window.disconnect(connect_id)
            connect_id = null
            callback = null
        }
        return { connect, disconnect }
    }
}

if (this.setTimeout)   timeouts.setTimeout   = setTimeout    // use native setTimeout if available
if (this.clearTimeout) timeouts.clearTimeout = clearTimeout  // use native clearTimeout if available

// used for flagging Widgets as inaccessible to avoid deallocation errors
var LOCKED = Symbol('LOCKED')

var LEVEL = {
    ERROR: 0,
    INFO:  1,
    DEBUG: 2,
}

var USE_GTK = null

/** setup and return a polyfill object to handle different GTk versions */
function getPoly(gtk_version=null) {
    if (USE_GTK == null) {
        USE_GTK = useGtk(gtk_version)
    }

    const { Gtk, Gdk } = imports.gi
    const poly = {
    USE_GTK,
    LEVEL,
    log_level: LEVEL.ERROR,
    log:   (msg) => { if (poly.log_level >= LEVEL.INFO)  log(msg) },
    error: (err) => { if (poly.log_level >= LEVEL.ERROR) logError(err) },
    debug: (msg) => { if (poly.log_level >= LEVEL.DEBUG) log(msg) },
    isGtk3: () => Gtk.MAJOR_VERSION < 4,
    get GtkVersion() { return Gtk.MAJOR_VERSION },
    init:  (args=null) => {
        if (poly.isGtk3()) Gtk.init(args)
        else               Gtk.init()
    },
    initialized: false,
    safeInit: (args=null) => {
        if (poly.initialized) return
        poly.init(args)
        poly.initialized = true
    },
    append: (container, o) => {
        // TODO: check if we need smart type switch to call correct "append" on specific widget types
        if (container.append)           return container.append(o)
        if (container.add)              return container.add(o)
        if (container.pack_start)       return container.pack_start(o, ...PACK_START_ARGS)
        throw new Error(`append(widget) not implemented for ${container}`)
    },
    set_child: (container, o) => {
        // TODO: check if we need smart type switch to call correct "set_child" on specific widget types
        if (container.set_child)        return container.set_child(o)
        if (container.set_title_widget) return container.set_title_widget(o)
        if (container.set_custom_title) return container.set_custom_title(o)
        if (container.add)              return container.add(o)
        throw new Error(`set_child(widget) not implemented for ${container}`)
    },
    remove: (w, parent=null, depth=0) => {
        if (depth > 100) throw new Error(`too many recursive removals`)
        if (w.foreach) {
            let i = 0
            w.foreach((c) => {
                poly.debug(`LOCKING child #${i++} of ${w}`)
                c[LOCKED] = true
                poly.remove(c, w, depth+1)
            })
        }
        if (w.get_child) {
            poly.debug(`LOCKING single child of ${w}`)
            let c = w.get_child()
            c[LOCKED] = true
            poly.remove(c, w, depth+1)
        }
        if (parent && parent.remove) {
            poly.debug(`remove child ${w} from parent ${parent}`)
            return parent.remove(w)
        }
    },
    show: (w) => { if (!w[LOCKED]) w.show() },
    hide: (w) => { if (!w[LOCKED]) w.hide() },
    toggle_visible: (w, visible=!w.get_visible()) => {
        visible? poly.show(w) : poly.hide(w)
    },
    toggle_active: (w,  active=!w.get_active())  => {
        if (!w[LOCKED]) w.set_active(active)
    },
    set_modal: (w, v) => {
        if (w.set_modal)    return w.set_modal(v)
        if (w.set_autohide) return w.set_autohide(v)
        throw new Error(`set_modal(boolean) not implemented for ${w}`)
    },
    set_popover: (w, pop) => {
        if (w.set_popover)       return w.set_popover(pop)
        if (pop.set_relative_to) return pop.set_relative_to(w)
        throw new Error(`set_popover(widget) not implemented for ${w}`)
    },
    get_last_child: (w) => {
        if (w.get_last_child) return w.get_last_child()
        if (w.get_children) {
            let c = w.get_children()
            if (c.length == 0) return null
            else               return c[c.length - 1]
        }
        throw new Error(`get_last_child() not implemented for ${w}`)
    },
    get_first_child: (w) => {
        if (w.get_first_child) return w.get_first_child()
        if (w.get_children) {
            let c = w.get_children()
            if (c.length == 0) return null
            else               return c[0]
        }
        throw new Error(`get_first_child() not implemented for ${w}`)
    },
    get_child: (w, pos=0) => {
        if (w.get_children) {
            let c = w.get_children()
            if (c.length <= pos) return null
            else                 return c[pos]
        }
        if (w.get_next_sibling) {
            let c = poly.get_first_child(w)
            let i = 0
            while (c != null && i < pos) { c = c.get_next_sibling(); i++ }
            return c
        }
        throw new Error(`get_child() not implemented for ${w}`)
    },
    click: (w) => {
        if (w.clicked)       return w.clicked()
        if (w.emit)          return w.emit('clicked')
        // if (w.activate)      return w.activate()
        throw new Error(`click() not implemented for ${w}`)
    },
    activate: (w) => {
        if (w.activate)      return w.activate()
        if (w.emit)          return w.emit('activate')
        throw new Error(`activate() not implemented for ${w}`)
    },
    popup: (w) => {
        if (typeof w.popup == 'function') w.popup()
    },
    popdown: (w) => {
        if (typeof w.popdown == 'function') w.popdown()
    },
    getRoot: (w, gtk_class=Gtk.Window) => {
        const match = (widget) => widget instanceof gtk_class
        let root = match(w)? w : null
        let p = w

        while (p != null) {
            let parent, window
            if (p.get_parent) parent = p.get_parent()  // try to find parent
            if (p.get_window) window = p.get_window()  // try to find parent window

            // check if any result is matching and set it as root and also as next parent
            if      (match(parent))  p = root = parent
            else if (match(window))  p = root = window
            // or just take the next non-null as next parent without setting as root
            else if (parent != null) p = parent
            else if (window != null) p = parent
            else                     break
        }
        return root
    },
    runDialog: (dia, cb=null, close=true) => {
        poly.show(dia)
        dia.connect('response', (o, id) => {
            if (cb) cb(id)
            if (id != Gtk.ResponseType.CLOSE && close) dia.close()
        })
    },
    getWindow: (w) => poly.getRoot(w, Gtk.Window),
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
        const len = theme.get_search_path().length
        if (theme.add_search_path)    theme.add_search_path(path)
        if (theme.append_search_path) theme.append_search_path(path)
        return theme.get_search_path().length - len
    },
    ...timeouts, ...gtk,
}; return poly }

function useGtk(version=null) {
    let env = imports.gi.GLib.getenv('USE_GTK')
    version = version || env
    if (version == null) return
    log(`setting GTK version from @param version=${version}, USE_GTK=${env}`)
    if (typeof version == 'number' || version.length == 1) version = `${version}.0`
    try {
        log(`using GTK/Gdk/GdkX11 ${version}`)
        imports.gi.versions.Gtk = version
        imports.gi.versions.GdkX11 = version
        // imports.gi.versions.Gdk = version
    } catch (e) {
        logError(e)
    }
    return version
}

function gtk3() { return getPoly(3) }
function gtk4() { return getPoly(4) }

if (!this.module) this.module = {}
module.exports = { getPoly, useGtk, gtk3, gtk4, timeouts, LOCKED }
