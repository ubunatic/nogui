/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 672:
/***/ ((__unused_webpack_module, __unused_webpack_exports, __webpack_require__) => {


const USE_GTK = imports.gi.GLib.getenv('USE_GTK')
if (USE_GTK) imports.gi.versions.Gtk = USE_GTK
log(`using GTK version: ${imports.gi.Gtk.get_major_version()}`)

const MyAudio = __webpack_require__(989)  // webpack import for `imports.lib.myaudio`
const poly = __webpack_require__(877).poly       // webpack import for `imports.lib.myaudio`
const {Gio, GLib, Gtk} = imports.gi      // regular import without need for webpack

// first setup some main-file logic to locate the NoGui file and other assets
const program   = imports.system.programInvocationName
const args      = [program].concat(ARGV)
const here      = GLib.path_get_dirname(program)
const asset_dir = GLib.build_filenamev([here, '..', 'share'])
// NOTE: If you webpack this file and move it elsewhere, make sure the
//       assets are still reachable from the webpacked location.

// then define some meta data, config, create an app
const application_id = 'com.github.ubunatic.noguiMyAudio'
const window_opt     = {title: 'MyAudio App', default_width: 240}
const flags          = Gio.ApplicationFlags.FLAGS_NONE  // allow any kind of argument
const app            = new Gtk.Application({application_id, flags})

let songs = []
let play_and_quit = false
app.add_main_option('song', 'f'.charCodeAt(0), GLib.OptionFlags.IN_MAIN,
                    GLib.OptionArg.STRING_ARRAY, 'song to play', 'SONG')
app.add_main_option('quit', 'q'.charCodeAt(0), GLib.OptionFlags.IN_MAIN,
                    GLib.OptionArg.NONE, 'quit after playing', null)

app.connect('handle-local-options', (app, d) => {
    if (d.contains('song')) songs = d.lookup_value('song', null).get_strv()
    if (d.contains('quit')) play_and_quit = true
    print('songs', songs)
    print('quit', play_and_quit)
    return -1
})
app.connect('activate', (app) => {
    let w = new Gtk.ApplicationWindow({application:app, ...window_opt})

    // now load the actual audio player app and add its `Gtk.Widget`
    let player = new MyAudio.Player(asset_dir, w)
    poly.append(w, player.widget)
    w.show()
    w.connect('destroy', () => app.quit())

    // finally start to do something with the app
    if (songs.length > 0) player.songs = songs
    player.playSong()
    if (play_and_quit) {
        print('quit')
        w.close()
        app.quit()
    }
})

app.run(args)


/***/ }),

/***/ 989:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

imports.gi.versions.Gtk = '4.0'        // define which GTK version we support
const { GLib, Gtk, Gio } = imports.gi  // regular import without need for webpack

const nogui = __webpack_require__(877)   // webpack import for `imports.<path>.nogui`
nogui.logging.setVerbose(false)  // show UI builder logs and more

const { asyncTimeout } = nogui.poly

let song_counter = 0

class Song {
    constructor(name, playlist_number=null) {
        if (!playlist_number) {
            playlist_number = (song_counter += 1)
        }
        this.name = name
        this.playlist_number = playlist_number
    }
    get number() { return this.playlist_number }
    toString()   { return `[${this.number}] ${this.name}` }
}

// To allow the app to do something, we need to define a data model
// that can also referenced in the NoGui spec.
class Model {
    constructor() {
        this.muted = false
        this.playing = false
        this.songs = [new Song('Default Song')]
        this.num_songs = 1
        this.next_song = 1
        this.song = ''
        this.song_name = ''
        this.progress = ''
    }
}

// Also our player needs some logic that works with the data.
class SongPlayer extends Model {
    async Play(ctx) {
        this.playing = true
        let stop = false
        ctx.connect(() => stop = true)
        const playNext = async (num) => {
            if (this.songs.length == 0 || stop || num > this.songs.length) {
                // nothing to play or must stop
                return
            }
            let song = this.song = this.songs[num - 1]
            print('playing song', song)
            // simulate playing and report progress
            for (let i = 0; i < 1200; i++) {
                await asyncTimeout(() => {}, 100)
                if (stop) return
                if (i%10 != 0) continue
                let s = i/10
                this.progress = `${Math.floor(s/600)}${Math.floor(s/60)}:${Math.floor(s%60/10)}${s%10}`
            }
            return true
        }
        try {
            if (this.next_song > this.songs.length || this.next_song == null) {
                // rewind playlist
                this.next_song = 1
            }
            while (this.next_song <= this.songs.length) {
                await playNext(this.next_song)
                if (stop) return
                this.next_song += 1
            }
            this.next_song = 1
        }
        catch (e) {
            logError(e)
        }
    }
}

// To interact with the UI we need some handlers and add trackable UI state.
class SongController extends SongPlayer {
    constructor() {
        super()
        this.view = null
        this.ctx = null
        /** @type {Promise} prom - reusable Play promise to await end of playing */
        this.prom = null
    }
    async playSong() {
        if (this.playing) return
        await this.stopSong()
        this.ctx = new Gio.Cancellable()
        this.prom = this.Play(this.ctx)
        try       { await this.prom; print('finished playing') }
        catch (e) { logError(e) }
        this.playing = false
        this.song = ''
        this.progress = ''
        this.prom = null
    }
    async nextSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopSong()
        if (this.next_song < this.songs.length) this.next_song += 1
        else                                    this.next_song = 1
        if (restart) this.playSong()
    }
    async prevSong() {
        let restart = this.playing? true : false
        if (restart) await this.stopSong()
        if (this.next_song > 1) this.next_song -= 1
        else                    this.next_song = this.songs.length
        if (restart) this.playSong()
    }
    async stopSong() {
        if (this.ctx) this.ctx.cancel()
        if (this.prom) await this.prom
    }
    openFile()  {
        const s = new Song(`Song "🎶 ${this.songs.length + 1} 🎶"`)
        this.songs.push(s)
        print('added song', this.songs.slice(-1))
    }
    forceQuit() { /* noop */ }
    respClear(id, code) {
        if(code == 'OK') this.songs = []
    }
}

/** Main audio player class with all needed controls  */
class Player extends SongController {
    constructor(assets_dir='.', window) {
        super()
        // A `Gtk.Stack` serves as main widget to manage views.
        let stack = this.widget = new Gtk.Stack()
        stack.show()

        this.forceQuit = () => window.close()

        // `nogui.Controller` manages data and connects controls to the parents
        let ctl = this.controller = new nogui.Controller({
            window, data:this, callbacks:this,
            showView: (name) => {
                stack.set_visible_child_name(name)
                this.view = name
            }
        })

        ctl.data.bindProperty('songs',
            (v)   => { this.num_songs = this.songs.length },
            (k,v) => { this.num_songs = this.songs.length },
        )
        ctl.data.bindProperty('song',
            (v)   => { this.song_name = this.song.name },
            (k,v) => { this.song_name = this.song.name },
        )

        // Define where to find the JSON or JS file for our UI.
        let spec_file = GLib.build_filenamev([assets_dir, 'spec.js'])

        // A `nogui.Builder` builds the UI.
        let ui = new nogui.Builder(spec_file, ctl, ctl.data, assets_dir)
        ui.build()

        // The builder now has all `ui.views`, `ui.icons`, and `ui.dialogs`.
        // Only the views need to added to the parent controls.
        for (const v of ui.views) stack.add_named(v.widget, v.name)

        // The ctl.showView handler allows switching views manually or
        // via the spec action "view":"name_of_view".
        ctl.showView(ui.spec.main)

        // Data bindings are set up automatically, so that we can adjust
        // values and they will be reflected in the UI
        this.muted = true
    }
}

module.exports = { Player }


/***/ }),

