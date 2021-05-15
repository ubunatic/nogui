// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { GLib, } = imports.gi
const ByteArray = imports.byteArray

/** converts path elements `...s` to an OS-specific path string
 * @returns {string} OS-specific path string
*/
var toPath = (...s) => GLib.build_filenamev(s)

/** wraps a path string in an Array or returns the unchanged path
 * if it is not a `string`
 * @param {string|Array} path  file path as string or Array
 * @returns {Array}            file path as Array
*/
var toPathArray = (path) => (typeof path == 'string')? [path] : path

/** extracts the file extension from the given path.
 * If the file as no extension (separated with '.') file itself is returned
 * @param {string|Array} file  file path as string or Array
 * @returns {string}           extension of the file
*/
var fileExt = (file) => GLib.build_filenamev(toPathArray(file)).split('.').pop()

/**
 * @param {string} path  the file name of the file to read
 * @returns {string}     the text content of the file
 */
var readFile = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

if (!this.module) this.module = {}
module.exports = { toPath, toPathArray, fileExt, readFile }
