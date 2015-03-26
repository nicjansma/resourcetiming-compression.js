/* eslint-env node, mocha */
(function(root) {
    "use strict";

    //
    // Run in either Mocha, Karma or Browser environments
    //
    if (typeof root === "undefined") {
        root = {};
    }

    var ResourceTimingCompression = root.ResourceTimingCompression ?
        root.ResourceTimingCompression :
        require("../src/resourcetiming-compression");

    var expect = root.expect ? root.expect : require("expect.js");

    //
    // ResourceTimingCompression
    //
    describe("ResourceTimingCompression", function() {
        //
        // .toBase36
        //
        describe(".toBase36()", function() {
            it("should return the base 36 equivalent of 100", function() {
                expect(ResourceTimingCompression.toBase36(100)).to.be("2s");
            });

            it("should return an empty string if the input is not a number", function() {
                expect(ResourceTimingCompression.toBase36()).to.be("");
                expect(ResourceTimingCompression.toBase36("")).to.be("");
                expect(ResourceTimingCompression.toBase36("a")).to.be("");
            });
        });

        //
        // .trimTiming
        //
        describe(".trimTiming()", function() {
            it("should handle 0", function() {
                expect(ResourceTimingCompression.trimTiming(0)).to.be(0);
            });

            it("should handle undefined", function() {
                expect(ResourceTimingCompression.trimTiming()).to.be(0);
            });

            it("should handle non-numbers", function() {
                expect(ResourceTimingCompression.trimTiming("a")).to.be(0);
            });

            it("should round to the nearest number", function() {
                expect(ResourceTimingCompression.trimTiming(0, 0)).to.be(0);
                expect(ResourceTimingCompression.trimTiming(100, 0)).to.be(100);
                expect(ResourceTimingCompression.trimTiming(100.5, 0)).to.be(101);
                expect(ResourceTimingCompression.trimTiming(100.01, 0)).to.be(100);
                expect(ResourceTimingCompression.trimTiming(100.99, 0)).to.be(101);
            });

            it("should round when given a navtiming offset", function() {
                expect(ResourceTimingCompression.trimTiming(100)).to.be(100);
                expect(ResourceTimingCompression.trimTiming(100, 1)).to.be(99);
                expect(ResourceTimingCompression.trimTiming(100.12, 1.12)).to.be(99);
                expect(ResourceTimingCompression.trimTiming(100, 100)).to.be(0);
                expect(ResourceTimingCompression.trimTiming(100, 101)).to.be(-1);
            });
        });

        //
        // .convertToTrie
        //
        describe(".convertToTrie()", function() {
            it("should convert a single node", function() {
                var data = {"abc": "abc"};
                var expected = {
                    "a": {
                        "b": {
                            "c": "abc"
                        }
                    }
                };
                expect(ResourceTimingCompression.convertToTrie(data)).to.eql(expected);
            });

            it("should convert a two-node tree whose nodes don't intersect", function() {
                var data = {"abc": "abc", "xyz": "xyz"};
                var expected = {
                    "a": {
                        "b": {
                            "c": "abc"
                        }
                    },
                    "x": {
                        "y": {
                            "z": "xyz"
                        }
                    }
                };
                expect(ResourceTimingCompression.convertToTrie(data)).to.eql(expected);
            });

            it("should convert a complex tree", function() {
                var data = {"abc": "abc", "abcd": "abcd", "ab": "ab"};
                var expected = {
                    "a": {
                        "b": {
                            "|": "ab",
                            "c": {
                                "|": "abc",
                                "d": "abcd"
                            }
                        }
                    }
                };
                expect(ResourceTimingCompression.convertToTrie(data)).to.eql(expected);
            });
        });

        //
        // .optimizeTrie
        //
        describe(".optimizeTrie()", function() {
            it("should optimize a single-node tree", function() {
                var data = {"abc": "abc"};
                var expected = {
                    "abc": "abc"
                };

                var trie = ResourceTimingCompression.convertToTrie(data);

                expect(ResourceTimingCompression.optimizeTrie(trie, true)).to.eql(expected);
            });

            it("should optimize a simple tree", function() {
                var data = {"abc": "abc", "xyz": "xyz"};
                var expected = {
                    "abc": "abc",
                    "xyz": "xyz"
                };

                var trie = ResourceTimingCompression.convertToTrie(data);

                expect(ResourceTimingCompression.optimizeTrie(trie, true)).to.eql(expected);
            });

            it("should optimize a complex tree", function() {
                var data = {"abc": "abc", "abcd": "abcd", "ab": "ab"};
                var expected = {
                    "ab":
                    {
                        "|": "ab",
                        "c": {
                            "|": "abc",
                            "d": "abcd"
                        }
                    }
                };

                var trie = ResourceTimingCompression.convertToTrie(data);

                expect(ResourceTimingCompression.optimizeTrie(trie, true)).to.eql(expected);
            });
        });
    });
}(typeof window !== "undefined" ? window : undefined));
