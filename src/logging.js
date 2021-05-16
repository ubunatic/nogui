// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

var ELLIPS = {
    LEN: 60,
    STR: '…',
}

/** returns the main class name or type of the object */
function typeString(obj) {
    return (obj && obj.constructor)? obj.constructor.name : typeof obj
}

/** returns the class or type and an ellipsed value of the object */
function objectString(obj) {
    let s = ''
    try       { s = JSON.stringify(obj) }
    catch (e) { s = `${obj}` }
    if (s === undefined) s = 'undefined'
    try {
        if (s.length > ELLIPS.LEN) s = `${s.slice(0, ELLIPS.LEN - 1)}${ELLIPS.STR}`
        s = `${typeString(obj)}(${s})`
    } catch (e) {
        error(e)
        throw e
    }
    return s
}

/** returns the main class names or types of the objects */
const typeStrings = (...o) => o.map(typeString).join(', ')
var typ = typeStrings

/** returns the classes or types and ellipsed values of the objects */
const objectStrings = (...o) => o.map(objectString).join(', ')
var str = objectStrings

/** returns `length` of object of number of keys */
var len = (o) => o.length != null? o.length : Object.keys(o).length

/** defaultLogMessage show a log message `msg`
 *  prepends optional `labels` in []-brackets and
 *  appends a string representation of optional `objects`
 */
function defaultLogMessage(msg, labels=[], objects=[]) {
    let res = []
    if (labels  && labels.length  > 0) res.push(`[${labels.join('][')}]`)
    if (msg !== undefined && msg !== null) res.push(msg)
    if (objects && objects.length > 0) res.push(` ${str(...objects)}`)
    return res.join(' ')
}

const ERROR = 0
const INFO  = 1
const DEBUG = 2

const LEVEL = {
    ERROR: ERROR,
    INFO:  INFO,
    DEBUG: DEBUG,
}

const self = this

// setup default loggers for different systems
// TODO: better system detection
let _window = {}, _console = {}
try { _window  = window  } catch (e) {}  // system is GJS
try { _console = console } catch (e) {}  // system is Node.js
try { _print   = print   } catch (e) {}  // other system with "print" as fallback

var Logger = class Logger {
    /**
     * @param {string} name     - prefix added to the log message
     * @param {Object} global   - global `this` where you would access `log` implicitly, default value is `window`
     */
    constructor(name, parent=null) {
        const info  = parent && parent.log   || _console.log   || _window.log      || _print
        const debug = parent && parent.debug || _console.log   || _window.log      || _print
        const error = parent && parent.error || _console.error || _window.logError || _print
        this.name = name
        this.labels = this.name? [name] : []
        this.connected = []
        this.level = INFO

        // public functions bound to `this` logger so they can be called without `this`
        /** switches between INFO and DEBUG level based on boolean value `v`
         * @param {boolean} v  - true sets DEBUG level, false sets INFO level
         * */
        this.setVerbose = (v=true) => this.level = v? DEBUG : INFO
        this.setSilent  = (v=true) => this.level = v? ERROR : INFO
        this.reset      = ()       => this.level = INFO
        this.setLevel   = (level)  => this.level = level

        // formatters for inspecting types and objects
        this.str = str
        this.typ = typ
        this.len = len
        // setup default formatter
        this.fmt = defaultLogMessage

        // prefix level label to labels
        const labels  = (l) => [l, ...this.labels]
        const gt      = (l) =>  this.l >= l

        // log functions (callable without `this`)
        this.log   = (msg, ...objs)      => gt(INFO)  && info(      this.fmt(msg, labels('info'),  objs))
        this.error = (err, msg, ...objs) => gt(ERROR) && error(err, this.fmt(msg, labels('error'), objs))
        this.debug = (msg, ...objs)      => gt(DEBUG) && debug(     this.fmt(msg, labels('debug'), objs))
    }

    get level()  { return this._level }
    set level(l) {
        this._level = l
        this.connected.forEach(fn => fn(l))
    }

    /** connect a level change handler to propagate runtime level changes */
    connect(onLevelChange) {
        this.connected.push(onLevelChange)
        onLevelChange(this.level)
    }

    // shortcut for less code in log logic above
    get l() { return this.level }

    // ATTENTION: Do not add any class methods here since log methods are often used without valid `this`.
}

/** @type {Object<string,Logger>} */
const loggers = {}
function getLogger(name) {
    if (!(name in loggers)) {
        loggers[name] = new Logger(name)
    }
    return loggers[name]
}

function applyAll(fn) { for (const name in loggers) fn(loggers[name]) }

/** set verbose state of all loggers */
function setVerbose(v=true) {
    applyAll(l => l.setVerbose(v))
    if (v) log(`setting all loggers to verbose logging level`)
}

/** set silent state of all loggers */
function setSilent(v=true)  { applyAll(l => l.setSilent(v)) }

/** set log level of all loggers */
function setLevel(l)        { applyAll(l => l.setLevel(l)) }

var logger = new Logger('')
var {log, debug, error} = logger

if (!this.module) this.module = {}
module.exports = {
    Logger, logger, setVerbose, setSilent, setLevel, getLogger,
    typ, str, len, log, debug, error,
    LEVEL, ELLIPS
}
