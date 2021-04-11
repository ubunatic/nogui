var path = require('path').resolve;

const opt = {
    mode: 'production',
    optimization: { minimize: false },
    resolve: {
        modules: [ path('.', 'src'), 'node_modules' ],
        fallback: { 'fs': false },
    },
    externals: {
        'gnome': 'global',
        'lang': 'imports.lang',
        'bytearray': 'imports.byteArray',
        'system': 'imports.system',
        'gi': 'imports.gi',
        'gi/atk': 'imports.gi.Atk',
        'gi/gtk': 'imports.gi.Gtk',
        'gi/gdk': 'imports.gi.Gdk',
        'gi/gobject': 'imports.gi.GObject',
        'gi/gio': 'imports.gi.Gio',
        'gi/soup': 'imports.gi.Soup',
        'gi/glib': 'imports.gi.GLib',
        'gi/clutter': 'imports.gi.Clutter',
        // Gnome Shell imports
        'gi/meta': 'imports.gi.Meta',
        'gi/shell': 'imports.gi.Shell',
        'ui/main': 'imports.ui.main',
        'ui/popupMenu': 'imports.ui.popupMenu',
        'ui/panelMenu': 'imports.ui.panelMenu',        
        'gi/st': 'imports.gi.St',
        'misc/config': 'imports.misc.config',
        'me': 'imports.misc.extensionUtils.getCurrentExtension()',
    },
}

const src       = path(__dirname, 'src')
const dist      = path(__dirname, 'dist')
const demo_src  = path(__dirname, 'examples', 'simple-app', 'src')
const demo_dist = path(__dirname, 'examples', 'simple-app', 'dist')

module.exports = [
    {
        entry: {
            nogui: path(src, 'nogui.js'),
            repl:  path(src, 'repl.js'),
        },
        output: {
            filename: '[name].js',
            path: dist,
            libraryTarget: 'this',
            // library: '[name]'
        },
        ...opt
    },
    {
        entry: {
            nogui_simple_app: path(demo_src, 'app.js')
        },
        output: {
            filename: 'simple.app.js',
            path: demo_dist,
            libraryTarget: 'this',
            // library: '[name]'
        },
        ...opt
    }
]
