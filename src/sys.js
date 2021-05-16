// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { GLib, } = imports.gi
const ByteArray = imports.byteArray

/** converts path elements to an OS-specific path string
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
var fileExt = (file) => basename(toPathArray(file)).split('.').pop()

/**
 * @param {string} path  the file name of the file to read
 * @returns {string}     the text content of the file
 */
var readFile = (path) => ByteArray.toString(GLib.file_get_contents(path)[1])

/** converts string of path Array to a path string
 * @param   {string|Array} path  file path as string or Array
 * @returns {string}             file path as string
*/
var makePath = (path) => (typeof path == 'string')? path : toPath(...path)

/**
 * @param {string} path  the file path to get the dirname from
 * @returns {string}     the dirname of the path
*/
var dirname = (path) => GLib.path_get_dirname(makePath(path))

/**
* @param {string} path  the file path to get the basename from
* @returns {string}     the basename of the path
*/
var basename = (path) => GLib.path_get_basename(makePath(path))

if (!this.module) this.module = {}
module.exports = { toPath, toPathArray, fileExt, readFile, makePath, dirname, basename }
