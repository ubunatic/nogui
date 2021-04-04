# About NoGui

NoGui is a **widget-free**, **XML-free**, **boilerplate-free**
notation for specifying user interfaces.

## Example

```js
// define your UI in one file
var spec = {
    icons: {
        card: { name: "audio-card" },
        play: { name: "media-playback-start" },
    },
    main: "main",
    views: {
        main: [
            { title: "My Audio App", icon: "card" },
            { switch: "Play Audio", bind: "playAudio", icon: "play" },
        ]
    }
}
```

## Rendering
Use this spec for rendering your UI. The UI tree should be easy to process
and you can use any technology to draw widgets on any device.