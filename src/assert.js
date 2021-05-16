
function typeStr(o) { return (o && o.constructor)? o.constructor.name : typeof o }
function typ(...o)  { return o.map(typeStr).join(', ') }

function Null(v, msg='assert.Null', ...o) {
    assert(v == null, `${msg}, got ${v}, expected null`, ...o)
}

function NotNull(v, msg='assert.NotNull', ...o) {
    assert(v != null, `${msg}, got ${v}, expected non-null`, ...o)
}

function NotEq(v, e, msg='assert.NotEq', ...o) {
    assert(v != e, `${msg}, got ${v} == ${e}`, ...o)
}

function Eq(v, e, msg='assert.Eq', ...o) {
    assert(v == e, `${msg}, got ${v}, expected ${e}`, ...o)
}

function True(val, msg='assert.True', ...o) {
    assert(val, msg, ...o)
}

function False(val, msg='assert.False', ...o) {
    assert(!val, msg, ...o)
}

function InstanceOf(val, T, msg='assert.InstanceOf', ...o) {
    assert(val instanceof T, `${msg}, got ${typ(val)}, expected ${T}`, ...o)
}

function Match(val, expr, capt={}, msg='assert.Match', ...o) {
    let m = `${val}`.match(expr)
    assert(m != null, `${msg}, value ${val} does not match expr ${expr}`, ...o)
    let errors = []
    if (capt) for (const k in capt) {
        let cap = capt[k]
        let got = m[k]
        if (got != cap) errors.push(`capture group ${k} expected "${cap}", got "${got}"`)
    }
    if (errors.length > 0) {
        assert(false, `${msg} capture errors: ${errors.join(', ')}`, ...o)
    }
}

function Fail(msg, ...o) {
    assert(false, msg, ...o)
}

function assert(val, msg='assert', ...o) {
    if (!val) throw new Error(`${msg} ${typ(...o)}`)
}

if (!this.module) this.module = {}
module.exports = {
    assert,
    Null,
    NotNull,
    Eq,
    NotEq,
    True,
    False,
    Fail,
    InstanceOf,
    Match,
}
