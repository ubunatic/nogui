#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o errtrace

fail() { echo -e "[FAIL] $*"; exit 1; }
ok()   { echo -e "[OK] $*\n";         }

# finds the first Markdown JS code section
find_code() {
    awk -v sec=$1 '/^```/ { code++; next } code == sec'
}

test_nogui() {    
    echo "TODO: add test" ||
    fail "err msg"
    ok   "ok msg"
}

test_lint() {
    reuse lint ||
    fail "reuse test failed, please check (.reuse/dep5)"
    ok   "reuse spec is OK"
}

test_all() {
    test_nogui
    test_lint    
}

run_test() {
    if test $# -eq 0
    then tests=all
    else tests="$*"
    fi
    for t in $tests; do "test_$t"; done
}

run_reuse() {
    reuse addheader -y 2021 src/*.js -l MIT -c 'Uwe Jugel'
}

run_generate() {
    cat README.md | find_code 1 > demos/assets/player.js
    cat README.md | find_code 3 > demos/gtk4-player.js
}

nodemon=node_modules/.bin/nodemon
webpack=node_modules/.bin/webpack

run_demo()    { (cd demos; gjs ../dist/bin/nogui_demo.js) }
run_build()   { run_generate; $webpack; run_build_demo; }
run_develop() { $nodemon --exec "$0 nodemon_build"; }

run_build_demo() {
    (echo '#!/usr/bin/env gjs'
     cat dist/bin/nogui_demo.js) > dist/bin/nogui-demo
}

run_nodemon_build(){
    run_build    || fail 'build failed'
    run_demo     || fail 'demo app crashed'
}

run_install()   { sudo npm install   -g .; }
run_uninstall() { sudo npm uninstall -g .; }

if test $# -eq 0
then cmd=run_test
else cmd=run_"$1"; shift
fi

"$cmd" "$*"