/***/ 111:
/***/ (function(module) {

(function (global, factory) {
	 true ? module.exports = factory() :
	0;
}(this, (function () { 'use strict';

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var _global = createCommonjsModule(function (module) {
	// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
	var global = module.exports = typeof window != 'undefined' && window.Math == Math
	  ? window : typeof self != 'undefined' && self.Math == Math ? self
	  // eslint-disable-next-line no-new-func
	  : Function('return this')();
	if (typeof __g == 'number') { __g = global; } // eslint-disable-line no-undef
	});

	var _core = createCommonjsModule(function (module) {
	var core = module.exports = { version: '2.6.5' };
	if (typeof __e == 'number') { __e = core; } // eslint-disable-line no-undef
	});
	var _core_1 = _core.version;

	var _isObject = function (it) {
	  return typeof it === 'object' ? it !== null : typeof it === 'function';
	};

	var _anObject = function (it) {
	  if (!_isObject(it)) { throw TypeError(it + ' is not an object!'); }
	  return it;
	};

	var _fails = function (exec) {
	  try {
	    return !!exec();
	  } catch (e) {
	    return true;
	  }
	};

	// Thank's IE8 for his funny defineProperty
	var _descriptors = !_fails(function () {
	  return Object.defineProperty({}, 'a', { get: function () { return 7; } }).a != 7;
	});

	var document = _global.document;
	// typeof document.createElement is 'object' in old IE
	var is = _isObject(document) && _isObject(document.createElement);
	var _domCreate = function (it) {
	  return is ? document.createElement(it) : {};
	};

	var _ie8DomDefine = !_descriptors && !_fails(function () {
	  return Object.defineProperty(_domCreate('div'), 'a', { get: function () { return 7; } }).a != 7;
	});

	// 7.1.1 ToPrimitive(input [, PreferredType])

	// instead of the ES6 spec version, we didn't implement @@toPrimitive case
	// and the second argument - flag - preferred type is a string
	var _toPrimitive = function (it, S) {
	  if (!_isObject(it)) { return it; }
	  var fn, val;
	  if (S && typeof (fn = it.toString) == 'function' && !_isObject(val = fn.call(it))) { return val; }
	  if (typeof (fn = it.valueOf) == 'function' && !_isObject(val = fn.call(it))) { return val; }
	  if (!S && typeof (fn = it.toString) == 'function' && !_isObject(val = fn.call(it))) { return val; }
	  throw TypeError("Can't convert object to primitive value");
	};

	var dP = Object.defineProperty;

	var f = _descriptors ? Object.defineProperty : function defineProperty(O, P, Attributes) {
	  _anObject(O);
	  P = _toPrimitive(P, true);
	  _anObject(Attributes);
	  if (_ie8DomDefine) { try {
	    return dP(O, P, Attributes);
	  } catch (e) { /* empty */ } }
	  if ('get' in Attributes || 'set' in Attributes) { throw TypeError('Accessors not supported!'); }
	  if ('value' in Attributes) { O[P] = Attributes.value; }
	  return O;
	};

	var _objectDp = {
		f: f
	};

	var _propertyDesc = function (bitmap, value) {
	  return {
	    enumerable: !(bitmap & 1),
	    configurable: !(bitmap & 2),
	    writable: !(bitmap & 4),
	    value: value
	  };
	};

	var _hide = _descriptors ? function (object, key, value) {
	  return _objectDp.f(object, key, _propertyDesc(1, value));
	} : function (object, key, value) {
	  object[key] = value;
	  return object;
	};

	var hasOwnProperty = {}.hasOwnProperty;
	var _has = function (it, key) {
	  return hasOwnProperty.call(it, key);
	};

	var id = 0;
	var px = Math.random();
	var _uid = function (key) {
	  return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
	};

	var _library = false;

	var _shared = createCommonjsModule(function (module) {
	var SHARED = '__core-js_shared__';
	var store = _global[SHARED] || (_global[SHARED] = {});

	(module.exports = function (key, value) {
	  return store[key] || (store[key] = value !== undefined ? value : {});
	})('versions', []).push({
	  version: _core.version,
	  mode: _library ? 'pure' : 'global',
	  copyright: '© 2019 Denis Pushkarev (zloirock.ru)'
	});
	});

	var _functionToString = _shared('native-function-to-string', Function.toString);

	var _redefine = createCommonjsModule(function (module) {
	var SRC = _uid('src');

	var TO_STRING = 'toString';
	var TPL = ('' + _functionToString).split(TO_STRING);

	_core.inspectSource = function (it) {
	  return _functionToString.call(it);
	};

	(module.exports = function (O, key, val, safe) {
	  var isFunction = typeof val == 'function';
	  if (isFunction) { _has(val, 'name') || _hide(val, 'name', key); }
	  if (O[key] === val) { return; }
	  if (isFunction) { _has(val, SRC) || _hide(val, SRC, O[key] ? '' + O[key] : TPL.join(String(key))); }
	  if (O === _global) {
	    O[key] = val;
	  } else if (!safe) {
	    delete O[key];
	    _hide(O, key, val);
	  } else if (O[key]) {
	    O[key] = val;
	  } else {
	    _hide(O, key, val);
	  }
	// add fake Function#toString for correct work wrapped methods / constructors with methods like LoDash isNative
	})(Function.prototype, TO_STRING, function toString() {
	  return typeof this == 'function' && this[SRC] || _functionToString.call(this);
	});
	});

	var _aFunction = function (it) {
	  if (typeof it != 'function') { throw TypeError(it + ' is not a function!'); }
	  return it;
	};

	// optional / simple context binding

	var _ctx = function (fn, that, length) {
	  _aFunction(fn);
	  if (that === undefined) { return fn; }
	  switch (length) {
	    case 1: return function (a) {
	      return fn.call(that, a);
	    };
	    case 2: return function (a, b) {
	      return fn.call(that, a, b);
	    };
	    case 3: return function (a, b, c) {
	      return fn.call(that, a, b, c);
	    };
	  }
	  return function (/* ...args */) {
	    return fn.apply(that, arguments);
	  };
	};

	var PROTOTYPE = 'prototype';

	var $export = function (type, name, source) {
	  var IS_FORCED = type & $export.F;
	  var IS_GLOBAL = type & $export.G;
	  var IS_STATIC = type & $export.S;
	  var IS_PROTO = type & $export.P;
	  var IS_BIND = type & $export.B;
	  var target = IS_GLOBAL ? _global : IS_STATIC ? _global[name] || (_global[name] = {}) : (_global[name] || {})[PROTOTYPE];
	  var exports = IS_GLOBAL ? _core : _core[name] || (_core[name] = {});
	  var expProto = exports[PROTOTYPE] || (exports[PROTOTYPE] = {});
	  var key, own, out, exp;
	  if (IS_GLOBAL) { source = name; }
	  for (key in source) {
	    // contains in native
	    own = !IS_FORCED && target && target[key] !== undefined;
	    // export native or passed
	    out = (own ? target : source)[key];
	    // bind timers to global for call from export context
	    exp = IS_BIND && own ? _ctx(out, _global) : IS_PROTO && typeof out == 'function' ? _ctx(Function.call, out) : out;
	    // extend global
	    if (target) { _redefine(target, key, out, type & $export.U); }
	    // export
	    if (exports[key] != out) { _hide(exports, key, exp); }
	    if (IS_PROTO && expProto[key] != out) { expProto[key] = out; }
	  }
	};
	_global.core = _core;
	// type bitmap
	$export.F = 1;   // forced
	$export.G = 2;   // global
	$export.S = 4;   // static
	$export.P = 8;   // proto
	$export.B = 16;  // bind
	$export.W = 32;  // wrap
	$export.U = 64;  // safe
	$export.R = 128; // real proto method for `library`
	var _export = $export;

	// 7.1.4 ToInteger
	var ceil = Math.ceil;
	var floor = Math.floor;
	var _toInteger = function (it) {
	  return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
	};

	// 7.2.1 RequireObjectCoercible(argument)
	var _defined = function (it) {
	  if (it == undefined) { throw TypeError("Can't call method on  " + it); }
	  return it;
	};

	// true  -> String#at
	// false -> String#codePointAt
	var _stringAt = function (TO_STRING) {
	  return function (that, pos) {
	    var s = String(_defined(that));
	    var i = _toInteger(pos);
	    var l = s.length;
	    var a, b;
	    if (i < 0 || i >= l) { return TO_STRING ? '' : undefined; }
	    a = s.charCodeAt(i);
	    return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff
	      ? TO_STRING ? s.charAt(i) : a
	      : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
	  };
	};

	var $at = _stringAt(false);
	_export(_export.P, 'String', {
	  // 21.1.3.3 String.prototype.codePointAt(pos)
	  codePointAt: function codePointAt(pos) {
	    return $at(this, pos);
	  }
	});

	var codePointAt = _core.String.codePointAt;

	var max = Math.max;
	var min = Math.min;
	var _toAbsoluteIndex = function (index, length) {
	  index = _toInteger(index);
	  return index < 0 ? max(index + length, 0) : min(index, length);
	};

	var fromCharCode = String.fromCharCode;
	var $fromCodePoint = String.fromCodePoint;

	// length should be 1, old FF problem
	_export(_export.S + _export.F * (!!$fromCodePoint && $fromCodePoint.length != 1), 'String', {
	  // 21.1.2.2 String.fromCodePoint(...codePoints)
	  fromCodePoint: function fromCodePoint(x) {
	    var arguments$1 = arguments;
	 // eslint-disable-line no-unused-vars
	    var res = [];
	    var aLen = arguments.length;
	    var i = 0;
	    var code;
	    while (aLen > i) {
	      code = +arguments$1[i++];
	      if (_toAbsoluteIndex(code, 0x10ffff) !== code) { throw RangeError(code + ' is not a valid code point'); }
	      res.push(code < 0x10000
	        ? fromCharCode(code)
	        : fromCharCode(((code -= 0x10000) >> 10) + 0xd800, code % 0x400 + 0xdc00)
	      );
	    } return res.join('');
	  }
	});

	var fromCodePoint = _core.String.fromCodePoint;

	// This is a generated file. Do not edit.
	var Space_Separator = /[\u1680\u2000-\u200A\u202F\u205F\u3000]/;
	var ID_Start = /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE83\uDE86-\uDE89\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]/;
	var ID_Continue = /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u08D4-\u08E1\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u09FC\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9-\u0AFF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C80-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D00-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D54-\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1CD0-\u1CD2\u1CD4-\u1CF9\u1D00-\u1DF9\u1DFB-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE3E\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC00-\uDC4A\uDC50-\uDC59\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDE00-\uDE3E\uDE47\uDE50-\uDE83\uDE86-\uDE99\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC36\uDC38-\uDC40\uDC50-\uDC59\uDC72-\uDC8F\uDC92-\uDCA7\uDCA9-\uDCB6\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD36\uDD3A\uDD3C\uDD3D\uDD3F-\uDD47\uDD50-\uDD59]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD838[\uDC00-\uDC06\uDC08-\uDC18\uDC1B-\uDC21\uDC23\uDC24\uDC26-\uDC2A]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6\uDD00-\uDD4A\uDD50-\uDD59]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/;

	var unicode = {
		Space_Separator: Space_Separator,
		ID_Start: ID_Start,
		ID_Continue: ID_Continue
	};

	var util = {
	    isSpaceSeparator: function isSpaceSeparator (c) {
	        return typeof c === 'string' && unicode.Space_Separator.test(c)
	    },

	    isIdStartChar: function isIdStartChar (c) {
	        return typeof c === 'string' && (
	            (c >= 'a' && c <= 'z') ||
	        (c >= 'A' && c <= 'Z') ||
	        (c === '$') || (c === '_') ||
	        unicode.ID_Start.test(c)
	        )
	    },

	    isIdContinueChar: function isIdContinueChar (c) {
	        return typeof c === 'string' && (
	            (c >= 'a' && c <= 'z') ||
	        (c >= 'A' && c <= 'Z') ||
	        (c >= '0' && c <= '9') ||
	        (c === '$') || (c === '_') ||
	        (c === '\u200C') || (c === '\u200D') ||
	        unicode.ID_Continue.test(c)
	        )
	    },

	    isDigit: function isDigit (c) {
	        return typeof c === 'string' && /[0-9]/.test(c)
	    },

	    isHexDigit: function isHexDigit (c) {
	        return typeof c === 'string' && /[0-9A-Fa-f]/.test(c)
	    },
	};

	var source;
	var parseState;
	var stack;
	var pos;
	var line;
	var column;
	var token;
	var key;
	var root;

	var parse = function parse (text, reviver) {
	    source = String(text);
	    parseState = 'start';
	    stack = [];
	    pos = 0;
	    line = 1;
	    column = 0;
	    token = undefined;
	    key = undefined;
	    root = undefined;

	    do {
	        token = lex();

	        // This code is unreachable.
	        // if (!parseStates[parseState]) {
	        //     throw invalidParseState()
	        // }

	        parseStates[parseState]();
	    } while (token.type !== 'eof')

	    if (typeof reviver === 'function') {
	        return internalize({'': root}, '', reviver)
	    }

	    return root
	};

	function internalize (holder, name, reviver) {
	    var value = holder[name];
	    if (value != null && typeof value === 'object') {
	        for (var key in value) {
	            var replacement = internalize(value, key, reviver);
	            if (replacement === undefined) {
	                delete value[key];
	            } else {
	                value[key] = replacement;
	            }
	        }
	    }

	    return reviver.call(holder, name, value)
	}

	var lexState;
	var buffer;
	var doubleQuote;
	var sign;
	var c;

	function lex () {
	    lexState = 'default';
	    buffer = '';
	    doubleQuote = false;
	    sign = 1;

	    for (;;) {
	        c = peek();

	        // This code is unreachable.
	        // if (!lexStates[lexState]) {
	        //     throw invalidLexState(lexState)
	        // }

	        var token = lexStates[lexState]();
	        if (token) {
	            return token
	        }
	    }
	}

	function peek () {
	    if (source[pos]) {
	        return String.fromCodePoint(source.codePointAt(pos))
	    }
	}

	function read () {
	    var c = peek();

	    if (c === '\n') {
	        line++;
	        column = 0;
	    } else if (c) {
	        column += c.length;
	    } else {
	        column++;
	    }

	    if (c) {
	        pos += c.length;
	    }

	    return c
	}

	var lexStates = {
	    default: function default$1 () {
	        switch (c) {
	        case '\t':
	        case '\v':
	        case '\f':
	        case ' ':
	        case '\u00A0':
	        case '\uFEFF':
	        case '\n':
	        case '\r':
	        case '\u2028':
	        case '\u2029':
	            read();
	            return

	        case '/':
	            read();
	            lexState = 'comment';
	            return

	        case undefined:
	            read();
	            return newToken('eof')
	        }

	        if (util.isSpaceSeparator(c)) {
	            read();
	            return
	        }

	        // This code is unreachable.
	        // if (!lexStates[parseState]) {
	        //     throw invalidLexState(parseState)
	        // }

	        return lexStates[parseState]()
	    },

	    comment: function comment () {
	        switch (c) {
	        case '*':
	            read();
	            lexState = 'multiLineComment';
	            return

	        case '/':
	            read();
	            lexState = 'singleLineComment';
	            return
	        }

	        throw invalidChar(read())
	    },

	    multiLineComment: function multiLineComment () {
	        switch (c) {
	        case '*':
	            read();
	            lexState = 'multiLineCommentAsterisk';
	            return

	        case undefined:
	            throw invalidChar(read())
	        }

	        read();
	    },

	    multiLineCommentAsterisk: function multiLineCommentAsterisk () {
	        switch (c) {
	        case '*':
	            read();
	            return

	        case '/':
	            read();
	            lexState = 'default';
	            return

	        case undefined:
	            throw invalidChar(read())
	        }

	        read();
	        lexState = 'multiLineComment';
	    },

	    singleLineComment: function singleLineComment () {
	        switch (c) {
	        case '\n':
	        case '\r':
	        case '\u2028':
	        case '\u2029':
	            read();
	            lexState = 'default';
	            return

	        case undefined:
	            read();
	            return newToken('eof')
	        }

	        read();
	    },

	    value: function value () {
	        switch (c) {
	        case '{':
	        case '[':
	            return newToken('punctuator', read())

	        case 'n':
	            read();
	            literal('ull');
	            return newToken('null', null)

	        case 't':
	            read();
	            literal('rue');
	            return newToken('boolean', true)

	        case 'f':
	            read();
	            literal('alse');
	            return newToken('boolean', false)

	        case '-':
	        case '+':
	            if (read() === '-') {
	                sign = -1;
	            }

	            lexState = 'sign';
	            return

	        case '.':
	            buffer = read();
	            lexState = 'decimalPointLeading';
	            return

	        case '0':
	            buffer = read();
	            lexState = 'zero';
	            return

	        case '1':
	        case '2':
	        case '3':
	        case '4':
	        case '5':
	        case '6':
	        case '7':
	        case '8':
	        case '9':
	            buffer = read();
	            lexState = 'decimalInteger';
	            return

	        case 'I':
	            read();
	            literal('nfinity');
	            return newToken('numeric', Infinity)

	        case 'N':
	            read();
	            literal('aN');
	            return newToken('numeric', NaN)

	        case '"':
	        case "'":
	            doubleQuote = (read() === '"');
	            buffer = '';
	            lexState = 'string';
	            return
	        }

	        throw invalidChar(read())
	    },

	    identifierNameStartEscape: function identifierNameStartEscape () {
	        if (c !== 'u') {
	            throw invalidChar(read())
	        }

	        read();
	        var u = unicodeEscape();
	        switch (u) {
	        case '$':
	        case '_':
	            break

	        default:
	            if (!util.isIdStartChar(u)) {
	                throw invalidIdentifier()
	            }

	            break
	        }

	        buffer += u;
	        lexState = 'identifierName';
	    },

	    identifierName: function identifierName () {
	        switch (c) {
	        case '$':
	        case '_':
	        case '\u200C':
	        case '\u200D':
	            buffer += read();
	            return

	        case '\\':
	            read();
	            lexState = 'identifierNameEscape';
	            return
	        }

	        if (util.isIdContinueChar(c)) {
	            buffer += read();
	            return
	        }

	        return newToken('identifier', buffer)
	    },

	    identifierNameEscape: function identifierNameEscape () {
	        if (c !== 'u') {
	            throw invalidChar(read())
	        }

	        read();
	        var u = unicodeEscape();
	        switch (u) {
	        case '$':
	        case '_':
	        case '\u200C':
	        case '\u200D':
	            break

	        default:
	            if (!util.isIdContinueChar(u)) {
	                throw invalidIdentifier()
	            }

	            break
	        }

	        buffer += u;
	        lexState = 'identifierName';
	    },

	    sign: function sign$1 () {
	        switch (c) {
	        case '.':
	            buffer = read();
	            lexState = 'decimalPointLeading';
	            return

	        case '0':
	            buffer = read();
	            lexState = 'zero';
	            return

	        case '1':
	        case '2':
	        case '3':
	        case '4':
	        case '5':
	        case '6':
	        case '7':
	        case '8':
	        case '9':
	            buffer = read();
	            lexState = 'decimalInteger';
	            return

	        case 'I':
	            read();
	            literal('nfinity');
	            return newToken('numeric', sign * Infinity)

	        case 'N':
	            read();
	            literal('aN');
	            return newToken('numeric', NaN)
	        }

	        throw invalidChar(read())
	    },

	    zero: function zero () {
	        switch (c) {
	        case '.':
	            buffer += read();
	            lexState = 'decimalPoint';
	            return

	        case 'e':
	        case 'E':
	            buffer += read();
	            lexState = 'decimalExponent';
	            return

	        case 'x':
	        case 'X':
	            buffer += read();
	            lexState = 'hexadecimal';
	            return
	        }

	        return newToken('numeric', sign * 0)
	    },

	    decimalInteger: function decimalInteger () {
	        switch (c) {
	        case '.':
	            buffer += read();
	            lexState = 'decimalPoint';
	            return

	        case 'e':
	        case 'E':
	            buffer += read();
	            lexState = 'decimalExponent';
	            return
	        }

	        if (util.isDigit(c)) {
	            buffer += read();
	            return
	        }

	        return newToken('numeric', sign * Number(buffer))
	    },

	    decimalPointLeading: function decimalPointLeading () {
	        if (util.isDigit(c)) {
	            buffer += read();
	            lexState = 'decimalFraction';
	            return
	        }

	        throw invalidChar(read())
	    },

	    decimalPoint: function decimalPoint () {
	        switch (c) {
	        case 'e':
	        case 'E':
	            buffer += read();
	            lexState = 'decimalExponent';
	            return
	        }

	        if (util.isDigit(c)) {
	            buffer += read();
	            lexState = 'decimalFraction';
	            return
	        }

	        return newToken('numeric', sign * Number(buffer))
	    },

	    decimalFraction: function decimalFraction () {
	        switch (c) {
	        case 'e':
	        case 'E':
	            buffer += read();
	            lexState = 'decimalExponent';
	            return
	        }

	        if (util.isDigit(c)) {
	            buffer += read();
	            return
	        }

	        return newToken('numeric', sign * Number(buffer))
	    },

	    decimalExponent: function decimalExponent () {
	        switch (c) {
	        case '+':
	        case '-':
	            buffer += read();
	            lexState = 'decimalExponentSign';
	            return
	        }

	        if (util.isDigit(c)) {
	            buffer += read();
	            lexState = 'decimalExponentInteger';
	            return
	        }

	        throw invalidChar(read())
	    },

	    decimalExponentSign: function decimalExponentSign () {
	        if (util.isDigit(c)) {
	            buffer += read();
	            lexState = 'decimalExponentInteger';
	            return
	        }

	        throw invalidChar(read())
	    },

	    decimalExponentInteger: function decimalExponentInteger () {
	        if (util.isDigit(c)) {
	            buffer += read();
	            return
	        }

	        return newToken('numeric', sign * Number(buffer))
	    },

	    hexadecimal: function hexadecimal () {
	        if (util.isHexDigit(c)) {
	            buffer += read();
	            lexState = 'hexadecimalInteger';
	            return
	        }

	        throw invalidChar(read())
	    },

	    hexadecimalInteger: function hexadecimalInteger () {
	        if (util.isHexDigit(c)) {
	            buffer += read();
	            return
	        }

	        return newToken('numeric', sign * Number(buffer))
	    },

	    string: function string () {
	        switch (c) {
	        case '\\':
	            read();
	            buffer += escape();
	            return

	        case '"':
	            if (doubleQuote) {
	                read();
	                return newToken('string', buffer)
	            }

	            buffer += read();
	            return

	        case "'":
	            if (!doubleQuote) {
	                read();
	                return newToken('string', buffer)
	            }

	            buffer += read();
	            return

	        case '\n':
	        case '\r':
	            throw invalidChar(read())

	        case '\u2028':
	        case '\u2029':
	            separatorChar(c);
	            break

	        case undefined:
	            throw invalidChar(read())
	        }

	        buffer += read();
	    },

	    start: function start () {
	        switch (c) {
	        case '{':
	        case '[':
	            return newToken('punctuator', read())

	        // This code is unreachable since the default lexState handles eof.
	        // case undefined:
	        //     return newToken('eof')
	        }

	        lexState = 'value';
	    },

	    beforePropertyName: function beforePropertyName () {
	        switch (c) {
	        case '$':
	        case '_':
	            buffer = read();
	            lexState = 'identifierName';
	            return

	        case '\\':
	            read();
	            lexState = 'identifierNameStartEscape';
	            return

	        case '}':
	            return newToken('punctuator', read())

	        case '"':
	        case "'":
	            doubleQuote = (read() === '"');
	            lexState = 'string';
	            return
	        }

	        if (util.isIdStartChar(c)) {
	            buffer += read();
	            lexState = 'identifierName';
	            return
	        }

	        throw invalidChar(read())
	    },

	    afterPropertyName: function afterPropertyName () {
	        if (c === ':') {
	            return newToken('punctuator', read())
	        }

	        throw invalidChar(read())
	    },

	    beforePropertyValue: function beforePropertyValue () {
	        lexState = 'value';
	    },

	    afterPropertyValue: function afterPropertyValue () {
	        switch (c) {
	        case ',':
	        case '}':
	            return newToken('punctuator', read())
	        }

	        throw invalidChar(read())
	    },

	    beforeArrayValue: function beforeArrayValue () {
	        if (c === ']') {
	            return newToken('punctuator', read())
	        }

	        lexState = 'value';
	    },

	    afterArrayValue: function afterArrayValue () {
	        switch (c) {
	        case ',':
	        case ']':
	            return newToken('punctuator', read())
	        }

	        throw invalidChar(read())
	    },

	    end: function end () {
	        // This code is unreachable since it's handled by the default lexState.
	        // if (c === undefined) {
	        //     read()
	        //     return newToken('eof')
	        // }

	        throw invalidChar(read())
	    },
	};

	function newToken (type, value) {
	    return {
	        type: type,
	        value: value,
	        line: line,
	        column: column,
	    }
	}

	function literal (s) {
	    for (var i = 0, list = s; i < list.length; i += 1) {
	        var c = list[i];

	        var p = peek();

	        if (p !== c) {
	            throw invalidChar(read())
	        }

	        read();
	    }
	}

	function escape () {
	    var c = peek();
	    switch (c) {
	    case 'b':
	        read();
	        return '\b'

	    case 'f':
	        read();
	        return '\f'

	    case 'n':
	        read();
	        return '\n'

	    case 'r':
	        read();
	        return '\r'

	    case 't':
	        read();
	        return '\t'

	    case 'v':
	        read();
	        return '\v'

	    case '0':
	        read();
	        if (util.isDigit(peek())) {
	            throw invalidChar(read())
	        }

	        return '\0'

	    case 'x':
	        read();
	        return hexEscape()

	    case 'u':
	        read();
	        return unicodeEscape()

	    case '\n':
	    case '\u2028':
	    case '\u2029':
	        read();
	        return ''

	    case '\r':
	        read();
	        if (peek() === '\n') {
	            read();
	        }

	        return ''

	    case '1':
	    case '2':
	    case '3':
	    case '4':
	    case '5':
	    case '6':
	    case '7':
	    case '8':
	    case '9':
	        throw invalidChar(read())

	    case undefined:
	        throw invalidChar(read())
	    }

	    return read()
	}

	function hexEscape () {
	    var buffer = '';
	    var c = peek();

	    if (!util.isHexDigit(c)) {
	        throw invalidChar(read())
	    }

	    buffer += read();

	    c = peek();
	    if (!util.isHexDigit(c)) {
	        throw invalidChar(read())
	    }

	    buffer += read();

	    return String.fromCodePoint(parseInt(buffer, 16))
	}

	function unicodeEscape () {
	    var buffer = '';
	    var count = 4;

	    while (count-- > 0) {
	        var c = peek();
	        if (!util.isHexDigit(c)) {
	            throw invalidChar(read())
	        }

	        buffer += read();
	    }

	    return String.fromCodePoint(parseInt(buffer, 16))
	}

	var parseStates = {
	    start: function start () {
	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        push();
	    },

	    beforePropertyName: function beforePropertyName () {
	        switch (token.type) {
	        case 'identifier':
	        case 'string':
	            key = token.value;
	            parseState = 'afterPropertyName';
	            return

	        case 'punctuator':
	            // This code is unreachable since it's handled by the lexState.
	            // if (token.value !== '}') {
	            //     throw invalidToken()
	            // }

	            pop();
	            return

	        case 'eof':
	            throw invalidEOF()
	        }

	        // This code is unreachable since it's handled by the lexState.
	        // throw invalidToken()
	    },

	    afterPropertyName: function afterPropertyName () {
	        // This code is unreachable since it's handled by the lexState.
	        // if (token.type !== 'punctuator' || token.value !== ':') {
	        //     throw invalidToken()
	        // }

	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        parseState = 'beforePropertyValue';
	    },

	    beforePropertyValue: function beforePropertyValue () {
	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        push();
	    },

	    beforeArrayValue: function beforeArrayValue () {
	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        if (token.type === 'punctuator' && token.value === ']') {
	            pop();
	            return
	        }

	        push();
	    },

	    afterPropertyValue: function afterPropertyValue () {
	        // This code is unreachable since it's handled by the lexState.
	        // if (token.type !== 'punctuator') {
	        //     throw invalidToken()
	        // }

	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        switch (token.value) {
	        case ',':
	            parseState = 'beforePropertyName';
	            return

	        case '}':
	            pop();
	        }

	        // This code is unreachable since it's handled by the lexState.
	        // throw invalidToken()
	    },

	    afterArrayValue: function afterArrayValue () {
	        // This code is unreachable since it's handled by the lexState.
	        // if (token.type !== 'punctuator') {
	        //     throw invalidToken()
	        // }

	        if (token.type === 'eof') {
	            throw invalidEOF()
	        }

	        switch (token.value) {
	        case ',':
	            parseState = 'beforeArrayValue';
	            return

	        case ']':
	            pop();
	        }

	        // This code is unreachable since it's handled by the lexState.
	        // throw invalidToken()
	    },

	    end: function end () {
	        // This code is unreachable since it's handled by the lexState.
	        // if (token.type !== 'eof') {
	        //     throw invalidToken()
	        // }
	    },
	};

	function push () {
	    var value;

	    switch (token.type) {
	    case 'punctuator':
	        switch (token.value) {
	        case '{':
	            value = {};
	            break

	        case '[':
	            value = [];
	            break
	        }

	        break

	    case 'null':
	    case 'boolean':
	    case 'numeric':
	    case 'string':
	        value = token.value;
	        break

	    // This code is unreachable.
	    // default:
	    //     throw invalidToken()
	    }

	    if (root === undefined) {
	        root = value;
	    } else {
	        var parent = stack[stack.length - 1];
	        if (Array.isArray(parent)) {
	            parent.push(value);
	        } else {
	            parent[key] = value;
	        }
	    }

	    if (value !== null && typeof value === 'object') {
	        stack.push(value);

	        if (Array.isArray(value)) {
	            parseState = 'beforeArrayValue';
	        } else {
	            parseState = 'beforePropertyName';
	        }
	    } else {
	        var current = stack[stack.length - 1];
	        if (current == null) {
	            parseState = 'end';
	        } else if (Array.isArray(current)) {
	            parseState = 'afterArrayValue';
	        } else {
	            parseState = 'afterPropertyValue';
	        }
	    }
	}

	function pop () {
	    stack.pop();

	    var current = stack[stack.length - 1];
	    if (current == null) {
	        parseState = 'end';
	    } else if (Array.isArray(current)) {
	        parseState = 'afterArrayValue';
	    } else {
	        parseState = 'afterPropertyValue';
	    }
	}

	// This code is unreachable.
	// function invalidParseState () {
	//     return new Error(`JSON5: invalid parse state '${parseState}'`)
	// }

	// This code is unreachable.
	// function invalidLexState (state) {
	//     return new Error(`JSON5: invalid lex state '${state}'`)
	// }

	function invalidChar (c) {
	    if (c === undefined) {
	        return syntaxError(("JSON5: invalid end of input at " + line + ":" + column))
	    }

	    return syntaxError(("JSON5: invalid character '" + (formatChar(c)) + "' at " + line + ":" + column))
	}

	function invalidEOF () {
	    return syntaxError(("JSON5: invalid end of input at " + line + ":" + column))
	}

	// This code is unreachable.
	// function invalidToken () {
	//     if (token.type === 'eof') {
	//         return syntaxError(`JSON5: invalid end of input at ${line}:${column}`)
	//     }

	//     const c = String.fromCodePoint(token.value.codePointAt(0))
	//     return syntaxError(`JSON5: invalid character '${formatChar(c)}' at ${line}:${column}`)
	// }

	function invalidIdentifier () {
	    column -= 5;
	    return syntaxError(("JSON5: invalid identifier character at " + line + ":" + column))
	}

	function separatorChar (c) {
	    console.warn(("JSON5: '" + (formatChar(c)) + "' in strings is not valid ECMAScript; consider escaping"));
	}

	function formatChar (c) {
	    var replacements = {
	        "'": "\\'",
	        '"': '\\"',
	        '\\': '\\\\',
	        '\b': '\\b',
	        '\f': '\\f',
	        '\n': '\\n',
	        '\r': '\\r',
	        '\t': '\\t',
	        '\v': '\\v',
	        '\0': '\\0',
	        '\u2028': '\\u2028',
	        '\u2029': '\\u2029',
	    };

	    if (replacements[c]) {
	        return replacements[c]
	    }

	    if (c < ' ') {
	        var hexString = c.charCodeAt(0).toString(16);
	        return '\\x' + ('00' + hexString).substring(hexString.length)
	    }

	    return c
	}

	function syntaxError (message) {
	    var err = new SyntaxError(message);
	    err.lineNumber = line;
	    err.columnNumber = column;
	    return err
	}

	var stringify = function stringify (value, replacer, space) {
	    var stack = [];
	    var indent = '';
	    var propertyList;
	    var replacerFunc;
	    var gap = '';
	    var quote;

	    if (
	        replacer != null &&
	        typeof replacer === 'object' &&
	        !Array.isArray(replacer)
	    ) {
	        space = replacer.space;
	        quote = replacer.quote;
	        replacer = replacer.replacer;
	    }

	    if (typeof replacer === 'function') {
	        replacerFunc = replacer;
	    } else if (Array.isArray(replacer)) {
	        propertyList = [];
	        for (var i = 0, list = replacer; i < list.length; i += 1) {
	            var v = list[i];

	            var item = (void 0);

	            if (typeof v === 'string') {
	                item = v;
	            } else if (
	                typeof v === 'number' ||
	                v instanceof String ||
	                v instanceof Number
	            ) {
	                item = String(v);
	            }

	            if (item !== undefined && propertyList.indexOf(item) < 0) {
	                propertyList.push(item);
	            }
	        }
	    }

	    if (space instanceof Number) {
	        space = Number(space);
	    } else if (space instanceof String) {
	        space = String(space);
	    }

	    if (typeof space === 'number') {
	        if (space > 0) {
	            space = Math.min(10, Math.floor(space));
	            gap = '          '.substr(0, space);
	        }
	    } else if (typeof space === 'string') {
	        gap = space.substr(0, 10);
	    }

	    return serializeProperty('', {'': value})

	    function serializeProperty (key, holder) {
	        var value = holder[key];
	        if (value != null) {
	            if (typeof value.toJSON5 === 'function') {
	                value = value.toJSON5(key);
	            } else if (typeof value.toJSON === 'function') {
	                value = value.toJSON(key);
	            }
	        }

	        if (replacerFunc) {
	            value = replacerFunc.call(holder, key, value);
	        }

	        if (value instanceof Number) {
	            value = Number(value);
	        } else if (value instanceof String) {
	            value = String(value);
	        } else if (value instanceof Boolean) {
	            value = value.valueOf();
	        }

	        switch (value) {
	        case null: return 'null'
	        case true: return 'true'
	        case false: return 'false'
	        }

	        if (typeof value === 'string') {
	            return quoteString(value, false)
	        }

	        if (typeof value === 'number') {
	            return String(value)
	        }

	        if (typeof value === 'object') {
	            return Array.isArray(value) ? serializeArray(value) : serializeObject(value)
	        }

	        return undefined
	    }

	    function quoteString (value) {
	        var quotes = {
	            "'": 0.1,
	            '"': 0.2,
	        };

	        var replacements = {
	            "'": "\\'",
	            '"': '\\"',
	            '\\': '\\\\',
	            '\b': '\\b',
	            '\f': '\\f',
	            '\n': '\\n',
	            '\r': '\\r',
	            '\t': '\\t',
	            '\v': '\\v',
	            '\0': '\\0',
	            '\u2028': '\\u2028',
	            '\u2029': '\\u2029',
	        };

	        var product = '';

	        for (var i = 0; i < value.length; i++) {
	            var c = value[i];
	            switch (c) {
	            case "'":
	            case '"':
	                quotes[c]++;
	                product += c;
	                continue

	            case '\0':
	                if (util.isDigit(value[i + 1])) {
	                    product += '\\x00';
	                    continue
	                }
	            }

	            if (replacements[c]) {
	                product += replacements[c];
	                continue
	            }

	            if (c < ' ') {
	                var hexString = c.charCodeAt(0).toString(16);
	                product += '\\x' + ('00' + hexString).substring(hexString.length);
	                continue
	            }

	            product += c;
	        }

	        var quoteChar = quote || Object.keys(quotes).reduce(function (a, b) { return (quotes[a] < quotes[b]) ? a : b; });

	        product = product.replace(new RegExp(quoteChar, 'g'), replacements[quoteChar]);

	        return quoteChar + product + quoteChar
	    }

	    function serializeObject (value) {
	        if (stack.indexOf(value) >= 0) {
	            throw TypeError('Converting circular structure to JSON5')
	        }

	        stack.push(value);

	        var stepback = indent;
	        indent = indent + gap;

	        var keys = propertyList || Object.keys(value);
	        var partial = [];
	        for (var i = 0, list = keys; i < list.length; i += 1) {
	            var key = list[i];

	            var propertyString = serializeProperty(key, value);
	            if (propertyString !== undefined) {
	                var member = serializeKey(key) + ':';
	                if (gap !== '') {
	                    member += ' ';
	                }
	                member += propertyString;
	                partial.push(member);
	            }
	        }

	        var final;
	        if (partial.length === 0) {
	            final = '{}';
	        } else {
	            var properties;
	            if (gap === '') {
	                properties = partial.join(',');
	                final = '{' + properties + '}';
	            } else {
	                var separator = ',\n' + indent;
	                properties = partial.join(separator);
	                final = '{\n' + indent + properties + ',\n' + stepback + '}';
	            }
	        }

	        stack.pop();
	        indent = stepback;
	        return final
	    }

	    function serializeKey (key) {
	        if (key.length === 0) {
	            return quoteString(key, true)
	        }

	        var firstChar = String.fromCodePoint(key.codePointAt(0));
	        if (!util.isIdStartChar(firstChar)) {
	            return quoteString(key, true)
	        }

	        for (var i = firstChar.length; i < key.length; i++) {
	            if (!util.isIdContinueChar(String.fromCodePoint(key.codePointAt(i)))) {
	                return quoteString(key, true)
	            }
	        }

	        return key
	    }

	    function serializeArray (value) {
	        if (stack.indexOf(value) >= 0) {
	            throw TypeError('Converting circular structure to JSON5')
	        }

	        stack.push(value);

	        var stepback = indent;
	        indent = indent + gap;

	        var partial = [];
	        for (var i = 0; i < value.length; i++) {
	            var propertyString = serializeProperty(String(i), value);
	            partial.push((propertyString !== undefined) ? propertyString : 'null');
	        }

	        var final;
	        if (partial.length === 0) {
	            final = '[]';
	        } else {
	            if (gap === '') {
	                var properties = partial.join(',');
	                final = '[' + properties + ']';
	            } else {
	                var separator = ',\n' + indent;
	                var properties$1 = partial.join(separator);
	                final = '[\n' + indent + properties$1 + ',\n' + stepback + ']';
	            }
	        }

	        stack.pop();
	        indent = stepback;
	        return final
	    }
	};

	var JSON5 = {
	    parse: parse,
	    stringify: stringify,
	};

	var lib = JSON5;

	var es5 = lib;

	return es5;

})));


