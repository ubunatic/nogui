var path = require('path');

let resolve = {
    modules: [
        path.resolve('./src'),
        'node_modules'
    ],
    fallback: {
        "fs": false
    },
}

let externals = {
    'gnome': 'global',
    'lang': 'imports.lang',
    'bytearray': 'imports.byteArray',
    'system': 'imports.system',
    'gi': 'imports.gi',
    'gi/gtk': 'imports.gi.Gtk',
    // 'gi/meta': 'imports.gi.Meta',
    // 'gi/shell': 'imports.gi.Shell',
    // 'ui/main': 'imports.ui.main',
    // 'ui/popupMenu': 'imports.ui.popupMenu',
    // 'ui/panelMenu': 'imports.ui.panelMenu',
    // 'gi/atk': 'imports.gi.Atk',
    // 'gi/st': 'imports.gi.St',
    // 'misc/config': 'imports.misc.config',
    // 'me': 'imports.misc.extensionUtils.getCurrentExtension()',
    'gi/gtk': 'imports.gi.Gtk',
    'gi/gdk': 'imports.gi.Gdk',
    'gi/gobject': 'imports.gi.GObject',
    'gi/gio': 'imports.gi.Gio',
    'gi/soup': 'imports.gi.Soup',
    'gi/glib': 'imports.gi.GLib',
    'gi/clutter': 'imports.gi.Clutter',
}

module.exports = [
    {
        mode: 'production',
        optimization: { minimize: false },
        entry: {
            nogui: './src/nogui.js',
            repl: './src/repl.js',
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname),
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
            gtk4demo: './demos/gtk4-app.js',
        },
        output: {
            filename: 'demos/gtk4-app.min.js',
            path: path.resolve(__dirname),
            libraryTarget: 'var',
            library: '[name]'
        },
        resolve,
        externals,
    }
]