.PHONY: build develop test demo reuse generate install uninstall help
help:
	# targets:
	#
	#    build    - build the main module with webpack
	#    develop  - start nodemon and build continuously
	#    test     - run all tests
	#    demo     - start the nogui demo
	#    reuse    - add SPDX License headers to main source files
	#    generate - generate code from Markdown comments

build develop test demo reuse generate install uninstall: ; ./make.sh $@
