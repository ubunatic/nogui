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

const SymBinding = Symbol('SymBinding')

const logger = require('./logging').getLogger('binding')
const { log, debug, typ, str, len } = logger
const { parseExpr, parseLiteral } = require('./expr')

const _ = (obj) => Object.keys(obj).map(k => `${k}:${obj[k]}`).join(',')

let next_proxy_id = 0
let next_binding_id = 0
const nextProxyID   = () => (next_proxy_id += 1)
const nextBindingID = () => (next_binding_id += 1)

/** Object with its `Binding` assigned to `this[SymBinding]`
 * This class is only used for typing aids during development.
*/
class Proxied {
    constructor(){
        /** @type {Binding} */
        this[SymBinding]
    }
}

/**
 * @callback ValueSetter
 * @param {*} val changed value
 */

/**
 * @callback ChangeHandler
 * @param {string|number} key  name of the changed property
 * @param {*}             val  value of the changed property
 * @param {Object|Array}  obj  the watched object
 */

/** @typedef {number} BindingID */
/** @typedef {string} ConnectID */
/** @typedef {string} PropertyName */

/** @class basic binding class to manage a list of property change receivers
 * @param {Object|Array} obj object to be watched
 *
 * @prop {Number}  id     running number used as ID of this binding
 * @prop {Proxied} proxy  the binding-internal `Proxy` that is used to access data
 *                        and notify all property `targets` and object `watchers`
*/
class Bindable {
    constructor(obj) {
        /** @type {Object<string,ValueSetter>} stores change handlers for single properties */
        this.targets = {}

        /** @type {Object<string,ChangeHandler>} stores change handlers for the whole object */
        this.watchers = {}

        this.id = nextProxyID()
        this.source = obj
        this.proxy = new Proxy(obj, {
            deleteProperty: (obj, k) => {
                obj[k]
                this.notify(k, null)
                return true
            },
            set: (obj, k, v) => {
                obj[k] = v
                this.notify(k, v)
                return true
            }
        })
    }

    // legacy data access properties
    get obj()  { return this.proxy }
    get data() { return this.proxy }

    toString() {
        return `${typ(this)}(proxy=${typ(this.proxy)})`
    }

    parseConnectID(bind_id) {
        const m = bind_id.match(/^(.*):([0-9]+)$/)
        return { k:m[1], id:m[2] }
    }

    connect(k, onChange) {
        const id = nextBindingID()
        const bind_id = `${k}:${id}`
        if (this.targets[k] == null) this.targets[k] = {}
        this.targets[k][id] = onChange
        return bind_id
    }
    disconnect(bind_id) {
        let { k, id } = this.parseConnectID(bind_id)
        return delete this.targets[k][id]
    }

    watch(onChange) {
        let id = nextBindingID()
        this.watchers[id] = onChange
    }
    unwatch(id) {
        return delete this.watchers[id]
    }

    notify(k, v) {
        if (this.targets[k]) {
            Object.values(this.targets[k]).forEach(t => t(v))
        }
        Object.values(this.watchers).forEach(w => w(k, v, this.proxy))
    }
}


/** basic binding class to manage a list of property change receivers
 * @param {Object} obj    object to be watched
 * @param {Object} parent parent object to be watched via '$name' bindings
 */
class Binding extends Bindable {
    constructor(obj, parent=null){
        // debug(`new Binding(${typ(obj)}, status=${getUnbindableReason(obj) || 'bindable'})`)
        super(obj)

        /** @type {Object<string,function>} id and unbind function for all managed bindings */
        this.unbinders = {}

        /**
         * @type {Proxied}
         */
        this.parent = GetProxy(parent)

        /** make Binding accessible from the proxy and the original object */
        this.proxy[SymBinding] = this
        obj[SymBinding] = this

        debug(`create ${this}`)
    }

    size() { return Object.keys(this.unbinders).length }

