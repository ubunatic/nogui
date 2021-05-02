#!/usr/bin/env bash
imports=imports// exec gjs -I $(dirname $0)/../src $0 $*

const loop = imports.mainloop
const assert = imports.assert
const {getPoly, useGtk, gtk3, gtk4, timeouts } = imports.poly

let poly = null
let gui = false
let slow = false

for (const v of ARGV) switch (v) {
    case '3':      poly = gtk3(); assert.True(poly.isGtk3());  break
    case '4':      poly = gtk4(); assert.False(poly.isGtk3()); break
    case '-g':     // fallthrough
    case '--gui':  gui = true; break
    case '-s':     // fallthrough
    case '--slow': slow = true; break    
}

if (!poly) {
    poly = getPoly()
    assert.NotNull(poly.GtkVersion)
}

const delay = slow? 10000 : 100

const str = JSON.stringify

const { setTimeout, clearTimeout, asyncTimeout } = imports.poly.timeouts

let src = setTimeout(() => log(`timeout`), 0)
clearTimeout(src)

const { Gtk, Gio } = imports.gi

let app = gui? new Gtk.Application() : new Gio.Application()
let quit = () => app.quit()

function newDialog(w) { return new Gtk.MessageDialog({
    buttons: [Gtk.ButtonsType.OK],
    modal: false,
    transient_for: w,
})}

let res = {}

let start = () => {
    log(`app started gui=${gui}`)
    if (!gui) return
    log('start gui')
    let win = new Gtk.ApplicationWindow({application:app})
    win.show()
    win.connect('destroy', quit)

    let box = new Gtk.Box()
    box.show()
    poly.append(win, box)

    let btn = new Gtk.Button({label:'Quit'})
    btn.connect('clicked', quit)
    btn.show()
    poly.append(box, btn)

    const handleResponse = (id) => {
        log(`got dialog response gtk_code=${id}`)
        res.gtk_code = id
    }
    let dia = newDialog(win)

    res.display = poly.getDisplay()
    if (res.display instanceof imports.gi.GdkX11.X11Display) {
        res.screen = poly.getScreen()
    }
    res.theme = poly.getTheme()
    res.path_diff = poly.addIconPath('.')
    res.gui_started = true    

    poly.runDialog(dia, handleResponse)
    setTimeout(() => dia.close(), delay)
    setTimeout(quit, delay * 2)
}

const assertDebug = (obj) => {
    assert.NotNull(obj)
    print(obj, typeof obj, obj.constructor && obj.constructor.name)
}

app.connect('activate', start)
app.run(null)
print(str(res))
if(gui) {
    assert.True(res.gui_started, 'expected GUI start')
    assert.Eq(res.path_diff, 1,  'expected one more search_path')
    assert.NotNull(res.gtk_code, 'expected dialog response')
    assertDebug(res.display,     'expected a Gdk.Display')
    assertDebug(res.theme,       'expected a Gtk.IconTheme')
}