/***/ }),

/***/ 396:
/***/ ((module, exports, __webpack_require__) => {

/* module decorator */ module = __webpack_require__.nmd(module);
// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

// This file is part of md2pango (https://github.com/ubunatic/md2pango).

const H1="H1", H2="H2", H3="H3", UL="BULLET", OL="LIST", CODE="CODE"
const BOLD="BOLD", EMPH="EMPH", PRE="PRE", LINK="LINK"

let sub_h1, sub_h2, sub_h3

// m2p_sections defines how to detect special markdown sections.
// These expressions scan the full line to detect headings, lists, and code.
const m2p_sections = [
    sub_h1 = { name: H1, re: /^(#\s+)(.*)(\s*)$/,   sub: "<big><big><big>$2</big></big></big>" },
    sub_h2 = { name: H2, re: /^(##\s+)(.*)(\s*)$/,  sub: "<big><big>$2</big></big>" },
    sub_h3 = { name: H3, re: /^(###\s+)(.*)(\s*)$/, sub: "<big>$2</big>" },
    { name: UL, re: /^(\s*[\*\-]\s)(.*)(\s*)$/,   sub: " • $2" },
    { name: OL, re: /^(\s*[0-9]+\.\s)(.*)(\s*)$/, sub: " $1$2" },
    { name: CODE, re: /^```[a-z_]*$/,             sub: "<tt>" },
]

// m2p_styles defines how to replace inline styled text
const m2p_styles = [
    { name: BOLD, re: /(^|[^\*])(\*\*)(.*)(\*\*)/g, sub: "$1<b>$3</b>" },
    { name: BOLD, re: /(\*\*)(.*)(\*\*)([^\*]|$)/g, sub: "<b>$3</b>$4" },
    { name: EMPH, re: /(^|[^\*])(\*)(.*)(\*)/g,   sub: "$1<i>$3</i>" },
    { name: EMPH, re: /(\*)(.*)(\*)([^\*]|$)/g,   sub: "<i>$3</i>$4" },    
    { name: PRE,  re: /(`)([^`]*)(`)/g,           sub: "<tt>$2</tt>" },
    { name: LINK, re: /(!)?(\[)(.*)(\]\()(.+)(\))/g,  sub: "<a href='$5'>$3</a>" },
    { name: LINK, re: /(!)?(\[)(.*)(\]\(\))/g,        sub: "<a href='$3'>$3</a>" },
]

const re_comment = /^\s*<!--.*-->\s*$/
const re_color = /^(\s*<!--\s*(fg|bg)=(#?[0-9a-z_A-Z-]*)\s*((fg|bg)=(#?[0-9a-z_A-Z-]*))?\s*-->\s*)$/
const re_reset = /(<!--\/-->)/
const re_uri = /http[s]?:\/\/[^\s']*/
const re_href = "/href='(http[s]?:\\/\\/[^\\s]*)'"
const re_atag = "<a\s.*>.*(http[s]?:\\/\\/[^\\s]*).*</a>/"
const re_h1line = /^===+\s*$/
const re_h2line = /^---+\s*$/

const m2p_escapes = [
    [/<!--.*-->/, ''],
    [/&/g, '&amp;'],
    [/</g, '&lt;'],
    [/>/g, '&gt;'],    
]

const code_color_span = "<span foreground='#bbb' background='#222'>"

const escape_line  = (line) => m2p_escapes.reduce((l, esc) => l.replace(...esc), line)

const pad = (lines, start=1, end=1) => {
    let len = lines.reduce((n, l) => l.length > n ? l.length : n, 0)
    return lines.map((l) => l.padEnd(len + end, ' ').padStart(len + end + start, ' '))
}

function convert(text) {
    let lines = text.split('\n')
    let code = false
    let out = []
    let pre = []
    let color_span_open = false
    let tt_must_close = false

    const try_close_span = () => {
        if (color_span_open) {
            out.push('</span>')
            color_span_open = false
        }
    }
    const try_open_span = () => {
        if (!color_span_open) {
            out.push('</span>')
            color_span_open = false
        }
    }


    for (const line of lines) {
        // first parse color macros in non-code texts
        if(!code) {
            let colors = line.match(re_color)
            if (colors || line.match(re_reset)) try_close_span()
            if (colors) {
                try_close_span()
                if(color_span_open) close_span()
                let fg = colors[2] == 'fg'? colors[3] : colors[5] == 'fg'? colors[6] : ''
                let bg = colors[2] == 'bg'? colors[3] : colors[5] == 'bg'? colors[6] : ''
                let attrs = ''
                if(fg != '') { attrs += ` foreground='${fg}'`}
                if(bg != '') { attrs += ` background='${bg}'`}
                if (attrs != '') {                
                    out.push(`<span${attrs}>`)
                    color_span_open = true
                }
            }
        }
        // all macros processed, lets remove remaining comments
        if (line.match(re_comment)) continue

        // escape all non-verbatim text
        let result = code? line : escape_line(line)
        let code_start = false
        let match = null
        for (sec of m2p_sections) {
            if (match = line.match(sec.re)) {
                switch (sec.name) {
                    case CODE:
                        if (!code) {
                            code_start=true
                            if (color_span_open) {
                                // cannot color
                                result = '<tt>'
                                tt_must_close = false
                            } else {
                                result = code_color_span + '<tt>'
                                tt_must_close = true
                            }
                        }
                        else {
                            out.push(...pad(pre).map(escape_line))
                            result='</tt>'
                            if (tt_must_close) {
                                result += '</span>'
                                tt_must_close = false
                            }
                        }
                        code=!code
                        break
                    default:
                        if (code) result = line
                        else      result = line.replace(sec.re, sec.sub)
                        break
                }
                break
            }
        }
        if (code && !code_start) {
            pre.push(result)
            continue
        }
        if (line.match(re_h1line)) {
            out.push(`# ${out.pop()}`.replace(sub_h1.re, sub_h1.sub))
            continue
        }
        if (line.match(re_h2line)) {
            out.push(`## ${out.pop()}`.replace(sub_h2.re, sub_h2.sub))
            continue
        }
        // all other text can be styled
        for (const style of m2p_styles) {
            result = result.replace(style.re, style.sub)
        }
        // all raw urls can be linked if possible
        let uri  = result.match(re_uri)    // look for any URI
        let href = result.match(re_href)   // and for URIs in href=''
        let atag = result.match(re_atag)   // and for URIs in <a></a>
        href = href && href[1] == uri
        atag = href && atag[1] == uri
        if (uri && (href || atag)) {
            result = result.replace(uri, `<a href='${uri}'>${uri}</a>`)
        }
        out.push(result)
    }

    try_close_span()
    return out.join('\n')
}

const readFile = (f) => {
    // node.js only and when running from the command line
    const fs = __webpack_require__(939)
    return fs.readFileSync(f, 'utf8')
}

let __is_nodejs_main = false
try {
    // node.js specific checks and exports
    __is_nodejs_main = (__webpack_require__.c[__webpack_require__.s] === module)
    exports.convert = convert
} catch(e) {}

if (__is_nodejs_main) {
    // running in node.js called from the CLI
    let args = process.argv.slice(2)
    if (args.length == 0 || args.find((a) => a == '-h')) {
        console.log(`Usage: ${process.argv[1]} FILE [FILE...]`)
        process.exit(0)
    }
    args.forEach((f) => process.stdout.write(convert(readFile(f))))
}


/***/ }),

/***/ 99:
/***/ (function(module) {


function typeStr(o) { return (o && o.constructor)? o.constructor.name : typeof o }
function typ(...o)  { return o.map(typeStr).join(', ') }

function Null(v, msg='assert.Null', ...o) {
    assert(v == null, `${msg}, got ${v}, expected null`, ...o)
}

function NotNull(v, msg='assert.NotNull', ...o) {
    assert(v != null, `${msg}, got ${v}, expected non-null`, ...o)
}

function NotEq(v, e, msg='assert.NotEq', ...o) {
    assert(v != e, `${msg}, got ${v} == ${e}`, ...o)
}

function Eq(v, e, msg='assert.Eq', ...o) {
    assert(v == e, `${msg}, got ${v}, expected ${e}`, ...o)
}

function True(val, msg='assert.True', ...o) {
    assert(val, msg, ...o)
}

function False(val, msg='assert.False', ...o) {
    assert(!val, msg, ...o)
}

function assert(val, msg='assert', ...o) {
    if (!val) throw new Error(`${msg} ${typ(...o)}`)
}

if (!this.module) this.module = {}
module.exports = {
    Null:    Null,
    NotNull: NotNull,
    Eq:      Eq,
    NotEq:   NotEq,
    True:    True,
    False:   False,
    assert:  assert,
}


/***/ }),

/***/ 329:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

/**
 * Bindings Module
 * @module binding
 *
 * This module contains classes and functions for controlling
 * data bindings and object proxies.
 */

let GObject
try       { GObject = imports.gi.GObject.Object }
catch (e) { GObject = class GObject {}}

const HasBindings = Symbol('HasBindings')
const ProxyInfo   = Symbol('ProxyInfo')
const BindInfo    = Symbol('BindInfo')

const logger = __webpack_require__(347).getLogger('binding')
const { log, debug, typ, str, len } = logger
const assert = __webpack_require__(99)
const { parseExpr, parseLiteral } = __webpack_require__(755)

const _ = (obj) => Object.keys(obj).map(k => `${k}:${obj[k]}`).join(',')

let next_proxy_id = 1

function createProxy(obj) {
    if (obj[ProxyInfo] != null) return obj
    log(`createProxy(${typ(obj)}, status=${getUnbindableReason(obj) || 'bindable'})`)
    if (!isBindable(obj)) return obj
    let targets = []
    let bind_id = 0
    const p = new Proxy(obj, {
        deleteProperty: function(obj, k) {
            delete obj[k]
            for (const t of targets) if (t) t(k, null)
            return true
        },
        set: function(obj, k, v) {
            obj[k] = v
            for (const t of targets) if (t) t(k, v)
            return true
        }
    })
    p[ProxyInfo] = {
        id: next_proxy_id++,
        connect:    (onChange) => { bind_id++; targets[bind_id] = onChange; return bind_id },
        disconnect: (id)       => { delete targets[id] }
    }
    return p
}

function getUnbindableReason(obj) {
    if (obj == null)              return 'cannot bind to null'
    if (typeof obj == 'function') return 'cannot bind to function'
    if (typeof obj != 'object')   return 'cannot bind to non-objects'
    if (obj[HasBindings])         return 'cannot reuse objects with bindings'
    if (obj[ProxyInfo])           return 'cannot reuse proxied objects'
    if (obj instanceof Bindable)  return 'cannot reuse Bindables'
    if (obj instanceof Binding)   return 'cannot reuse Bindings'
    if (obj instanceof Promise)   return 'cannot bind to Promise'
    if (obj instanceof GObject)   return 'cannot bind to GObject'
    return null
}

function isBindable(obj) { return getUnbindableReason(obj) == null }

/** @class Binding makes object properties bindable.
 * If the assigned value to the property is again a bindable object,
 * this object will also be "proxied" to bubble up property changes.
 * This does not create a real binding
*/
var Binding = class Binding {
    constructor(obj, field) {
        const val = obj[field]  // current value

        debug(`create Binding(${typ(obj)}, ${field}:${typ(val)})`)

        this.targets = {}
        this.prop_targets = {}
        this.proxy_bind_id = 0
        this.bind_id = 0
        this.field   = field
        this.obj     = obj
        this.value   = null  // start with null
        this.getter = () => this.value
        this.setter = (val) => {
            if (val != this.value) {
                // disconnect previous proxied value before overwriting
                if (this.value != null && this.value[ProxyInfo] != null) {
                    this.value[ProxyInfo].disconnect(this.proxy_bind_id)
                    this.proxy_bind_id = 0
                }

                // automatically listen to array element changes to avoid
                // managing separate list Bindings
                // setting `val` to null will remove the binding (see above)
                if (Array.isArray(val)) {
                    val = createProxy(val)
                    this.proxy_bind_id = val[ProxyInfo].connect((k, v) => {
                        // report any change as fully change of the array
                        // checking for length changes is not sufficient,
                        // since individual elements may have been replaced
                        this.valueChanged(val)
                    })
                }

                // finally set the value as the current value and emit the change
                this.value = val
                this.valueChanged(val)
            }
        }

        Object.defineProperty(obj, field, {
            get: this.getter,
            set: this.setter,
        })

        obj[field] = val
    }
    valueChanged(v){
        Object.values(this.targets).forEach(t => t(v))
        return this
    }
    connect(onChange) {
        const id = (this.bind_id += 1)
        if (onChange) this.targets[id] = onChange
        return id
    }
    disconnect(id){
        delete this.targets[id]
    }
}

/**
 * bindTpl parses a template string an returns all found fields and
 * a template value getter to obtain the current template value,
 * based on the bound `data` and `self` objects.
 *
 * @param {string} s      - template string with variable expressions
 * @param {object} data   - data used by the expression
 * @param {string} self   - source of the template
 *
 * The `value` getter returns the completed string.
 * The fields are the variable names found in the template.
 */
function bindTpl(s, data=null, self=null) {
    // debug(`expr.bindTpl data=${typ(data)}`)
    let { expr, fields } = parseLiteral(s)
    return { get value() {
        // debug(`expr.bindTpl.value data=${typ(data)}, data.data=${str(data.data)}`)
        return expr.exec(data, self)
    }, fields }
}

/**
 * bindExpr parses an expression string an returns all found fields and
 * a value getter to obtain the current value defined by the expression by
 * evaluating the bound `data` and `self` objects.
 *
 * @param {string} s      - expression syntax
 * @param {object} data   - data used by the expression
 * @param {string} self   - source of expression
 *
 * The `value` getter returns the computed value of the expression.
 * The fields are the variable names found in the expression syntax.
 */
function bindExpr(s, data=null, self=null) {
    const { expr, fields } = parseExpr(s)
    return { get value() { return expr.exec(data, self) }, fields }
}

/** @class base class for objects with bindable properties */
var Bindable = class Bindable {
    /**
     * @param {object}          data
     * @param {object|Bindable} parent
     */
    constructor(data={}, parent=null) {
        /** @type {Object<string,Binding>} bindings */
        this.bindings = bindAll(data)
        this.data = data
        data[BindInfo] = this

        /** @type {Object<string,Binding[]>} template_bindings */
        this.template_bindings = {}
        this.property_bindings = {}
        this.next_binding_id = 0

        /** @type {Bindable} */
        this.parent = null
        if (parent instanceof Bindable) this.parent = parent
        else if (parent != null)        this.parent = Bind(parent)
    }

    /** @returns {Binding} */
    getBinding(name, depth=0) {
        // log(`getBinding(${name})`)
        if (depth > 100) throw new Error(`getBinding recursion error, cyclic data models are not supported`)
        if (name.startsWith('$')) return this.parent.getBinding(name.slice(1), depth+1)
        else                      return this.bindings[name]
    }

    getBindingValue(name) {
        return this.getBinding(name).value
    }

    getManagedID(name, id) { return `${name}:${id}` }

    toString() { return `${typ(this)}(data=${typ(this.data)}, parent=${typeof this.parent}}` }

    /**
     * @callback valueSetter
     * @param {*} value - the changed value
    */
    /**
     * @param {string} name
     * @param {valueSetter} onChange
     * @returns {{id:number, setter:valueSetter}}
    */
    bindProperty(name, onChange, onPropChange=null) {
        let b = this.getBinding(name)
        if (!b) throw new Error(debug(`missing binding "${name}" in ${this}`))

        const id = b.connect(onChange, onPropChange)
        const binding_id = this.getManagedID(name, id)
        this.property_bindings[binding_id] = {name, id}
        return {id, setter:b.setter}
    }

    bindExpr(syntax, onChange, self=null) {
        const expr = bindExpr(syntax, this.data, self)
        let id = this.bindFields(expr.fields, () => onChange(expr.value))
        onChange(expr.value)  // update expr once to init GUI states
        return {id, expr}
    }

    bindTemplate(tpl, onChange, self=null) {
        const expr = bindTpl(tpl, this.data, self)
        let id = this.bindFields(expr.fields, () => onChange(expr.value))
        onChange(expr.value)  // update template once to avoid weird values
        return {id, expr}
    }

    // binds multiple fields to one change handler
    bindFields(fields, onFieldChange) {
        // no need to bind static text
        if (len(fields) == 0) return null

        // ensure we keep track of all bindings
        const bindings = []
        const binding_id = (this.next_binding_id += 1)
        this.template_bindings[binding_id] = bindings

        for (const name in fields) {
            let { id } = this.bindProperty(name, (v) => onFieldChange(name, v))
            bindings.push({name, id})
        }
        return binding_id
    }

    unbindProperty(name, id) {
        let b = this.getBinding(name)
        if (b) {
            b.disconnect(id)
            const binding_id = this.getManagedID(name, id)
            delete this.property_bindings[binding_id]
        }
    }

    unbindTemplate(id) {
        let bindings = this.template_bindings[id]
        if (bindings) for (const {name,id} of bindings) {
            this.unbindProperty(name, id)
        }
        delete this.template_bindings[id]
    }

    unbindExpr(id) { this.unbindTemplate(id) }

    unbindAll() {
        for (const id in this.template_bindings)                        this.unbindTemplate(id)
        for (const {name, id} of Object.values(this.property_bindings)) this.unbindProperty(name, id)
    }
}

/**
 * bindAll creates a Binding for all properties of `data` making them bindable
 * using the returned `bindings`; also marks the `data` with Symbol `HasBindings`
 *
 * @param {object} data
 * @returns {Object<string,Binding>}
 */
function bindAll(data) {
    debug(`bindAll(${typ(data)})`)
    let msg = getUnbindableReason(data)
    if (msg) throw new Error(`bindAll(${typ(data)}) failed: ${msg}`)

    let bindings = {}
    for (const k in data) {
        bindings[k] = new Binding(data, k)
    }
    data[HasBindings] = true
    return bindings
}

/** return an objects Bindable and setup new Bindable if needed
 * @returns {Bindable}
*/
function Bind(data, parent=null) {
    if (data[BindInfo] == null) new Bindable(data, parent)
    assert.NotNull(data[BindInfo], `failed to setup BindInfo`)
    return data[BindInfo]
}

module.exports = { Bind, Binding, Bindable, bindAll, bindExpr, bindTpl, BindInfo }


/***/ }),

/***/ 405:
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const binding = __webpack_require__(329)

var Controller = class Controller {
    constructor({window={}, data={}, callbacks={}, dialogs={}, showView=null}) {
        this.data      = new binding.Bindable(data)
        this.window    = window
        this.callbacks = callbacks
        this.dialogs   = dialogs
        if (showView != null) this.showView = showView
    }
    showView(name) {
        throw new Error(`Controller.showView not set`)
    }
    callBack(name, ...args) {
        if(name in this.callbacks) {
            let res = this.callbacks[name](...args)
            if (res instanceof Promise) {
                res.catch((e) => logError(e))
                return
            }
            return res            
        }
        logError(new Error(`callback '${name}' not found`))
    }
    openDialog(name)  {        
        if(name in this.dialogs) {
            return this.dialogs[name].run(this.window)
        }
        logError(new Error(`dialog '${name}' not found`))
    }
    /** @param {Object<string,Gtk.MessageDialog>} dialogs */
    addDialogs(dialogs) {
        dialogs.forEach(d => this.dialogs[d.name] = d)
    }    
}

if (!this.module) this.module = {}
module.exports = { Controller }

/***/ }),

/***/ 294:
/***/ (function(module) {

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
        case Gtk.ResponseType.APPLY:
        case Gtk.ResponseType.YES:
        case Gtk.ResponseType.OK:     return RESPONSE_TYPE.OK
        case Gtk.ResponseType.CANCEL: 
        case Gtk.ResponseType.NO:     
        case Gtk.ResponseType.CLOSE:  return RESPONSE_TYPE.NOT_OK
        case Gtk.ResponseType.HELP:   return RESPONSE_TYPE.HELP
        default:                      return RESPONSE_TYPE.OTHER
    }    
}

if (!this.module) this.module = {}
module.exports = { RESPONSE_TYPE, gtkToNoguiResponseCode }


/***/ }),

/***/ 988:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const logging = __webpack_require__(347)
const { log, debug } = new logging.Logger('tokens')

const TOKEN = {
    SPACE:  'SPACE',
    VAR:    'VAR',
    PROP:   'PROP',
    LIT:    'LIT',
    ADDSUB: 'ADDSUB',
    COMP:   'COMP',
    MULDIV: 'MULDIV',
    UNA:    'UNA',
    LPAR:   'LPAR',
    RPAR:   'RPAR',
    TERN:   'TERN',
    COLON:  'COLON',
    CONCAT: 'CONCAT',
    EXPR:   'EXPR',
}

const LEXPR = {
    SPACE:  /^\s+/,
    VAR:    /^\$+[a-zA-Z0-9_]*|^[a-zA-Z_][a-zA-Z0-9_]*/,
    PROP:   /^@[a-zA-Z0-9_]*/,
    LIT:    /^'[^']*'|^"[^"]*"|^[1-9][0-9]*\.?[0-9]*(e[0-9]+)?/,
    ADDSUB: /^[+\-]/,    
    COMP:   /^==|\!=|[><]=?|&&|\|\|/,
    MULDIV: /^[*/%]/,
    UNA:    /^\!/,
    LPAR:   /^\(/,
    RPAR:   /^\)/,
    TERN:   /^\?/,
    COLON:  /^\:/,
    CONCAT: /^\.\./,
}

const LEXLIT = {
    EXPR: /\{\{([^\}]*)\}\}/,
    VAR:  /^\$+[a-zA-Z0-9_]*/,
    LIT:  /^[^\$]+/,    
}

/**
 * A token presents a single unit of syntax that can be interpreted by the parser.
 *  @class
 */
 class Token {
    /**     
     * @param {string} name 
     * @param {string} src
     */
    constructor(name, src) {
        this.name = name
        this.src = src
    }
    get T() { return this.name }
    toString() {
        if (this.name == TOKEN.SPACE) return ''
        else                          return `${this.name}('${this.src}')`
    }
}

function findClosing(L, R, tokens=[]) {
    let l = 0
    let r = 0
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].name == L) l++
        if (tokens[i].name == R) r++
        if (l == r) return i
        if (r > l) throw new Error(`invalid nesting for close=${r} > open=${l}`)
    }
}

