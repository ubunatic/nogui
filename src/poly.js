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
    append: (container, o) => {
        // TODO: check if we need smart type switch to call correct "append" on specific widget types
        if (container.append)      return container.append(o)
        if (container.add)         return container.add(o)
        if (container.pack_start)  return container.pack_start(o, ...PACK_START_ARGS)
        if (container.set_child)   return container.set_child(o)
        throw new Error(`append(widget) not implemented for ${container}`)
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
    show:   (w) => { if (!w[LOCKED]) w.show() },
    hide:   (w) => { if (!w[LOCKED]) w.hide() },
    toggle: (w, state) => state? poly.show(w) : poly.hide(w),
    runDialog: (dia, cb=null, close=true) => {
        poly.show(dia)
        dia.connect('response', (o, id) => {
            if (cb) cb(id)
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
        const len = theme.get_search_path().length
        if (theme.add_search_path)    theme.add_search_path(path)
        if (theme.append_search_path) theme.append_search_path(path)
        return theme.get_search_path().length - len
    },
    ...timeouts,
}; return poly }

function useGtk(version=null) {
    version = version || imports.gi.GLib.getenv('USE_GTK')
    if (version == null) return
    log(`using GTK/Gdk/GdkX11 ${version}`)
    if (typeof version == 'number') version = `${version}.0`
    try {
        imports.gi.versions.Gtk = version
        imports.gi.versions.GdkX11 = version
        imports.gi.versions.Gdk = version
    } catch (e) {
        logError(e)
    }
    return version
}

function gtk3() { return getPoly(3) }
function gtk4() { return getPoly(4) }

if (!this.module) this.module = {}
module.exports = { getPoly, useGtk, gtk3, gtk4, timeouts, LOCKED }
