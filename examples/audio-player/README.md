# NoGui Demo Project

This example project uses NoGui + webpack to create a small GTK app
that can be started as standalone GTK/GJS application.

**Note:** This project requires **GTK 4.0**

## Project Structure

- **[src](./src)** contains all source code.\
    [src/myaudio.js]() is the main library. \
    [src/app.js]() loads the lib and runs it in a Gtk.Application.

- **[lib](./lib)** contains copied sources or webpack-generated code\
  These files are used to run the actual app.

- **[share](./share)** contains assets loaded at runtime,\
  such as icons and UI spec.

- **[bin](./bin)** contains: system binaries to start the app.\
  These will be installed in your prefix to provide cli commands.

## Usage

Run `bin/nogui-audio-player` to start the app. This will run `gjs` with
the webpacked `app.js`.
