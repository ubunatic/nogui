imports.gi.versions.Gtk = '4.0'                 // define supported GTK version
const { Gtk, Gio, GObject, GLib } = imports.gi  // required system imports

// Gnome Shell Extensions
const ui = imports.ui
const Main = ui.main
const PanelMenu = ui.panelMenu

// Gnome-Shell-style relative import for this extension
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Player } = Me.imports.myaudio
log(`loaded Me.imports.myaudio: ${Player}`)

const asset_dir = GLib.build_filenamev([Me.path, '..', 'share'])
// NOTE: If you webpack this file and move it elsewhere, make sure the
//       assets are still reachable from the webpacked location.

var MenuButton = GObject.registerClass(
  class MenuButton extends PanelMenu.Button {
    _init() {
      super._init(1.0, Me.metadata.name, null)
      this.set_label('😎')

      this.player_window = null

      this.connect('clicked',  () => this.onClick())
      this.connect('activate', () => this.onStart())
      this.connect('destroy',  () => this.onStop())
    }
    onClick() {
      let w = this.player_window = new Gtk.Window()
      let p = new Player(asset_dir, w)
      w.set_child(p.widget)
      w.show()
    }
    onStart() {
      log(`activated MenuButton for ${Me.uuid}`)
    }
    onStop() {
      log(`destroyed MenuButton for ${Me.uuid}`)
    }
  }
)

// menuBtn is the main control used to access the extension.
let menuBtn

// enable is called by the extension manager to enable the extension
function enable() {
  if (menuBtn != null) {
    logError(new Error('enable called again without calling disable'))
    menuBtn.destroy()
  }
  menuBtn = new MenuButton()
  Main.panel.addToStatusArea(Me.metadata.name, menuBtn)
  log(`enabled ${Me.uuid}`)
}

// disable is called by the extension manager to disable the extension.
// The effect of disable must be that all related processes are stopped,
// all controls are removed, all bindings are released, etc.
function disable() {
  if (menuBtn == null) {
    logError(new Error('menuBtn is null, disable called before enable'))
  } else {
    menuBtn.player_window.destroy()
    menuBtn.destroy()
  }
  menuBtn = null
  log(`disabled ${Me.uuid}`)
}

// init is called by the extension manager when loading this module.
function init() {
  log(`initialized ${Me.uuid}`)
}