const MODE = {
    AUTO:   'AUTO',
    STRING: 'STRING',
}

/**
 * @param {string} lit 
 */
function tokenizeLiteral(lit, mode=MODE.AUTO) {
    const is_str = lit.match(/^['"`].*/)
    if (mode == MODE.AUTO) {
        if (!is_str) return [new Token(TOKEN.LIT, lit)]
        lit = lit.slice(1,-1)
    } else {
        // MODE.STRING
        // assume lit is raw string literal
    }

    debug(`tokenizing string literal: ${lit}`)
    let tokens = []

    while (lit.length > 0) {
        let m, name, src
        for (const token_name in LEXLIT) {
            // debug(`checking for token ${token_name} in ${lit}`)
            if (m = lit.match(LEXLIT[token_name])) {
                name = token_name
                src = m[1] != null? m[1] : m[0]
                break
            }
        }
        if (name == null) throw new Error(`unexpected literal token at "${s20(code)}"`)

        // combine strings and vars with "+", TODO: use string templates or cast to string
        if (tokens.length > 0) tokens.push(new Token(TOKEN.CONCAT, '..'))        
        
        if (name == TOKEN.LIT) {
            // wrap partial string as new full string
            tokens.push(new Token(name, `'${src}'`))
        }
        else if (name == TOKEN.EXPR) {
            tokens.push(
                new Token(TOKEN.LPAR, '('),
                ...tokenize(src),
                new Token(TOKEN.RPAR, ')'),
            )
        }
        else {
            tokens.push(new Token(name, src))
        }
        
        lit = lit.slice(m[0].length)
    }

    // convert to string
    if (tokens.length == 1) tokens = [
        new Token(TOKEN.LIT, "''"),
        new Token(TOKEN.CONCAT, '..'),
        ...tokens,
    ]

    if (tokens.length > 1) tokens = [
        new Token(TOKEN.LPAR, '('),
        ...tokens,
        new Token(TOKEN.RPAR, ')'),
    ]

    // debug(`literal tokens`, tokens)

    return tokens
}

function s20(s) { return s.slice(0,20) }

/**
 * @param {string} code
 */
function tokenize(code) {
    const tokens = []
    while (code.length > 0) {
        let m, name
        for (const token_name in LEXPR) {
            if (m = code.match(LEXPR[token_name])) { name = token_name; break }
        }
        if (name == null) throw new Error(`unexpected token at "${s20(code)}"`)

        if (name == TOKEN.LIT) tokens.push(...tokenizeLiteral(m[0]))
        else                   tokens.push(new Token(name, m[0]))

        code = code.slice(m[0].length)
    }
    return tokens
}

module.exports = { TOKEN, LEXPR, Token, tokenize, findClosing, tokenizeLiteral, MODE }

/***/ }),