    toString() {
        return `${typ(this)}(proxy=${typ(this.proxy)}, parent=${typeof this.parent})`
    }

    /** @returns {{p:Object, k:string, b:Binding}} */
    resolve(k, depth=0) {
        // debug(`Binding.resolve(k=${k}), data=${str(this.data)})`)
        if (depth > 100) throw new Error(`getProxy recursion error, cyclic data models are not supported`)
        if (k.startsWith('$')) return GetBinding(this.parent).resolve(k.slice(1), depth+1)
        else                   return {p:this.proxy, k, b:this}
    }
    getValue(k) {
        const res = this.resolve(k)
        return res.p[res.k]
    }
    setValue(k, v) {
        const res = this.resolve(k)
        return res.p[res.k] = v
    }
    deleteValue(k) {
        const res = this.resolve(k)
        return delete res.p[res.k]
    }

    /**
     * @callback ValueSetter
     * @param {*} value - the changed value
    */
    /**
     * Registers a `ValueSetter` function to observe changes of the named property.
     * This excludes nested changes, i.e., of properties of the named property.
     *
     * @param {string} name
     * @param {ValueSetter} onChange
     * @returns {{id:number, setter:ValueSetter}}
    */
    bindProperty(name, onChange) {
        const {p,k,b} = this.resolve(name)
        const setter = (v) => p[k] = v
        const id = b.connect(k, onChange)
        const unbind = () => b.disconnect(id)
        this.unbinders[id] = unbind
        return {id, setter}
    }

    /**
     * Registers a `ChangeHandler` function to observe value and nested value changes
     * of the named property. This excludes nested changes of the direct properties
     * of the named property (no recursion).
     *
     * If the whole object is changed by directly setting the named property, the change
     * handler is disconnected from the old object and registered at the new one to
     * also observer property changes of the new object.
     *
     * @param {string} name
     * @param {ChangeHandler} onChange
     */
    bindObject(name, onChange) {
        debug(`bindObject(${name}, ${typeof onChange})`)
        const {p,k,b} = this.resolve(name)

        // setup hooks for obj watcher to watch nested property changes
        let watch_id = null
        let bind_id = null
        let obj = null

        /** unwatch previous proxy */
        const unwatch = () => {
            if (watch_id == null) return
            GetBinding(obj).unwatch(watch_id)
            watch_id = null
        }

        /** switch onChange handler to new proxy */
        const watch = (v) => {
            unwatch()
            obj = v
            watch_id = GetBinding(obj).watch(onChange)
            onChange(null, null, obj)
        }

        /** set proxy[k] and thus notify any connected observers */
        const setter = (v) => p[k] = GetProxy(v, p)

        /** stops observing both direct and nested property changes */
        const unbind = () => {
            unwatch()
            b.disconnect(bind_id)
        }

        setter(p[k])                      // set value once to ensure it is proxfied and bindable
        bind_id = b.connect(k, watch)     // observe direct property changed (new objects)
        this.unbinders[bind_id] = unbind  // allow unbinding
        watch(p[k])                       // also start observing nested property changes

        return {bind_id, setter}
    }

    bindExpr(syntax, onChange, self=null) {
        const expr = bindExpr(syntax, this.proxy, self)
        const res = this.bindFields(expr.fields, () => onChange(expr.value))
        onChange(expr.value)  // update expr once to init GUI states
        return {...res, expr}
    }

    bindTemplate(tpl, onChange, self=null) {
        const expr = bindTpl(tpl, this.proxy, self)
        const res = this.bindFields(expr.fields, () => {
            onChange(expr.value)
            // debug(`bindTemplate.onChange ${expr.value}`)
        })
        onChange(expr.value)  // update template once to avoid weird values
        return {...res, expr}
    }

