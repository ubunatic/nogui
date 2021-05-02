// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { Gtk } = imports.gi

const poly = require('./poly').getPoly()

const Options = {
    V: {orientation: Gtk.Orientation.VERTICAL},
    H: {orientation: Gtk.Orientation.HORIZONTAL},
}

const Constants = {
    CENTER: Gtk.Align.CENTER,
    FILL:   Gtk.Align.FILL,
}

let add = (parent, widget, ...styles) => {
    css(widget, ...styles)
    poly.append(parent, widget)
    poly.show(widget)
    poly.show(parent)
    return widget
}

var css = (w, ...styles) => {
    const ctx = w.get_style_context()
    styles.forEach((obj) => {
        if (obj == null) return
        if(typeof obj == 'string') {
            const cp = new Gtk.CssProvider()
            cp.load_from_data(obj)
            obj = cp
        }
        ctx.add_provider(obj, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    })
    return w
}

if (!this.module) this.module = {}
module.exports = { add, css, Options, ...Constants }
