// imports.gi.versions.Gtk = '4.0'                 // define supported GTK version
const { Gtk, Gio, GObject, GLib } = imports.gi  // required system imports

// Gnome Shell Extensions
const ui = imports.ui
const Main = ui.main
const PanelMenu = ui.panelMenu

// Gnome-Shell-style relative import for this extension
const Me = imports.misc.extensionUtils.getCurrentExtension()

/** @type {import('./myaudio.js')} */
const myaudio = Me.imports.myaudio

const { Player, poly, sys } = Me.imports.myaudio
// log(`loaded Me.imports.myaudio.Player: ${Player}`)
// log(`loaded Me.imports.myaudio.poly: ${poly}`)
// log(`loaded Me.imports.myaudio.sys: ${sys}`)

const asset_dir = sys.toPath(Me.path, '..', 'share')
// NOTE: If you webpack this file and move it elsewhere, make sure the
//       assets are still reachable from the webpacked location.

var MenuButton = GObject.registerClass(
  class MenuButton extends PanelMenu.Button {
    _init() {
      super._init(1.0, Me.metadata.name, null)
      this.set_label('🎵😎🎵')
      this.pop = null
      this.player = null

      // only start adding elements after the button ios created
      this.connect('realize', () => {
        // preload the default player in the background before first opening
        this.Start()
        // and make sure we cleanup after the parent window dies
        this.getWindow().connect('destroy', () => this.Stop())
        // setup popup menu
        if (poly.isGtk3()) {
          this.set_direction(Gtk.ArrowType.DOWN)
          this.set_use_popover(true)
        } else {
          this.set_create_popup_func(() => this.showPop())
        }
      })
    }
    buildUI(){
      let p = this.pop = new Gtk.Popover()
      let quit = () => this.hidePop()
      if (this.player) this.player.forceQuit()
      this.player = new Player(asset_dir, this.getWindow(), quit)
      poly.set_child(p, this.player.widget)
      poly.set_modal(p, false)
      poly.set_popover(this, p)
      return p
    }
    showPop() { if (this.pop) poly.popup(this.pop) }
    hidePop() { if (this.pop) poly.popdown(this.pop) }
    getWindow(){ return poly.getWindow(this) }
    Start() {
      if (this.pop == null || this.player == null) this.buildUI()
      log(`activated extension ${Me.uuid}`)
    }
    Stop() {
      if (this.player) this.player.forceQuit()
      // this.hidePop()
      this.pop = null
      log(`stopped extension ${Me.uuid}`)
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
    menuBtn.destroy()
  }
  menuBtn = null
  log(`disabled ${Me.uuid}`)
}

// init is called by the extension manager when loading this module.
function init() {
  log(`initialized ${Me.uuid}`)
}
