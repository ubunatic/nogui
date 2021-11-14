# How to contribute to nogui?
1. Check the [issues](https://github.com/ubunatic/nogui/issues).
2. Check the [examples](examples) to learn how UIs should be specified.
3. Avoid big dependencies.
4. Ensure it builds with `webpack`.
5. Avoid `imports.ui`!
6. Focus on GTK 4.0 first, but then also use and extend [nogui.poly](src/poly.js)
   to ensure GTK 3/4 compatibility.
8. Ensure *teardown* of anything you *setup* such as bindings, scoped widget
   variables, and anything that may leak memory in an reactive app.
9. Add `/** @type {import('path/to/code.js')} */` annotations to GJS imports for
   better IDE support and see [src/modules.js](src/modules.js) for how to export
   module symbols correctly.

# Some Warnings
1. This project is in very early stages and should still be seen as an experiment.
   Anything can change and you may be stuck with an old version if you don't plan
   some buffer for refactoring.
2. 🤓 Nerd Alert! This project follows some opinionated coding standards that are
   not for the faint of heart of the regular JS hacker.

   The used "standards" include:

   * no semicolons, since modern JS engines and minifiers have super robust
     JS semicolon insertion (I did not have single issue so far!)
   * block-syntax statements where possible (esp. when multiple things need to be
     switched, created, or returned, and are much more readable as a "table")
   * block-syntax end-of-line comments
   * block-syntax JS objects and JSON
   * block-syntax if-else without curlies
   * block-syntax try-catch for single statement try-catch bodies
   * single-statement loop-bodies without curlies
   * switch-case fallthroughs (only with annotation though)
   * avoid repetition where possible, since extracting even small functions
     allows for better "tables" and block-style code in general
   * create own utils to avoid big dependencies and to avoid bending existing
     frameworks to be compatible with webpacked GJS (e.g., nogui provides own
     [binding](src/binding.js), [assert](src/assert.js), [logging](src/logging.js)
     modules)
