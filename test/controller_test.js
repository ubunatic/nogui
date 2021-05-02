const { Controller } = require('../src/controller')
const { Bindable }   = require('../src/binding')
const { getLogger } = require('../src/logging')
const assert = require('../src/assert')
const logger = getLogger('binding')
const { log, debug, typ } = logger
logger.setVerbose()

class Model {
    constructor(data) {
        for (const k in data) {
            this[k] = data[k]
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
    let app = new App({v:1})
    let ctl = new Controller({
        window:null, data:app, callbacks:app,
    })

    log('checking `data` property and type')
    assert.NotNull(ctl.data)
    assert.True(ctl.data instanceof Bindable)

    log('checking model bindings')
    let res = {}
    function onChange(v)      { res['v']     = v }
    function onStateChange(s) { res['state'] = s }

    ctl.data.bindProperty('v', onChange)
    ctl.data.bindProperty('state', onStateChange)

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
    log('OK testCtrl')
}

testCtrl()