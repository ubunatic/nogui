// define your UI in one file
module.exports = {
  icons: {
    card: { name: 'audio-card' },
    play: { name: 'media-playback-start' },
    stop: { name: 'media-playback-stop' },
    exit: { name: 'application-exit-symbolic' },
    info: { name: "dialog-information-symbolic" },
    gears: { name: "settings-gears-symbolic" },
    back:  { name: "go-previous-symbolic" },
    vol_max: { name: 'audio-volume-high-symbolic' },
    vol_min: { name: 'audio-volume-muted-symbolic' },    
  },
  dialogs: {
    about: { info: 'About Audio Player',  file: 'about.md',  icon: 'info' },
    close: { ask:  'Close Audio Player?', call: 'respClose', icon: 'exit' },
  },
  views: {
    main: [
      { title: 'My Audio App', icon: 'card' },
      { action: 'Play Audio', call: 'playAudio',  icon: 'play' },
      { action: 'Stop Audio', call: 'stopAudio',  icon: 'stop' },
      { switch: 'Mute Audio', bind: 'muted', icons: ['vol_max', 'vol_min'] },
      { action: 'About',    dialog: 'about',  icon: 'info' },
      { action: 'Settings', view: 'settings', icon: 'gears' },
      { action: 'Close',    dialog: 'close',  icon: 'exit' },
    ],
    settings: [
      { title: 'Settings', icon: 'gears' },
      { switch: 'Mute Audio', bind: 'muted', icons: ['vol_max', 'vol_min'] },
      { action: 'Back', view: 'main',  icon: 'back' },
    ]
  },
  main: 'main',
}
