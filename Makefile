.PHONY: webpack build develop test demo app ext reuse generate install uninstall help

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
	#   ext       - start a complex nogui demo app as Gnome Extension
	#   reuse     - add SPDX License headers to main source files
	#   install   - install locally
	#   uninstall - uninstall local installation
	#
	# see `make.sh` for details

demo app ext reuse test: build

demo app ext reuse webpack generate build develop test install uninstall: ; ./make.sh $@
