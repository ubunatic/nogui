const gi = imports.gi
const { GLib, Gio } = gi
const ByteArray = imports.byteArray

let history = []
let history_index = -1
let line_prefix = ''

/**
 * `readByteCallback` handles a single byte of input
 *
 * @callback readByteCallback
 * @param {GLib.Bytes} byte
 */

/**
 * readByte read a single byte from the `stream` and passes as argument to `cb`.
 * 
 * @param {Gio.InputStream} stream 
 * @param {readByteCallback} cb
 */
function readByte(stream, cb) {
    // start reading and catch potential pipe errors
    try {
        stream.read_bytes_async(1, GLib.PRIORITY_LOW, null, (stream, res) => {
            // process output and catch potential read errors
            try       { cb(stream.read_bytes_finish(res).get_data()) }
            catch (e) { logError(e); cb(null) }
        })
    } catch(e) {
        logError(e); cb(null)
    }
}

// Terminal escape codes to control the cursor an clear lines
// These code will only work if the terminal is in the correct mode.
var TERM = {
    SAVE_CURSOR:     '\0o33[s',    
    RESTORE_CURSOR:  '\0o33[u',
    CLEAR_LINE:      '\0o33[K',
    CLEAR_SCREEN:    '\0o33[2J',
    CURSOR_FORWARD:  '\0o33[2C',
    CURSOR_BACKWARD: '\0o33[2D',
}

var KEYS = {
    UP:        'UP',
    DOWN:      'DOWN',
    LEFT:      'LEFT',
    RIGHT:     'RIGHT',
    CTRL_UP:   'CTRL_UP',
    CTRL_DOWN: 'CTRL_DOWN',
    CTRL_LEFT: 'CTRL_LEFT',
    CTRL_RIGHT:'CTRL_RIGHT',
    ENTER:     'ENTER',
    TAB:       'TAB',
}

var TTYSEQ = {
    UP:         [27,91,65].join(' '),
    DOWN:       [27,91,66].join(' '),
    LEFT:       [27,91,68].join(' '),
    RIGHT:      [27,91,67].join(' '),
    CTRL_UP:    [59,53,65].join(' '),
    CTRL_DOWN:  [59,53,66].join(' '),
    CTRL_LEFT:  [59,53,68].join(' '),
    CTRL_RIGHT: [59,53,67].join(' '),    
}

function getKey(bytes) {
    const last_3 = bytes.slice(-3).join(' ')
    // print('\ntest key:', last_3)
    for (const k in TTYSEQ) {
        if (TTYSEQ[k] == last_3) return KEYS[k]
    }
    return null
}

function put(...s) {
    if (stdout != null) s.forEach(s => stdout.put_string(`${s}`, null))
    else                print(...s)
}

function put_string(...s) {
    if (stdout != null) s.forEach(s => stdout.put_string(s, null))
    else                print(...s)
}

function write_bytes(b) {
    if (stdout != null) stdout.write_bytes(b, null)
    else                print(...s)
}

function clear_line(len) {
    put_string('\r')
    len = history.reduce((l, s) => l > s.length ? l : s.length, len)
    for (let i = 0; i < len; i++) put_string(' ')
    for (let i = 0; i < len; i++) put_string('\b')
    put_string('\r')
}

/**
 * `readLineCallback` handles a single byte of input
 *
 * @callback readLineCallback
 * @param {string} line
 * @param {array}  bytes
 */

/**
 * readLine reads a full line of input from the `stream` and passes the resulting
 * string as first argument and the raw bytes as second argument `cb`.
 * 
 * @param {Gio.InputStream} stream 
 * @param {readLineCallback} cb 
 */
function readBytes(stream, cb) {
    let bytes = []
    let esc = []
    let all = []

    // restore prev input line if required
    if (line_prefix != '') {
        for (const s of line_prefix) {
            bytes.push(s.charCodeAt(0))
        }        
        line_prefix = ''
    }

    const handleByte = (byte) => {
        if (byte == null) return cb(null)
        const code = byte[0]
        const l = esc.length
        all.push(code)
        if      (l == 0 && code == 27) esc[0] = 27
        else if (l == 1 && code == 91) esc[1] = 91
        else if (l == 2 && code == 49) esc[2] = 49
        else if ((l == 2 || l == 5) && code >= 65 && code <= 68) {
            // arrow keys or CTRL + arrow keys
            esc.push(code)
            // put(` // esc:${esc}, all:${all}`)
            return cb(bytes, getKey(esc))
        }
        else if (l == 4 && code == 59) esc[4] = 59
        else if (l == 5 && code == 53) esc[4] = 53
        else if (code == 127) {
            bytes.pop()
            put_string('\b \b')
        }
        else if (code == 10){
            // put(` // all:${all}`)
            return cb(bytes, KEYS.ENTER)
        }
        else if (code == 9 || code == 0){
            // put(` // all:${all}`)
            return cb(bytes, KEYS.TAB)
        }
        else {
            // handle incomplete ESC seq
            if (l > 0) {
                bytes = bytes.concat(esc)
                put_string(String.fromCharCode(...esc))
                esc = []
            }
            // handle unprocessed byte
            bytes.push(code)
            const char = String.fromCharCode(code)
            put_string(char)
        }

        readByte(stream, handleByte)
    }
    // start reading until line end
    readByte(stream, handleByte)
}

