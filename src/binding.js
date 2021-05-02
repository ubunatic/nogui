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

const HasBindings = Symbol('HasBindings')
const ProxyInfo   = Symbol('ProxyInfo')
const BindInfo    = Symbol('BindInfo')

const logger = require('./logging').getLogger('binding')
const { log, debug, typ, str, len } = logger
const assert = require('./assert')
const { parseExpr, parseLiteral } = require('./expr')

const _ = (obj) => Object.keys(obj).map(k => `${k}:${obj[k]}`).join(',')

let next_proxy_id = 1

function createProxy(obj) {
    if (obj[ProxyInfo] != null) return obj
    log(`createProxy(${typ(obj)}, status=${getUnbindableReason(obj) || 'bindable'})`)
    if (!isBindable(obj)) return obj
    let targets = []
    let bind_id = 0
    const p = new Proxy(obj, {
        deleteProperty: function(obj, k) {
            delete obj[k]
            for (const t of targets) if (t) t(k, null)
            return true
        },
        set: function(obj, k, v) {
            obj[k] = v
            for (const t of targets) if (t) t(k, v)
            return true
        }
    })
    p[ProxyInfo] = {
        id: next_proxy_id++,
        connect:    (onChange) => { bind_id++; targets[bind_id] = onChange; return bind_id },
        disconnect: (id)       => { delete targets[id] }
    }
    return p
}

function getUnbindableReason(obj) {
    if (obj == null)              return 'cannot bind to null'
    if (typeof obj == 'function') return 'cannot bind to function'
    if (typeof obj != 'object')   return 'cannot bind to non-objects'
    if (obj[HasBindings])         return 'cannot reuse objects with bindings'
    if (obj[ProxyInfo])           return 'cannot reuse proxied objects'
    if (obj instanceof Bindable)  return 'cannot reuse Bindables'
    if (obj instanceof Binding)   return 'cannot reuse Bindings'
    if (obj instanceof Promise)   return 'cannot bind to Promise'
    if (obj instanceof GObject)   return 'cannot bind to GObject'
    return null
}

function isBindable(obj) { return getUnbindableReason(obj) == null }

