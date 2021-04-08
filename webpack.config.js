var path = require('path').resolve;

let resolve = {
    modules: [ path('.', 'src'), 'node_modules' ],
    fallback: { 'fs': false },
}

let externals = {
    'gnome': 'global',
    'lang': 'imports.lang',
    'bytearray': 'imports.byteArray',
    'system': 'imports.system',
    'gi': 'imports.gi',
    'gi/gtk': 'imports.gi.Gtk',
    'gtk3': "(imports.gi.versions.Gtk = '3.0', imports.gi.Gtk)",
    'gtk4': "(imports.gi.versions.Gtk = '4.0', imports.gi.Gtk)",
    'gi/meta': 'imports.gi.Meta',
    'gi/shell': 'imports.gi.Shell',
    'ui/main': 'imports.ui.main',
    'ui/popupMenu': 'imports.ui.popupMenu',
    'ui/panelMenu': 'imports.ui.panelMenu',
    'gi/atk': 'imports.gi.Atk',
    'gi/st': 'imports.gi.St',
    'misc/config': 'imports.misc.config',
    'me': 'imports.misc.extensionUtils.getCurrentExtension()',
    'gi/gtk': 'imports.gi.Gtk',
    'gi/gdk': 'imports.gi.Gdk',
    'gi/gobject': 'imports.gi.GObject',
    'gi/gio': 'imports.gi.Gio',
    'gi/soup': 'imports.gi.Soup',
    'gi/glib': 'imports.gi.GLib',
    'gi/clutter': 'imports.gi.Clutter',
}

const src       = path(__dirname, 'src')
const dist      = path(__dirname, 'dist')
const demo_src  = path(__dirname, 'examples', 'simple-app', 'src')
const demo_dist = path(__dirname, 'examples', 'simple-app', 'dist')

module.exports = [
    {
        mode: 'production',
        optimization: { minimize: false },
        entry: {
            nogui: path(src, 'nogui.js'),
            repl:  path(src, 'repl.js'),
        },
        output: {
            filename: '[name].js',
            path: dist,
            libraryTarget: 'var',
            library: '[name]'
        },
        resolve,
        externals,
    },
    {
        mode: 'production',
        optimization: { minimize: false },
        entry: {
            nogui_simple_app: path(demo_src, 'app.js')
        },
        output: {
            filename: 'simple.app.js',
            path: demo_dist,
            libraryTarget: 'var',
            library: '[name]'
        },
        resolve,
        externals,
    }
]
