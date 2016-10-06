//
// resourcetiming-decompression.js
//
// Decompresses ResourceTiming data compressed via resourcetiming-compression.js.
//
// See http://nicj.net/compressing-resourcetiming/
//
// https://github.com/nicjansma/resourcetiming-compression.js
//
(function(window) {
    "use strict";

    // save old ResourceTimingDecompression object for noConflict()
    var root;
    var previousObj;
    if (typeof window !== "undefined") {
        root = window;
        previousObj = root.ResourceTimingDecompression;
    }

    // model
    var ResourceTimingDecompression = {};

    //
    // Functions
    //
    /**
     * Changes the value of ResourceTimingDecompression back to its original value, returning
     * a reference to the ResourceTimingDecompression object.
     *
     * @returns {object} Original ResourceTimingDecompression object
     */
    ResourceTimingDecompression.noConflict = function() {
        root.ResourceTimingDecompression = previousObj;
        return ResourceTimingDecompression;
    };

    /**
     * Initiator type map
     */
    ResourceTimingDecompression.INITIATOR_TYPES = {
        "other": 0,
        "img": 1,
        "link": 2,
        "script": 3,
        "css": 4,
        "xmlhttprequest": 5,
        "html": 6
    };

    /**
    * Returns a map with key/value pairs reversed.
    *
    * @param {object} origMap Map we want to reverse.
    * 
    * @returns {object} New map with reversed mappings.
    */
    ResourceTimingDecompression.getRevMap = function(origMap) {
        var revMap = {};
        for (var key in origMap) {
            if (origMap.hasOwnProperty(key)) {
                revMap[origMap[key]] = key;
            }
        }
        return revMap;
    }

    /**
    * Reverse initiator type map
    */
    ResourceTimingDecompression.REV_INITIATOR_TYPES = ResourceTimingDecompression.getRevMap(ResourceTimingDecompression.INITIATOR_TYPES);

    // Any ResourceTiming data time that starts with this character is not a time,
    // but something else (like dimension data)
    var SPECIAL_DATA_PREFIX = "*";

    // Dimension data special type
    var SPECIAL_DATA_DIMENSION_TYPE = "0";

    // Dimension data special type
    var SPECIAL_DATA_SIZE_TYPE = "1";

    /**
     * Decompresses a compressed ResourceTiming trie
     *
     * @param {object} rt ResourceTiming trie
     * @param {string} prefix URL prefix for the current node
     *
     * @returns {ResourceTiming[]} ResourceTiming array
     */
    ResourceTimingDecompression.decompressResources = function(rt, prefix) {
        var resources = [];

        prefix = prefix || "";

        for (var key in rt) {
            // skip over inherited properties
            if (!rt.hasOwnProperty(key)) {
                continue;
            }

            var node = rt[key];
            var nodeKey = prefix + key;

            // strip trailing pipe, which is used to designate a node that is a prefix for
            // other nodes but has resTiming data
            if (nodeKey.indexOf("|", nodeKey.length - 1) !== -1) {
                nodeKey = nodeKey.substring(0, nodeKey.length - 1);
            }

            if (typeof node === "string") {
                // add all occurences
                var timings = node.split("|");

                // end-node
                for (var i = 0; i < timings.length; i++) {
                    var resourceData = timings[i];
                    if (resourceData.length > 0 && resourceData[0] === SPECIAL_DATA_PREFIX) {
                      // dimensions for this resource
                      continue;
                    }

                    resources.push(this.decodeCompressedResource(resourceData, nodeKey));
                }
            } else {
                // continue down
                var nodeResources = this.decompressResources(node, nodeKey);

                resources = resources.concat(nodeResources);
            }
      }

      return resources;
    };

    /**
     * Determines the initiatorType from a lookup
     *
     * @param {number} index Initiator type index
     *
     * @returns {string} initiatorType, or "other" if not known
     */
    ResourceTimingDecompression.getInitiatorTypeFromIndex = function(index) {
        if (this.REV_INITIATOR_TYPES.hasOwnProperty(index)) {
            return this.REV_INITIATOR_TYPES[index];
        }
        else {
            return "other";
        }
    };

    /**
     * Decodes a compressed ResourceTiming data string
     *
     * @param {string} data Compressed timing data
     * @param {string} url  URL
     *
     * @returns {ResourceTiming} ResourceTiming pseudo-object (containing all of the properties of a
     * ResourceTiming object)
     */
    ResourceTimingDecompression.decodeCompressedResource = function(data, url) {
        if (!data || !url) {
            return {};
        }

        var initiatorType = parseInt(data[0], 10);
        data = data.length > 1 ? data.split(SPECIAL_DATA_PREFIX + SPECIAL_DATA_SIZE_TYPE) : [];
        var timings = data.length > 0 && data[0].length > 1 ? data[0].substring(1).split(",") : [];
        var sizes = data.length > 1 ? data[1] : "";

        // convert all timings from base36
        for (var i = 0; i < timings.length; i++) {
            if (timings[i] === "") {
                // startTime being 0
                timings[i] = 0;
            } else {
                // de-base36
                timings[i] = parseInt(timings[i], 36);
            }
        }

        // special case timestamps
        var startTime = timings.length >= 1 ? timings[0] : 0;

        // fetchStart is either the redirectEnd time, or startTime
        var fetchStart = timings.length < 10 ?
            startTime :
            this.decodeCompressedResourceTimeStamp(timings, 9, startTime);

        // all others are offset from startTime
        var res = {
            name: url,
            initiatorType: this.getInitiatorTypeFromIndex(initiatorType),
            startTime: startTime,
            redirectStart: this.decodeCompressedResourceTimeStamp(timings, 9, startTime) > 0 ? startTime : 0,
            redirectEnd: this.decodeCompressedResourceTimeStamp(timings, 9, startTime),
            fetchStart: fetchStart,
            domainLookupStart: this.decodeCompressedResourceTimeStamp(timings, 8, startTime),
            domainLookupEnd: this.decodeCompressedResourceTimeStamp(timings, 7, startTime),
            connectStart: this.decodeCompressedResourceTimeStamp(timings, 6, startTime),
            secureConnectionStart: this.decodeCompressedResourceTimeStamp(timings, 5, startTime),
            connectEnd: this.decodeCompressedResourceTimeStamp(timings, 4, startTime),
            requestStart: this.decodeCompressedResourceTimeStamp(timings, 3, startTime),
            responseStart: this.decodeCompressedResourceTimeStamp(timings, 2, startTime),
            responseEnd: this.decodeCompressedResourceTimeStamp(timings, 1, startTime)
        };

        res.duration = res.responseEnd > 0 ? (res.responseEnd - res.startTime) : 0;

        // decompress resource size data
        if (sizes.length > 0) {
            this.decompressSize(sizes, res);
        }

        return res;
    };

    /**
     * Decodes a timestamp from a compressed RT array
     *
     * @param {number[]} timings ResourceTiming timings
     * @param {number} idx Index into array
     * @param {number} startTime NavigationTiming The Resource's startTime
     *
     * @returns {number} Timestamp, or 0 if unknown or missing
     */
    ResourceTimingDecompression.decodeCompressedResourceTimeStamp = function(timings, idx, startTime) {
        if (timings && timings.length >= (idx + 1)) {
            if (timings[idx] !== 0) {
                return timings[idx] + startTime;
            }
        }

        return 0;
    };

    /**
     * Decompresses size information back into the specified resource
     *
     * @param {string} compressed Compressed string
     * @param {ResourceTiming} resource ResourceTiming bject
     * @returns {ResourceTiming} ResourceTiming object with decompressed sizes
     */
    ResourceTimingDecompression.decompressSize = function(compressed, resource) {
        var split, i;

        if (typeof resource === "undefined") {
            resource = {};
        }

        split = compressed.split(",");

        for (i = 0; i < split.length; i++) {
            if (split[i] === "_") {
                // special non-delta value
                split[i] = 0;
            } else {
                // fill in missing numbers
                if (split[i] === "") {
                    split[i] = 0;
                }

                // convert back from Base36
                split[i] = parseInt(split[i], 36);

                if (i > 0) {
                    // delta against first number
                    split[i] += split[0];
                }
            }
        }

        // fill in missing
        if (split.length === 1) {
            // transferSize is a delta from encodedSize
            split.push(split[0]);
        }

        if (split.length === 2) {
            // decodedSize is a delta from encodedSize
            split.push(split[0]);
        }

        // re-add attributes to the resource
        resource.encodedBodySize = split[0];
        resource.transferSize = split[1];
        resource.decodedBodySize = split[2];

        return resource;
    };

    //
    // Export to the appropriate location
    //
    if (typeof define === "function" && define.amd) {
        //
        // AMD / RequireJS
        //
        define([], function() {
            return ResourceTimingDecompression;
        });
    } else if (typeof module !== "undefined" && module.exports) {
        //
        // Node.js
        //
        module.exports = ResourceTimingDecompression;
    } else if (typeof root !== "undefined") {
        //
        // Browser Global
        //
        root.ResourceTimingDecompression = ResourceTimingDecompression;
    }
}(typeof window !== "undefined" ? window : undefined));
