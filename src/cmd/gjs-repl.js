#!/usr/bin/env bash
imports=imports// trap "stty echo -cbreak && echo 'tty restore'" EXIT; stty cbreak -echo; exec bash -c "gjs $0" -- "$@"

const gi = imports.gi
const { GLib, Gio } = gi

let args = [imports.system.programInvocationName].concat(ARGV)
const file = GLib.path_get_basename(args[0])
const dir  = GLib.path_get_dirname(args[0])
const src  = GLib.path_get_dirname(dir)

imports.searchPath.unshift(src)
const repl = imports.repl

print('starting GJS Repl')
let loadGtk = () => {
    imports.gi.versions.Gtk = '4.0'
    Gtk = imports.gi.Gtk
    Gdk = imports.gi.Gdk
    Gtk.init()
}

// TODO: run without GTK
loadGtk()

let app = new Gtk.Application({
    flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE
})

// creates a dummy window to block the process
createWindow = (app) => new Gtk.ApplicationWindow({ application: app })

app.connect('startup', createWindow )
app.connect('activate', () => print('repl started') )
app.connect('command-line', (app, cmd) => repl.startRepl(cmd.get_stdin()))
app.run(null)