/***/ 524:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

/**
 * This module implements a basic expression language used by nogui
 * for widgets property bindings and for template bindings.
 * @module expression
 */

const { Logger } = __webpack_require__(347)
const logger = new Logger('expr')
const { log, debug, error } = logger

const { TOKEN, LEXPR } = __webpack_require__(988)

const SymParent = Symbol('Parent')

const VAR    = /^\$*/
const PROP   = /^@/
const NUMBER = /^[1-9][0-9]*\.?[0-9]*(e[0-9]+)?$/
const STRING = /^("[^"]*"|'[^']*')$/

const OP = {
    VAR:    'VAR',
    BIN:    'BIN',
    UNA:    'UNA',
}

const PRECEDENCE = {
    UNA:     100, // una before any
    MULDIV:  90,  // mult before add
    CONCAT:  85,  // concat before add
    ADDSUB:  80,  // add before logic
    COMP:    70,  // logic comparators before grouping
    LPAR:    50,  // 
    RPAR:    50,  // grouping before logic syntax
    TERN:    20,  // logic part1
    COLON:   20,  // logic part2
    VAR:     0,   // variables and
    LIT:     0,   // literals and
    PROP:    0,   // properties have no precedence
}

function getUnaryExec(str) {
    switch (str) {
        case '!': return (_, rhs, data, self=null) => !rhs.exec(data, self)
        case '-': return (_, rhs, data, self=null) => -rhs.exec(data, self)
        case '+': return (_, rhs, data, self=null) => +rhs.exec(data, self)
        case '(': return (_, rhs, data, self=null) =>  rhs.exec(data, self)
    }
    throw new Error(`invalid unary operator ${this} ${this.T}`)
}

