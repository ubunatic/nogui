
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

function Fail(msg, ...o) {
    assert(false, msg, ...o)
}

function assert(val, msg='assert', ...o) {
    if (!val) throw new Error(`${msg} ${typ(...o)}`)
}

if (!this.module) this.module = {}
module.exports = {
    Null:    Null,
    NotNull: NotNull,
    Eq:      Eq,
    NotEq:   NotEq,
    True:    True,
    False:   False,
    Fail:    Fail,
    assert:  assert,
}
