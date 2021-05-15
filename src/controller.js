// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const logging = require('./logging')
const { log, debug, str, typ } = logging.getLogger('nogui')
const { GetProxy, GetBinding, Binding } = require('./binding')

var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        this.data      = GetProxy(data)
        this.callbacks = callbacks
        this.window    = window
        this.dialogs   = dialogs
        if (showView != null) this.showView = showView
    }
    showView(name) {
        if (!this.callbacks.showView) {
            throw new Error(`callbacks.showView not set`)
        }
        this.callbacks.showView(name)
    }
    callBack(name, ...args) {
        if(name in this.callbacks) {
            let res = this.callbacks[name](...args)
            if (res instanceof Promise) {
                res.catch((e) => logError(e))
                return
            }
            return res
        }
        logError(new Error(`callback '${name}' not found`))
    }

    openDialog(name)  {
        if(name in this.dialogs) {
            return this.dialogs[name].run(this.window)
        }
        logError(new Error(`dialog '${name}' not found`))
    }

    /** @param {Object<string,Gtk.MessageDialog>} dialogs */
    addDialogs(dialogs) {
        dialogs.forEach(d => this.dialogs[d.name] = d)
    }

    /** @returns {Binding} */
    get binding() { return GetBinding(this.data) }

    /** traverses the property path and makes objects bindable
     *
     * returns the binding at the end of the path or `null`
     * if no `Binding` was found or could be created.
     *
     * Replaces objects along the path with proxies.
     *
     * 1. Traverse down the property path, proxify objects, and
     *    return the value or data object at the end of the path
     * 2. Sets the `Binding.parent` of objects along the path
     *    if the parent was not set.
     *
     * @param {boolean} update  if `true`, updates parent-child relations, overwriting
     *                          all `Binding.parent` objects along the path. This allows
     *                          for calling `bind(path, true)` after property updates.
     * @param {boolean} unbind  if `true`, traversed properties will be unbound by calling
     *                          `Binding.unbindAll()` on each Binding along the path.
     *
     * @returns {Binding}
    */
    bind(path, update=false, unbind=false) {
        const keys = path.split(/\.+/)

        let obj = keys.reduce( (parent, k) => {
            if (parent == null || parent[k] == null) return null

            let child = parent[k]
            let b = GetBinding(child)
            if (b == null) {
                log(`Controller.bind(${path}), k=${k} child=${str(child)}`)
                parent[k] = child = GetProxy(child, parent)
                b = GetBinding(child)
            }
            if (b.parent == null || update) b.parent = GetProxy(parent)
            if (unbind) b.unbindAll()
            return child
        }, this.data)

        if (obj == null) return null
        debug(`Controller.bind(${path}) finished, ${str(obj)}`)
        return GetBinding(obj)
    }
}

if (!this.module) this.module = {}
module.exports = { Controller }