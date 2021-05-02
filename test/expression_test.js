const { parseExpr, parseLiteral, SymParent } = require(`../src/expr`)
const { getLogger } = require('../src/logging')

const logger = getLogger('expr')
const log = logger.log
logger.setVerbose()

const P = SymParent

const examples = [
    { expr: '$val',           data: { val:1 },          exp: 1 },
    { expr: '-$val',          data: { val:1 },          exp: -1 },
    { expr: 'val',            data: { val:1 },          exp: 1 },
    { expr: '-val',           data: { val:1 },          exp: -1 },
    { expr: '$v1 == $v2',     data: { v1:'a', v2:'b' }, exp: false },        
    { expr: '!$v1',           data: { v1:'x'},          exp: false },
    { expr: '$V3ry_Long',     data: { V3ry_Long:true }, exp: true },
    { expr: '$num',           data: { num:2 },          exp: 2 },
    { expr: '$a > $b',        data: { a:2, b:1 },       exp: true },
    { expr: '$a + $b',        data: { a:2, b:1 },       exp: 3 },
    { expr: '-+$v1 - +-$v2',  data: { v1:-1, v2:-1 },   exp: 0 },
    { expr: '$0 + $1 + $2',   data: [3,3,3],            exp: 9 },
    { expr: '$0 + $1 * $2',   data: [3,3,3],            exp: 12 },
    { expr: '$0 * $1 + $2',   data: [3,3,3],            exp: 12 },
    { expr: '$0*$1 == $2*$3', data: [2,3,3,2],          exp: true },
    { expr: '$0+$1 == $2*$3', data: [2,4,3,2],          exp: true },
    { expr: '$0+$1 == $2+$3', data: [3,3,4,2],          exp: true },
    { expr: '$0*$1 == $2+$3', data: [3,2,4,2],          exp: true },
    { expr: '($0 + $1) * $2', data: [2,1,3],            exp: 9 },
    { expr: '$0*$1--($1+$2)', data: [2,3,2],            exp: 11 },
    { expr: '1+1+1+1',        data: [],                 exp: 4 },
    { expr: '11.23e3 + 1.5',  data: [],                 exp: 11231.5 },
    { expr: '"a"+"bc"+\'d\'',                           exp: "abcd" },
    { expr: '"abc" == "a"+"bc"',                        exp: true },
    { expr: '"a" + 2',                                  exp: "a2" },
    { expr: '"a" * 2',                                  exp: NaN },
    { expr: '1 == 1 ? "a" : "b"',                       exp: "a" },
    { expr: '1 == 2 ? "a" : "b"',                       exp: "b" },
    { expr: '1 == 1 ? 2*3 : 5+2',                       exp: 6 },
    { expr: '1 == 2 ? 2*3 : 5+2',                       exp: 7 },
    { expr: '(1 == 2) ? (2*3) : (5+2)*2',               exp: 14 },
    { expr: '$a + $$b + $$$c + $$$$d',
      data: {a:1, [P]: {b:1, [P]: {c:1, [P]: {d:1}}}},
      exp: 4,
    },
    { expr: '@a + $b',        data: {b:1}, self: {a:1}, exp:2 },
    { expr: '"$a".."$b"',     data: {a:1, b:1},         exp:"11" },
    { expr: '"$a X $b"',      data: {a:1, b:1},         exp:"1 X 1" },
    { expr: '"X$a Y$b Z"',    data: {a:1, b:1},         exp:"X1 Y1 Z" },
    { expr: '"X{{a}}{{b}}Y"', data: {a:1, b:1},         exp:"X11Y" },
    { expr: '"{{v?a:b}}"',    data: {v:true, a:1, b:2}, exp:"1" },
    { expr: '"{{!v?a:b}}"',   data: {v:true, a:1, b:2}, exp:"2" },
    { lit:  '{{!v?a:b}}',     data: {v:true, a:1, b:2}, exp:"2" },
    { lit:  '!v?a:b',                                   exp:"!v?a:b" },
]

function testParse() {
    let all = []
    for (const e of examples) {
        let parsed = e.lit? parseLiteral(e.lit) : parseExpr(e.expr)
        let { expr } = parsed
        let check = () => {
            let res = expr.exec(e.data, e.self)
            if (isNaN(e.exp) && isNaN(res) || res == e.exp) {
                log(`parseExpr("${expr}") OK`)
                return
            }
            throw new Error(`bad expr result for ${expr} expected ${e.exp}, got ${res}`)
        }
        check()
        all.push(check)
    }
    return all
}

function benchmarkExec() {
    let all = testParse()
    logger.setSilent()
    let start = Date.now()
    let end   = Date.now() + 100  // run bench for 100ms
    let runs = 0
    while (Date.now() < end) {
        for (const fn of all) { fn(), runs++ }
    }
    let dur = Date.now() - start
    let total = runs * all.length
    let per_sec = total / dur * 1000
    let expr_µs = dur * 1000 / total
    logger.reset()
    log(`benchmark result: runs=${runs}, num_expr=${total}, per_sec=${per_sec}, expr_µs=${expr_µs}`)
}

benchmarkExec()

