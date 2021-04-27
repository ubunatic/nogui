imports.gi.versions.Gtk = '4.0'   // define which GTK version we support
const { GLib, Gtk, Gio } = imports.gi  // regular import without need for webpack

const nogui = require('nogui')    // webpack import for `imports.<path>.nogui`
nogui.setVerbose(true)            // show UI builder logs and more

const { asyncTimeout } = require('./utils')  // webpack local import

let song_counter = 0

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

// To allow the app to do something, we need to define a data model
// that can also referenced in the NoGui spec.
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
    }
}

// Also our player needs some logic that works with the data.
class AudioPlayer extends Model {
    async Play(ctx) {
        this.playing = true
        let stop = false
        ctx.connect(() => stop = true)
        const play = async (num) => {
            if (this.songs.length == 0 || stop || num > this.songs.length) {
                // nothing to play or must stop
                return
            }
            let song = this.song = this.songs[num - 1]
            print('playing song', song)
            // simulate playing and report progress
            for (let i = 0; i < 1200; i++) {                
                await asyncTimeout(() => {}, 100)
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
                await play(this.next_song)
                if (stop) return
                this.next_song += 1
            }
            this.next_song = 1
        } finally {
            this.playing = false
            this.song = ''
            this.progress = ''
        }
    }
}

// To interact with the UI we need some handlers and add trackable UI state.
class MyAudioController extends AudioPlayer {
    constructor() {
        super()
        this.view = null
        this.ctx = null
        /** @type {Promise} prom - reusable Play promise to await end of playing */
        this.prom = null
    }
    async playAudio() {
        if (this.playing) return
        if (this.ctx) this.ctx.cancel()
        this.ctx = new Gio.Cancellable()
        this.prom = this.Play(this.ctx)
        try { await this.prom; print('finished playing') }
        catch (e) { logError(e) }
        this.prom = null
    }
    async nextSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopAudio()
        if (this.next_song < this.songs.length) this.next_song += 1
        else                                    this.next_song = 1
        if (restart) this.playAudio()
    }
    async prevSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopAudio()
        if (this.next_song > 1) this.next_song -= 1
        else                    this.next_song = this.songs.length
        if (restart) this.playAudio()
    }
    async stopAudio() {
        if (this.ctx) this.ctx.cancel()
        if (this.prom) await this.prom
    }
    openFile()  { 
        const s = new Song(`Song "🎶 ${this.songs.length + 1} 🎶"`)
        this.songs.push(s)
        print('added song', this.songs.slice(-1))
    }
    forceQuit() { /* noop */ }
    respClear(id, code) {
        if(code == 'OK') this.songs = []
    }
}

class Player extends MyAudioController {
    constructor(assets_dir='.', window) {
        super()
        // A `Gtk.Stack` serves as main widget to manage views.
        let stack = this.widget = new Gtk.Stack()

        this.forceQuit = () => window.close()

        // `nogui.Controller` manages data and connects controls to the parents
        let ctl = this.controller = new nogui.Controller({
            window, data:this, callbacks:this,
            showView: (name) => {
                stack.set_visible_child_name(name)
                this.view = name
            }
        })

        ctl.bindProperty('songs',
            (v)   => { this.num_songs = this.songs.length },
            (k,v) => { this.num_songs = this.songs.length },
        )
        ctl.bindProperty('song',
            (v)   => { this.song_name = this.song.name },
            (k,v) => { this.song_name = this.song.name },
        )

        // Define where to find the JSON or JS file for our UI.
        let spec_file = GLib.build_filenamev([assets_dir, 'spec.js'])

        // A `nogui.Builder` builds the UI.
        let ui = new nogui.Builder(spec_file, ctl, assets_dir)
        ui.buildWidgets()

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

module.exports = { Player }
