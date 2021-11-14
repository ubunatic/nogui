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
    error(new Error('ExampleSilentModeError'), 'This must be visible in silent mode')
    setSilent(false)
    log('back to normal')
    log('OK testLogger')
}

function buildUI() {
    let spec = {
        views: {
            main: [
                // only "add" never "insert" new objects, many tests depend on the order
                'test',
                '--------',
                { action: 'action',   call: 'click', vis: 'show_action'},
                { text:   'dynamic',  view: 'main',  vis: '@view == view' },
                'clicks=$clicks',
                { switch: 'toggle', bind: 'toggle1'},
                { switch: 'toggle', bind: 'toggle2'},
            ],
            other: [
                'other view'
            ]
        },
        main: 'main'
    }

    let data = nogui.binding.GetProxy({
        show_action:true,
        view: null,
        clicks: 0,
        toggle1: false,
        toggle2: true,
    })

    let callbacks = {
        click()        { data.clicks++ },
        showView(view) { data.view = view },
    }

    let reset = () => {
        data.show_action = true
        data.view = null
        data.clicks = 0
    }

    let ctl = new nogui.Controller({ data, callbacks })
    let ui  = new nogui.Builder(spec, ctl, ctl.data)

    poly.safeInit()  // must call Gtk.init before creating any Gtk classes
    ui.build()

    const { Gtk } = imports.gi
    const main = ui.views[0]

    return { Gtk, ui, main, ctl, reset }
}

function testBuild() {
    let { Gtk, ui, main, ctl, reset } = buildUI()

    assert.NotNull(main, 'main view must be set')
    assert.NotNull(ctl,  'controller must be set')
    assert.NotNull(ui,   'ui must be created')

    let data = ctl.data
    let w = main.widget
    assert.InstanceOf(w, Gtk.Box)
    log('ui.views:main.widget', w)

    let text   = poly.get_child(w, 0)
    let sep    = poly.get_child(w, 1)
    let action = poly.get_child(w, 2)
    let dtext  = poly.get_child(w, 3)
    let tpl    = poly.get_child(w, 4)
    let tog    = poly.get_child(w, 5)

    assert.InstanceOf(text,   Gtk.Label)
    assert.InstanceOf(sep,    Gtk.Separator)
    assert.InstanceOf(action, Gtk.Button)
    assert.InstanceOf(dtext,  Gtk.Box)
    assert.InstanceOf(tpl,    Gtk.Label)

    let sw = poly.get_last_child(tog)
    assert.InstanceOf(sw, Gtk.Switch)

    assert.Null(data.view)
    ctl.showView(ui.spec.main)
    assert.Eq(data.view, 'main')
    ctl.showView('other')
    assert.Eq(data.view, 'other')

    log('OK testBuild')
}

function testBinding() {
    let { Gtk, ui, main, ctl, reset } = buildUI()

    let data = ctl.data
    let w = main.widget
    let action = poly.get_child(w, 2)
    let dtext  = poly.get_child(w, 3)
    let tpl    = poly.get_child(w, 4)
    let tog1   = poly.get_child(w, 5)
    let tog2   = poly.get_child(w, 6)
    let sw1    = poly.get_last_child(tog1)
    let sw2    = poly.get_last_child(tog2)

    assert.True(ctl.data.show_action, 'data model should mark action button as visible')
    assert.True(action.get_visible(), 'action button should be marked are visible')
    data.show_action = false
    assert.False(ctl.data.show_action, 'data model should mark action button as NOT visible')
    assert.False(action.get_visible(), 'action button should be marked as NOT visible')

    reset()

    assert.False(dtext.get_visible(), 'dynamic text should be marked as NOT visible')
    ctl.showView('main')
    assert.True(dtext.get_visible(), 'dynamic text should be marked as visible')

    assert.Eq(data.clicks, 0)
    poly.click(action)
    assert.Eq(data.clicks, 1)
    poly.click(action)
    assert.Eq(data.clicks, 2)

    let text = tpl.get_text()
    assert.Match(text, /^clicks=([0-9]+)$/, {1:data.clicks}, 'ui must show clicks')

    assert.Eq(data.toggle1, false)
    assert.Eq(data.toggle2, true)
    poly.toggle_active(sw1)
    poly.toggle_active(sw2)
    assert.Eq(data.toggle1, true)
    assert.Eq(data.toggle2, false)

    log('OK testBinding:vis')
}

testArgs()
testModules()
testLogger()
testBuild()
testBinding()