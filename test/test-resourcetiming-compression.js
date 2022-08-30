/* eslint-env node, mocha */
/* eslint-disable max-len, no-unused-expressions, consistent-return */
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

    var ResourceTimingDecompression = root.ResourceTimingDecompression ?
        root.ResourceTimingDecompression :
        require("../src/resourcetiming-decompression");

    var expect = root.expect ? root.expect : require("expect.js");

    /**
     * Determines if the test environment can get ResourceTiming
     *
     * @returns {boolean} True if the environment supports ResourceTiming
     */
    function canGetResourceTiming() {
        if (typeof window === "undefined") {
            return false;
        }

        if (window.location && window.location.href) {
            if (window.location.href.indexOf("file://") !== -1) {
                return false;
            }
        }

        if (!("performance" in window) || !window.performance) {
            return false;
        }

        if (typeof window.performance.getEntriesByType !== "function") {
            return false;
        }

        if (typeof window.PerformanceResourceTiming === "undefined") {
            return false;
        }

        if (window.performance.getEntriesByType("resource").length === 0) {
            return false;
        }

        return true;
    }

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
                var data = { "abc": "abc" };
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
                var data = { "abc": "abc", "xyz": "xyz" };
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
                var data = { "abc": "abc", "abcd": "abcd", "ab": "ab" };
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
                var data = { "abc": "abc" };
                var expected = {
                    "abc": "abc"
                };

                var trie = ResourceTimingCompression.convertToTrie(data);

                expect(ResourceTimingCompression.optimizeTrie(trie, true)).to.eql(expected);
            });

            it("should optimize a simple tree", function() {
                var data = { "abc": "abc", "xyz": "xyz" };
                var expected = {
                    "abc": "abc",
                    "xyz": "xyz"
                };

                var trie = ResourceTimingCompression.convertToTrie(data);

                expect(ResourceTimingCompression.optimizeTrie(trie, true)).to.eql(expected);
            });

            it("should optimize a complex tree", function() {
                var data = { "abc": "abc", "abcd": "abcd", "ab": "ab" };
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

        //
        // .compressSize
        //
        describe(".compressSize()", function() {
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

        //
        // .reverseString
        //
        describe(".reverseString()", function() {
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

        //
        // .reverseHostname
        //
        describe(".reverseHostname()", function() {
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

        //
        // .accumulateServerTimingEntries
        //
        describe(".accumulateServerTimingEntries()", function() {
            it("Should increment our count collector", function() {
                var serverTimingCollection = {};
                ResourceTimingCompression.accumulateServerTimingEntries(serverTimingCollection, [{ name: "n1", description: "d1" }, { name: "n2", description: "d1" }]);
                ResourceTimingCompression.accumulateServerTimingEntries(serverTimingCollection, [{ name: "n2", description: "d1" }, { name: "n2", description: "d2" }]);

                expect(serverTimingCollection).to.eql({
                    n1: {
                        count: 1,
                        counts: {
                            d1: 1
                        }
                    },
                    n2: {
                        count: 3,
                        counts: {
                            d1: 2,
                            d2: 1
                        }
                    }
                });
            });
        });

        //
        // .compressServerTiming
        //
        describe(".compressServerTiming()", function() {
            it("Should create a lookup from our count collector", function() {
                expect(ResourceTimingCompression.compressServerTiming({
                    m0: {
                        count: 0,
                        counts: {}
                    },
                    m1: {
                        count: 1,
                        counts: {
                            d1: 1
                        }
                    }, m2: {
                        count: 5,
                        counts: {
                            d2a: 3,
                            d2b: 2
                        }
                    }
                })).to.eql([
                    ["m2", "d2a", "d2b"],
                    ["m1", "d1"],
                    ["m0"]
                ]);
            });
            it("Should special case exactly one empty description", function() {
                expect(ResourceTimingCompression.compressServerTiming({
                    m0: {
                        count: 1,
                        counts: {
                            "": 1
                        }
                    }
                })).to.eql([
                    "m0"
                ]);
            });
        });

        //
        // .indexServerTiming
        //
        describe(".indexServerTiming()", function() {
            it("Should index a lookup", function() {
                expect(ResourceTimingCompression.indexServerTiming([
                    ["metric0", "d1"],
                    ["metric1", "d2a", "d2b"]
                ])).to.eql({
                    metric0: {
                        index: 0,
                        descriptions: {
                            d1: 0
                        }
                    },
                    metric1: {
                        index: 1,
                        descriptions: {
                            d2a: 0,
                            d2b: 1
                        }
                    }
                });
            });

            it("Should special case exactly one empty description", function() {
                expect(ResourceTimingCompression.indexServerTiming([
                    "metric0"
                ])).to.eql({
                    metric0: {
                        index: 0,
                        descriptions: {
                            "": 0
                        }
                    }
                });
            });
        });

        //
        // .identifyServerTimingEntry
        //
        describe(".identifyServerTimingEntry()", function() {
            it("Should create identifiers", function() {
                expect(ResourceTimingCompression.identifyServerTimingEntry(0, 0)).to.eql("");
                expect(ResourceTimingCompression.identifyServerTimingEntry(0, 1)).to.eql(":.1");
                expect(ResourceTimingCompression.identifyServerTimingEntry(1, 0)).to.eql(":1");
                expect(ResourceTimingCompression.identifyServerTimingEntry(1, 1)).to.eql(":1.1");
            });
        });

        //
        // .updateScriptFlags
        //
        describe(".updateScriptFlags()", function() {
            it("Should do nothing if the script isn't in the scripts map", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateScriptFlags(
                    {}, {
                        initiatorType: "script",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.scriptAttrs).to.eql(undefined);
            });

            it("Should compress a async script", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateScriptFlags(
                    {
                        "http://foo": {
                            async: true,
                            defer: false,
                            nodeName: "SCRIPT"
                        }
                    }, {
                        initiatorType: "script",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.scriptAttrs).to.eql(0x1);
            });

            it("Should compress a async defer script", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateScriptFlags(
                    {
                        "http://foo": {
                            async: true,
                            defer: true,
                            nodeName: "SCRIPT"
                        }
                    }, {
                        initiatorType: "script",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.scriptAttrs).to.eql(0x1 | 0x2);
            });

            it("Should compress a async defer in the body script", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateScriptFlags(
                    {
                        "http://foo": {
                            async: true,
                            defer: true,
                            nodeName: "SCRIPT",
                            nodeType: 1,
                            parentNode: {
                                nodeName: "BODY"
                            }
                        }
                    }, {
                        initiatorType: "script",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.scriptAttrs).to.eql(0x1 | 0x2 | 0x4);
            });
        });

        //
        // .updateLinkFlags
        //
        describe(".updateLinkFlags()", function() {
            it("Should do nothing if the link isn't in the links map", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateLinkFlags(
                    {}, {
                        initiatorType: "link",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.linkAttrs).to.eql(undefined);
            });

            it("Should compress a prefetch link", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateLinkFlags(
                    {
                        "http://foo": {
                            rel: "prefetch"
                        }
                    }, {
                        initiatorType: "link",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.linkAttrs).to.eql(1);
            });

            it("Should compress a prerender link", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateLinkFlags(
                    {
                        "http://foo": {
                            rel: "prerender"
                        }
                    }, {
                        initiatorType: "link",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.linkAttrs).to.eql(3);
            });

            it("Should compress a preload link", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateLinkFlags(
                    {
                        "http://foo": {
                            rel: "preload"
                        }
                    }, {
                        initiatorType: "link",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.linkAttrs).to.eql(2);
            });

            it("Should compress a stylesheet link", function() {
                var rtEntry = {};

                ResourceTimingCompression.updateLinkFlags(
                    {
                        "http://foo": {
                            rel: "stylesheet"
                        }
                    }, {
                        initiatorType: "link",
                        name: "http://foo"
                    }, rtEntry);

                expect(rtEntry.linkAttrs).to.eql(4);
            });
        });

        //
        // .inArray
        //
        describe(".inArray()", function() {
            it("Should return false on an empty array", function() {
                expect(ResourceTimingCompression.inArray(1)).to.eql(false);
                expect(ResourceTimingCompression.inArray(1, [])).to.eql(false);
            });

            it("Should return false on an empty val", function() {
                expect(ResourceTimingCompression.inArray(undefined, [])).to.eql(false);
            });

            it("Should return true on an matching value", function() {
                expect(ResourceTimingCompression.inArray("a", ["b", "c", "a"])).to.eql(true);
            });

            it("Should return false on an missing value", function() {
                expect(ResourceTimingCompression.inArray("z", ["b", "c", "a"])).to.eql(false);
            });
        });

        //
        // .cleanupURL
        //
        describe(".cleanupURL()", function() {
            it("Should return an empty string when no argument is given", function() {
                expect(ResourceTimingCompression.cleanupURL()).to.eql("");
            });

            it("Should return an empty string when null is passed as argument", function() {
                expect(ResourceTimingCompression.cleanupURL(null)).to.eql("");
            });

            it("Should return an empty string when undefined is passed as argument", function() {
                expect(ResourceTimingCompression.cleanupURL(undefined)).to.eql("");
            });

            it("Should return an empty string when an empty string is passed as argument", function() {
                expect(ResourceTimingCompression.cleanupURL(undefined)).to.eql("");
            });

            it("Should return an empty string when false is passed as argument", function() {
                expect(ResourceTimingCompression.cleanupURL(false)).to.eql("");
            });

            it("Should return an empty string when an array is passed as argument", function() {
                expect(ResourceTimingCompression.cleanupURL(["a", "b"])).to.eql("");
            });

            it("Should not trim a URL underneath the limit", function() {
                expect(ResourceTimingCompression.cleanupURL("http://foo.com", 1000)).to.eql("http://foo.com");
            });

            it("Should trim a URL with a query string over the limit at the query string", function() {
                expect(ResourceTimingCompression.cleanupURL("http://foo.com?aaaaaa", 20)).to.eql("http://foo.com?...");
            });

            it("Should trim a URL with a query string too long over the limit at the limit", function() {
                expect(ResourceTimingCompression.cleanupURL("http://foo.com?aaaaaa", 14)).to.eql("http://foo....");
            });

            it("Should trim a URL without a query string over the limit at the limit", function() {
                expect(ResourceTimingCompression.cleanupURL("http://foo.com/a/b/c/d", 17)).to.eql("http://foo.com...");
            });
        });

        //
        // .compressResourceTiming
        //
        describe(".compressResourceTiming()", function() {
            it("Should compress a simple entry", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "img",
                    startTime: 1,
                    responseEnd: 2
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "11,1"
                    },
                    servertiming: {}
                });
            });

            it("Should add script attributes", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "script",
                    startTime: 1,
                    responseEnd: 2,
                    scriptAttrs: 4
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "31,1*24"
                    },
                    servertiming: {}
                });
            });

            it("Should add link attributes", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "link",
                    startTime: 1,
                    responseEnd: 2,
                    linkAttrs: 2
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "21,1*42"
                    },
                    servertiming: {}
                });
            });

            it("Should compress resourcetiming namespace data.", function() {
                var data = { foo: "bar" };
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "link",
                    startTime: 1,
                    responseEnd: 2,
                    linkAttrs: 2,
                    _data: data
                }], { lookup: {} })).to.eql({
                    servertiming: {},
                    restiming: {
                        "foo": "21,1*42*5foo:bar"
                    }
                });
            });

            it("Should add workerStart offset (same as fetchStart)", function() {
                var startTime = 1,
                    workerStart = 1000,
                    responseEnd = 2000;

                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "img",
                    startTime: startTime,
                    responseEnd: responseEnd,
                    workerStart: workerStart,
                    fetchStart: workerStart
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "11,1jj*6" + (workerStart - startTime).toString(36)
                    },
                    servertiming: {}
                });
            });

            it("Should add workerStart offset (different than fetchStart)", function() {
                var startTime = 1,
                    workerStart = 1000,
                    fetchStart = 1500,
                    responseEnd = 2000;

                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "img",
                    startTime: startTime,
                    responseEnd: responseEnd,
                    workerStart: workerStart,
                    fetchStart: fetchStart
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "11,1jj"
                            + "*6"
                            + (workerStart - startTime).toString(36)
                            + ","
                            + (fetchStart - startTime).toString(36)
                    },
                    servertiming: {}
                });
            });

            it("Should compress http/1.1 nextHopProtocol data", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "link",
                    startTime: 1,
                    responseEnd: 2,
                    nextHopProtocol: "http/1.1"
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "21,1*7h1.1"
                    },
                    servertiming: {}
                });
            });

            it("Should compress h3 nextHopProtocol data", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "link",
                    startTime: 1,
                    responseEnd: 2,
                    nextHopProtocol: "h3"
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "21,1*7h3"
                    },
                    servertiming: {}
                });
            });

            it("Should not have nextHopProtocol data if empty", function() {
                expect(ResourceTimingCompression.compressResourceTiming(null, [{
                    name: "foo",
                    initiatorType: "link",
                    startTime: 1,
                    responseEnd: 2,
                    nextHopProtocol: ""
                }], { lookup: {} })).to.eql({
                    restiming: {
                        "foo": "21,1"
                    },
                    servertiming: {}
                });
            });
        });

        //
        // .getResourceTiming
        //
        describe(".getResourceTiming()", function() {
            it("Should get an object with .restiming and .servertiming from the page", function() {
                if (!canGetResourceTiming()) {
                    return this.skip();
                }

                var results = ResourceTimingCompression.getResourceTiming();

                expect(results).to.have.own.property("restiming");
                expect(results).to.have.own.property("servertiming");
            });

            it("Should contain the scaled PNG image", function() {
                if (!canGetResourceTiming()) {
                    return this.skip();
                }

                var results = ResourceTimingCompression.getResourceTiming();
                var resources = ResourceTimingDecompression.decompressResources(results.restiming, results.servertiming);
                var scaledImage = resources.find(function(r) {
                    return r.name.indexOf("?scaled") !== -1;
                });

                if (!scaledImage) {
                    // Karma won't load the image
                    return this.skip();
                }

                expect(scaledImage).to.not.eql(undefined);
            });

            it("Should contain the scaled PNG image with timings set", function() {
                if (!canGetResourceTiming()) {
                    return this.skip();
                }

                var results = ResourceTimingCompression.getResourceTiming();
                var resources = ResourceTimingDecompression.decompressResources(results.restiming, results.servertiming);
                var scaledImage = resources.find(function(r) {
                    return r.name.indexOf("?scaled") !== -1;
                });

                if (!scaledImage) {
                    // Karma won't load the image
                    return this.skip();
                }

                expect(scaledImage).to.have.own.property("startTime");
                expect(scaledImage.startTime).to.be.above(0);

                expect(scaledImage).to.have.own.property("responseEnd");
                expect(scaledImage.responseEnd).to.be.above(0);
            });

            it("Should contain the scaled PNG image with dimensions set", function() {
                if (!canGetResourceTiming()) {
                    return this.skip();
                }

                var results = ResourceTimingCompression.getResourceTiming();
                var resources = ResourceTimingDecompression.decompressResources(results.restiming, results.servertiming);
                var scaledImage = resources.find(function(r) {
                    return r.name.indexOf("?scaled") !== -1;
                });

                if (!scaledImage) {
                    // Karma won't load the image
                    return this.skip();
                }

                expect(scaledImage.height).to.equal(100);
                expect(scaledImage.width).to.equal(100);
                expect(scaledImage.x).to.be.above(100);
                expect(scaledImage.y).to.be.above(100);
                expect(scaledImage.naturalHeight).to.equal(1000);
                expect(scaledImage.naturalWidth).to.equal(1000);
            });

            it("Should contain the scaled PNG image without dimensions if skipDimensions was set", function() {
                if (!canGetResourceTiming()) {
                    return this.skip();
                }

                var results = ResourceTimingCompression.getResourceTiming(window, undefined, undefined, true);
                var resources = ResourceTimingDecompression.decompressResources(results.restiming, results.servertiming);
                var scaledImage = resources.find(function(r) {
                    return r.name.indexOf("?scaled") !== -1;
                });

                if (!scaledImage) {
                    // Karma won't load the image
                    return this.skip();
                }

                expect(scaledImage.height).to.be.undefined;
                expect(scaledImage.width).to.be.undefined;
                expect(scaledImage.x).to.be.undefined;
                expect(scaledImage.y).to.be.undefined;
                expect(scaledImage.naturalHeight).to.be.undefined;
                expect(scaledImage.naturalWidth).to.be.undefined;
            });
        });

        //
        // .isCacheHit
        //
        describe(".isCacheHit()", function() {
            it("Should return false if transferSize > 0", function() {
                expect(ResourceTimingCompression.isCacheHit({
                    name: "foo",
                    initiatorType: "img",
                    startTime: 1,
                    transferSize: 100,
                    duration: 100
                })).to.be.true;
            });

            it("Should return false if transferSize == 0 and decodedBodySize != 0", function() {
                expect(ResourceTimingCompression.isCacheHit({
                    name: "foo",
                    initiatorType: "img",
                    startTime: 1,
                    transferSize: 0,
                    decodedBodySize: 100,
                    duration: 100
                })).to.be.false;
            });

            it("Should return true if sizes are missing and duration < 30", function() {
                expect(ResourceTimingCompression.isCacheHit({
                    name: "foo",
                    initiatorType: "img",
                    startTime: 1,
                    duration: 10
                })).to.be.true;
            });

            it("Should return false if sizes are missing and duration >= 30", function() {
                expect(ResourceTimingCompression.isCacheHit({
                    name: "foo",
                    initiatorType: "img",
                    startTime: 1,
                    duration: 100
                })).to.be.false;
            });
        });
    });
}(typeof window !== "undefined" ? window : undefined));