function getBinaryExec(str) {
    switch (str) {
        case '==': return (lhs, rhs, data, self=null) => lhs.exec(data, self) == rhs.exec(data, self)
        case '!=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) != rhs.exec(data, self)
        case '&&': return (lhs, rhs, data, self=null) => lhs.exec(data, self) && rhs.exec(data, self)
        case '||': return (lhs, rhs, data, self=null) => lhs.exec(data, self) || rhs.exec(data, self)
        case '>=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) >= rhs.exec(data, self)
        case '<=': return (lhs, rhs, data, self=null) => lhs.exec(data, self) <= rhs.exec(data, self)
        case '>':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  > rhs.exec(data, self)
        case '<':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  < rhs.exec(data, self)
        case '+':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  + rhs.exec(data, self)
        case '-':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  - rhs.exec(data, self)
        case '*':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  * rhs.exec(data, self)
        case '/':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  / rhs.exec(data, self)
        case '%':  return (lhs, rhs, data, self=null) => lhs.exec(data, self)  % rhs.exec(data, self)
        case '..': return (lhs, rhs, data, self=null) => `${lhs.exec(data, self)}${rhs.exec(data, self)}`
        case '?':  return (lhs, rhs, data, self=null) => (
            lhs.exec(data, self) ? rhs.lhs.exec(data, self) : rhs.rhs.exec(data, self)
        )
        case ':':  return (lhs, rhs, data, self=null) => { throw new Error('cannot execute rhs-only of ternary') }
        
    }
    throw new Error(`invalid binary operator ${str}`)   
}

/**
 * Base class for parse expressions
 * @interface
 */
class Expr {
    get T()               { return 'Empty' }
    get Token()           { return '' }
    toString()            { return 'Empty()' }
    exec(data, self=null) { return null }
    get fields()          { return {} }
}

/** @implements {Expr} */
class Operator {
    constructor(typ, text, lhs=null, rhs=null){
        this.typ  = typ
        this.text = text
        this.op   = text
        this.lhs  = lhs
        this.rhs  = rhs
        // "compile" the operator now!
        switch (this.T) {
            case OP.UNA: this.exec_fn = getUnaryExec(this.op);  break
            case OP.BIN: this.exec_fn = getBinaryExec(this.op); break
            default: throw new Error(`invalid operator: ${this.op}`)
        }
    }

    get T() { return this.typ }

    get Token() {
        if (this.op.match(LEXPR.COMP))   return TOKEN.COMP
        if (this.op.match(LEXPR.MULDIV)) return TOKEN.MULDIV
        if (this.op.match(LEXPR.ADDSUB)) return TOKEN.ADDSUB
        if (this.op.match(LEXPR.UNA))    return TOKEN.UNA
        if (this.op.match(LEXPR.LPAR))   return TOKEN.LPAR
        if (this.op.match(LEXPR.RPAR))   return TOKEN.RPAR
        if (this.op.match(LEXPR.TERN))   return TOKEN.TERN
        if (this.op.match(LEXPR.COLON))  return TOKEN.COLON
        if (this.op.match(LEXPR.CONCAT)) return TOKEN.CONCAT
    }

    get Precedence() { return PRECEDENCE[this.Token] }

    toString() {
        let res = []
        if (this.lhs) res.push(`(${this.lhs})`)
        let op = this.op
        if (this.T == OP.UNA) op += `¹`
        if (this.T == OP.BIN) op += `²`
        res.push(op)
        if (this.rhs) res.push(`(${this.rhs})`)
        if (this.Token == TOKEN.LPAR) res.push(')')
        return res.join(' ')
    }
    exec(data, self=null) { return this.exec_fn(this.lhs, this.rhs, data, self) }
    get fields() {
        let res
        if (this.lhs) res = this.lhs.fields
        if (this.rhs) res = { ...res, ...this.rhs.fields }
        return res
    }
}

/** @implements {Expr} */
class Literal {
    constructor(text) {
        this.text = text
        if      (text.match(NUMBER)) this.value = Number(text)
        else if (text.match(STRING)) this.value = text.slice(1,-1)
        else throw new Error(`unexpected Literal value ${text}`)        
    }
    get T()          { return OP.VAR }
    get Token()      { return TOKEN.LIT }
    get Precedence() { return 0 }
    toString()  { return `${this.value}` }
    exec(data, self=null)  {
        // log(`Literal.exec -> "${this.value}"`)
        return this.value
    }
    get fields() { return null }
}

/** @implements {Expr} */
class Variable {
    constructor(text, matcher=VAR) {
        let m = text.match(matcher)[0]
        this.text = text
        this.prop = m.length == 0? text : text.slice(1)  // remove first "$" if needed
        this.name = text.slice(m.length)
        this.depth = m.length
        this.noname = (m.length == text.length)
        // TODO: precompile depth traversal
    }

    get T()     { return OP.VAR }
    get Token() { return TOKEN.VAR }
    get Precedence() { return 0 }
    toString() { return this.text }
    getValue(obj) {
        // A) allow parent access via SymParent
        if (SymParent in obj) {
            if      (this.depth == 2) obj = obj[SymParent]
            else if (this.depth  > 2) for (let i = this.depth; i >= 2; i--) obj = obj[SymParent]
            if (this.noname) return obj
            return obj[this.name]
        }
        // B) access parent simply by full var name with "$" suffix
        return obj[this.prop]
    }
    exec(data, self=null) { return this.getValue(data) }
    get fields() {
        let res = {}
        res[this.prop] = true
        return res
    }
}

class Property extends Variable {
    constructor(text) { super(text, PROP) }
    exec(data, self) { return this.getValue(self) }
    get fields() { return null }
}

module.exports = {
    OP, PRECEDENCE,
    Operator, Literal, Variable, Property, Expr,
    SymParent, logger
}

/***/ }),

/***/ 755:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { OP, PRECEDENCE,
        Expr, Operator, Variable, Property, Literal,
        SymParent, logger } = __webpack_require__(524)
const { TOKEN, Token, findClosing, tokenize, tokenizeLiteral, MODE } = __webpack_require__(988)
const { log, debug, error } = logger

/**
 * @param   {Token} t 
 * @param   {Expr} lhs 
 * @param   {Expr} rhs 
 * @returns {Expr}
 */
function precedenceCombine(t, lhs, rhs) {
    if (!lhs) throw new Error(`missing LHS for ${t}`)
    // debug('PRECEDENCE:', t.name, rhs.Token, PRECEDENCE[t.name], rhs.Precedence)
    if (rhs.lhs && rhs.Precedence < PRECEDENCE[t.name]) {
        rhs.lhs = new Operator(OP.BIN, t.src, lhs, rhs.lhs) // steal LHS from lower-precedence RHS
        return rhs                                          // return wrapping RHS as resulting OP
    }
    return new Operator(OP.BIN, t.src, lhs, rhs)
}

/**
 * @param {Expr} lhs
 * @param {Token[]} tokens
 * @returns {Expr}
*/
function parse(lhs, tokens=[]) {
    if (tokens.length == 0) return lhs

    const t = tokens[0]
    if (t.name != TOKEN.SPACE) {
        debug(`PARSE ${t.name}, t=${t}, tokens=${tokens}`)
    }

    switch (t.name) {
        // Spaces and Parenthesis
        case TOKEN.SPACE:
            return parse(lhs, tokens.slice(1))
        case TOKEN.LPAR:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            let i = findClosing(TOKEN.LPAR, TOKEN.RPAR, tokens)
            let expr = parse(null, tokens.slice(1,i))      // parse what is inside ()
            lhs = new Operator(OP.UNA, t.src, null, expr)  // wrap it in an UNA
            return parse(lhs, tokens.slice(i+1))           // parse remainder
        case TOKEN.RPAR:
            throw new Error(`unexpected ${t}`)

        // Variables and Literals
        case TOKEN.VAR:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Variable(t.src), tokens.slice(1))
        case TOKEN.PROP:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Property(t.src), tokens.slice(1))
        case TOKEN.LIT:
            if (lhs) throw new Error(`unexpected LHS before ${t}`)
            return parse(new Literal(t.src), tokens.slice(1))

        // Binary Operators
        case TOKEN.TERN:   // fallthrough
        case TOKEN.COLON:  // fallthrough
        case TOKEN.COMP:   // fallthrough
        case TOKEN.CONCAT: // fallthrough
        case TOKEN.MULDIV:
            return precedenceCombine(t, lhs, parse(null, tokens.slice(1)))

        // Mixed Unary/Binary Operators
        case TOKEN.ADDSUB:            
            if (lhs) {
                return precedenceCombine(t, lhs, parse(null, tokens.slice(1)))
            }
            // fallthrough to UNA
        case TOKEN.UNA:
            rhs = parse(null, tokens.slice(1))
            if (rhs.T == OP.BIN) {
                // embed higher-precedence UNA
                rhs.lhs = new Operator(OP.UNA, t.src, null, rhs.lhs)
                return rhs
            }
            return new Operator(OP.UNA, t.src, null, rhs)            
    }
    throw new Error(`unexpected token "${t}"`)
}

function parseExpr(syntax) {
    let tokens = tokenize(syntax)    
    let expr = parse(null, tokens)
    return { tokens, expr, fields:expr.fields }
}

function parseLiteral(syntax) {
    let tokens = tokenizeLiteral(syntax, MODE.STRING)
    let expr = parse(null, tokens)
    return { tokens, expr, fields:expr.fields }
}

module.exports = { parseExpr, parseLiteral, SymParent, logger }

/***/ }),