    // binds multiple fields to one change handler
    bindFields(fields, onFieldChange) {
        // no need to bind static text
        if (len(fields) == 0) return null

        debug(`bindFields(${str(fields)})`)

        // keep track of all bindings
        const ids = []
        const setters = {}
        const binding_id = nextBindingID()

        for (const name in fields) {
            const { id, setter } = this.bindProperty(name, (v) => {
                onFieldChange(name, v)
                // log(`bindFields.onFieldChange ${name}=${v}`)
            })
            ids.push(id)
            setters[id] = setter
        }

        const unbind = () => {
            ids.forEach(id => this.unbind(id))
            for (const name in fields) delete setter[name]
        }

        const setter = (o) => {
            for (const name in fields) setters[name](o[name])
        }

        this.unbinders[binding_id] = unbind

        return { id:binding_id, setter }
    }

    unbind(id) {
        const unbind = this.unbinders[id]
        if (unbind) unbind()
        delete this.unbinders[id]
    }

    unbindAll() {
        Object.keys(this.unbinders).forEach(id => this.unbind(id))
    }
}

/**
 * Returns the `Binding.proxy` of the object's `Binding`.
 * If not present, creates a new `Binding` for the given `obj`.
 *
 * @param {object}  obj       the object to be proxied
 * @param {object}  parent    a parent object to be proxied
 * @param {boolean} recursive whether or not to proxify child properties
 * @param {number}  depth     recursion depth for safety checks
 *
 * @returns {Proxied}         a bindable `Proxy` to the object
 *
 * The returned proxy will have a `Binding` assigned to `obj[SymBinding]`
 * that can be used as follows.
 *
 * @example <caption>Basic Usage</caption>
 * let obj = GetProxy(loadMyData())  // make data object bindable before using it
 * obj['x'] = 0                      // use the returned proxy as data object
 *
 * let onChange = (v) => print(`value changed: x=${v}`)
 *
 * let b  = binding.GetBinding(obj)        // get Binding of the proxy
 * let id = b.bindProperty('x', onChange)  // watch for for changes
 * obj['x'] = 1
 * // output: "value changed: x=1"
 *
 * b.unbind(id)
 * obj['x'] = 2
 * // output: none
 *
*/
function GetProxy(obj, parent=null, recursive=true, depth=0) {
    if (GetBinding(obj) != null) return obj  // object is already bindable, no need to proxy
    if (!isBindable(obj))        return obj  // don't proxy literal values and system objects

    const proxy = new Binding(obj, parent).proxy
    if (recursive) {
        if (depth > 100) throw new Error(`cannot create proxies for cyclic data models`)

        // create proxies for all properties
        Object.keys(obj).map(k => {
            let v = proxy[k]                    // get current property value
            if (GetBinding(v) != null) return  // object is already bindable, no need to update
            if (!isBindable(v))        return  // stop recursion and literal values of system objects

            // create a proxy and update the parent property value
            proxy[k] = GetProxy(v, proxy, recursive, depth+1)
        })
    }
    return proxy
}

/** returns the `Binding` of the given object or `null` if no binding is
 * set. Use `GetProxy` instead to create bindings as needed.
 *
 * @returns {Binding}
*/
function GetBinding(obj) {
    if (obj == null) return null
    return obj[SymBinding]
}

