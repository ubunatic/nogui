#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o errtrace

fail() { echo -e "[FAIL] $*"; exit 1; }
ok()   { echo -e "[OK] $*\n";         }

test_expr() {
    node test/expression_test.js ||
    fail "expressions test failed"
    ok   "expressions tested"
}

test_demo() {
    run_demo -h ||
    fail "failed to run demo"
    ok   "demo tested"
}

test_lint() {
    reuse lint ||
    fail "reuse test failed, please check (.reuse/dep5)"
    ok   "reuse spec is valid"
}

test_example() {    
    make -C $example test ||
    fail "failed testing example: $example"
    ok   "example tested: $example"
}

run_bench() { test_expr; }

run_test() {
    if test $# -eq 0 || test "$*" = "all"
    then tests="expr demo lint"
    else tests="$*"
    fi
    for t in $tests; do "test_$t"; done
    ok "tested $tests"
}

# finds the first Markdown JS code section
find_code()      { awk -v sec=$1 '/^```/ { code++; next } code == sec';                    }
codegen_header() { echo "// This file was generated from ../../README.md. Do not modify!"; } 
run_generate()   { ( codegen_header; cat README.md | find_code 1 ) > "$demo/src/app.js";  }

nodemon=node_modules/.bin/nodemon
webpack=node_modules/.bin/webpack
demo=examples/simple-app
example=examples/audio-player

run_webpack()       { $webpack; }
run_demo()          { gjs "$demo/dist/simple.app.js" "$@"; }
run_build()         { run_webpack; run_build_example; }
run_develop()       { $nodemon -w ./src -w $example/src -w $example/share --exec "$0 nodemon_build"; }
run_build_example() { make -C $example build; }
run_install()       { sudo npm install   -g .; }
run_uninstall()     { sudo npm uninstall -g .; }
run_ext()           { GJSEXT_USE_GTK=4 gjsext examples/audio-player/lib/extension.js; }
run_app()           { GJSEXT_USE_GTK=4 examples/audio-player/bin/nogui-audio-player;  }
run_reuse()         { reuse addheader -y 2021 src/*.js -l MIT -c 'Uwe Jugel';         }

run_nodemon_build(){
    run_webpack       || fail 'faild to pack'
    run_build_example || fail 'build failed'
    run_app           || fail 'demo app crashed'
}

if test $# -eq 0
then cmd=run_test
else cmd=run_"$1"; shift
fi

"$cmd" $*
