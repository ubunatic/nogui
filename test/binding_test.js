const { bindAll, bindExpr, bindTpl, Bindable, Binding } = require(`../src/binding`)
const { getLogger } = require('../src/logging')
const assert = require('../src/assert')

const logger = getLogger('binding')
const { log, debug, typ } = logger
logger.setVerbose()

function testBinding() {
    let b = new Binding({a:1}, 'a')
    assert.Eq(b.obj.a, 1)

    let res = null
    let id = b.connect((v) => res = v)
    assert.NotNull(b.targets[id], 'binding must have targets')

    b.obj.a = 2
    assert.Eq(b.obj.a, 2, `expected property change a=2, got ${b.obj.a}`)
    assert.Eq(res, 2, 'binding must change value to 2')

    b.disconnect(id)
    assert.Null(b.targets[id])
    log(`OK testBinding`)
}

function testPropBinding() {
    // let b = new Binding({a:{b:1}}, 'a')
    // assert.Eq(b.obj.a.b, 1)

    // let res = {}
    // let id = b.connect(null, (k, v) => res = {k, v} )
    // assert.NotNull(b.prop_targets[id], 'expected property binding')

    // b.obj.a.b = 2
    // assert.Eq(b.obj.a.b, 2, 'expected nested property b=2')
    // assert.Eq(res.k, 'b',   'expected connect result key   k="b"', res)
    // assert.Eq(res.v, 2,     'expected connect result value v=2', res)

    // b.disconnect(id)
    // assert.Null(b.targets[id])
    // log(`OK testPropBinding`)
}

function testBindable() {
    let b = new Bindable({a:1, b:{x:1}, c:['x','y']})

    let val = null
    b.bindProperty('a', (v) => val = v)
    b.data.a = 2
    assert.Eq(val, 2)

    let prop = {}
    let { id } = b.bindProperty('b', (v) => prop.v = v)
    let mid = b.getManagedID('b', id)
    assert.Eq(mid, 'b:1')
    b.data.x = 3
    assert.Null(prop.v, `binding must not bubble up internal property updates`)

    b.bindProperty('c', (v) => prop.v = v)
    assert.Null(prop.v, `binding must not bubble up initial list`)
    b.data.c.push('z')
    assert.NotNull(prop.v, `binding must bubble up list changes`)

    assert.Eq(Object.keys(b.property_bindings).length, 3)

    b.unbindAll()
    assert.Eq(Object.keys(b.property_bindings).length, 0)

    log(`OK testBindable`)
}

function testBindAll() {
    let data = {
        a:1,
        b:{x:1},
        fn() {},
        null:null,
        b1:false,
        b2:false,
        empty:'',
    }
    let bindings = bindAll(data)
    assert.Eq(Object.keys(bindings).length, 7)

    try {
        bindAll(data)
        assert(false, 'must not re-bind')
    } catch (e) {
        debug(`no-re-bind check successful`)
    }

    log(`OK testBindAll`)
}

function testBindTemplate() {
    let data = {a:true, x:1, y:2}
    let s = '{{ a? "$x": y }}'
    let t = bindTpl(s, data)
    assert.True('a' in t.fields)
    assert.True('x' in t.fields)
    assert.True('y' in t.fields)
    assert.Eq(t.value, '1')
    assert.Eq(typeof(t.value), 'string')
    data.a = false
    assert.Eq(t.value, 2)
    assert.Eq(typeof(t.value), 'number')
}

function testSongTemplate() {
    let $ = { playing: false, song:"Cool Song 😎🎶" }
    let b = new Bindable($)
    let src = {text: '{{ playing? "Playing: $song" : "Next Song: $song" }}'}
    let res = {}
    function onChange(v) { res.v = v }
    let id = b.bindTemplate(src.text, onChange, b, src)
    assert.Eq(res.v, `Next Song: ${$.song}`)
}

testBinding()
testPropBinding()
testBindable()
testBindAll()
testBindTemplate()
testSongTemplate()