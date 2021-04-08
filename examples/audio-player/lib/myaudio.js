const Gtk   = require('gtk4')  // webpack import for `imports.gi.Gtk`
const nogui = require('nogui') // webpack import for `imports.<path>.nogui`
const GLib  = imports.gi.GLib  // regular import without need for webpack

nogui.setVerbose(true)  // show UI builder logs and more

// To allow the app to do something, we need to define
// some callbacks and a data model referenced in the NoGui spec.
export const data = {
    muted: false,
}

export const callbacks = {
    playAudio() { print("PLAY") },
    stopAudio() { print("STOP") },
    quit()      { /* noop */ },
    respClose(id, code) { if(code == 'OK') this.quit() },
}

export class Player {

    Play(songs=[]) {
        if (songs.length == 0) print('Song list is empty')
        for (const song of songs) {
            print('Playing song', song)
        }
    }

    constructor(assets_dir='.', window) {
        // A `Gtk.Stack` serves as main widget to manage views.
        let stack = this.widget = new Gtk.Stack()

        callbacks.quit = () => window.close()

        // `nogui.Controller` manages data and connects controls to the parents
        let ctl = this.controller = new nogui.Controller({
            window, data, callbacks,
            showView: (name) => stack.set_visible_child_name(name)
        })

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
        data.muted = true  
    }
}
