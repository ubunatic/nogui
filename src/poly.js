

function getPoly({Gtk=imports.Gtk, Gdk=imports.Gdk}={}) { var poly = {
    isGtk3: () => Gtk.MAJOR_VERSION < 4,
    append: (container, o) => {
        if (container.append) return container.append(o)
        // No append available, must try other ways!
        if (container instanceof Gtk.Box) {
            return box.pack_start(o, true, false, '1.0')
        }
        throw new Error(`append(widget) not implemented for ${container}`)
    },
    runDialog: (dia, cb=null, close=true) => {
        dia.show()
        dia.connect('response', (o, id) => {            
            if (cb) cb(id)
            if (id != Gtk.ResponseType.CLOSE && close) dia.close()
        })
    },
    getDisplay: () => Gdk.Display.get_default(),
    getScreen:  () => poly.getDisplay().get_default_screen(),
    getTheme:   () => {
        const T = Gtk.IconTheme
        if (T.get_for_display) return T.get_for_display(poly.getDisplay())
        if (T.get_for_screen)  return T.get_for_screen(poly.getScreen())
        return Gtk.IconTheme.get_default()
    },
    addIconPath: (path) => {
        const theme = poly.getTheme()
        if (theme.add_search_path)    theme.add_search_path(path)
        if (theme.append_search_path) theme.append_search_path(path)
    }
}; return poly }

module.exports = { getPoly }
