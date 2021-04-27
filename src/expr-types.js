// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

/**
 * This module implements a basic expression language used by nogui
 * for widgets property bindings and for template bindings.
 * @module expression
 */

const { Logger } = require('./logging')
const logger = new Logger('expr')
const { log, debug, error } = logger

const { TOKEN, LEXPR } = require('./expr-tokens')

const SymParent = Symbol('Parent')

const VAR    = /^\$*/
const PROP   = /^@/
const NUMBER = /^[1-9][0-9]*\.?[0-9]*(e[0-9]+)?$/
const STRING = /^("[^"]*"|'[^']*')$/

const OP = {
    VAR:    'VAR',
    BIN:    'BIN',
    UNA:    'UNA',
}

const PRECEDENCE = {
    UNA:     100, // una before any
    MULDIV:  90,  // mult before add
    CONCAT:  85,  // concat before add
    ADDSUB:  80,  // add before logic
    COMP:    70,  // logic comparators before grouping
    LPAR:    50,  // 
    RPAR:    50,  // grouping before logic syntax
    TERN:    20,  // logic part1
    COLON:   20,  // logic part2
    VAR:     0,   // variables and
    LIT:     0,   // literals and
    PROP:    0,   // properties have no precedence
}

function getUnaryExec(str) {
    switch (str) {
        case '!': return (_, rhs, data, self=null) => !rhs.exec(data, self)
        case '-': return (_, rhs, data, self=null) => -rhs.exec(data, self)
        case '+': return (_, rhs, data, self=null) => +rhs.exec(data, self)
        case '(': return (_, rhs, data, self=null) =>  rhs.exec(data, self)
    }
    throw new Error(`invalid unary operator ${this} ${this.T}`)
}

function getBinaryExec(str) {
    switch (str) {
        case '==': return (lhs, rhs, data, self=null) => lhs.exec(data, self) == rhs.exec(data, self)
        case '!=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) != rhs.exec(data, self)
        case '&&': return (lhs, rhs, data, self=null) => lhs.exec(data, self) && rhs.exec(data, self)
        case '||': return (lhs, rhs, data, self=null) => lhs.exec(data, self) || rhs.exec(data, self)
        case '>=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) >= rhs.exec(data, self)
        case '<=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) <= rhs.exec(data, self)
        case '>':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  > rhs.exec(data, self)
        case '<':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  < rhs.exec(data, self)
        case '+':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  + rhs.exec(data, self)
        case '-':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  - rhs.exec(data, self)
        case '*':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  * rhs.exec(data, self)
        case '/':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  / rhs.exec(data, self)
        case '%':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  % rhs.exec(data, self)
        case '..': return (lhs, rhs, data, self=null) => `${lhs.exec(data, self)}${rhs.exec(data, self)}`
        case '?':  return (lhs, rhs, data, self=null) => (
            lhs.exec(data, self) ? rhs.lhs.exec(data, self) : rhs.rhs.exec(data, self)
        )
        case ':':  return (lhs, rhs, data, self=null) => { throw new Error('cannot execute rhs-only of ternary') }
        
    }
    throw new Error(`invalid binary operator ${str}`)   
}

/**
 * Base class for parse expressions
 * @interface
 */
class Expr {
    get T()               { return 'Empty' }
    get Token()           { return '' }
    toString()            { return 'Empty()' }
    exec(data, self=null) { return null }
    get fields()          { return {} }
}

/** @implements {Expr} */
class Operator {
    constructor(typ, text, lhs=null, rhs=null){
        this.typ  = typ
        this.text = text
        this.op   = text
        this.lhs  = lhs
        this.rhs  = rhs
        // "compile" the operator now!
        switch (this.T) {
            case OP.UNA: this.exec_fn = getUnaryExec(this.op);  break
            case OP.BIN: this.exec_fn = getBinaryExec(this.op); break
            default: throw new Error(`invalid operator: ${this.op}`)
        }
    }

    get T() { return this.typ }

    get Token() {
        if (this.op.match(LEXPR.COMP))   return TOKEN.COMP
        if (this.op.match(LEXPR.MULDIV)) return TOKEN.MULDIV
        if (this.op.match(LEXPR.ADDSUB)) return TOKEN.ADDSUB
        if (this.op.match(LEXPR.UNA))    return TOKEN.UNA
        if (this.op.match(LEXPR.LPAR))   return TOKEN.LPAR
        if (this.op.match(LEXPR.RPAR))   return TOKEN.RPAR
        if (this.op.match(LEXPR.TERN))   return TOKEN.TERN
        if (this.op.match(LEXPR.COLON))  return TOKEN.COLON
        if (this.op.match(LEXPR.CONCAT)) return TOKEN.CONCAT
    }

    get Precedence() { return PRECEDENCE[this.Token] }

    toString() {
        let res = []
        if (this.lhs) res.push(`(${this.lhs})`)
        let op = this.op
        if (this.T == OP.UNA) op += `¹`
        if (this.T == OP.BIN) op += `²`
        res.push(op)
        if (this.rhs) res.push(`(${this.rhs})`)
        if (this.Token == TOKEN.LPAR) res.push(')')
        return res.join(' ')
    }
    exec(data, self=null) { return this.exec_fn(this.lhs, this.rhs, data, self) }
    get fields() {
        let res
        if (this.lhs) res = this.lhs.fields
        if (this.rhs) res = { ...res, ...this.rhs.fields }
        return res
    }
}

/** @implements {Expr} */
class Literal {
    constructor(text) {
        this.text = text
        if      (text.match(NUMBER)) this.value = Number(text)
        else if (text.match(STRING)) this.value = text.slice(1,-1)
        else throw new Error(`unexpected Literal value ${text}`)        
    }
    get T()          { return OP.VAR }
    get Token()      { return TOKEN.LIT }
    get Precedence() { return 0 }
    toString()  { return `${this.value}` }
    exec(data, self=null)  {
        // log(`Literal.exec -> "${this.value}"`)
        return this.value
    }
    get fields() { return null }
}

/** @implements {Expr} */
class Variable {
    constructor(text, matcher=VAR) {
        let m = text.match(matcher)[0]
        this.text = text
        this.prop = m.length == 0? text : text.slice(1)  // remove first "$" if needed
        this.name = text.slice(m.length)
        this.depth = m.length
        this.noname = (m.length == text.length)
        // TODO: precompile depth traversal
    }

    get T()     { return OP.VAR }
    get Token() { return TOKEN.VAR }
    get Precedence() { return 0 }
    toString() { return this.text }
    getValue(obj) {
        // A) allow parent access via SymParent
        if (SymParent in obj) {
            if      (this.depth == 2) obj = obj[SymParent]
            else if (this.depth  > 2) for (let i = this.depth; i >= 2; i--) obj = obj[SymParent]
            if (this.noname) return obj
            return obj[this.name]
        }
        // B) access parent simply by full var name with "$" suffix
        return obj[this.prop]
    }
    exec(data, self=null) { return this.getValue(data) }
    get fields() {
        let res = {}
        res[this.prop] = true
        return res
    }
}

class Property extends Variable {
    constructor(text) { super(text, PROP) }
    exec(data, self) { return this.getValue(self) }
    get fields() { return null }
}

module.exports = {
    OP, PRECEDENCE,
    Operator, Literal, Variable, Property, Expr,
    SymParent, logger
}