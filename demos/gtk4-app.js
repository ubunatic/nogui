#!/usr/bin/env bash
imports=imports// trap "stty echo -cbreak && echo 'tty restore'" EXIT; stty cbreak -echo; exec bash -c "gjs $0" -- "$@"

imports.gi.versions.Gtk = '4.0'
const { GLib, Gtk, Gdk, Gio } = imports.gi
const ByteArray = imports.byteArray

let args  = [imports.system.programInvocationName].concat(ARGV)
let flags = Gio.ApplicationFlags.HANDLES_COMMAND_LINE

const path = (...o) => GLib.build_filenamev(o)
const readFile = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])
const css = (...css_strings) => {
    let cp = new Gtk.CssProvider()
    cp.load_from_data(css_strings.join('\n'))
    return cp
}
const addStyles = (w, ...styles) => {
    const ctx = w.get_style_context()
    styles.forEach((s) => {
        if(typeof s == 'string') s = css(s)
        ctx.add_provider(s, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    })
}

const file   = GLib.path_get_basename(args[0])
const dir    = GLib.path_get_dirname(args[0])
const root   = GLib.path_get_dirname(dir)
const src    = path(root, 'src')
const demos  = path(root, 'demos')
const assets = path(root, 'demos', 'assets')

print(`adding ${src} to searchPath`)
imports.searchPath.unshift(src)
print(`adding ${demos} to searchPath`)
imports.searchPath.unshift(demos)

const nogui = imports.nogui
const md2pango = imports.md2pango
const repl = imports.repl
const demo = imports.assets.demo

Gtk.init()

// CSS from source code
let styles = {
    dark:       'color: #eee; background-color: #222; padding: 2px;',
    dark_panel: 'background-color: #333; padding: 10px;',
    mp20:       'padding: 20px; margin: 20px;',
    mp10:       'padding: 10px; margin: 10px;',
    mp5:        'padding:  5px; margin:  5px;',
    border1:    'border-width: 1px;',
    border2:    'border-width: 3px;',
    border3:    'border-width: 3px;',
}

let V = {'orientation': Gtk.Orientation.VERTICAL}
let H = {'orientation': Gtk.Orientation.HORIZONTAL}

let add = (parent, widget) => { parent.append(widget); return widget }

function startDemo(app) {
    // setup basic layout
    let w = new Gtk.ApplicationWindow({
        application: app,
    })
    w.set_default_size(400,600)    
    // window class names: windowcontrols, window, windowhandle
    // addStyles(w, `window {${styles.mp20}}`)
    w.show()

    // root container
    let box = new Gtk.Box(V)
    w.set_child(box)

    // menu bar
    let menu = add(box, new Gtk.Box(H))
    let b    = add(menu, new Gtk.Button({'label': 'load ui'}))

    // main content area
    let nav   = add(box, new Gtk.StackSwitcher({stack: new Gtk.Stack()}))
    let stack = add(box, nav.get_stack())
    addStyles(stack, `stack {${styles.mp10}}`)

    // status bar
    let status = add(box, new Gtk.Box(H))

    ctrl = new nogui.Controller({
        window: w,
        data: {
            // bindable properties
            showVideo:  false,
            showRender: false,
            showPower:  false,
            useRoot:    false,
        },
        callbacks: {
            stopGPUTop: () => print("STOP"),
        },
        viewHandler: (n) => stack.set_visible_child_name(n),        
    })

    let formatters = {
        md: { format: (s) => md2pango.convert(s) }
    }

    let ui = null
    let loadUI = () => {
        ui = nogui.buildWidgets(demo.spec, ctrl, assets, formatters)
        for (const i of ui.icons) status.append(i)
        for (const v of ui.views) stack.add_named(v.widget, v.name)
        ctrl.showView(demo.spec.main)
    }

    // main content
    b.connect('clicked', loadUI)

    loadUI()

    // store main vars globally
    // TODO: allow only during debugging remove
    window.ctrl = ctrl
    window.data = ctrl.data
    window.app  = app
    window.ui   = ui
}

function main() {
    let app = new Gtk.Application({flags})
    app.connect('startup', () => startDemo(app) )
    app.connect('command-line', (app, cmd) => repl.startRepl(cmd.get_stdin()))
    app.run(null)    
}

if (file == 'gtk4-app.js') main()