/* eslint-env node, mocha */
(function(root) {
    "use strict";

    //
    // Run in either Mocha, Karma or Browser environments
    //
    if (typeof root === "undefined") {
        root = {};
    }

    var ResourceTimingDecompression = root.ResourceTimingDecompression ?
        root.ResourceTimingDecompression :
        require("../src/resourcetiming-decompression");

    var expect = root.expect ? root.expect : require("expect.js");

    //
    // ResourceTimingDecompression
    //
    describe("ResourceTimingDecompression", function() {
        //
        // .decodeCompressedResourceTimeStamp
        //
        describe(".decodeCompressedResourceTimeStamp()", function() {
            it("should return 0 if the array is empty", function() {
                expect(ResourceTimingDecompression.decodeCompressedResourceTimeStamp([], 0, 100)).to.be(0);
            });

            it("should return 0 if the timestamp is 0", function() {
                expect(ResourceTimingDecompression.decodeCompressedResourceTimeStamp([0], 0, 100)).to.be(0);
            });

            it("should return 0 if the timestamp is beyond the array length", function() {
                expect(ResourceTimingDecompression.decodeCompressedResourceTimeStamp([100], 1, 100)).to.be(0);
            });

            it("should give the timestamp with a single entry", function() {
                expect(ResourceTimingDecompression.decodeCompressedResourceTimeStamp([100], 0, 100)).to.be(200);
            });

            it("should give the timestamp with multiple entries", function() {
                expect(ResourceTimingDecompression.decodeCompressedResourceTimeStamp([100, 200, 300], 2, 100))
                    .to.be(400);
            });
        });

        //
        // .getInitiatorTypeFromIndex
        //
        describe(".getInitiatorTypeFromIndex()", function() {
            it("should return other on a bad type", function() {
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(-1)).to.be("other");
            });

            it("should return properly for all of the known types", function() {
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(0)).to.be("other");
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(1)).to.be("img");
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(2)).to.be("link");
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(3)).to.be("script");
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(4)).to.be("css");
                expect(ResourceTimingDecompression.getInitiatorTypeFromIndex(5)).to.be("xmlhttprequest");
            });
        });

        //
        // .decompressResources
        //
        describe(".decompressResources()", function() {
            var compressedTimestamps = "31,7,6,5,5,4,3,3,2,1,0";

            function getTimestampsFor(url) {
                return {
                    name: url,
                    initiatorType: "script",
                    startTime: 1,
                    redirectStart: 1,
                    redirectEnd: 2,
                    fetchStart: 2,
                    domainLookupStart: 3,
                    domainLookupEnd: 4,
                    connectStart: 4,
                    secureConnectionStart: 5,
                    connectEnd: 6,
                    requestStart: 6,
                    responseStart: 7,
                    responseEnd: 8,
                    duration: 7
                };
            }

            it("should return an empty array if given an empty trie", function() {
                expect(ResourceTimingDecompression.decompressResources({})).to.eql([]);
            });

            it("should process a single-node trie", function() {
                var data = {
                    "abc": compressedTimestamps
                };
                var expected = [getTimestampsFor("abc")];

                expect(ResourceTimingDecompression.decompressResources(data)).to.eql(expected);
            });

            it("should process a complex trie", function() {
                var data = {
                    "abc": compressedTimestamps,
                    "xyz": compressedTimestamps
                };
                var expected = [getTimestampsFor("abc"), getTimestampsFor("xyz")];

                expect(ResourceTimingDecompression.decompressResources(data)).to.eql(expected);
            });

            it("should process a complex trie", function() {
                var data = {
                    "ab":
                    {
                        "|": compressedTimestamps,
                        "c": {
                            "|": compressedTimestamps,
                            "d": compressedTimestamps
                        }
                    }
                };
                var expected = [getTimestampsFor("ab"), getTimestampsFor("abc"), getTimestampsFor("abcd")];

                expect(ResourceTimingDecompression.decompressResources(data)).to.eql(expected);
            });
        });
    });
}(typeof window !== "undefined" ? window : undefined));