/**
 * `readInput` reads lines and bytes from the `stream`, passing them to the callback `cb`.
 * 
 * @param {Gio.InputStream} stream 
 * @param {readLineCallback} cb 
 */
function readInput(stream, cb) {
    if (cb == null) throw new Error('missing callback to process stdin lines')
    // setup line handler that also handles null lines as end of input
    const handleBytes = (bytes, key=null) => {
        if (key == null) {
            return log('input stream closed')
        }
        cb(String.fromCharCode(...bytes), key)
        return readBytes(stream, handleBytes)        
    }
    // start readLine loop
    readBytes(stream, handleBytes)
}

const re_native_code1 = /{\s*.*\[native code\].*\s*}/mi
const re_native_code2 = /{\s*.*wrapper for native.*\s*}/mi

function complete(expr) {
    let end = expr.slice(-1)[0]
    if (end == '*' || end == '.') {
        expr = expr.slice(0, -1)
    } else {
        end = '*'
    }
    // put_string(`complete: ${expr}${end}`)

    if (expr.length == 0) expr = 'window'
    let search = ''
    let obj = null
    switch (end) {
        case '.': break
        case '*':
            let parts = expr.split('.')
            if (parts.length < 2) parts.unshift('window')
            search = parts.slice(-1)[0].replace(/\*/g, '.*')
            search = new RegExp(`^_*${search}.*`)
            expr = parts.slice(0,-1).join('.')
            break
        default:
            logError(new Error(`unsupported expr terminator: ${end}`))
    }
    put_string(`\r// searching: ${expr}.${search}\n`)
    obj = eval(expr)
    let completion = {}    
    Object.keys(obj).forEach((k) => {
        if (search != '' && !k.match(search)) return
        try {
            completion[k] = `${obj[k]}`.replace(re_native_code1, '').replace(re_native_code2, '')
        } catch (e) {
            completion[k] = `ERROR: ${e.message}`
        }
    })
    return completion
}

var RESULT_TYPE = {
    EVAL: 'EVAL',
    COMPLETION: 'COMPLETION',
    ERROR: 'ERROR',
    NONE: 'NONE',
}

function evaluate(line, key=null) {
    let res = {line, obj: null, error: null, type: RESULT_TYPE.EVAL}
    try {
        let expr = line.trim()

        if (key == KEYS.UP) {
            res.type = RESULT_TYPE.NONE            
            if (history_index > 0) {
                history_index--
                res.line = line_prefix = history[history_index]
                clear_line(line.length)
                put_string(line_prefix)
            }
        }
        else if (key == KEYS.DOWN) {
            res.type = RESULT_TYPE.NONE
            if (history.length == 0) return res
            if (history_index < history.length) {
                history_index++
                if(history_index == history.length) {
                    clear_line(line.length)
                } else {
                    res.line = line_prefix = history[history_index]
                    clear_line(line.length)
                    put_string(line_prefix)
                }
            }
        }
        else if (key == KEYS.RIGHT) {
            res.type = RESULT_TYPE.NONE
            put_string(' ')
        }
        else if (key == KEYS.LEFT) {
            res.type = RESULT_TYPE.NONE
            put_string('\b \b')
        }
        else if (expr.match(/.*[\.\*]$/) || key == KEYS.TAB) {
            // put_string(` searching for '${expr}'\n`)
            res.obj = complete(expr)
            res.type = RESULT_TYPE.COMPLETION
        }
        else {
            // put_string(` eval: ${expr}`)
            res.obj = eval(line)
            res.type = RESULT_TYPE.EVAL
        }
        return res
    } catch(e) {
        res.error = e
        res.type = RESULT_TYPE.ERROR
        return res       
    }
}

let stdout = null
try {
    stdout = new Gio.DataOutputStream({
        base_stream: new Gio.UnixOutputStream({ fd: 1 })
    })
    log('using fd=1 as stdout for repl')
} catch(e) {
    // ignore
}

function startRepl(stream, cb=null, context=null) {
    readInput(stream, (line, key=null) => {
        let res = evaluate(line, key)
        // print(JSON.stringify(res))
        if (cb != null) return cb(res)
        switch (res.type) {
        case RESULT_TYPE.ERROR:
            put_string(`  // ERROR: ${res.error.message}, LINE: ${line}`)
            break;
        case RESULT_TYPE.EVAL:
            put_string(`, res: ${res.obj}\n`)
            history = history.slice(-100).filter(l => l != res.line)
            history.push(res.line)
            history_index = history.length
            break;
        case RESULT_TYPE.COMPLETION:
            if (res.obj == null) {
                put_string(`  // no completion for ${line}`)
            }
            Object.keys(res.obj).sort().forEach(k => {
               print(`${k}: ${res.obj[k]}`)
            })
            break;
        }
    })
}
