// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

/**
 * Bindings Module
 * @module binding
 * 
 * This module contains classes and functions for controlling
 * data bindings and object proxies.
 */

let GObject
try       { GObject = imports.gi.GObject.Object }
catch (e) { GObject = class GObject {}}

const logging = require('./logging')
const { log, debug, setVerbose, obj } = new logging.Logger('binding')
const { parseExpr, parseLiteral } = require('./expr')

const _ = (obj) => Object.keys(obj).map(k => `${k}:${obj[k]}`).join(',')

function proxy(obj, onChange) {
    if (!isProxiable(obj)) return obj
    debug('create', obj)
    return new Proxy(obj, {
        deleteProperty: function(obj, k) {
            delete obj[k]
            onChange(k, null)
            return true
        },
        set: function(obj, k, v) {      
            obj[k] = v
            onChange(k, v)
            return true;
        }
    })
}

function isBindable(obj) {
    if (typeof obj == 'function') return false
    if (obj instanceof Promise)   return false  // don't fiddle with Promises
    if (obj instanceof GObject)   return false  // don't fiddle with GObject, only pure data objects allowed
    return true
}

function isProxiable(obj) { return (
    isBindable(obj)           &&
    typeof obj == 'object'    &&  // only 'objects' can be proxied
    obj != null
)}

var Binding = class Binding {
    constructor(obj, field) {
        const val = obj[field]  // current value

        const type = obj.constructor? obj.constructor.name : typeof obj
        debug(`create Binding([${type}], '${field}')`)

        this.targets = {}
        this.prop_targets = {}
        this.bind_id = 0
        this.field   = field
        this.obj     = obj
        this.value   = null  // start with null
        this.getter = () => this.value
        this.setter = (val) => {
            if (val != this.value) {
                val = proxy(val, (k, v) => this.propChanged(k, v))
                this.value = val
                this.valueChanged(val)
            }
        }

        Object.defineProperty(obj, field, {
            get: this.getter,
            set: this.setter,
        })
    
        obj[field] = val
    }
    valueChanged(v){
        Object.values(this.targets).forEach(t => t(v))
        return this
    }
    propChanged(k, v){
        Object.values(this.prop_targets).forEach(t => t(k, v))
        return this
    }
    connect(onChange, onPropChange=null){
        const id = (this.bind_id++)
        this.targets[id] = onChange
        if (onPropChange) this.prop_targets[id] = onPropChange
        return id
    }
    disconnect(id){
        delete this.targets[id]
        delete this.prop_targets[id]
    }
}

/**
 * parse_template parses a template string an returns a template array,
 * the found template fields, and a setter for updating values.
 * 
 * @param {string} s     - template string with variable expressions
 * @param {string} self  - source of the template
 * 
 * The getter returns the complete string. The setter requires a variable name and a value
 * to be updated. The fields are the variable names found in the template.
 */
function parse_template(s, self=null) {
    let tpl = ''
    let { expr, fields } = parseLiteral(s)

    let getter = null, setter = null
    if (fields != null) {
        let data = {}  // copy of the watched data, used for evaluation via `expr.exec`

        getter = () => tpl
        /**
         * @param {string} field - name of variable to update
         * @param {string} val   - value to put in the template
         * @returns {boolean}    - true if value changed, false otherwise
         */
        setter = (field, val) => {
            // ignore updates for know values that did not change
            if      (!(field in data))   { debug(`init tpl field: ${field}:${val}`) }
            else if (val == data[field]) { debug(`ignore tpl field: ${field}:${val}`); return false }
            else                         { debug(`update tpl field: ${field}:${val}`) }

            if (field in data && data[field] == val) return false
            data[field] = val                // store last know value
            
            let res = expr.exec(data, self)  // compute expr result
            if (tpl != res) {
                tpl = res
                return true
            }
            return false
        }
    }
    return { fields, setter, getter }
}

function parse_expr(s) {
    const {tokens, expr} = parseExpr(s)
    let comp = (row, data) => expr.exec(data, row)
    let fields = expr.fields
    // debug(`parsed ${tokens} as ${expr} with fields`, obj(expr.fields))
    return { comp, fields }
}

/** @class base class for objects with bindable properties */
var Bindable = class Bindable {
    /**
     * @param {Object<string,Binding>} bindings
     * @param {Bindable}               parent
     */
    constructor(bindings={}, parent=null) {
        /** @type {Object<string,Binding>} bindings */
        this.bindings = bindings
        /** @type {Object<string,Binding[]>} template_bindings */
        this.template_bindings = {}
        this.next_template_binding_id = 0
        this.parent = parent
    }

    getBinding(name) {
        // TODO: recursion check
        if (name.startsWith('$')) return this.parent.getBinding(name.slice(1))
        else                      return this.bindings[name]
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
    bindProperty(name, onChange, onPropChange=null) {
        let b = this.getBinding(name)
        if (!b) throw new Error(debug(`missing binding "${name}" in data model of`, this))
        const id = b.connect(onChange, onPropChange)
        return {id, setter:b.setter}
    }
    unbindProperty(name, id) {
        let b = this.getBinding(name)
        if (b) b.disconnect(id)
    }
    getBindingValue(name) {
        return this.getBinding(name).value
    }
    bindTemplate(tpl, onChange, self=null) {
        let { fields, setter, getter } = parse_template(tpl, self)
        if (fields == null) return null
        debug(`bindTemplate tpl='${tpl}', fields=${obj(fields)}`)

        // ensure we keep track of all bindings        
        let bindings = []
        let binding_id = (this.next_template_binding_id += 1)
        this.template_bindings[binding_id] = bindings

        for (const name in fields) {                                            
            let { id } = this.bindProperty(name, (v) => {
                if (setter(name, v)) onChange(getter())
            })
            let val = this.getBindingValue(name)
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
}

/**
 * bindAll creates a Binding for all properties of `data` making them bindable
 * using the returned bindings.
 * 
 * @param {object} data 
 * @returns {Object.<string, Binding>}
 */
 function bindAll(data) {
    let bindings = {}
    for (const k in data) {
        if (isBindable(data[k])) bindings[k] = new Binding(data, k)
    }
    return bindings
}

module.exports = { Binding, Bindable, bindAll, parse_expr, parse_template, setVerbose }