/** @class Binding makes object properties bindable.
 * If the assigned value to the property is again a bindable object,
 * this object will also be "proxied" to bubble up property changes.
 * This does not create a real binding
*/
var Binding = class Binding {
    constructor(obj, field) {
        const val = obj[field]  // current value

        debug(`create Binding(${typ(obj)}, ${field}:${typ(val)})`)

        this.targets = {}
        this.prop_targets = {}
        this.proxy_bind_id = 0
        this.bind_id = 0
        this.field   = field
        this.obj     = obj
        this.value   = null  // start with null
        this.getter = () => this.value
        this.setter = (val) => {
            if (val != this.value) {
                // disconnect previous proxied value before overwriting
                if (this.value != null && this.value[ProxyInfo] != null) {
                    this.value[ProxyInfo].disconnect(this.proxy_bind_id)
                    this.proxy_bind_id = 0
                }

                // automatically listen to array element changes to avoid
                // managing separate list Bindings
                // setting `val` to null will remove the binding (see above)
                if (Array.isArray(val)) {
                    val = createProxy(val)
                    this.proxy_bind_id = val[ProxyInfo].connect((k, v) => {
                        // report any change as fully change of the array
                        // checking for length changes is not sufficient,
                        // since individual elements may have been replaced
                        this.valueChanged(val)
                    })
                }

                // finally set the value as the current value and emit the change
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
    connect(onChange) {
        const id = (this.bind_id += 1)
        if (onChange) this.targets[id] = onChange
        return id
    }
    disconnect(id){
        delete this.targets[id]
    }
}

/**
 * bindTpl parses a template string an returns all found fields and
 * a template value getter to obtain the current template value,
 * based on the bound `data` and `self` objects.
 *
 * @param {string} s      - template string with variable expressions
 * @param {object} data   - data used by the expression
 * @param {string} self   - source of the template
 *
 * The `value` getter returns the completed string.
 * The fields are the variable names found in the template.
 */
function bindTpl(s, data=null, self=null) {
    // debug(`expr.bindTpl data=${typ(data)}`)
    let { expr, fields } = parseLiteral(s)
    return { get value() {
        // debug(`expr.bindTpl.value data=${typ(data)}, data.data=${str(data.data)}`)
        return expr.exec(data, self)
    }, fields }
}

/**
 * bindExpr parses an expression string an returns all found fields and
 * a value getter to obtain the current value defined by the expression by
 * evaluating the bound `data` and `self` objects.
 *
 * @param {string} s      - expression syntax
 * @param {object} data   - data used by the expression
 * @param {string} self   - source of expression
 *
 * The `value` getter returns the computed value of the expression.
 * The fields are the variable names found in the expression syntax.
 */
function bindExpr(s, data=null, self=null) {
    const { expr, fields } = parseExpr(s)
    return { get value() { return expr.exec(data, self) }, fields }
}

/** @class base class for objects with bindable properties */
var Bindable = class Bindable {
    /**
     * @param {object}          data
     * @param {object|Bindable} parent
     */
    constructor(data={}, parent=null) {
        /** @type {Object<string,Binding>} bindings */
        this.bindings = bindAll(data)
        this.data = data
        data[BindInfo] = this

        /** @type {Object<string,Binding[]>} template_bindings */
        this.template_bindings = {}
        this.property_bindings = {}
        this.next_binding_id = 0

        /** @type {Bindable} */
        this.parent = null
        if (parent instanceof Bindable) this.parent = parent
        else if (parent != null)        this.parent = Bind(parent)
    }

    /** @returns {Binding} */
    getBinding(name, depth=0) {
        // log(`getBinding(${name})`)
        if (depth > 100) throw new Error(`getBinding recursion error, cyclic data models are not supported`)
        if (name.startsWith('$')) return this.parent.getBinding(name.slice(1), depth+1)
        else                      return this.bindings[name]
    }

    getBindingValue(name) {
        return this.getBinding(name).value
    }

    getManagedID(name, id) { return `${name}:${id}` }

    toString() { return `${typ(this)}(data=${typ(this.data)}, parent=${typeof this.parent}}` }

    /**
     * @callback valueSetter
     * @param {*} value - the changed value
    */
    /**
     * @param {string} name
     * @param {valueSetter} onChange
     * @returns {{id:number, setter:valueSetter}}
    */
    bindProperty(name, onChange, onPropChange=null) {
        let b = this.getBinding(name)
        if (!b) throw new Error(debug(`missing binding "${name}" in ${this}`))

        const id = b.connect(onChange, onPropChange)
        const binding_id = this.getManagedID(name, id)
        this.property_bindings[binding_id] = {name, id}
        return {id, setter:b.setter}
    }

    bindExpr(syntax, onChange, self=null) {
        const expr = bindExpr(syntax, this.data, self)
        let id = this.bindFields(expr.fields, () => onChange(expr.value))
        onChange(expr.value)  // update expr once to init GUI states
        return {id, expr}
    }

    bindTemplate(tpl, onChange, self=null) {
        const expr = bindTpl(tpl, this.data, self)
        let id = this.bindFields(expr.fields, () => onChange(expr.value))
        onChange(expr.value)  // update template once to avoid weird values
        return {id, expr}
    }

    // binds multiple fields to one change handler
    bindFields(fields, onFieldChange) {
        // no need to bind static text
        if (len(fields) == 0) return null

        // ensure we keep track of all bindings
        const bindings = []
        const binding_id = (this.next_binding_id += 1)
        this.template_bindings[binding_id] = bindings

        for (const name in fields) {
            let { id } = this.bindProperty(name, (v) => onFieldChange(name, v))
            bindings.push({name, id})
        }
        return binding_id
    }

    unbindProperty(name, id) {
        let b = this.getBinding(name)
        if (b) {
            b.disconnect(id)
            const binding_id = this.getManagedID(name, id)
            delete this.property_bindings[binding_id]
        }
    }

    unbindTemplate(id) {
        let bindings = this.template_bindings[id]
        if (bindings) for (const {name,id} of bindings) {
            this.unbindProperty(name, id)
        }
        delete this.template_bindings[id]
    }

    unbindExpr(id) { this.unbindTemplate(id) }

    unbindAll() {
        for (const id in this.template_bindings)                        this.unbindTemplate(id)
        for (const {name, id} of Object.values(this.property_bindings)) this.unbindProperty(name, id)
    }
}

/**
 * bindAll creates a Binding for all properties of `data` making them bindable
 * using the returned `bindings`; also marks the `data` with Symbol `HasBindings`
 *
 * @param {object} data
 * @returns {Object<string,Binding>}
 */
function bindAll(data) {
    debug(`bindAll(${typ(data)})`)
    let msg = getUnbindableReason(data)
    if (msg) throw new Error(`bindAll(${typ(data)}) failed: ${msg}`)

    let bindings = {}
    for (const k in data) {
        bindings[k] = new Binding(data, k)
    }
    data[HasBindings] = true
    return bindings
}

/** return an objects Bindable and setup new Bindable if needed
 * @returns {Bindable}
*/
function Bind(data, parent=null) {
    if (data[BindInfo] == null) new Bindable(data, parent)
    assert.NotNull(data[BindInfo], `failed to setup BindInfo`)
    return data[BindInfo]
}

module.exports = { Bind, Binding, Bindable, bindAll, bindExpr, bindTpl, BindInfo }