/**
 * Creates and returns data `model` to be proxied by the source object `obj`
 * and modifies the source object to work as proxy to the new data.
 * If the `obj` already has a `Binding` it will not modify the `obj` and return
 * the present `Binding.proxy` instead.
 *
 * Wiring the the source `obj` to a new data models works as follows.
 *
 *  1. Create a new bindable data model (an empty object with a new `Binding`).
 *  2. Define getters and setters on the source `obj` for all given `keys` to
 *     access the model values. The default keys are all `Object.keys` of `obj`.
 *  3. Store the `Binding` of the model also as `obj[SymBinding]` to
 *     make it accessible from the caller. By that the `obj` can be treated as
 *     a `Proxied` object which can register change handlers via its `Binding`.
 *
 * This function does not recursively modify the child objects. Only the
 * root object `obj` will get new getters and setters, However, new values
 * assigned to the source object's properties will still be proxied if possible
 * and linked to their parent.
 * This is because a `Proxy` allows for handling of `delete obj[key]` and is
 * currently preferred over direct source object modifications.
 *
 * @returns {Proxied} model
 *
 * @example
 * let app = {
 *     clicks:0,
 *     deep: {val:0},
 *     init()     { binding.Bind(this, ['clicks','deep']) },
 *     click()    { this.clicks++ },
 *     bind(k,fn) { return binding.GetBinding(this).bindProperty(k,fn) }
 * }
 *
 * app.init()
 * app.bind('clicks', (v) => print(`clicked ${clicks} times`))
 * app.click()
 *
 * // binding to nested properties
 * binding.GetBinding(app.deep).('val', (v) => print(`deep.val=${v}`))
 *
*/
function Bind(obj, keys=null) {
    // Strictly disallow `null` as data source.
    // This indicates misuse of `Bind` with child-objects in setters,
    // which should be better handled with proxies.
    if (obj == null) throw new Error('Cannot Bind to null')

    // If we have a binding already all is good.
    // No need to modify the source object.
    let b = GetBinding(obj)
    if (b != null) return b.proxy

    if (keys == null) keys = Object.keys(obj)

    // No binding was found but keys are defined. Now let's create a data model.
    // Since we are going to overwrite setters and getters on the source `obj`,
    // we need a place to store the actual values. Thereby, the source object
    // actually becomes the implicit "proxy" for the new data model.
    b = new Binding({})  // create an empty object with a Binding

    // Convert the source object to become a proxy instead of a value store.
    keys.forEach(k => AddProperty(obj, k, b))

    // Also store the binding as Binding of the source object.
    // This allow for directly subscribing to properties from the source object.
    obj[SymBinding] = b

    // The source object is now compatible with regular `Proxied` objects.
    debug(`Bind(${str(obj)}, keys=${str(keys)})`)

    // Return the native `Proxy` of the data model. Using this proxy is the
    // preferred way of accessing the data instead of over the source object's
    // getters and setters.
    return b.proxy
}

function AddProperty(obj, k, binding=GetBinding(obj)) {
    if (!binding) throw new Error('cannot AddProperty to non-bindable')
    const model = binding.proxy

    // The goal is to make `obj[k] = val` also set `model[k] = val`
    // and thereby notify any subscribers of the `Binding` to `k`.
    // overwrite property getter and setter pointing to the new model
    // the setter will also proxify any given value to make the whole
    // property tree bindable.
    const getter = ()  => model[k]
    const setter = (v) => model[k] = GetProxy(v, model)

    setter(obj[k])  // copy property value and proxify through the setter

    // augment the source object to act as a naive proxy, i.e., without
    // support for `delete obj[key]` statements.
    Object.defineProperty(obj, k, {
        get: getter,
        set: setter,
    })
}

/** @param {Proxied} obj */
function Unbind(obj) {
    const b = GetBinding(obj)
    if (b == null) return
    b.unbindAll()
}

function getUnbindableReason(obj) {
    if (obj == null)              return 'cannot bind to null'
    if (typeof obj == 'function') return 'cannot bind to function'
    if (typeof obj != 'object')   return 'cannot bind to non-objects'
    if (obj[SymBinding])          return 'cannot reuse proxied objects'
    if (obj instanceof Bindable)  return 'cannot bind to Bindable'
    if (obj instanceof Binding)   return 'cannot bind to Binding'
    if (obj instanceof Promise)   return 'cannot bind to Promise'
    if (obj instanceof GObject)   return 'cannot bind to GObject'
    return null
}

function isBindable(obj) { return getUnbindableReason(obj) == null }

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

module.exports = { Bind, AddProperty, Unbind, GetProxy, GetBinding, Binding, bindExpr, bindTpl, SymBinding }
