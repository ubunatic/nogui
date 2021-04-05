// To allow the app to do something, we need to define
// some callbacks and a data model as used in the NoGui spec.
const data = {
    muted: false,
}
const callbacks = {
    playAudio() { print("PLAY") },
    stopAudio() { print("STOP") },
    respClose(id, code) { if(code == 'OK') app.quit() },
}

// Now we can bring everything together into the GTK app.
const Gtk   = require('gtk4')  // webpack import for `imports.gi.Gtk`
const nogui = require('nogui') // webpack import for `imports.<path>.nogui`

let app = new Gtk.Application()
app.connect('activate', (app) => {
    let window = new Gtk.ApplicationWindow({      
      title: 'My Audio Player', default_width: 240, application:app,
    })
    let stack = new Gtk.Stack()  // use a Gtk.Stack to manage views
    window.set_child(stack)
    window.show()

    // `nogui.Controller` manages data and connects controls to the parents
    let ctl = new nogui.Controller({
        window, data, callbacks,
        showView: (name) => stack.set_visible_child_name(name),
    })

    // `nogui.Builder` builds the UI
    let spec = require('./assets/player')  // read + load `player.js`
    let ui = new nogui.Builder(spec, ctl, './assets')
    ui.buildWidgets()

    // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
    // Only the views need to added to the parent controls.
    for (const v of ui.views) stack.add_named(v.widget, v.name)

    // The ctl.showView handler allows switching views manually or
    // via the spec action "view":"<name>".
    ctl.showView(spec.main)
    
    data.muted = true  // data bindings are set up automatically
})
app.run(null)
