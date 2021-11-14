#!/usr/bin/env bash
#
# This file outsources shell scripts from the Makefile to keep the make targets
# more readable and to have more control over the test scripts, using bash
# functions, custom error handling, and better error and test messages.
#
# All tests are defined as `test_<name>` functions.
# All run and build targets are defined as `run_<name>` functions.
#
# Run them via `./make.sh [test|run] <name1> <name2> ...`.
#

set -o errexit
set -o pipefail
set -o errtrace
set -o functrace

fail() { echo -e "[FAIL] $*\n" 1>&2; exit 1; }
err()  { echo -e "[ERR]  $*\n" 1>&2;         }
ok()   { echo -e "[OK]   $*\n" 1>&2;         }
log()  { echo -e "[INFO] $*\n" 1>&2;         }

# default test suite to run
all="expr bind poly nogui demo lint"

test_bind() {
    node test/binding_test.js &&
    node test/controller_test.js
}

test_poly() {
    test/gjs/poly_test.js --gui 3 &&
    test/gjs/poly_test.js --gui 4
}

test_nogui() {
    test/gjs/nogui_test.js --gui 3 &&
    test/gjs/nogui_test.js --gui 4
}

test_expr() { node test/expression_test.js; }
test_demo() { run_demo -h; }
test_app()  { run_app -h; }
test_lint() { reuse lint || fail "reuse test failed, please check (.reuse/dep5)"; }
test_app()  { make -C $app test || fail "failed testing example app: $app"; }

run_test() {
    local failed_tests="" ok_tests="" num_ok=0 num_failed=0
    if test $# -eq 0 || test "$*" = "all"
    then tests="$all"
    else tests="$*"
    fi
    for t in $tests; do
        if "test_$t"
        then ok  "test $t successful"; (( num_ok     += 1 )); ok_tests="$ok_tests $t"
        else err "test $t failed";     (( num_failed += 1 )); failed_tests="$failed_tests $t"
        fi
    done
    local msg="tests successful ($num_ok):$ok_tests, tests failed ($num_failed):$failed_tests"
    test $num_failed -eq 0 && ok "$msg" || fail "$msg"
}

# finds the Nth Markdown code section
find_code()      { awk -v sec=$1 '/^```/ { code++; next } code == sec';                    }
codegen_header() { echo "// This file is generated from the project's README.md. Do not modify!"; }
run_generate()   { (codegen_header && cat README.md) | find_code 1 > "$demo/src/app.js";  }

nodemon=node_modules/.bin/nodemon
webpack=node_modules/.bin/webpack
demo=examples/simple-app
app=examples/audio-player

run_webpack()       { $webpack; }
run_demo()          { gjs "$demo/dist/simple.app.js" "$@"; }
run_build()         { run_webpack; run_build_app; }
run_develop()       { $nodemon -w ./src -w $app/src -w $app/share --exec "$0 nodemon_build"; }
run_build_app()     { make -C $app build; }
run_install()       { sudo npm install   -g .; }
run_uninstall()     { sudo npm uninstall -g .; }
run_app()           { examples/audio-player/bin/nogui-audio-player; }
run_reuse()         { reuse addheader -y 2021 src/*.js -l MIT -c 'Uwe Jugel'; }
run_bench()         { test_expr; }
run_nodemon_build() {
    log "NODEMON BUILD START"
    run_webpack   || fail 'NODEMON BUILD FAILED: failed to pack'
    run_build_app || fail 'NODEMON BUILD FAILED: build failed'
    run_app       || fail 'NODEMON BUILD FAILED: demo app crashed'
    log "NODEMON BUILD OK"
}

if test $# -eq 0
then cmd=run_test
else cmd=run_"$1"; shift
fi

"$cmd" $*
