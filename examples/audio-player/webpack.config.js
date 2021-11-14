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
        'gi/gtk': 'imports.gi.Gtk',
        'gi/atk': 'imports.gi.Atk',
        'gi/gdk': 'imports.gi.Gdk',
        'gi/gobject': 'imports.gi.GObject',
        'gi/gio': 'imports.gi.Gio',
        'gi/soup': 'imports.gi.Soup',
        'gi/glib': 'imports.gi.GLib',
        'gi/clutter': 'imports.gi.Clutter',
        // Gnome Shell imports
        'gi/st': 'imports.gi.St',
        'gi/meta': 'imports.gi.Meta',
        'gi/shell': 'imports.gi.Shell',
        'ui/main': 'imports.ui.main',
        'ui/popupMenu': 'imports.ui.popupMenu',
        'ui/panelMenu': 'imports.ui.panelMenu',
        'misc/config': 'imports.misc.config',
    },
}

const src  = path(__dirname, 'src')
const dist = path(__dirname, 'lib')

module.exports = [
    {
        // Build the Desktop App.
        // This will put all npm-based dependencies in one file
        // to make it GJS compatible and avoid searchPath modifications.
        entry: { nogui_audio_player: path(src, 'app.js') },
        output: {
            filename: 'audio-player.app.js',
            path: dist,
            libraryTarget: 'this',
        },
        ...opt,
    },
    {
        // Build the myaudio as GJS-compatible library.
        entry: { myaudio: path(src, 'myaudio.js') },
        output: {
            filename: 'myaudio.js',
            path: dist,
            libraryTarget: 'this',
        },
        ...opt,
    },
]
