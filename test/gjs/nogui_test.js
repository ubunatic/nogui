#!/usr/bin/env bash
imports=imports// exec gjs -I $(dirname $0)/../../dist -I $(dirname $0)/../../src -I $(dirname $0) $0 $*

/**
 * @type {import('../../src/nogui')}
 * nogui module loaded from ../../dist/nogui.js (see shebang).
*/
const nogui = imports.nogui

/** @type {import('./gjs_testing.js')} */
const gt = imports.gjs_testing
const loop = gt.modules.mainloop

const _ = JSON.stringify
const args = gt.parseArgs()

const { log, error, debug , str, typ, setLevel, setSilent } = nogui.logging.getLogger('nogui_test')
const { assert, binding, expr, poly, logging, sys, styling } = nogui

function testModules() {
    assert.NotNull(binding, 'binding module must be exported by nogui')
    assert.NotNull(expr,    'expr module must be exported by nogui')
    assert.NotNull(poly,    'poly module must be exported by nogui')
    assert.NotNull(logging, 'logging module must be exported by nogui')
    assert.NotNull(sys,  'system module must be exported by nogui')
    assert.NotNull(styling, 'styling module must be exported by nogui')
    log('OK testModules')
}

function testArgs() {
    assert.NotNull(args.gui)
    assert.NotNull(args.slow)
    assert.NotNull(args.prog)
}

function testLogger(params) {
    const banner = `
    ##############################################################
    ################# THIS SHOULD NOT BE VISIBLE #################
    ##############################################################
    `
    log('log', {a:1})
    debug(banner)
    log(str({a:1}))
    log(typ({a:1}))
    try       { error('x'); assert.Fail('error log must only accept errors') }
    catch (e) {}
    error(new Error('ExampleError'), 'some error message')
    setLevel(nogui.logging.LEVEL.DEBUG)
    debug('DEBUG', {debug:'it works!'})
    setSilent()
    log(banner)
    error(new Error('ExampleSilentModeError'), 'must be visible in silent mode')
    setSilent(false)
    log('back to normal')
    log('OK testLogger')
}

function testBuild() {
    let spec = {
        views: {
            main: [
                'test'
            ]
        }
    }

    let fn = {
        call1()        { log('call1') },
        showView(view) { log(`showView(${view})`) },
    }

    let ctl = new nogui.Controller({
        window: null,
        data: nogui.binding.GetProxy({}),
        callbacks: fn,
    })

    let ui = new nogui.Builder(spec, ctl, ctl.data)

    poly.init()  // must call Gtk.init before creating any Gtk classes
    ui.buildViews()

    log('ui.views', ui.views)
}

function testBinding() {

}

testArgs()
testModules()
testLogger()
testBuild()
testBinding()