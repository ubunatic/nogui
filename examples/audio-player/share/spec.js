// define your UI in one file
module.exports = {
  icons: {
    card:    { name: 'audio-card-symbolic' },
    play:    { name: 'media-playback-start' },
    stop:    { name: 'media-playback-stop' },
    exit:    { name: 'application-exit-symbolic' },
    info:    { name: "dialog-information-symbolic" },
    warn:    { name: "dialog-warning-symbolic" },
    gears:   { name: "settings-gears-symbolic" },
    back:    { name: "go-previous-symbolic" },
    prev:    { name: "go-previous-symbolic" },
    next:    { name: "go-next-symbolic" },
    vol_max: { name: 'audio-volume-high-symbolic' },
    vol_min: { name: 'audio-volume-muted-symbolic' },
    open:    { name: 'document-open-symbolic' },
    list:    { name: 'document-properties-symbolic' },
    trash:   { name: 'edit-delete-symbolic' },
    "🎵":    { name: 'audio-card-symbolic' }
  },
  dialogs: {
    about: { info: 'About Audio Player',  file: 'about.md',  icon: 'info' },
    clear: { ask:  'Remove all songs\nfrom playlist?', call: 'respClear', icon: 'trash' },
  },
  parts: {
    song: [
      { text: '$playlist_number: $name', vis: '$$song_name != name', icon: '🎵' },
      { text: '$playlist_number: $name', vis: '$$song_name == name', icon: 'play' }
    ],
    status: [
      { text: '{{ playing? "Playing: $song" : "Next Song: $next_song" }}', fill:true },
      { text: '($progress)',  vis: "playing" },
      { act: '', call: 'forceQuit', icon: 'exit' },
    ],
    nav: [
      { act: 'Prev',                              call: 'prevSong', icon: 'prev', when: 'playing'  },
      { act: 'Play',       label: 'Play',         call: 'playSong', icon: 'play',  vis: '!playing' },
      { act: 'Stop',       label: 'Stop',         call: 'stopSong', icon: 'stop',  vis: 'playing'  },
      { act: 'Next',                              call: 'nextSong', icon: 'next', when: 'playing'  },
      { act: 'Open Media',                        call: 'openFile', icon: 'open' },
      { act: 'Playlist',   label: ' $num_songs ', view: 'playlist', icon: 'list',  vis: 'view != @view' },
      { act: 'Main View',                         view: 'main',     icon: 'gears', vis: 'view != @view' },
    ]
  },
  views: {
    main: [
      { title: 'Audio Player', icon: 'audio' },
      { use: 'status' },
      { use: 'nav'},
      '-----------------------------------------------------------',
      { switch: 'Mute Audio',      bind: 'muted', icons: ['vol_max', 'vol_min'] },
      { switch: 'Log Debug Level', bind: 'debug', icons: ['info', 'warn' ] },
      { act: 'About',    dialog: 'about',  icon: 'info' },
    ],
    playlist: [
      { title: 'Playlist', icon: 'gears' },
      { use: 'status' },
      { use: 'nav' },
      '-----------------------------------------------------------',
      { table: [
        { title: 'Songs: $num_songs, Playing: $song, Next: $next_song' },
        { repeat: 'songs', use: 'song' },
      ]},
      { act: 'Clear Playlist', dialog: 'clear', icon: 'trash' },
    ],
  },
  main: 'main',
}
