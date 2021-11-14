/** @type {import('../../../src/nogui.js')} */
const nogui = require('nogui')   // webpack import for `imports.<path>.nogui`
const { poly, sys } = nogui
const { Bind, GetBinding } = nogui.binding
const { log, error, debug, str, typ } = nogui.logging.getLogger('myaudio')

// At this point, GTK libs are imported by nogui and the versions may have
// been set using the USE_GTK env var, e.g., via `USE_GTK=4 lib/app.js`.
// We can now import GTK libs as usual (without webpack)
const { Gtk, Gio } = imports.gi

let song_counter = 0

/**
 * Data class that stores the name and playlist number
 * of a song to be displayed in the playlist.
 *
 * @param {string}        name            - name of the song
 * @param {number|string} playlist_number - number in the playlist
 *
 * The fields can be used in the nogui spec to show their values in the UI.
*/
class Song {
    constructor(name, playlist_number=null) {
        if (!playlist_number) {
            playlist_number = (song_counter += 1)
        }
        this.name = name
        this.playlist_number = playlist_number
    }
    get number() { return this.playlist_number }
    toString()   { return `[${this.number}] ${this.name}` }
}

/**
 * Data class to store the state of the app.
 * All fields can be used in the nogui spec to show their values in the UI.
*/
class Model {
    constructor() {
        this.muted = false
        this.playing = false
        this.songs = [new Song('Default Song')]
        this.num_songs = 1
        this.next_song = 1
        this.song = ''
        this.song_name = ''
        this.progress = ''
        this.view = null
        this.debug = false

        // For convenience, we are using `Model` also base class for our app.
        // This allows for accessing data through `this.songs`, etc. without a proxy.
        // However, to make the data bindable we need to proxify `this` using `Bind`
        // to replace all model properties with getters and setters that will point
        // to new a subscribable proxy object.
        const keys = Object.keys(this)
        Bind(this, keys)
        log(`set up data model with keys=${keys}`)

        // We can now setup some player logic using the bindings.
        let b = GetBinding(this)

        b.bindObject('songs', (k,v,o) => this.num_songs = this.songs.length)
        b.bindProperty('song',    (v) => this.song_name = this.song.name)
        b.bindProperty('debug',   (v) => nogui.logging.setVerbose(v))
    }
}

/** Very basic player to play all songs. */
class SongPlayer extends Model {
    async Play(ctx) {
        this.playing = true
        let stop = false
        ctx.connect(() => stop = true)
        const playNext = async (num) => {
            if (this.songs.length == 0 || stop || num > this.songs.length) {
                // nothing to play or must stop
                return
            }
            let song = this.song = this.songs[num - 1]
            print('playing song', song)
            // simulate playing and report progress
            for (let i = 0; i < 1200; i++) {
                await poly.asyncTimeout(() => {}, 100)
                if (stop) return
                if (i%10 != 0) continue
                let s = i/10
                this.progress = `${Math.floor(s/600)}${Math.floor(s/60)}:${Math.floor(s%60/10)}${s%10}`
            }
            return true
        }
        try {
            if (this.next_song > this.songs.length || this.next_song == null) {
                // rewind playlist
                this.next_song = 1
            }
            while (this.next_song <= this.songs.length) {
                await playNext(this.next_song)
                if (stop) return
                this.next_song += 1
            }
            this.next_song = 1
        }
        catch (e) {
            logError(e)
        }
    }
}

/**
 * Advanced player that can start, stop, add, and clear songs.
 * This class defines most callbacks called via the nogui spec.
*/
class SongController extends SongPlayer {
    constructor() {
        super()
        this.ctx = null
        /** @type {Promise} prom - reusable Play promise to await end of playing */
        this.prom = null
    }
    async playSong() {
        if (this.playing) return
        await this.stopSong()
        this.ctx = new Gio.Cancellable()
        this.prom = this.Play(this.ctx)
        try       { await this.prom; print('finished playing') }
        catch (e) { logError(e) }
        this.playing = false
        this.song = ''
        this.progress = ''
        this.prom = null
    }
    async nextSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopSong()
        if (this.next_song < this.songs.length) this.next_song += 1
        else                                    this.next_song = 1
        if (restart) this.playSong()
    }
    async prevSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopSong()
        if (this.next_song > 1) this.next_song -= 1
        else                    this.next_song = this.songs.length
        if (restart) this.playSong()
    }
    async stopSong() {
        if (this.ctx) this.ctx.cancel()
        if (this.prom) await this.prom
    }
    async forceQuit() {
        try       { await this.stopSong() }
        catch (e) { error(e) }
        this.quitCallback()
    }
    quitCallback() { /* noop */ }
    openFile(f='')  {
        if (f == '') f = `Song "🎶 ${this.songs.length + 1} 🎶"`
        const s = new Song(f)
        this.songs.push(s)
        print('added song', this.songs.slice(-1))
    }
    /** @param {String[]} songs */
    loadSongs(songs=[]) {
        if (songs.length == 0) return
        this.songs = []
        for (const s of songs) this.songs.push(new Song(s))
        print(`added ${this.songs.length} songs`)
    }
    /** NoGui Dialog response handler
     * @param {number} id   GTK Dialog response code number
     * @param {String} code NoGui Dialog response code string
    */
    respClear(id, code) {
        if(code == 'OK') this.songs = []
    }
}

/** Main audio player class with all needed controls */
var Player = class Player extends SongController {
    constructor(assets_dir='.', window=null, quit=null) {
        super()
        // A `Gtk.Stack` serves as main widget to manage views.
        let stack = this.widget = new Gtk.Stack()
        stack.show()

        const showView = (name) => {
            stack.set_visible_child_name(name)
            this.view = name
        }

        if (quit) this.quitCallback = quit

        // `nogui.Controller` manages data and connects controls to the parents
        let ctl = this.controller = new nogui.Controller({
            window, data:this, callbacks:this, showView
        })

        // Define where to find the JSON or JS file for our UI.
        let spec_file = sys.toPath(assets_dir, 'spec.js')

        // A `nogui.Builder` builds the UI.
        let ui = new nogui.Builder(spec_file, ctl, ctl.data, assets_dir)
        ui.build()

        // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
        // Only the views need to added to the parent controls.
        for (const v of ui.views) stack.add_named(v.widget, v.name)

        // The ctl.showView handler allows switching views manually or
        // via the spec action "view":"name_of_view".
        ctl.showView(ui.spec.main)

        // Data bindings are set up automatically, so that we can adjust
        // values and they will be reflected in the UI
        this.muted = true
    }
}
Player.toString = () => 'class myaudio.Player'

if (!this.module) this.module = {}
module.exports = { Player, poly, sys }
