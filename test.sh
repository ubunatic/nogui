#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o errtrace

fail() { echo -e "[FAIL] $*"; exit 1; }
ok()   { echo -e "[OK] $*\n";         }

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

if test $# -eq 0
then targets=all
else targets="$*"
fi

echo "running tests: $targets"
for t in $targets; do "test_$t"; done
