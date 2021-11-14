.PHONY: test webpack build

test: build
	bin/nogui-audio-player -h
	bin/nogui-audio-player -q -f a -f b

build: webpack

webpack: ; ../../node_modules/.bin/webpack
