const { Controller }    = require('../src/controller')
const { Binding, GetProxy, SymBinding } = require('../src/binding')
const { getLogger }     = require('../src/logging')

const assert = require('../src/assert')
const { restart } = require('nodemon')
const logger = getLogger('binding')
const { log, debug, typ } = logger
logger.setVerbose()

class Model {
    constructor(data) {
        for (const k in data) {
            this[k] = GetProxy(data[k], this)
        }
    }
}

START   = 1
CLICKED = 2

class App extends Model {
    constructor(data) {
        super(data)
        this.state = START
        this.clicks = 0
    }
    read(name) {
        return this[name]
    }
    click() {
        this.state = CLICKED
        this.clicks += 1
    }
}

function testCtrl(){
    log('START testCtrl')
    let app = new App({v:1, l:[1,2,3], o:{x:{y:1}, z:1}})
    let ctl = new Controller({
        window:null, data:app, callbacks:app,
    })

    log('checking `data` property and type')
    assert.NotNull(ctl.data)
    assert.True(ctl.binding instanceof Binding)

    log('checking model bindings')
    let res = {}
    function onChange(v)      { res['v']     = v }
    function onStateChange(s) { res['state'] = s }

    ctl.binding.bindProperty('v', onChange)
    ctl.binding.bindProperty('state', onStateChange)

    log('checking callbacks and model change')
    function cb(...o) { return ctl.callBack(...o) }
    assert.Eq(cb('read', 'v'), 1)
    assert.Eq(cb('read', 'state'), START)

    cb('click')
    assert.Eq(app.state, CLICKED)
    assert.Eq(app.clicks, 1)
    cb('click')
    assert.Eq(app.state, CLICKED)
    assert.Eq(app.clicks, 2)

    assert.Eq(app.l[0], 1)
    assert.NotNull(app.l[SymBinding])
    assert.NotNull(app.o[SymBinding])

    log('checking dynamically created bindings with parent access')
    let b = ctl.bind('o.x')
    res = {}
    b.bindProperty('y', (y) => res.y = y)
    b.setValue('y', 2)
    assert.Eq(res.y, 2)

    b.bindProperty('$z', (z) => res.z = z)
    b.setValue('$z', 2)
    assert.Eq(res.z, 2)

    b.bindProperty('$$v', (v) => res.v = v)
    b.setValue('$$v', 2)
    assert.Eq(res.v, 2)

    log('OK testCtrl')
}

testCtrl()