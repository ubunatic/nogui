const MyAudio = require('./myaudio.js')  // webpack import for `imports.lib.myaudio`
const poly    = require('nogui').poly    // webpack import for `imports.lib.nogui`
const {Gio, GLib, Gtk} = imports.gi      // regular import without need for webpack

// first setup some main-file logic to locate the NoGui file and other assets
const program   = imports.system.programInvocationName
const args      = [program].concat(ARGV)
const here      = GLib.path_get_dirname(program)
const asset_dir = GLib.build_filenamev([here, '..', 'share'])
// NOTE: If you webpack this file and move it elsewhere, make sure the
//       assets are still reachable from the webpacked location.

// then define some meta data, config, create an app
const application_id = 'com.github.ubunatic.noguiMyAudio'
const window_opt     = {title: 'MyAudio App', default_width: 360, default_height: 300}
const flags          = Gio.ApplicationFlags.FLAGS_NONE  // allow any kind of argument
const app            = new Gtk.Application({application_id, flags})

let songs = []
let play_and_quit = false

app.add_main_option('song', 'f'.charCodeAt(0), GLib.OptionFlags.IN_MAIN,
                    GLib.OptionArg.STRING_ARRAY, 'song to play', 'SONG')
app.add_main_option('quit', 'q'.charCodeAt(0), GLib.OptionFlags.IN_MAIN,
                    GLib.OptionArg.NONE, 'quit after playing', null)

app.connect('handle-local-options', (app, d) => {
    if (d.contains('song')) songs = d.lookup_value('song', null).get_strv()
    if (d.contains('quit')) play_and_quit = true
    print('songs', songs)
    print('quit', play_and_quit)
    return -1
})

app.connect('activate', (app) => {
    let w = new Gtk.ApplicationWindow({application:app, ...window_opt})
    let quit           = () => { w.close(); app.quit() }
    let onPlayFinished = () => { if (play_and_quit) quit() }

    // now load the actual audio player app and add its `Gtk.Widget`
    let player = new MyAudio.Player(asset_dir, w, quit)
    poly.set_child(w, player.widget)
    w.show()
    w.connect('destroy', () => app.quit())

    // finally start to do something with the app
    if (songs.length > 0) player.loadSongs(songs)

    player.playSong().then(onPlayFinished).catch(logError)
})

app.run(args)
