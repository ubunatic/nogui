.PHONY: webpack build develop test demo app ext reuse generate install uninstall proto help

all: build

help:
	# targets:
	#
	#   webpack   - pack current nogui sources with webpack
	#   generate  - re-generate demo code from Markdown comments
	#   build     - pack nogui and build demos
	#   develop   - start nodemon and build continuously
	#   test      - run all tests
	#   demo      - start basic nogui demo
	#   app       - start a complex nogui demo app
	#   reuse     - add SPDX License headers to main source files
	#   install   - install locally
	#   uninstall - uninstall local installation
	#
	# see `make.sh` for details

demo app reuse test: build

demo app reuse webpack generate build develop test install uninstall: ; ./make.sh $@


proto: spec/spec_pb.js

%_pb.js: %.proto
	protoc --proto_path=spec --js_out=import_style=commonjs,binary:$(dir $@) $^
