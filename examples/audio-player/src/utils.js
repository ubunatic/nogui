const { GLib } = imports.gi

/** returns a new `Promise` to be resolved or rejected with the result or error
 *  produced by calling `func` after a `delay_ms` timeout.
*/
function asyncTimeout(func, delay_ms=0, ...args) {
    return new Promise((resolve, reject) => {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay_ms, () => {
            try       { resolve(func(...args)) }
            catch (e) { reject(e) }
            return GLib.SOURCE_REMOVE
        })
    })
}

module.exports = { asyncTimeout }