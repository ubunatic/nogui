# NoGui Demo Project

This example project uses NoGui + webpack to create a small GTK app
that can be started as standalone GTK/GJS application.
The project also shows how to run the same code as Gnome Extension.

**Note:** This project requires **GTK 4.0**

## Project Structure

- **[src](./src)** contains all source code.\
    [src/myaudio.js]() is the main library. \
    [src/app.js]() loads the lib and runs it in a Gtk.Application.\
    [src/extension.js]() loads the lib and runs it as a Gnome Extension.\

- **[lib](./lib)** contains copied sources or webpack-generated code\
  Use the contained files to run the actual app and extension.

- **[share](./share)** contains assets loaded at runtime,\
  such as icons and UI spec.

- **[bin](./bin)** contains: system binaries to start the app.\
  These will be installed in your prefix to provide cli commands.

## Usage

Run `bin/nogui-audio-player` to start the app. This will run `gjs` with
the webpacked `app.js`.

Run `gjsext lib/extension.js --nogui`
to test the extension. (requires [gjsext](https://github.com/ubunatic/gjsext))
