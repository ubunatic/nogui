// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { GLib, } = imports.gi
const ByteArray = imports.byteArray

const toPath      = (...s) => GLib.build_filenamev(s)
const toPathArray = (path) => (typeof path == 'string')? [path] : path
const fileExt     = (file) => GLib.build_filenamev(toPathArray(file)).split('.').pop()
const readFile    = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

if (!this.module) this.module = {}
module.exports = { toPath, toPathArray, fileExt, readFile }