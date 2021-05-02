// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const logging = require('./logging')
const { log, debug } = new logging.Logger('tokens')

const TOKEN = {
    SPACE:  'SPACE',
    VAR:    'VAR',
    PROP:   'PROP',
    LIT:    'LIT',
    ADDSUB: 'ADDSUB',
    COMP:   'COMP',
    MULDIV: 'MULDIV',
    UNA:    'UNA',
    LPAR:   'LPAR',
    RPAR:   'RPAR',
    TERN:   'TERN',
    COLON:  'COLON',
    CONCAT: 'CONCAT',
    EXPR:   'EXPR',
}

const LEXPR = {
    SPACE:  /^\s+/,
    VAR:    /^\$+[a-zA-Z0-9_]*|^[a-zA-Z_][a-zA-Z0-9_]*/,
    PROP:   /^@[a-zA-Z0-9_]*/,
    LIT:    /^'[^']*'|^"[^"]*"|^[1-9][0-9]*\.?[0-9]*(e[0-9]+)?/,
    ADDSUB: /^[+\-]/,    
    COMP:   /^==|\!=|[><]=?|&&|\|\|/,
    MULDIV: /^[*/%]/,
    UNA:    /^\!/,
    LPAR:   /^\(/,
    RPAR:   /^\)/,
    TERN:   /^\?/,
    COLON:  /^\:/,
    CONCAT: /^\.\./,
}

const LEXLIT = {
    EXPR: /\{\{([^\}]*)\}\}/,
    VAR:  /^\$+[a-zA-Z0-9_]*/,
    LIT:  /^[^\$]+/,    
}

/**
 * A token presents a single unit of syntax that can be interpreted by the parser.
 *  @class
 */
 class Token {
    /**     
     * @param {string} name 
     * @param {string} src
     */
    constructor(name, src) {
        this.name = name
        this.src = src
    }
    get T() { return this.name }
    toString() {
        if (this.name == TOKEN.SPACE) return ''
        else                          return `${this.name}('${this.src}')`
    }
}

function findClosing(L, R, tokens=[]) {
    let l = 0
    let r = 0
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].name == L) l++
        if (tokens[i].name == R) r++
        if (l == r) return i
        if (r > l) throw new Error(`invalid nesting for close=${r} > open=${l}`)
    }
}

const MODE = {
    AUTO:   'AUTO',
    STRING: 'STRING',
}

/**
 * @param {string} lit 
 */
function tokenizeLiteral(lit, mode=MODE.AUTO) {
    const is_str = lit.match(/^['"`].*/)
    if (mode == MODE.AUTO) {
        if (!is_str) return [new Token(TOKEN.LIT, lit)]
        lit = lit.slice(1,-1)
    } else {
        // MODE.STRING
        // assume lit is raw string literal
    }

    debug(`tokenizing string literal: ${lit}`)
    let tokens = []

    while (lit.length > 0) {
        let m, name, src
        for (const token_name in LEXLIT) {
            // debug(`checking for token ${token_name} in ${lit}`)
            if (m = lit.match(LEXLIT[token_name])) {
                name = token_name
                src = m[1] != null? m[1] : m[0]
                break
            }
        }
        if (name == null) throw new Error(`unexpected literal token at "${s20(code)}"`)

        // combine strings and vars with "+", TODO: use string templates or cast to string
        if (tokens.length > 0) tokens.push(new Token(TOKEN.CONCAT, '..'))        
        
        if (name == TOKEN.LIT) {
            // wrap partial string as new full string
            tokens.push(new Token(name, `'${src}'`))
        }
        else if (name == TOKEN.EXPR) {
            tokens.push(
                new Token(TOKEN.LPAR, '('),
                ...tokenize(src),
                new Token(TOKEN.RPAR, ')'),
            )
        }
        else {
            tokens.push(new Token(name, src))
        }
        
        lit = lit.slice(m[0].length)
    }

    // convert to string
    if (tokens.length == 1) tokens = [
        new Token(TOKEN.LIT, "''"),
        new Token(TOKEN.CONCAT, '..'),
        ...tokens,
    ]

    if (tokens.length > 1) tokens = [
        new Token(TOKEN.LPAR, '('),
        ...tokens,
        new Token(TOKEN.RPAR, ')'),
    ]

    // debug(`literal tokens`, tokens)

    return tokens
}

function s20(s) { return s.slice(0,20) }

/**
 * @param {string} code
 */
function tokenize(code) {
    const tokens = []
    while (code.length > 0) {
        let m, name
        for (const token_name in LEXPR) {
            if (m = code.match(LEXPR[token_name])) { name = token_name; break }
        }
        if (name == null) throw new Error(`unexpected token at "${s20(code)}"`)

        if (name == TOKEN.LIT) tokens.push(...tokenizeLiteral(m[0]))
        else                   tokens.push(new Token(name, m[0]))

        code = code.slice(m[0].length)
    }
    return tokens
}

module.exports = { TOKEN, LEXPR, Token, tokenize, findClosing, tokenizeLiteral, MODE }