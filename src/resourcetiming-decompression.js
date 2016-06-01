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
                    resources.push(this.decodeCompressedResource(timings[i], nodeKey));
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
        for (var initiatorType in this.INITIATOR_TYPES) {
            if (this.INITIATOR_TYPES[initiatorType] === index) {
                return initiatorType;
            }
        }

        return "other";
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
        var timings = data.length > 1 ? data.substring(1).split(",") : [];

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
