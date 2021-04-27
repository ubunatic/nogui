// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const typeString = (obj) => obj.constructor? obj.constructor.name : typeof obj

function objectString(...objects) {
    let res = []
    for (const obj of objects) {
        let s = ''
        try       { s = JSON.stringify(obj) }
        catch (e) { s = `${obj}` }
        try {
            if (s.length > 40) s = s.slice(0,39) + '…'
            res.push(`${typeString(obj)}(${s})`)
        } catch (e) { logError(e) }
    }
    return res.join(', ')
}

/** defaultLogMessage show a log message `msg`
 *  prepends optional `labels` in []-brackets and
 *  appends a string representation of optional `objects`
 */
function defaultLogMessage(msg, labels=[], objects=[]) {
    let res = []
    if (labels  && labels.length  > 0) res.push(`[${labels.join('][')}]`)
    res.push(msg)
    if (objects && objects.length > 0) res.push(` ${objects.join(', ')}`)
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
        const info  = parent && parent.log   || _console.log   || _window.log       || _print
        const debug = parent && parent.debug || _console.log   || _window.log       || _print
        const error = parent && parent.error || _console.error || _window.logError  || _print
        this.name = name
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
        this.obj = objectString
        this.typ = typeString
        // setup default formatter
        this.fmt = defaultLogMessage

        // log functions (callable without `this`)
        this.log   = (msg, ...objs) => { if (this.l >= INFO)  info(this.fmt(msg,  ['info',  this.name], objs)) }
        this.error = (msg, ...objs) => { if (this.l >= ERROR) error(this.fmt(msg, ['error', this.name], objs)) }
        this.debug = (msg, ...objs) => { if (this.l >= DEBUG) debug(this.fmt(msg,  ['debug', this.name], objs)) }
    }

    // shortcut for less code in log logic above
    get l() { return this.level }

    // ATTENTION: Do not add any class methods here since log methods are often used without valid `this`.
}

if (!this.module) this.module = {}
module.exports = { Logger, typeString, objectString, LEVEL }
