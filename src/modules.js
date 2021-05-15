/**
 * @module modules loads and exports common system and nogui imports
 *
 * The exported modules are type-annotated where possible for better IDE experience.
 *
 * To use it, just import this module and annotate it with the jsDoc
 * type `{import('path/to/modules.js')}`.
 *
 * This will provide all typedefs from this file and the exposed modules also
 * for GJS `imports` without the need to use `require` (which only works via webpack)
 *
 * @see {@link ../test/poly_test.js}
*/

// NOTE: Only add modules here that do not use `require`!
// HINT: To make your modules compatible with GJS `imports` and node.js `require`
//       1. Declare all public statements either as `function` or as `var` (GJS-style exports).
//       2. Also export them as node.js exports by adding
//          ```js
//          if (!this.module) this.module = {}
//          module.exports = { /* put all vars and functions */ }
//          ```

/** @type {import('./logging.js')} */
var logging = imports.logging

/** @type {import('./poly.js')} */
var poly = imports.poly

/** @type {import('./assert.js')} */
var assert = imports.assert

// TODO: import typedef for GLib/Gio/GTK libs so they appear in VS Code
var system = imports.system
var mainloop = imports.mainloop
var gi = imports.gi

if (!this.module) this.module = {}
module.exports = { poly, assert, logging, system, mainloop, gi }
