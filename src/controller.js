// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const binding = require('./binding')

var Controller = class Controller extends binding.Bindable {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        super(binding.bindAll(data))
        this.window      = window       
        this.data        = data
        this.callbacks   = callbacks
        this.dialogs     = dialogs
        this.showView    = showView
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
    _add_dialogs(dialogs) {
        dialogs.forEach(d => this.dialogs[d.name] = d)
    }    
}

if (!this.module) this.module = {}
module.exports = { Controller }