/***/ 347:
/***/ (function(module) {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

var ELLIPS = {
    LEN: 60,
    STR: '…',
}

/** returns the main class name or type of the object */
function typeString(obj) {
    return (obj && obj.constructor)? obj.constructor.name : typeof obj
}

/** returns the class or type and an ellipsed value of the object */
function objectString(obj) {
    let s = ''
    try       { s = JSON.stringify(obj) }
    catch (e) { s = `${obj}` }
    if (s === undefined) s = 'undefined'
    try {
        if (s.length > ELLIPS.LEN) s = `${s.slice(0, ELLIPS.LEN - 1)}${ELLIPS.STR}`
        s = `${typeString(obj)}(${s})`
    } catch (e) {
        error(e)
        throw e
    }
    return s
}

/** returns the main class names or types of the objects */
const typeStrings = (...o) => o.map(typeString).join(', ')
var typ = typeStrings

/** returns the classes or types and ellipsed values of the objects */
const objectStrings = (...o) => o.map(objectString).join(', ')
var str = objectStrings

/** returns `length` of object of number of keys */
var len = (o) => o.length != null? o.length : Object.keys(o).length

/** defaultLogMessage show a log message `msg`
 *  prepends optional `labels` in []-brackets and
 *  appends a string representation of optional `objects`
 */
function defaultLogMessage(msg, labels=[], objects=[]) {
    let res = []
    if (labels  && labels.length  > 0) res.push(`[${labels.join('][')}]`)
    res.push(msg)
    if (objects && objects.length > 0) res.push(` ${objects.join(', ')}`)
    return res.join(' ')
}

const ERROR = 0
const INFO  = 1
const DEBUG = 2

const LEVEL = {
    ERROR: ERROR,
    INFO:  INFO,
    DEBUG: DEBUG,
}

const self = this

// setup default loggers for different systems
// TODO: better system detection
let _window = {}, _console = {}
try { _window  = window  } catch (e) {}  // system is GJS
try { _console = console } catch (e) {}  // system is Node.js
try { _print   = print   } catch (e) {}  // other system with "print" as fallback

var Logger = class Logger {
    /**
     * @param {string} name     - prefix added to the log message
     * @param {Object} global   - global `this` where you would access `log` implicitly, default value is `window`
     */
    constructor(name, parent=null) {
        const info  = parent && parent.log   || _console.log   || _window.log       || _print
        const debug = parent && parent.debug || _console.log   || _window.log       || _print
        const error = parent && parent.error || _console.error || _window.logError  || _print
        this.name = name
        this.labels = this.name? [name] : []
        this.connected = []
        this.level = INFO

        // public functions bound to `this` logger so they can be called without `this`
        /** switches between INFO and DEBUG level based on boolean value `v`
         * @param {boolean} v  - true sets DEBUG level, false sets INFO level
         * */
        this.setVerbose = (v=true) => this.level = v? DEBUG : INFO
        this.setSilent  = (v=true) => this.level = v? ERROR : INFO
        this.reset      = ()       => this.level = INFO
        this.setLevel   = (level)  => this.level = level

        // formatters for inspecting types and objects
        this.str = str
        this.typ = typ
        this.len = len
        // setup default formatter
        this.fmt = defaultLogMessage

        // log functions (callable without `this`)
        this.log   = (msg, ...objs) => { if (this.l >= INFO)  info(this.fmt(msg,  ['info',  ...this.labels], objs)) }
        this.error = (msg, ...objs) => { if (this.l >= ERROR) error(this.fmt(msg, ['error', ...this.labels], objs)) }
        this.debug = (msg, ...objs) => { if (this.l >= DEBUG) debug(this.fmt(msg, ['debug', ...this.labels], objs)) }
    }

    get level()  { return this._level }
    set level(l) {
        this._level = l
        this.connected.forEach(fn => fn(l))
    }

    /** connect a level change handler to propagate runtime level changes */
    connect(onLevelChange) {
        this.connected.push(onLevelChange)
        onLevelChange(this.level)
    }

    // shortcut for less code in log logic above
    get l() { return this.level }

    // ATTENTION: Do not add any class methods here since log methods are often used without valid `this`.
}

/** @type {Object<string,Logger>} */
const loggers = {}
function getLogger(name) {
    if (!(name in loggers)) {
        loggers[name] = new Logger(name)
    }
    return loggers[name]
}

function applyAll(fn) { for (const name in loggers) fn(loggers[name]) }

/** set verbose state of all loggers */
function setVerbose(v=true) { applyAll(l => l.setVerbose(v)) }

/** set silent state of all loggers */
function setSilent(v=true)  { applyAll(l => l.setSilent(v)) }

/** set log level of all loggers */
function setLevel(l)        { applyAll(l => l.setLevel(l)) }

var logger = new Logger('')
var {log, debug, error} = logger

if (!this.module) this.module = {}
module.exports = {
    Logger, logger, setVerbose, setSilent, setLevel, getLogger,
    typ, str, len, log, debug, error,
    LEVEL, ELLIPS
}


/***/ }),

/***/ 877:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

// nogui transforms a non-graphical UI spec to a widget tree
// see `assets/ui.js` to learn what features are supported.

const { Gtk, Gdk, Gio } = imports.gi

// setup polyfills based on Gtk version
const poly = __webpack_require__(260).getPoly()

// use webpack `require` for all (local) imports
const md2pango   = __webpack_require__(396)
const json5      = __webpack_require__(111)
const binding    = __webpack_require__(329)
const expr       = __webpack_require__(755)
const logging    = __webpack_require__(347)
const styling    = __webpack_require__(296)
const system     = __webpack_require__(529)
const dialog     = __webpack_require__(294)
const controller = __webpack_require__(405)

const { toPath, toPathArray, fileExt, readFile } = system
const { gtkToNoguiResponseCode, RESPONSE_TYPE } = dialog
const { Controller } = controller
const { Bindable }   = binding

// styling shortcuts and functions
const { CENTER, FILL, Options, add, css } = styling
const { V, H } = Options

// setup logging
const logger = logging.getLogger('nogui')
const { log, debug } = logger
logger.connect(l => poly.log_level = l)

// formatters for external content
const defaultFormatters = {
    md: { format: (s) => md2pango.convert(s) }
}

const items = (o) => Object.keys(o).map((k) => [k, o[k]])
const str = logging.str

function loadDialogFile(file, formatter=null) {
    let text = readFile(file)
    if (formatter != null) text = formatter.format(text)
    return text
}

function ensureBindable(data, ...labels) {
    if (data instanceof binding.Bindable) {
        // debug(`ensureBindable[${labels.join(', ')}](${str(data)})`)
    } else {
        throw new Error(`[${labels.join(', ')}]data model is broken , expected Bindable, got ${str(data)}`)
    }
    return data
}

function isLiteral(o) {
    const T = typeof o
    if (T == 'string')  return true
    if (T == 'number')  return true
    if (T == 'boolean') return true
    return false
}

