// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { Gtk } = imports.gi

// RESPONSE_TYPE defines nogui-dialog response types.
// The response types are more generic than `Gtk.ResponseType` codes
// and are passed additional argument to `Gtk.Dialog` callbacks.
// Also see https://gjs-docs.gnome.org/gtk40~4.0.3/gtk.responsetype
// and `gtkToNoguiResponseCode`.
var RESPONSE_TYPE = {
    HELP:   'HELP',  // HELP
    OK:     'OK',
    NOT_OK: 'NOT_OK',
    OTHER:  'OTHER',
}

const gtkToNoguiResponseCode = (response_code) => {
    // see: https://gjs-docs.gnome.org/gtk40~4.0.3/gtk.responsetype
    switch(response_code) {
        case Gtk.ResponseType.APPLY:  // fallthrough
        case Gtk.ResponseType.YES:    // fallthrough
        case Gtk.ResponseType.OK:     return RESPONSE_TYPE.OK
        case Gtk.ResponseType.CANCEL: // fallthrough
        case Gtk.ResponseType.NO:     // fallthrough
        case Gtk.ResponseType.CLOSE:  return RESPONSE_TYPE.NOT_OK
        case Gtk.ResponseType.HELP:   return RESPONSE_TYPE.HELP
        default:                      return RESPONSE_TYPE.OTHER
    }
}

if (!this.module) this.module = {}
module.exports = { RESPONSE_TYPE, gtkToNoguiResponseCode }
