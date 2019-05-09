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

    var ResourceTimingDecompression = root.ResourceTimingDecompression ?
        root.ResourceTimingDecompression :
        require("../src/resourcetiming-decompression");

    var expect = root.expect ? root.expect : require("expect.js");

    //
    // ResourceTimingDecompression
    //
    describe("ResourceTimingDecompression", function() {
        //
        // .decodeCompressedResource()
        //
        describe(".decodeCompressedResource()", function() {
            it("should process more than one special datas", function() {
                var entry = ResourceTimingDecompression.decodeCompressedResource(
                    "68y,95,7x,5s,5r,,3y,3y,1*1a,a,b*27*3100,:1*41",
                    "http://moc.oof",
                    ["edge", ["cdn-cache", "HIT", "MISS"], "origin"]);

                expect(entry.name).to.be("http://foo.com");
                expect(entry.encodedBodySize).to.be(10);
                expect(entry.transferSize).to.be(20);
                expect(entry.decodedBodySize).to.be(21);
                expect(entry.serverTiming).to.eql([
                    {
                        name: "edge",
                        description: "",
                        duration: 100
                    },
                    {
                        name: "cdn-cache",
                        description: "HIT",
                        duration: 0
                    }
                ]);
                expect(entry.scriptAsync).to.be(true);
                expect(entry.scriptDefer).to.be(true);
                expect(entry.scriptBody).to.be(true);
                expect(entry.rel).to.be("prefetch");
            });
        });

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

            it("should decompress the initiatorType for indexes over 9", function() {
                var data = {
                    "abc": "j1,7,6,5,5,4,3,3,2,1,0"
                };

                // swap in a different initiatorType
                var res = getTimestampsFor("abc");
                res.initiatorType = "eventsource";
                var expected = [res];

                expect(ResourceTimingDecompression.decompressResources(data)).to.eql(expected);
            });
        });

        //
        // .decompressSize
        //
        describe(".decompressSize()", function() {
            // X-O: [0, 0, 0] -> [0, 0, 0] -> [empty]
            it("Should reverse cross-origin resources", function() {
                expect({
                    transferSize: 0,
                    encodedBodySize: 0,
                    decodedBodySize: 0
                }).to.eql(ResourceTimingDecompression.decompressSize(""));
            });

            // 204: [t, 0, 0] -> [t, 0, 0] -> [e, t-e]
            it("Should reverse [e, t-e, d-e] -> [0, t, 0] -> ',t,0' -> ',t' for 204 responses", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 0,
                    decodedBodySize: 0
                }).to.eql(ResourceTimingDecompression.decompressSize(",a"));
            });

            // 304: [t: t <=> e, e, d: d>=e] -> [e, t-e, d-e]
            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,0' -> 'e,dt' for 304 responses (t > e, d = e)", function() {
                expect({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a,5"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,-dt,0' -> 'e,-dt' for 304 responses (t < e, d = e)", function() {
                expect({
                    transferSize: 5,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a,-5"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,0,0' -> 'e' for 304 responses (t = e, d = e)", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,dd' for 304 responses (t > e, d > e)", function() {
                expect({
                    transferSize: 20,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                }).to.eql(ResourceTimingDecompression.decompressSize("a,a,5"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,-dt,dd' for 304 responses (t < e, d > e)", function() {
                expect({
                    transferSize: 5,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                }).to.eql(ResourceTimingDecompression.decompressSize("a,-5,5"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,0,dd' -> 'e,,dd' for 304 responses (t = e, d > e)", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                }).to.eql(ResourceTimingDecompression.decompressSize("a,,5"));
            });

            // 200 non-gzipped: [t: t>=e, e, d: d=e] -> [e, t-e]
            it("Should reverse [e, t-e, d-e] -> [e, dt, 0] -> 'e,0' -> 'e' for 200 non-gzipped responses (t = e)", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, 0] -> 'e,dt' for 200 non-gzipped responses (t > e)", function() {
                expect({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a,5"));
            });

            // 200 gzipped: [t: t>=e, e, d: d>=e] -> [e, t-e, d-e]
            it("Should reverse [e, t-e, d-e] -> [e, dt, 0] -> 'e,0,dd' -> 'e,,dd' for 200 gzipped responses (t = e, d > e)", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                }).to.eql(ResourceTimingDecompression.decompressSize("a,,5"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, 0] -> 'e,dt,dd' for 200 gzipped responses (t > e, d > e)", function() {
                expect({
                    transferSize: 15,
                    encodedBodySize: 10,
                    decodedBodySize: 20
                }).to.eql(ResourceTimingDecompression.decompressSize("a,5,a"));
            });

            it("Should reverse [e, t-e, d-e] -> [e, dt, dd] -> 'e,dt,dd' for 200 gzipped responses (t > e, d > e)", function() {
                expect({
                    transferSize: 2000,
                    encodedBodySize: 20,
                    decodedBodySize: 0
                }).to.eql(ResourceTimingDecompression.decompressSize("k,1j0,-k"));
            });

            // retrieved from cache non-gzipped: [0, e, d: d=e] -> [e]
            it("Should reverse [e, t-e, d-e] -> [e, _, dd] -> 'e,_,0' -> 'e,_' for cached non-gzipped responses", function() {
                expect({
                    transferSize: 0,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSize("a,_"));
            });

            // retrieved from cache gzipped: [0, e, d: d>=e] -> [e, _, d-e]
            it("Should reverse [e, t-e, d-e] -> [e, _, dd] -> 'e,_,dd' -> 'e,_,dd' for cached gzipped responses", function() {
                expect({
                    transferSize: 0,
                    encodedBodySize: 10,
                    decodedBodySize: 15
                }).to.eql(ResourceTimingDecompression.decompressSize("a,_,5"));
            });
        });

        //
        // .decompressDimension
        //
        describe(".decompressDimension()", function() {
            it("Should return an empty object because of the lack of prefix.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressDimension("a,b,c,d"));
            });

            it("Should return an empty object because of the lack of data.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressDimension("*0"));
            });

            it("Should return an empty object because only one dimension exists.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressDimension("*01"));
            });

            it("Should a height, width of 1.", function() {
                expect({
                    height: 1,
                    width: 1,
                    y: 0,
                    x: 0,
                    naturalHeight: 1,
                    naturalWidth: 1
                }).to.eql(ResourceTimingDecompression.decompressDimension("*01,1"));
            });

            it("Should find a height, width, y, x of 1.", function() {
                expect({
                    height: 1,
                    width: 1,
                    naturalHeight: 1,
                    naturalWidth: 1,
                    y: 1,
                    x: 1
                }).to.eql(ResourceTimingDecompression.decompressDimension("*01,1,1,1"));
            });

            it("Should find a height, width, x of 1 and y of 0.", function() {
                expect({
                    height: 1,
                    width: 1,
                    naturalHeight: 1,
                    naturalWidth: 1,
                    y: 0,
                    x: 1
                }).to.eql(ResourceTimingDecompression.decompressDimension("*01,1,,1"));
            });

            it("Should find a height, width, x of 1 and y of 0, naturalHeight of 2 and naturalWidth of 4.", function() {
                expect({
                    height: 1,
                    width: 1,
                    naturalHeight: 2,
                    naturalWidth: 4,
                    y: 0,
                    x: 1
                }).to.eql(ResourceTimingDecompression.decompressDimension("*01,1,,1,2,4"));
            });
        });

        //
        // .addDimension
        //
        describe(".addDimension()", function() {
            it("Should return an empty object, because there is no dimension data.", function() {
                expect(
                {}
                ).to.eql(ResourceTimingDecompression.addDimension({}, {}));
            });

            it("Should not modify the resource because dimensionData is undefined.", function() {
                expect({
                    a: 1
                }).to.eql(ResourceTimingDecompression.addDimension({ a: 1 }, undefined));
            });

            it("Should add all dimension data to the resource.", function() {
                expect({
                    height: 1,
                    width: 1,
                    y: 0,
                    x: 1
                }).to.eql(ResourceTimingDecompression.addDimension({}, {
                    height: 1,
                    width: 1,
                    y: 0,
                    x: 1
                }));
            });

            it("Should add all dimension data and no other to the resource.", function() {
                expect({
                    height: 1,
                    width: 1,
                    y: 0,
                    x: 1
                }).to.eql(ResourceTimingDecompression.addDimension({}, {
                    height: 1,
                    width: 1,
                    y: 0,
                    x: 1,
                    notdimension: 1
                }));
            });
        });

        //
        // .searchSortedLast
        //
        describe(".searchSortedLast()", function() {
            it("Should return -1, because x is <= all the values.", function() {
                expect(
                    -1
                ).to.eql(ResourceTimingDecompression.searchSortedLast([1, 2, 3], 0));
            });

            it("Should return 2, because x is > all the values.", function() {
                expect(
                    2
                ).to.eql(ResourceTimingDecompression.searchSortedLast([1, 2, 3], 4));
            });
        });

        //
        // .searchSortedFirst
        //
        describe(".searchSortedFirst()", function() {
            it("Should return 0, because x is <= all the values.", function() {
                expect(
                    0
                ).to.eql(ResourceTimingDecompression.searchSortedFirst([1, 2, 3], 0));
            });

            it("Should return 3, because x is > all the values.", function() {
                expect(
                    3
                ).to.eql(ResourceTimingDecompression.searchSortedFirst([1, 2, 3], 4));
            });
        });

        //
        // .decompressNamespacedData
        //
        describe(".decompressNamespacedData()", function() {
            it("Should handled undefined.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressNamespacedData());
            });
            it("Should handle empty string.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressNamespacedData(""));
            });
            it("Should handle invalid data.", function() {
                expect({}).to.eql(ResourceTimingDecompression.decompressNamespacedData("foo"));
            });
            it("Should decompress valid data.", function() {
                expect({ _data: { foo: "bar" } }).to.eql(ResourceTimingDecompression.decompressNamespacedData("foo:bar"));
            });
            it("Should decompress valid data (with a semicolon in the value).", function() {
                expect({ _data: { foo: "bar:baz" } }).to.eql(ResourceTimingDecompression.decompressNamespacedData("foo:bar:baz"));
            });

            it("Should decompress data with different keys.", function() {
                var resource = {};
                ResourceTimingDecompression.decompressNamespacedData("a:1", resource);
                ResourceTimingDecompression.decompressNamespacedData("b:2", resource);
                expect({ _data: { a: 1, b: 2 } }).to.eql(resource);
            });
            it("Should decompress data with keys that collide twice.", function() {
                var resource = {};
                ResourceTimingDecompression.decompressNamespacedData("a:1", resource);
                ResourceTimingDecompression.decompressNamespacedData("a:2", resource);
                expect({ _data: { a: [1, 2] } }).to.eql(resource);
            });
            it("Should decompress data with keys that collide thrice.", function() {
                var resource = {};
                ResourceTimingDecompression.decompressNamespacedData("a:1", resource);
                ResourceTimingDecompression.decompressNamespacedData("a:2", resource);
                ResourceTimingDecompression.decompressNamespacedData("a:3", resource);
                expect({ _data: { a: [1, 2, 3] } }).to.eql(resource);
            });

        });

        //
        // .decompressSpecialData
        //
        describe(".decompressSpecialData()", function() {
            it("Should add sizes to the resource.", function() {
                expect({
                    transferSize: 10,
                    encodedBodySize: 10,
                    decodedBodySize: 10
                }).to.eql(ResourceTimingDecompression.decompressSpecialData(
                    "1a"
                ));
            });

            it("Should add script type to the resource.", function() {
                expect({
                    scriptAsync: true,
                    scriptDefer: false,
                    scriptBody: false
                }).to.eql(ResourceTimingDecompression.decompressSpecialData(
                    "21"
                ));
            });

            it("Should add script type to the resource.", function() {
                expect({
                    scriptAsync: true,
                    scriptDefer: true,
                    scriptBody: false
                }).to.eql(ResourceTimingDecompression.decompressSpecialData(
                    "23"
                ));
            });
        });

        //
        // .addContribution
        //
        describe(".addContribution()", function() {
            it("Should add contribution scores to the resources.", function() {
                expect([
                    { startTime: 0, responseEnd: 320, contribution: 0.609375 },
                    { startTime: 100, responseEnd: 260, contribution: 0.203125 },
                    { startTime: 170, responseEnd: 320, contribution: 0.1875 }
                ]).to.eql(ResourceTimingDecompression.addContribution([
                    {
                        startTime: 0,
                        responseEnd: 320
                    },
                    {
                        startTime: 100,
                        responseEnd: 260
                    },
                    {
                        startTime: 170,
                        responseEnd: 320
                    }
                ]));
            });

            it("Should add contribution scores correctly handling empty intervals.", function() {
                expect(0.9274587305277846).to.eql(
                    // Realistic values found in the wild.
                    ResourceTimingDecompression.addContribution([
                        { startTime: 1801, responseEnd: 3818 },
                        { startTime: 3311, responseEnd: 3590 },
                        { startTime: 3612, responseEnd: 3647 },
                        { startTime: 1548, responseEnd: 1562 },
                        { startTime: 910, responseEnd: 912 },
                        { startTime: 2806, responseEnd: 2852 },
                        { startTime: 2806, responseEnd: 2859 },
                        { startTime: 2797, responseEnd: 2831 },
                        { startTime: 2805, responseEnd: 2814 },
                        { startTime: 2803, responseEnd: 2810 },
                        { startTime: 3836, responseEnd: 3843 },
                        { startTime: 2957, responseEnd: 3292 },
                        { startTime: 2701, responseEnd: 3016 },
                        { startTime: 3430, responseEnd: 4241 },
                        { startTime: 2757, responseEnd: 3091 },
                        { startTime: 2235, responseEnd: 2540 },
                        { startTime: 2958, responseEnd: 3486 },
                        { startTime: 2303, responseEnd: 2838 },
                        { startTime: 2600, responseEnd: 2886 },
                        { startTime: 0, responseEnd: 791 },
                        { startTime: 843, responseEnd: 1137 },
                        { startTime: 2674, responseEnd: 2687 },
                        { startTime: 2670, responseEnd: 2681 },
                        { startTime: 2669, responseEnd: 2680 },
                        { startTime: 2669, responseEnd: 2679 },
                        { startTime: 2672, responseEnd: 2686 },
                        { startTime: 2667, responseEnd: 2670 },
                        { startTime: 2675, responseEnd: 2688 },
                        { startTime: 3214, responseEnd: 0 },
                        { startTime: 2675, responseEnd: 2688 },
                        { startTime: 2673, responseEnd: 2687 },
                        { startTime: 2676, responseEnd: 2688 },
                        { startTime: 2672, responseEnd: 2686 },
                        { startTime: 2671, responseEnd: 2683 },
                        { startTime: 2674, responseEnd: 2687 },
                        { startTime: 2671, responseEnd: 2685 },
                        { startTime: 1195, responseEnd: 1208 },
                        { startTime: 2668, responseEnd: 2671 },
                        { startTime: 844, responseEnd: 865 },
                        { startTime: 843, responseEnd: 853 },
                        { startTime: 3480, responseEnd: 0 },
                        { startTime: 1185, responseEnd: 1188 },
                        { startTime: 1288, responseEnd: 0 },
                        { startTime: 2714, responseEnd: 0 },
                        { startTime: 3316, responseEnd: 0 },
                        { startTime: 1288, responseEnd: 0 },
                        { startTime: 1291, responseEnd: 0 },
                        { startTime: 1809, responseEnd: 0 },
                        { startTime: 1205, responseEnd: 0 },
                        { startTime: 3215, responseEnd: 0 },
                        { startTime: 2490, responseEnd: 0 },
                        { startTime: 1809, responseEnd: 0 },
                        { startTime: 1578, responseEnd: 0 },
                        { startTime: 1193, responseEnd: 0 },
                        { startTime: 3330, responseEnd: 0 },
                        { startTime: 1291, responseEnd: 0 },
                        { startTime: 844, responseEnd: 0 },
                        { startTime: 1290, responseEnd: 0 },
                        { startTime: 2760, responseEnd: 2762 },
                        { startTime: 876, responseEnd: 883 },
                        { startTime: 1205, responseEnd: 0 },
                        { startTime: 1186, responseEnd: 0 },
                        { startTime: 844, responseEnd: 0 },
                        { startTime: 1195, responseEnd: 0 },
                        { startTime: 839, responseEnd: 871 },
                        { startTime: 844, responseEnd: 856 },
                        { startTime: 844, responseEnd: 857 },
                        { startTime: 869, responseEnd: 877 },
                        { startTime: 2798, responseEnd: 2801 },
                        { startTime: 3597, responseEnd: 0 },
                        { startTime: 3597, responseEnd: 0 },
                        { startTime: 843, responseEnd: 858 },
                        { startTime: 3534, responseEnd: 3547 },
                        { startTime: 2798, responseEnd: 2802 },
                        { startTime: 1194, responseEnd: 1212 },
                        { startTime: 1194, responseEnd: 1210 },
                        { startTime: 844, responseEnd: 865 },
                        { startTime: 1194, responseEnd: 1210 },
                        { startTime: 844, responseEnd: 866 },
                        { startTime: 1194, responseEnd: 1378 },
                        { startTime: 1194, responseEnd: 1209 },
                        { startTime: 1194, responseEnd: 1214 },
                        { startTime: 3659, responseEnd: 3661 },
                        { startTime: 1202, responseEnd: 1211 },
                        { startTime: 1288, responseEnd: 1290 },
                        { startTime: 2071, responseEnd: 2074 },
                        { startTime: 1184, responseEnd: 1187 },
                        { startTime: 3141, responseEnd: 3142 },
                        { startTime: 2802, responseEnd: 2806 },
                        { startTime: 3854, responseEnd: 3857 },
                        { startTime: 3455, responseEnd: 3473 },
                        { startTime: 3459, responseEnd: 3477 },
                        { startTime: 3786, responseEnd: 3882 },
                        { startTime: 2576, responseEnd: 2650 },
                        { startTime: 2806, responseEnd: 2815 },
                        { startTime: 3508, responseEnd: 3610 },
                        { startTime: 1160, responseEnd: 1164 },
                        { startTime: 2804, responseEnd: 2899 },
                        { startTime: 3790, responseEnd: 3792 },
                        { startTime: 3587, responseEnd: 3589 },
                        { startTime: 3690, responseEnd: 3691 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 876, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 876, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 875, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 3821, responseEnd: 3825 },
                        { startTime: 3821, responseEnd: 3826 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 3821, responseEnd: 3824 },
                        { startTime: 3821, responseEnd: 3825 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 879, responseEnd: 0 },
                        { startTime: 3821, responseEnd: 3826 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 3844, responseEnd: 3899 },
                        { startTime: 3469, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 874, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 1580, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 1581, responseEnd: 0 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 871, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 2717, responseEnd: 0 },
                        { startTime: 2717, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 873, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 872, responseEnd: 0 },
                        { startTime: 1982, responseEnd: 2017 },
                        { startTime: 953, responseEnd: 955 },
                        { startTime: 3564, responseEnd: 3612 },
                        { startTime: 3580, responseEnd: 3622 },
                        { startTime: 2576, responseEnd: 2582 },
                        { startTime: 1160, responseEnd: 1163 },
                        { startTime: 2806, responseEnd: 2859 },
                        { startTime: 1238, responseEnd: 1586 },
                        { startTime: 2576, responseEnd: 2582 },
                        { startTime: 3417, responseEnd: 3446 },
                        { startTime: 1403, responseEnd: 1454 },
                        { startTime: 1806, responseEnd: 1815 },
                        { startTime: 875, responseEnd: 884 },
                        { startTime: 1825, responseEnd: 1829 },
                        { startTime: 3489, responseEnd: 3491 },
                        { startTime: 1549, responseEnd: 1563 },
                        { startTime: 2817, responseEnd: 2822 },
                        { startTime: 3650, responseEnd: 3685 },
                        { startTime: 1534, responseEnd: 1537 },
                        { startTime: 3399, responseEnd: 4301 },
                        { startTime: 2968, responseEnd: 2970 },
                        { startTime: 2805, responseEnd: 2838 }
                    ]).reduce(function(acc, val) {
                        return acc + val.contribution;
                    }, 0)
                );
            });
        });

        //
        // .decompressServerTiming
        //
        describe(".decompressServerTiming()", function() {
            var optimized = [["m0", "d0a", "d0b"], ["m1", "d1a", "d1b"], "m2"];
            it("Should resolve to m0-d0a", function() {
                ["123", "123:0", "123:.0", "123:0.0"].forEach(function(compressed) {
                    expect(ResourceTimingDecompression.decompressServerTiming(optimized, compressed)).to.eql({
                        name: "m0",
                        description: "d0a",
                        duration: 123
                    });
                });
            });
            it("Should resolve to m0-d0b", function() {
                ["123:.1", "123:0.1"].forEach(function(compressed) {
                    expect(ResourceTimingDecompression.decompressServerTiming(optimized, compressed)).to.eql({
                        name: "m0",
                        description: "d0b",
                        duration: 123
                    });
                });
            });
            it("Should resolve to m1-d1a", function() {
                ["123:1", "123:1.0"].forEach(function(compressed) {
                    expect(ResourceTimingDecompression.decompressServerTiming(optimized, compressed)).to.eql({
                        name: "m1",
                        description: "d1a",
                        duration: 123
                    });
                });
            });
            it("Should resolve to m1-d1b", function() {
                ["123:1.1"].forEach(function(compressed) {
                    expect(ResourceTimingDecompression.decompressServerTiming(optimized, compressed)).to.eql({
                        name: "m1",
                        description: "d1b",
                        duration: 123
                    });
                });
            });
            it("Should resolve to m1-<empty string>", function() {
                ["123:2"].forEach(function(compressed) {
                    expect(ResourceTimingDecompression.decompressServerTiming(optimized, compressed)).to.eql({
                        name: "m2",
                        description: "",
                        duration: 123
                    });
                });
            });
        });

        //
        // .decompressScriptType
        //
        describe(".decompressScriptType()", function() {
            it("should set scriptAsync attribute", function() {
                expect(ResourceTimingDecompression.decompressScriptType("1")).to.eql({
                    scriptAsync: true,
                    scriptBody: false,
                    scriptDefer: false
                });
            });

            it("should set scriptDefer attribute", function() {
                expect(ResourceTimingDecompression.decompressScriptType("2")).to.eql({
                    scriptAsync: false,
                    scriptBody: false,
                    scriptDefer: true
                });
            });

            it("should set scriptBody attribute", function() {
                expect(ResourceTimingDecompression.decompressScriptType("4")).to.eql({
                    scriptAsync: false,
                    scriptBody: true,
                    scriptDefer: false
                });
            });

            it("should set all script* attributes", function() {
                expect(ResourceTimingDecompression.decompressScriptType("7")).to.eql({
                    scriptAsync: true,
                    scriptBody: true,
                    scriptDefer: true
                });
            });
        });

        //
        // .decompressLinkAttrType
        //
        describe(".decompressLinkAttrType()", function() {
            it("should set rel='prefetch' attribute", function() {
                expect(ResourceTimingDecompression.decompressLinkAttrType("1")).to.eql({
                    rel: "prefetch"
                });
            });

            it("should set rel='preload' attribute", function() {
                expect(ResourceTimingDecompression.decompressLinkAttrType("2")).to.eql({
                    rel: "preload"
                });
            });

            it("should set rel='prerender' attribute", function() {
                expect(ResourceTimingDecompression.decompressLinkAttrType("3")).to.eql({
                    rel: "prerender"
                });
            });

            it("should set rel='stylesheet' attributes", function() {
                expect(ResourceTimingDecompression.decompressLinkAttrType("4")).to.eql({
                    rel: "stylesheet"
                });
            });
        });
    });
}(typeof window !== "undefined" ? window : undefined));
