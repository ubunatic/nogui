// This is the UI of the app defined using super a light-weight JS object.
// Why not Gnome XML? Because Gnome XML super verbose and eventually becomes unreadable
// once the widget tree gets bigger. Most XML properties are useless to me.
// But a declarative UI is still cool and since JSON requires nasty quoting,
// a JS Object seemed the most natural. Also here I can freely express what my
// UI should "be" like and not how it should "look" like.
// I call this a NOGUI specification. It is all about actions, switches, views,
// dialogs, etc.

// UI defines the UI of the app.
var spec = {
    // all icons used by the app
    icons: {
        oscillator: { file: ["icons", "3d-meter-symbolic.svg"] },
        card:  { name: "audio-card" },
        video: { name: "video-x-generic" },
        power: { name: "battery-full-charged" },
        chart: { name: "utilities-system-monitor" },
    },
    // define the main view
    main: "menu",
    // all dialogs used by the app
    dialogs: {
        about: { title: "About Intel GPU Indicator", file: ["about.md"], ok: true, fmt: "md" },
        root:  { title: "Setting up `root` access",  file: ["root.md"],  ok: true, fmt: "md" },
        // TODO: allow setting plan Markdown dialogs using
        // name: "filename.md"
        // and detect everything else automatically
    },
    views: {
        // the main menu with all shortcuts for the indicator
        menu: [
            { title: "Intel GPU Indicator", icon: "card" },        
            { switch: "Video Acceleration", bind:   "showVideo",  icon: "video" },
            { switch: "3D Rendering",       bind:   "showRender", icon: "card" },
            { switch: "Power Usage",        bind:   "showPower",  icon: "power" },
            { action: "Stop Process",       call:   "stopGPUTop" },
            { action: "Setup `root`access", dialog: "root" },
            { action: "Settings",           view:   "settings" },
            { action: "About",              dialog: "about" },
        ],
        // the more elaborate settings dialog
        settings: [
            { title: "Intel GPU Indicator Settings", icon: "card" },
            { switch: "Show Video Acceleration Load",  bind: "showVideo" },
            { switch: "Show 3D Rendering Load",        bind: "showRender" },
            { switch: "Show Power Consumption",        bind: "showPower" },
            { switch: "Run `intel_gpu_top` as `root`", bind: "useRoot" },
            { action: "How to setup `root` access",    dialog: "root" },
            { action: "<-- Back",                      view:   "menu" },
        ],
    }
}

if (!this.module) module = {}
module.exports = { spec }
