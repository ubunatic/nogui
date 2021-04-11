.PHONY: test copy webpack build

test: build	
	bin/nogui-audio-player -h
	bin/nogui-audio-player -q -f a -f b
	gjsext lib/extension.js --nogui

build: copy webpack

copy:    ; cp src/extension.js src/*.json lib/
webpack: ; ../../node_modules/.bin/webpack
