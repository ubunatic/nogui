// This file was generated from ../../README.md. Do not modify!

// First define your UI inline in one plain JS `Object`.
// Of course, you may also load from from JSON, YAML, or another module.
const spec = {
  icons: {
    card: { name: 'audio-card' },
    play: { name: 'media-playback-start' },
    stop: { name: 'media-playback-stop' },
    exit: { name: 'application-exit-symbolic' },
    info: { name: "dialog-information-symbolic" },
    gears: { name: "settings-gears-symbolic" },
    back:  { name: "go-previous-symbolic" },
    vol_max: { name: 'audio-volume-high-symbolic' },
    vol_min: { name: 'audio-volume-muted-symbolic' },    
  },
  dialogs: {
    about: { info: 'About Audio Player',  file: '../README.md',  icon: 'info' },
    close: { ask:  'Close Audio Player?', call: 'respClose', icon: 'exit' },
  },
  views: {
    main: [
      { title: 'My Audio App', icon: 'card' },
      { action: 'Play Audio', call: 'playAudio',  icon: 'play' },
      { action: 'Stop Audio', call: 'stopAudio',  icon: 'stop' },
      { switch: 'Mute Audio', bind: 'muted', icons: ['vol_max', 'vol_min'] },
      { action: 'About',    dialog: 'about',  icon: 'info' },
      { action: 'Settings', view: 'settings', icon: 'gears' },
      { action: 'Close',    dialog: 'close',  icon: 'exit' },
    ],
    settings: [
      { title: 'Settings', icon: 'gears' },
      { switch: 'Mute Audio', bind: 'muted', icons: ['vol_max', 'vol_min'] },
      { action: 'Back', view: 'main',  icon: 'back' },
    ]
  },
  main: 'main',
}

// OK, now we have a clean user interface as NoGui "spec".
// Let's build some business logic for it.

// To allow the app to do something, we need to define
// some callbacks and a data model as used in the NoGui spec.
const data = {
    muted: false,  // nogui will setup data bindings for all fields
}
const callbacks = {
    playAudio() { print("PLAY") },  // callback for the Play button
    stopAudio() { print("STOP") },  // callback for the Stop button
    respClose(id, code) { if(code == 'OK') app.quit() },  // Dialog handler
}

// Now we can bring everything together into a GTK app.
const Gtk   = require('gtk4')   // webpack import for `imports.gi.Gtk`
const nogui = require('nogui')  // webpack import for `imports.<path>.nogui`

let app = new Gtk.Application()
app.connect('activate', (app) => {
    let window = new Gtk.ApplicationWindow({      
      title: 'Simple Audio Player', default_width: 240, application:app,
    })
    let stack = new Gtk.Stack()  // use a Gtk.Stack to manage views
    window.set_child(stack)
    window.show()

    // `nogui.Controller` manages data and connects controls to the parents
    let ctl = new nogui.Controller({
        window, data, callbacks,
        showView: (name) => stack.set_visible_child_name(name),
    })

    // Let's find out where this GJS file is located to find any assets.
    let program = imports.system.programInvocationName
    let here = imports.gi.GLib.path_get_dirname(program)

    // `nogui.Builder` builds the UI and loads assets such as icons
    // and Markdown files according to the NoGui spec.
    let ui = new nogui.Builder(spec, ctl, here)
    ui.buildWidgets()

    // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
    // Only the views need to added to the parent controls.
    for (const v of ui.views) stack.add_named(v.widget, v.name)

    // The ctl.showView handler allows switching views manually
    // and is also used for view changes defined in the spec.
    ctl.showView(ui.spec.main)

    data.muted = true  
})
app.run(null)
