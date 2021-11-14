
/** @typedef {{ name:string }} icon */

/** @typedef {{ text:string, title:string }} text */

/**
 * spec
 * @typedef {{
 *    icons: Object<string,icon>,
 *    dialogs: object,
 *    parts: Object<string,text|icon>,
 *    views: object,
 * }} spec
*/

class Icon {
    /** @param {icon} icon */
    constructor(icon) {
        /** @type {string} */
        this.name = icon.name
    }
}

class Text {
    /** @param {text} text */
    constructor(text) {
        if (text.title) {
            /** @type {string} */
            this.text = text.text
            this.title = text.title
        } else {
            /** @type {string} */
            this.text = text.text
        }
    }
}

class Spec {
    /** @param {spec} spec */
    constructor(spec) {
        /** @type {Object<string,Icon>} */
        this.icons = {}
        this.dialogs = {}
        /** @type {Object<string,Icon|Text>} */
        this.parts = {}
        this.views = {}

        if (!spec) return

        for (const name in spec.icons) this.icons[name] = new Icon(spec.icons[name])
        for (const name in spec.parts) this.parts[name] = new Text(spec.parts[name])
    }
}

if (!this.module) this.module = {}
module.exports = { Spec, Icon, Text }
