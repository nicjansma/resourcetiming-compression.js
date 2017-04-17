/* eslint-env node, mocha */
/* eslint-disable max-len */
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

            it("should return the input if the input is a string", function() {
                expect(ResourceTimingCompression.toBase36("")).to.be("");
                expect(ResourceTimingCompression.toBase36("a")).to.be("a");
            });

            it("should return an empty string if the input is not a number or string", function() {
                expect(ResourceTimingCompression.toBase36()).to.be("");
                expect(ResourceTimingCompression.toBase36(null)).to.be("");
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

        describe("compressSize()", function() {
            it("Should return an empty string if ResourceTiming2 is not supported", function() {
                expect(ResourceTimingCompression.compressSize({})).to.eql("");
            });

            // X-O: [0, 0, 0] -> [0, 0, 0] -> [empty]
            it("Should return an empty string for cross-origin resources", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 0,
                    encodedBodySize: 0,
                    decodedBodySize: 0
                })).to.eql("");
            });

            // 204: [t, 0, 0] -> [t, 0, 0] -> [e, t-e]
            it("Should return [e, t-e, d-e] -> [0, t, 0] -> ',t,0' -> ',t' for 204 responses", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 10,
                    encodedBodySize: 0,
                    decodedBodySize: 0
                })).to.eql(",a");
            });

            // 304: [t: t <=> e, e, d: d>=e] -> [e, t-e, d-e]
            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,0' -> 'e,dt' for 304 responses (t > e, d = e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a,5");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,-dt,0' -> 'e,-dt' for 304 responses (t < e, d = e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 5,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a,-5");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,0,0' -> 'e' for 304 responses (t = e, d = e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,dd' for 304 responses (t > e, d > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 20,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                })).to.eql("a,a,5");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,-dt,dd' for 304 responses (t < e, d > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 5,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                })).to.eql("a,-5,5");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,0,dd' -> 'e,,dd' for 304 responses (t = e, d > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                })).to.eql("a,,5");
            });

            // 200 non-gzipped: [t: t>=e, e, d: d=e] -> [e, t-e]
            it("Should return [e, t-e, d-e] -> [e, dt, 0] -> 'e,0' -> 'e' for 200 non-gzipped responses (t = e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, 0] -> 'e,dt' for 200 non-gzipped responses (t > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a,5");
            });

            // 200 gzipped: [t: t>=e, e, d: d>=e] -> [e, t-e, d-e]
            it("Should return [e, t-e, d-e] -> [e, dt, 0] -> 'e,0,dd' -> 'e,,dd' for 200 gzipped responses (t = e, d > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                })).to.eql("a,,5");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, 0] -> 'e,dt,dd' for 200 gzipped responses (t > e, d > e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 20
                })).to.eql("a,5,a");
            });

            it("Should return [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,dd' for 200 gzipped responses (t > e, d < e)", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 2000,
                    encodedBodySize: 20,
                    decodedBodySize: 0
                }, true)).to.eql("k,1j0,-k");
            });

            // retrieved from cache non-gzipped: [0, e, d: d=e] -> [e]
            it("Should return [e, t-e, d-e] -> [e, _, dd] -> 'e,_,0' -> 'e,_' for cached non-gzipped responses", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 0,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                })).to.eql("a,_");
            });

            // retrieved from cache gzipped: [0, e, d: d>=e] -> [e, _, d-e]
            it("Should return [e, t-e, d-e] -> [e, _, dd] -> 'e,_,dd' -> 'e,_,dd' for cached gzipped responses", function() {
                expect(ResourceTimingCompression.compressSize({
                    transferSize: 0,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                })).to.eql("a,_,5");
            });
        });

        describe("reverseString()", function() {
            it("Should reverse empty string", function() {
                expect(ResourceTimingCompression.reverseString("")).to.eql("");
            });
            it("Should reverse a single character string", function() {
                expect(ResourceTimingCompression.reverseString("a")).to.eql("a");
            });
            it("Should reverse a string", function() {
                expect(ResourceTimingCompression.reverseString("abc")).to.eql("cba");
            });
        });

        describe("reverseHostname()", function() {
            it("Should reverse the hostname portion of `http://domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("http://domain.com")).to.eql("http://moc.niamod");
            });
            it("Should reverse the hostname portion of `https://domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://domain.com")).to.eql("https://moc.niamod");
            });
            it("Should reverse the hostname portion of `https://www.domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://www.domain.com")).to.eql("https://moc.niamod.www");
            });
            it("Should reverse the hostname portion of `https://cdn.domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://cdn.domain.com")).to.eql("https://moc.niamod.ndc");
            });
            it("Should reverse the hostname portion of `https://cdn.domain.com:8080`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://cdn.domain.com:8080")).to.eql("https://0808:moc.niamod.ndc");
            });
            it("Should reverse the hostname portion of `https://cdn.stuff.domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://cdn.stuff.domain.com")).to.eql("https://moc.niamod.ffuts.ndc");
            });
            it("Should reverse the hostname portion of `https://cdn.domain.com/?foo=bar`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://cdn.domain.com/?foo=bar")).to.eql("https://moc.niamod.ndc/?foo=bar");
            });
            it("Should reverse the hostname portion of `https://cdn.domain.com/#hash_value`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://cdn.domain.com/#hash_value")).to.eql("https://moc.niamod.ndc/#hash_value");
            });
            it("Should reverse the hostname portion of `https://username:password@cdn.domain.com`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://username:password@cdn.domain.com")).to.eql("https://moc.niamod.ndc@drowssap:emanresu");
            });
            it("Should reverse the hostname portion of `http://cdn.domain.com/path/to/image/?foo=bar`", function() {
                expect(ResourceTimingCompression.reverseHostname("http://cdn.domain.com/path/to/image/?foo=bar")).to.eql("http://moc.niamod.ndc/path/to/image/?foo=bar");
            });
            it("Should reverse the hostname portion of `https://username:password@cdn.domain.com:8080/?foo=bar&baz=qux#hash_value`", function() {
                expect(ResourceTimingCompression.reverseHostname("https://username:password@cdn.domain.com:8080/?foo=bar&baz=qux#hash_value")).to.eql("https://0808:moc.niamod.ndc@drowssap:emanresu/?foo=bar&baz=qux#hash_value");
            });
            it("Should only reverse only the first instance of the hostname portion", function() {
                expect(ResourceTimingCompression.reverseHostname("http://domain.com/?foo=domain.com")).to.eql("http://moc.niamod/?foo=domain.com");
            });
        });

    });
}(typeof window !== "undefined" ? window : undefined));
