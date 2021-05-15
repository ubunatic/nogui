const { bindExpr, bindTpl, Binding, GetProxy, Unbind, SymBinding, Bind, GetBinding } = require(`../src/binding`)
const { getLogger } = require('../src/logging')
const assert = require('../src/assert')

const logger = getLogger('binding')
const { log, debug, typ, str } = logger
logger.setVerbose()

function testBinding() {
    let b = new Binding({a:1})
    assert.Eq(b.obj.a, 1)

    let res = null
    let bind_id = b.connect('a', (v) => res = v)
    let {k,id} = b.parseConnectID(bind_id)
    assert.Eq(k, 'a')
    assert.NotNull(b.targets[k], 'binding must have target groups')
    assert.NotNull(b.targets[k][id], 'binding must have targets')

    b.obj.a = 2
    assert.Eq(b.obj.a, 2, `expected property change a=2, got ${b.obj.a}`)
    assert.Eq(res, 2, 'binding must change value to 2')

    b.disconnect(bind_id)
    assert.Null(b.targets[k][id])
    log(`OK testBinding`)
}

function testBindable() {
    let b = new Binding({a:1, b:{x:1}, c:['x','y']})

    let val = null
    b.bindProperty('a', (v) => val = v)
    b.obj.a = 2
    assert.Eq(val, 2)

    let prop = {}
    let { id } = b.bindProperty('b', (v) => prop.b = b)
    assert.True(id.startsWith('b:'))
    b.obj.x = 3
    assert.Null(prop.b, `binding must not bubble up internal property updates`)

    b.bindObject('c', (k,v,l) => prop.c = l)
    assert.NotNull(prop.c, `binding must bubble up initial list`)
    b.data.c.push('z')
    assert.Eq(prop.c.length, 3, `binding must bubble up list changes`)

    assert.Eq(b.size(), 3)

    b.unbindAll()
    assert.Eq(b.size(), 0)

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
    let len = Object.keys(data).length
    let proxy = GetProxy(data)
    let b = GetBinding(proxy)
    assert.Eq(b.size(), 0)

    let res = {n:0}
    b.bindFields(data, (k, v, o) => {
        res.n += 1
        log(`k=${k}, v=${v}, o=${o}`)
    })
    assert.Eq(b.size(), len + 1, `expected N property bindings and 1 fields binding`)
    proxy.a = 2
    proxy.b = {}
    assert.Eq(res.n, 2, `expected two changes`)

    data.b1 = true
    data.b2 = true
    assert.Eq(res.n, 2, `no changes expected from non-proxied source modifications`)

    Unbind(data)
    assert.Eq(b.size(), 0)

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
    log(`OK testBindTemplate`)
}

function testSongTemplate() {
    let $ = { playing: false, song:"Cool Song 😎🎶" }
    let b = new Binding($)
    let src = {text: '{{ playing? "Playing: $song" : "Next Song: $song" }}'}
    let res = {}
    function onChange(v) { res.v = v }
    let id = b.bindTemplate(src.text, onChange, b, src)
    assert.Eq(res.v, `Next Song: ${$.song}`)
    log(`OK testSongTemplate`)
}

function testProxy() {
    let res = {n:0, updates:0}
    let data = {a: 1, n: 0}
    let app = {
        init(data) { this.data = GetProxy(data) },
        call() { res.n = (this.data.n += 1) },
        /** @returns {Binding} */
        get binding() { return GetBinding(this.data) }
    }

    app.init(data)
    let b = app.binding
    b.bindProperty('a', (a) => res.a = a)
    b.bindProperty('n', (n) => res.updates++)

    app.call()
    assert.Eq(app.data.n, 1,  'app call must update data model')
    assert.Eq(res.updates, 1, 'app call must send updates')
    log(`OK testProxy`)
}

function testHardWire() {
    let res = {n:0, updates:0}
    let app = {
        a: 1, n: 0,
        init() { Bind(this, ['a', 'n']) },
        call() { res.n = (this.n += 1) },
        /** @returns {Binding} */
        get binding() { return GetBinding(this) }
    }

    app.init()
    let b = app.binding
    b.bindProperty('a', (a) => res.a = a)
    b.bindProperty('n', (n) => res.updates++)

    app.call()
    assert.Eq(app.n, 1,  'app call must update data model')
    assert.Eq(res.updates, 1, 'app call must send updates')
    log(`OK testHardWire`)
}

function testNested() {
    let res = {}
    let app = {
        n:0, x:{y:{z:0}},
        init()  { Bind(this, ['n', 'x']) },
        call()  { this.n += 1 },
        set1(v) { this.x = {y:{z:v}} },
        set2(v) { this.x.y = {z:v} },
        set3(v) { this.x.y.z = v },
    }

    app.init()
    let b = GetBinding(app)

    b.bindProperty('x', x       => res.v1 = x.y.z)
    b.bindObject('x',   (k,v,o) => res.v2 = o.y.z)
    // b.bindObject('x.y', (k,v,o) => res.v3 = y.z)

    app.set1(1)
    assert.Eq(res.v1, 1)

    app.set2(2)
    assert.Eq(res.v2, 2)

    app.set3(3)
    assert.Null(res.z3, 'unbound nested object change must not bubble up')
}

testBinding()
testBindable()
testBindAll()
testBindTemplate()
testSongTemplate()
testProxy()
testHardWire()
testNested()
