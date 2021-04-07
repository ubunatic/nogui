# NoGui

![NoGui](nogui.svg)

NoGui is a **widget-free**, **XML-free**, **boilerplate-free**
notation for specifying user interfaces.

## Rendering
NoGui is rendering-agnostic. The UI tree should be easy to process
and you can use any technology to draw widgets on any device.

## NoGui GTK/GJS
This project provides a first NoGui implementation for GJS/GTK.
The [nogui](src/nogui.js) module allows for loading a NoGui spec
and rendering the corresponding GTK widgets.

## Example

*assets/player.js*
```js
// define your UI in one file
module.exports = {
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
    about: { info: 'About Audio Player',  file: 'about.md',  icon: 'info' },
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
```
This example is written in plain JavaScript. However, `json` or `yaml`
and loading these into memory should also work fine.

OK, now we have a clean user interface as NoGui "spec".
Let's build some business logic for it.

*gtk4-player.js*
```js
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
    let ui = new nogui.Builder('./assets/player,js', ctl, './assets')
    ui.buildWidgets()

    // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
    // Only the views need to added to the parent controls.
    for (const v of ui.views) stack.add_named(v.widget, v.name)

    // The ctl.showView handler allows switching views manually or
    // via the spec action "view":"<name>".
    ctl.showView(ui.spec.main)
    
    data.muted = true  // data bindings are set up automatically
})
app.run(null)
```

That is it! Here is what the app will look like.

![Player Main](img/demo-main.png) ![Player Settings](img/demo-settings.png) ![Player Dialog](img/demo-dialog.png)

## Packaging

The example uses Node.js `require` which is not available in `gjs`.
However, this is currently the [smartest way](https://stackoverflow.com/questions/38537256/how-can-i-include-files-with-gjs-gnome-javascript) of managing packages
for GJS apps without having modifications of your `imports.searchPath`
all over the place. Also for Gnome Extensions it is discouraged to modify
the `searchPath` anyway.

Using `require` and `webpack` you can generate minified files (see [webpack.config.js](webpack.config.js))
that include all required modules. And the best is that you then can use `npm` modules.
For instance, this project uses [md2pango](https://github.com/ubunatic/md2pango) to convert
Markdown to Pango Markup in the about dialog.
