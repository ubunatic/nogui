/**
 * @module gjs_testing loads common GJS and nogui modules used for
 * testing GJS code directly (without webpack roundtrip)
 *
 * The module supports parsing command line flags to control
 * GTK versions and GUI behavior.
 *
 * @see usage
 * @see {@link ../../src/modules.js}
 *
*/

/** @type {import('../../src/modules.js')} */
var modules = imports.modules
const prog = modules.system.programInvocationName

function usage() {
    print(`Usage: ${prog} [3|4] [-g|--gui] [-s|--slow]
    Options:
     3 | 4       define which GTK version to test
    -g | --gui   show the tested GTK windows an controls
                 otherwise only the a CLI will will be created without GUI
    -s | --slow  slow down the test scripts to allow interaction
                 with the testGUIs
    `)
}

/** parses ARGV and sets and returns a specific `poly` and
 * other args based on the supported command line flags.
 *
 * @see usage function for more details
*/
function parseArgs() {
    const { gtk3, gtk4 } = modules.poly
    let gui = false
    let slow = false
    let help = false
    let poly = null
    for (const v of ARGV) switch (v) {
        case '-3':     // fallthrough
        case '3':      poly = gtk3(); break
        case '-4':     // fallthrough
        case '4':      poly = gtk4(); break
        case '-g':     // fallthrough
        case '--gui':  gui = true; break
        case '-s':     // fallthrough
        case '--slow': slow = true; break
        case '-h':     // fallthrough
        case '--help': help = true; break
    }
    return { gui, slow, poly, help, prog }
}

if (!this.module) this.module = {}
module.exports = { modules, usage, parseArgs }
