// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { OP, PRECEDENCE,
        Expr, Operator, Variable, Property, Literal,
        SymParent, logger } = require('./expr-types')
const { TOKEN, Token, findClosing, tokenize, tokenizeLiteral, MODE } = require('./expr-tokens')
const { log, debug, error } = logger

/**
 * @param   {Token} t 
 * @param   {Expr} lhs 
 * @param   {Expr} rhs 
 * @returns {Expr}
 */
function precedenceCombine(t, lhs, rhs) {
    if (!lhs) throw new Error(`missing LHS for ${t}`)
    // debug('PRECEDENCE:', t.name, rhs.Token, PRECEDENCE[t.name], rhs.Precedence)
    if (rhs.lhs && rhs.Precedence < PRECEDENCE[t.name]) {
        rhs.lhs = new Operator(OP.BIN, t.src, lhs, rhs.lhs) // steal LHS from lower-precedence RHS
        return rhs                                          // return wrapping RHS as resulting OP
    }
    return new Operator(OP.BIN, t.src, lhs, rhs)
}

/**
 * @param {Expr} lhs
 * @param {Token[]} tokens
 * @returns {Expr}
*/
function parse(lhs, tokens=[]) {
    if (tokens.length == 0) return lhs

    const t = tokens[0]
    if (t.name != TOKEN.SPACE) {
        debug(`PARSE ${t.name}, t=${t}, tokens=${tokens}`)
    }

    switch (t.name) {
        // Spaces and Parenthesis
        case TOKEN.SPACE:
            return parse(lhs, tokens.slice(1))
        case TOKEN.LPAR:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            let i = findClosing(TOKEN.LPAR, TOKEN.RPAR, tokens)
            let expr = parse(null, tokens.slice(1,i))      // parse what is inside ()
            lhs = new Operator(OP.UNA, t.src, null, expr)  // wrap it in an UNA
            return parse(lhs, tokens.slice(i+1))           // parse remainder
        case TOKEN.RPAR:
            throw new Error(`unexpected ${t}`)

        // Variables and Literals
        case TOKEN.VAR:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Variable(t.src), tokens.slice(1))
        case TOKEN.PROP:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Property(t.src), tokens.slice(1))
        case TOKEN.LIT:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Literal(t.src), tokens.slice(1))

        // Binary Operators
        case TOKEN.TERN:   // fallthrough
        case TOKEN.COLON:  // fallthrough
        case TOKEN.COMP:   // fallthrough
        case TOKEN.CONCAT: // fallthrough
        case TOKEN.MULDIV:
            return precedenceCombine(t, lhs, parse(null, tokens.slice(1)))

        // Mixed Unary/Binary Operators
        case TOKEN.ADDSUB:            
            if (lhs) {
                return precedenceCombine(t, lhs, parse(null, tokens.slice(1)))
            }
            // fallthrough to UNA
        case TOKEN.UNA:
            rhs = parse(null, tokens.slice(1))
            if (rhs.T == OP.BIN) {
                // embed higher-precedence UNA
                rhs.lhs = new Operator(OP.UNA, t.src, null, rhs.lhs)
                return rhs
            }
            return new Operator(OP.UNA, t.src, null, rhs)            
    }
    throw new Error(`unexpected token "${t}"`)
}

function parseExpr(syntax) {
    let tokens = tokenize(syntax)    
    let expr = parse(null, tokens)
    return { tokens, expr, fields:expr.fields }
}

function parseLiteral(syntax) {
    let tokens = tokenizeLiteral(syntax, MODE.STRING)
    let expr = parse(null, tokens)
    return { tokens, expr, fields:expr.fields }
}

module.exports = { parseExpr, parseLiteral, SymParent, logger }