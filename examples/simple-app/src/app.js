// First define your UI inline in one plain JS `Object`.
// You can also load the `spec` from JSON, YAML, or another module.
const spec = {
  icons: {                                                                // define all icons used by the app
    card: { name: 'audio-card' },                                         // this example uses the standard
    play: { name: 'media-playback-start' },                               // GTK themed icons by their name
    stop: { name: 'media-playback-stop' },
    exit: { name: 'application-exit-symbolic' },
    info: { name: "dialog-information-symbolic" },
    gears: { name: "settings-gears-symbolic" },
    back:  { name: "go-previous-symbolic" },
    vol_max: { name: 'audio-volume-high-symbolic' },
    vol_min: { name: 'audio-volume-muted-symbolic' },
  },
  dialogs: {                                                              // simple text-based `dialogs`
    about: { info: 'About Audio Player',  file: '../README.md', icon: 'info' },  // with text in separate file
    close: { ask:  'Close Audio Player?', call: 'onClose',      icon: 'exit' },  // or inline
  },
  parts: {                                                                // `parts` are reusable components
    controls: [
      { act: 'Play', call: 'play', icon: 'play', vis: '!playing' },       // `act` is a small unlabeled action
      { act: 'Stop', call: 'stop', icon: 'stop', vis: 'playing'  },       // button with callbacks, icons, and
    ],                                                                    // the `act` text as tooltip
  },
  views: {                                                                // apps can have multiple views
    player: [
      { title: '{{ playing? "Playing: $song" : "Next Song: $song" }}' },  // use nogui expressions for dynamic text
      { use: 'controls' },                                                // just `use` the `parts` anywhere
      '------------------------------------------------------------',     // easy-peasy separators
      { action: 'About',    dialog: 'about',    icon: 'info' },           // `action` is a labelled button
      { action: 'Settings', view:   'settings', icon: 'gears' },          // actions and acts can also
      { action: 'Close',    dialog: 'close',    icon: 'exit' },           // show dialogs and switch views
    ],
    settings: [
      { title: 'Settings', icon: 'gears' },
      { use: 'controls' },                                                // just `use` the `parts` again
      '------------------------------------------------------------',
      { switch: '{{muted? "Muted" : "Not Muted"}}', bind: 'muted',        // controls can `bind` to the data
        icons: ['vol_max', 'vol_min'] },
      { act: 'Back to Player', view: 'player', icon: 'back' },            // basic view navigation with acts
    ]
  },
  main: 'player',                                                         // tell the app where to start
}

// OK, now we have a clean user interface as NoGui "spec".
// Let's build some business logic for it.

const nogui = require('nogui')   // webpack import for `imports.<path>.nogui`
const { binding, poly } = nogui  // unbox some NoGui helpers

// To allow the app to do something, we need to define some callbacks
// and a data model that can be referenced from the spec.
let data = binding.GetProxy({  // `binding.GetProxy` wraps our data in a
  playing: false,              // `Proxy` to make all fields bindable, so we
  muted:   false,              // can `bind` them in the controls, use them
  song:    'Cool Song 😎🎶'    // as `$vars` in templates (see spec!), or
})                             // create programmatic bindings in code.

// As controller of the app we can use any `object` with some callbacks.
let callbacks = {
  play() { data.playing = true  },  // callback for the Play button
  stop() { data.playing = false },  // callback for the Stop button
  onClose(id, code) {               // "close"-dialog handler
    if(code == 'OK') app.quit()
  },
}

// Now we can bring everything together into a GTK app.
const { Gtk, GLib } = imports.gi
const args = [imports.system.programInvocationName].concat(ARGV)
const here = GLib.path_get_dirname(args[0])
const app = new Gtk.Application()

app.connect('activate', (app) => {
    let stack  = new Gtk.Stack()  // use a Gtk.Stack to manage views
    let window = new Gtk.ApplicationWindow({
      title:'🎵 My Music', default_width:240, application:app, child:stack,
    })
    stack.show()   // GTK 3 requires calling "show" everywhere ¯\_(ツ)_/¯
    window.show()  // in GTK 4 only windows must be shown explicitly

    // `nogui.Controller` manages data, bindings, dialogs, and views
    let ctl = new nogui.Controller({
        window, data, callbacks,
        showView: (name) => stack.set_visible_child_name(name),
    })

    // Nogui will automatically manage bindings for expressions in the spec.
    // But you can also manually bind to the data to trigger custom logic.
    ctl.binding.bindProperty('playing', v => {
      log(v? `playing song "${data.song}"` : `song "${data.song}" stopped`)
    })

    // `nogui.Builder` builds the UI and loads assets such as icons
    // and Markdown files according to the NoGui spec.
    let ui = new nogui.Builder(spec, ctl, ctl.data, here)
    ui.build()  // `build` traverses the spec and creates all widgets

    // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
    // Only the views need to be added to the parent controls.
    for (const v of ui.views) stack.add_named(v.widget, v.name)

    // The custom `showView` handler can be used for switching `views`
    // manually in the custom parent control, i.e., the `stack` in this case.
    // The handler is also used for 'view:<view_name>' actions in the spec.
    ctl.showView(ui.spec.main)
    // A "view" is actually just a separate `Gtk.Widget` tree that can be
    // managed in any `Gtk.Widget`. NoGui does not make any assumptions here.

    callbacks.play()  // Just use the callback to control the app.
})

app.run(args)
