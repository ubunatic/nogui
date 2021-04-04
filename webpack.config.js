var path = require('path');

module.exports = {
    entry: {
        main: './src/main.js',
        // ui: './src/ui.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname),
        libraryTarget: 'var',
        library: '[name]'
    },
    resolve: {
        modules: [
            path.resolve('./src'),
            'node_modules'
        ]
    },
    externals: {
        'gnome': 'global',
        'lang': 'imports.lang',
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
}