/** Spec defines a user interface */
var Spec = class Spec {
    static from_path(p) {
        // return new Spec(eval(readFile(p)))
        let str = readFile(p)
        if (p.endsWith('.js')) str = str.replace(/^module\.exports = \{$/m, '{')
        return new Spec(json5.parse(str))
    }
    /** @param {Object} spec - defines the UI as plain JS object */
    constructor({icons={}, dialogs={}, views={}, parts={}, main="main", path="."}={}) {
        this.icons   = icons
        this.dialogs = dialogs
        this.views   = views
        this.parts   = parts
        this.main    = main
        this.path    = path
    }
}

var Builder = class Builder {
    /**
        Builder allows building a widget tree from a nogui spec.

        @param {Controller}  controller  - controller for the UI
        @param {Bindable}    data        - bindable data model
        @param {Spec|string} spec        - the nogui Spec or path to the spec file
        @param {string}      path        - path prefix used for all referenced gui resources (icons, docs, etc.)
        @param {Object}      formatters  - named formatters that will be used to format text and documents
    */
    constructor(spec, controller, data, path='.', formatters=defaultFormatters) {
        this.controller = controller
        this.data = ensureBindable(data, 'builder')
        this.spec = (typeof spec == 'string')? Spec.from_path(spec) : new Spec(spec)
        this.path = path
        this.formatters = formatters
        this.icons = null
        this.dialogs = null
        this.views = null
        this.done = false
    }

    build() {
        if (this.done) throw new Error('cannot build Widget tree more than once')
        log(`building widgets from ${str(this.spec)} with asset path ${this.path}`)
        this.buildIcons()
        this.buildDialogs()
        this.buildViews()
        if (this.controller != null) {
            this.controller.addDialogs(this.dialogs)
        }
        this.done = true
        return this
    }

    buildIcons() {
        const {spec, path} = this
        // allow finding icons by name
        poly.addIconPath(path)

        this.icons = items(spec.icons).map(([k,spec]) => {
            const str = JSON.stringify(spec)
            let img
            let opt
            if (spec.name) {
                opt = { icon_name: spec.name, use_fallback: true }
                img = new Gtk.Image(opt)
            }
            else if (spec.file) {
                let icon_path = toPath(path, ...toPathArray(spec.file))
                debug(`load icon: ${str} from ${icon_path}`)
                const gicon = Gio.FileIcon.new(Gio.File.new_for_path(icon_path))
                opt = {gicon: gicon, use_fallback: true}
                img = new Gtk.Image(opt)
            }
            if (img == null) {
                opt = { icon_name: "image-missing", use_fallback: true}
                img = Gtk.Image(opt)
                logError(new Error(`failed to load icon ${k}: ${str}`), 'using placeholder')
            } else {
                debug(`loaded icon ${k}: ${str}`)
            }
            return {name:k, img, opt, spec}
        })
    }

    buildDialogs() {
        const {spec, path, formatters, controller} = this
        // const flags = Gtk.DIALOG_DESTROY_WITH_PARENT | GTK_DIALOG_MODAL;
        this.dialogs = items(spec.dialogs).map(([k,spec]) => {
            const str = JSON.stringify(spec)
            let fmt = (spec.fmt && formatters && formatters[spec.fmt])
            if (spec.file && formatters && fmt == null) {
                fmt = formatters[fileExt(spec.file)] || null
            }
            let icon = this.findIcon(spec.icon)
            let buttons = [Gtk.ButtonsType.OK]
            let title = spec.info
            if (spec.ask) {
                title = spec.ask
                buttons = [Gtk.ButtonsType.OK_CANCEL]
            }
            const createDialog = (window) => {
                const w = new Gtk.Window()
                let text = null
                if (spec.file) {
                    let file = toPath(path, ...toPathArray(spec.file))
                    text = loadDialogFile(file, fmt)
                }
                const dialog = new Gtk.MessageDialog({
                    title, text, buttons,
                    use_markup: true,
                    modal: false,
                    transient_for: window,
                    message_type: Gtk.MessageType.OTHER,
                })
                // make dialog movable by adding a title bar
                const hdr = new Gtk.HeaderBar({ decoration_layout: 'icon:close' })
                if (icon) hdr.pack_start(new Gtk.Image(icon.opt))
                dialog.set_titlebar(hdr)
                log(`loaded dialog ${k}: ${str}`)
                return dialog
            }
            let ctlFunc = null
            if (spec.call) {
                ctlFunc = (...args) => controller.callBack(spec.call, ...args)
            }
            let run = (window, cb=ctlFunc) => {
                const handleResponse = (id) => {
                    const code = gtkToNoguiResponseCode(id)
                    debug(`got dialog response gtk_code=${id} nogui_code=${code}`)
                    if (cb) return cb(id, code)
                }
                poly.runDialog(createDialog(window), handleResponse)
            }
            log(`setup dialog ${k}: ${str}`)
            return { spec, name:k, run:run }
        })
    }

    buildTableRow(row, data=this.data) {
        ensureBindable(data,'table','row')
        let rbox = css(new Gtk.Box(H), 'box {padding: 0px; margin: 0px;}')
        let icon = this.findIcon(row.icon)
        if (icon) add(rbox, new Gtk.Image(icon.opt), 'image {margin-right: 10px;}')
        this.buildWidget(row, rbox, data)
        return rbox
    }

    buildTable(table, data=this.data) {
        ensureBindable(data,'table')
        // TODO: use Grid
        log(`building table: ${str(table)}`)
        let tbox = css(new Gtk.Box(V), 'box {padding: 5px;}')
        for (const i in table.table) {
            const row = table.table[i]
            debug(`buildTable.row: ${str(row)}`)
            if (row.repeat) {
                log(`building repeater: ${str(row)}`)

                /** @type {binding.Bindable[]} */
                let added = []
                let widgets = []
                let destroyed = false

                let onDestroy = (w) => {
                    // count to zero when widgets are destroyed
                    debug(`onDestroy: widgets=${widgets.length}`)
                    addItems()
                }

                let addItems = () => {
                    // if all previous widgets are destroyed, lets add new ones
                    if (widgets.length > 0 || added.length == 0 || destroyed) return
                    debug(`addItems: len=${added.length}`)
                    for (const b of added) {
                        let w = add(tbox, this.buildTableRow(row, b))
                        w.connect('destroy', onDestroy)
                        widgets.push(w)
                    }
                    added = []
                }

                let listChanged = (list) => {
                    debug(`listChanged: len=${list.length}, destroyed=${destroyed}, widgets=${widgets.length}`)
                    if (destroyed) return
                    while (widgets.length > 0) try {
                        debug(`remove widget #${widgets.length}`)
                        let w = widgets.shift()
                        poly.remove(w, tbox)
                    } catch (e) {
                        debug(`stopping listChanged on error: ${e}`)
                        logError(e)
                        return
                    }
                    added = list.map(o => binding.Bind(o, data))
                    addItems()
                }

                const { id } = data.bindExpr(row.repeat, listChanged)
                tbox.connect('destroy', () => {
                    debug(`tbox.destroy`)
                    destroyed = true
                    data.unbindExpr(id)
                })
                continue
            }
            add(tbox, this.buildTableRow(row, data))
        }
        return tbox
    }

    // returns a Separator or templated Label based on the given template `text`
    buildText({text, data=this.data, self=null}) {
        ensureBindable(data,'text')
        if (text.match(/^(---+|===+|###+|___+)$/)) {
            return new Gtk.Separator(H)
        }
        if (text == '|') {
            return new Gtk.Separator(V)
        }

        let l = css(new Gtk.Label({label:text}), 'label {margin-left: 5px; margin-right:5px;}')
        let id = data.bindTemplate(text, (v) => {
            // debug(`text updated ${text}: ${v}, self=${str(self)}`)
            // debug(`text updated data=${str(data.data)}`)
            l.set_label(v)
        }, self)
        if (id != null) {
            l.connect('destroy', (l) => {
                // debug(`unbinding ${text} ${id}`)
                data.unbindTemplate(id)
            })
        }
        return l
    }

    /**
     * @param {Object}        options        - lane options
     * @param {Object}        options.icon   - lane icon
     * @param {string|Object} options.text   - lane text
     * @param {string|Object} options.style  - lane text style
     * @param {boolean}       options.center - center lane
     * @param {boolean}       options.fill   - fill lane (H-expand text)
     * @param {Bindable}      options.data   - data model for lane
     * @param {Object}        options.self   - source of the lane (spec object)
     */
    buildLane({icon=null, text=null, style=null, center=false, fill=false, data=this.data, self=null}) {
        ensureBindable(data,'lane')
        let lane = new Gtk.Box(H)
        let icon_style = ''
        if (text) icon_style = 'image {margin-right: 10px;}'
        if (icon) {
            if (icon instanceof Gtk.Image) {
                add(lane, icon, icon_style)
            } else {
                add(lane, new Gtk.Image(icon.opt), icon_style)
            }
        }
        if (text) {
            style = style? `label ${style}` : null
            let l = null
            if (text instanceof Gtk.Label) l = text
            if (isLiteral(text))           l = this.buildText({text, data})
            if (l == null) throw new Error(`unsupported text value: ${str(text)}`)
            add(lane, l, style)
            if (fill) l.set_hexpand(true)
        }
        if (center) lane.set_halign(CENTER)
        return lane
    }

    buildAction({ text=null, tooltip=null, icon=null, call=null, dialog=null, view=null, margin=2,
                  data=this.data, self=null }) {
        ensureBindable(data,'action')
        const ctl = this.controller
        let l = css(this.buildLane({text, icon, center:true, data, self}), `box {margin: ${margin}px;}`)
        let b = css(new Gtk.Button({child:l, tooltip_text: tooltip}), `button {margin: 5px;}`)
        if (call)   b.connect('clicked', () => ctl.callBack(call))
        if (dialog) b.connect('clicked', () => ctl.openDialog(dialog))
        if (view)   b.connect('clicked', () => ctl.showView(view))
        return b
    }

    buildVis({vis, widget, data=this.data, self=null}){
        ensureBindable(data,'vis')

        let destroyed = false
        const onChange = (v) => {
            if (destroyed) { log(`destroyed!`); return }
            debug(`visUpdate data=${str(data.data)}`)
            debug(`visUpdate destroyed=${destroyed}`)
            if (v) poly.show(widget)
            else   poly.hide(widget)
        }

        const { id, expr } = data.bindExpr(vis, onChange, self)

        let destroy = (w) => {
            destroyed = true
            data.unbindExpr(id)
            debug(`visUnbind fields=${str(expr.fields)}`)
        }
        widget.connect('destroy', destroy)

        debug(`visBind fields=${expr.fields}`)
        onChange(expr.value)
    }

    buildViews() {
        this.views = items(this.spec.views).map(([k, spec]) => {
            let box = new Gtk.Box(V)
            for (const row of spec) {
                this.buildWidget(row, box)
            }
            return { name:k, widget:box }
        })
    }

    buildWidget(row, box, data=this.data) {
        ensureBindable(data,'widget')
        const ctl = this.controller

        if (typeof row == 'string') {
            add(box, this.buildText({text:row, data}))
            return
        }

        if (row instanceof Array) {
            let lane = add(box, new Gtk.Box(H), 'box {padding: 0px; margin:0px;}')
            for (const col of row) {
                this.buildWidget(col, lane, data)
            }
            return
        }

        if (row.use && row.use in this.spec.parts) {
            this.buildWidget(this.spec.parts[row.use], box, data)
            return
        }

        let icon = this.findIcon(row.icon)
        // items of repeated fields
        let images = []
        let labels = []
        let binds = []
        let toggleImage = null

        let icons = row.icons? row.icons : row.control? row.control.map(o => o.icon) : []

        if (icons && icons.length > 1) {
            for (const icon of icons) {
                let ico = this.findIcon(icon)
                images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
            }
        } else if (row.states && row.states.length > 0) {
            for (const state of row.states) {
                let ico = this.findIcon(state.icon)
                if (ico) images.push(css(new Gtk.Image(ico.opt), 'image {margin-right: 10px;}'))
                if (state.label) labels.push(state.label)
                if (state.bind)  binds.push(state.bind)
            }
        }

        if (images.length > 1) {
            toggleImage = (state) => {
                poly.toggle(images[1], state)
                poly.toggle(images[0], !state)
            }
        }

        let w = null
        let fill = row.center || row.fill || row.title? true: false

        if (row.title) {
            let style = '{margin: 5px; font-weight:bold;}'
            w = add(box, this.buildLane({text:row.title, style, fill, data, self:row}))
        }
        else if (row.text) {
            let style = '{margin: 5px;}'
            w = add(box, this.buildLane({text:row.text, style, fill, data, self:row}))
        }
        else if (row.row) {
            for (const col of row.row) this.buildWidget(col, box, data)
        }
        else if (row.hfill && typeof row.hfill == 'number') {
            let margin = 15 * row.hfill
            let style = `label {margin-left: ${margin}px; margin-right: ${margin}px;}`
            w = add(box, new Gtk.Label({label: ''}, style))
        }
        else if (row.vfill && typeof row.vfill == 'number') {
            let margin = 15 * row.vfill
            let style = `label {margin-top: ${margin}px; margin-bottom: ${margin}px;}`
            w = add(box, new Gtk.Label({label: ''}, style))
        }
        else if (row.notify) {
            for (const i in binds) {
                print(`adding bind ${binds[i]}, img:${images[i]}`)
                const icon = images[i]
                const text = `$${binds[i]}`
                const style = '{margin: 5px;}'
                const l = add(box, this.buildLane({ text, icon, data, style, center:true, self:row }))
                const onChange = (v) => poly.toggle(l, v)
                data.bindProperty(binds[i], onChange)
                poly.show(icon)
                onChange(data.getBindingValue(binds[i]))
            }
        }
        else if (row.table) {
            w = add(box, this.buildTable(row, data))
        }
        else if (row.act != null || row.action != null) {
            const {call, dialog, view} = row
            const text = row.label || row.action
            w = add(box, this.buildAction({
                text, icon, call, dialog, view, data,
                tooltip: row.act,
                padding: 5,
            }))
        }
        else if (row.actions) {
            let bar = w = add(box, new Gtk.Box(H), 'box {padding: 5px;}')
            bar.set_halign(CENTER)
            for (const c of row.actions) {
                this.buildWidget(c, bar, data)
            }
        }
        else if (row.toggle) {
            // build complex button content
            let l = w = css(this.buildLane({icon, center:true, data, self:row}), 'box {padding: 5px;}')
            if (images && images.length > 1) {
                add(l, images[0])
                add(l, images[1])
                if(toggleImage) toggleImage(false)
            }
            let label = add(l, new Gtk.Label())
            let b = add(box, new Gtk.ToggleButton({child:l}), 'button {margin: 5px;}')

            // setup label logic
            let is_off  = `${row.toggle} is OFF`
            let is_on = `${row.toggle} is ON`
            if (labels.length > 1){
                is_off = labels[0]
                is_on = labels[1]
            }

            // connect bindings and either a callback or a binding setter
            if (row.call) b.connect('clicked', () => ctl.callBack(row.call))
            if (row.view) b.connect('clicked', () => ctl.showView(row.view))
            if (row.bind) {
                let onChange = (value) => {
                    b.set_active(value? true: false)
                    label.set_label(value? is_on : is_off)
                    if(toggleImage) toggleImage(value)
                }
                let {id, setter} = data.bindProperty(row.bind, onChange)
                if (!row.call) {
                    b.connect('toggled', (b) => setter(b.get_active()))
                }
                b.connect('destroy', (b) => data.unbindProperty(row.bind, id))
                onChange(data.getBindingValue(row.bind))
            }
        }
        else if (row.switch) {
            let box_style = 'box {padding: 5px; padding-left: 10px; padding-right: 10px;}'
            let l = w = add(box, this.buildLane({icon, data, self:row}), box_style)
            if (images && images.length > 1) {
                add(l, images[0])
                add(l, images[1])
            }
            let label_style = 'label {margin-left: 10px;}'
            let label = add(l, this.buildText({text:row.switch, data, self:row}), label_style)
            label.set_hexpand(true)
            label.set_halign(Gtk.Align.START)

            let sw  = add(l, new Gtk.Switch())
            sw.set_halign(Gtk.Align.END)

            // connect bindings and either a callback or a binding setter
            if (row.call) sw.connect('state-set', () => ctl.callBack(row.call))
            if (row.bind) {
                let onChange = (value) => {
                    // label.set_label()
                    sw.set_state(value? true : false)
                    if(toggleImage) toggleImage(value)
                }
                let {id, setter} = data.bindProperty(row.bind, onChange)
                if (!row.call) {
                    sw.connect('state-set', (sw, state) => setter(state))
                }
                sw.connect('destroy', (sw) => data.unbindProperty(row.bind, id))
                onChange(data.getBindingValue(row.bind))
            }
        }

        if (w && row.vis) {
            this.buildVis({vis:row.vis, widget:w, data, self:row})
        }
    }

    findIcon(name)   {
        if (name == null) return null
        return this.icons.find(item => item.name == name)
    }
    findDialog(name) {
        if (name == null) return null
        return this.dialogs.find(item => item.name == name)
    }
    findView(name)   {
        if (name == null) return null
        return this.views.find(item => item.name == name)
    }
}

module.exports = {
    Spec, Builder, Controller, RESPONSE_TYPE,
    poly,
    logging,
    expr,
    binding,
    styling,
}


/***/ }),

/***/ 260:
/***/ (function(module) {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { GLib } = imports.gi

const PACK_START_ARGS = [
    true,  // expand
    false, // fill
    1,     // padding
]

var timeouts = {
    /** calls `func` after a `delay_ms` timeout and log potential errors */
    setTimeout(func, delay_ms=0, ...args) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay_ms, () => {
            try       { func(...args) }
            catch (e) { logError(e) }
            return GLib.SOURCE_REMOVE
        })
    },

    /** wrapper to `GLib.source_remove`
     * for removing a GLib `source` that was set with `setTimeout`.
     * @param {object} source
    */
    clearTimeout(source) { return GLib.source_remove(source) },

    /** returns a new `Promise` to be resolved or rejected with the result or error
     *  produced by calling `func` after a `delay_ms` timeout
     */
    asyncTimeout(func, delay_ms=0, ...args) {
        return new Promise((resolve, reject) => {
            return timeouts.setTimeout(() => {
                try       { resolve(func(...args)) }
                catch (e) { reject(e) }
            }, delay_ms)
        })
    }
}

if (this.setTimeout)   timeouts.setTimeout   = setTimeout    // use native setTimeout if available
if (this.clearTimeout) timeouts.clearTimeout = clearTimeout  // use native clearTimeout if available

// used for flagging Widgets as inaccessible to avoid deallocation errors
var LOCKED = Symbol('LOCKED')

var LEVEL = {
    ERROR: 0,
    INFO:  1,
    DEBUG: 2,
}

var USE_GTK = null

/** setup and return a polyfill object to handle different GTk versions */
function getPoly(gtk_version=null) {
    if (USE_GTK == null) {
        USE_GTK = useGtk(gtk_version)
    }

    const { Gtk, Gdk } = imports.gi
    const poly = {
    USE_GTK,
    LEVEL,
    log_level: LEVEL.ERROR,
    log:   (msg) => { if (poly.log_level >= LEVEL.INFO)  log(msg) },
    error: (err) => { if (poly.log_level >= LEVEL.ERROR) logError(err) },
    debug: (msg) => { if (poly.log_level >= LEVEL.DEBUG) log(msg) },
    isGtk3: () => Gtk.MAJOR_VERSION < 4,
    get GtkVersion() { return Gtk.MAJOR_VERSION },
    append: (container, o) => {
        // TODO: check if we need smart type switch to call correct "append" on specific widget types
        if (container.append)      return container.append(o)
        if (container.add)         return container.add(o)
        if (container.pack_start)  return container.pack_start(o, ...PACK_START_ARGS)
        if (container.set_child)   return container.set_child(o)
        throw new Error(`append(widget) not implemented for ${container}`)
    },
    remove: (w, parent=null, depth=0) => {
        if (depth > 100) throw new Error(`too many recursive removals`)
        if (w.foreach) {
            let i = 0
            w.foreach((c) => {
                poly.debug(`LOCKING child #${i++} of ${w}`)
                c[LOCKED] = true
                poly.remove(c, w, depth+1)
            })
        }
        if (w.get_child) {
            poly.debug(`LOCKING single child of ${w}`)
            let c = w.get_child()
            c[LOCKED] = true
            poly.remove(c, w, depth+1)
        }
        if (parent && parent.remove) {
            poly.debug(`remove child ${w} from parent ${parent}`)
            return parent.remove(w)
        }
    },
    show:   (w) => { if (!w[LOCKED]) w.show() },
    hide:   (w) => { if (!w[LOCKED]) w.hide() },
    toggle: (w, state) => state? poly.show(w) : poly.hide(w),
    runDialog: (dia, cb=null, close=true) => {
        poly.show(dia)
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
        const len = theme.get_search_path().length
        if (theme.add_search_path)    theme.add_search_path(path)
        if (theme.append_search_path) theme.append_search_path(path)
        return theme.get_search_path().length - len
    },
    ...timeouts,
}; return poly }

function useGtk(version=null) {
    version = version || imports.gi.GLib.getenv('USE_GTK')
    if (version == null) return
    log(`using GTK/Gdk/GdkX11 ${version}`)
    if (typeof version == 'number') version = `${version}.0`
    try {
        imports.gi.versions.Gtk = version
        imports.gi.versions.GdkX11 = version
        imports.gi.versions.Gdk = version
    } catch (e) {
        logError(e)
    }
    return version
}

function gtk3() { return getPoly(3) }
function gtk4() { return getPoly(4) }

if (!this.module) this.module = {}
module.exports = { getPoly, useGtk, gtk3, gtk4, timeouts, LOCKED }


/***/ }),

/***/ 296:
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

// SPDX-FileCopyrightText: 2021 Uwe Jugel
//
// SPDX-License-Identifier: MIT

const { Gtk } = imports.gi

const poly = __webpack_require__(260).getPoly()

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


/***/ }),

/***/ 529:
/***/ (function(module) {

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

/***/ }),

/***/ 939:
/***/ (() => {

/* (ignored) */

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = __webpack_module_cache__;
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// module cache are used so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	var __webpack_exports__ = __webpack_require__(__webpack_require__.s = 672);
/******/ 	var __webpack_export_target__ = this;
/******/ 	for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;