// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const binding = require('./binding')

var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        this.data      = new binding.Bindable(data)
        this.window    = window
        this.callbacks = callbacks
        this.dialogs   = dialogs
        if (showView != null) this.showView = showView
    }
    showView(name) {
        throw new Error(`Controller.showView not set`)
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
}

if (!this.module) this.module = {}
module.exports = { Controller }