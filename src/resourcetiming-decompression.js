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
     * Returns the index of the first value in the array such that it is
     * greater or equal to x.
     * The search is performed using binary search and the array is assumed
     * to be sorted in ascending order.
     *
     * @param {array} arr haystack
     * @param {any} x needle
     * @param {function} by transform function (optional)
     *
     * @returns {number} the desired index or arr.length if x is more than all values.
     */
    ResourceTimingDecompression.searchSortedFirst = function(arr, x, by) {
        if (!arr || arr.length === 0) {
            return -1;
        }

        function ident(a) {
            return a;
        }
        by = by || ident;
        x = by(x);
        var min = -1;
        var max = arr.length;
        var m = 0;

        while (min < (max - 1)) {
            m = (min + max) >>> 1;
            if (by(arr[m]) < x) {
                min = m;
            } else {
                max = m;
            }
        }
        return max;
    };

    /**
     * Returns the index of the last value in the array such that is it less
     * than or equal to x.
     * The search is performed using binary search and the array is assumed
     * to be sorted in ascending order.
     *
     * @param {array} arr haystack
     * @param {any} x needle
     * @param {function} by transform function (optional)
     *
     * @returns {number} the desired index or -1 if x is less than all values.
     */
    ResourceTimingDecompression.searchSortedLast = function(arr, x, by) {
        if (!arr || arr.length === 0) {
            return -1;
        }

        function ident(a) {
            return a;
        }
        by = by || ident;
        x = by(x);
        var min = -1;
        var max = arr.length;
        var m = 0;

        while (min < (max - 1)) {
            m = (min + max) >>> 1;
            if (x < by(arr[m])) {
                max = m;
            } else {
                min = m;
            }
        }
        return min;
    };

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
        "html": 6,
        // IMAGE element inside a SVG
        "image": 7,
        "beacon": 8,
        "fetch": 9
    };

    /**
    * Dimension name map
    */
    ResourceTimingDecompression.DIMENSION_NAMES = {
        "height": 0,
        "width": 1,
        "y": 2,
        "x": 3,
        "naturalHeight": 4,
        "naturalWidth": 5
    };

    /**
     * Script mask map
     */
    ResourceTimingDecompression.SCRIPT_ATTRIBUTES = {
        "scriptAsync": 1,
        "scriptDefer": 2,
        "scriptBody": 4
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
    };

    /**
    * Reverse initiator type map
    */
    ResourceTimingDecompression.REV_INITIATOR_TYPES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.INITIATOR_TYPES);

    /**
    * Reverse dimension name map
    */
    ResourceTimingDecompression.REV_DIMENSION_NAMES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.DIMENSION_NAMES);

    /**
     * Reverse script attribute map
     */
    ResourceTimingDecompression.REV_SCRIPT_ATTRIBUTES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.SCRIPT_ATTRIBUTES);

    // Any ResourceTiming data time that starts with this character is not a time,
    // but something else (like dimension data)
    var SPECIAL_DATA_PREFIX = "*";

    // Dimension data special type
    var SPECIAL_DATA_DIMENSION_TYPE = "0";
    var SPECIAL_DATA_DIMENSION_PREFIX = SPECIAL_DATA_PREFIX + SPECIAL_DATA_DIMENSION_TYPE;

    // Dimension data special type
    var SPECIAL_DATA_SIZE_TYPE = "1";

    // Dimension data special type
    var SPECIAL_DATA_SCRIPT_TYPE = "2";

    // Dimension data special type
    var SPECIAL_DATA_SERVERTIMING_TYPE = "3";

    // Regular Expression to parse a URL
    var HOSTNAME_REGEX = /^(https?:\/\/)([^\/]+)(.*)/;

    /**
     * Decompresses a compressed ResourceTiming trie
     *
     * @param {object} rt ResourceTiming trie
     * @param {array} st server timing entries lookup
     * @param {string} prefix URL prefix for the current node
     *
     * @returns {ResourceTiming[]} ResourceTiming array
     */
    ResourceTimingDecompression.decompressResources = function(rt, st, prefix) {
        var resources = [];

        // Dimension data for resources.
        var dimensionData;

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

                if (timings.length === 0) {
                    continue;
                }

                // Make sure we reset the dimensions before each new resource.
                dimensionData = undefined;

                if (this.isDimensionData(timings[0])) {
                    dimensionData = this.decompressDimension(timings[0]);

                    // Remove the dimension data from our timings array
                    timings = timings.splice(1);
                }

                // end-node
                for (var i = 0; i < timings.length; i++) {
                    var resourceData = timings[i];

                    if (resourceData.length > 0 && resourceData[0] === SPECIAL_DATA_PREFIX) {
                        // dimensions or sizes for this resource
                        continue;
                    }

                    // Decode resource and add dimension data to it.
                    resources.push(
                        this.addDimension(
                            this.decodeCompressedResource(resourceData, nodeKey, st),
                            dimensionData
                        )
                    );
                }
            } else {
                // continue down
                var nodeResources = this.decompressResources(node, st, nodeKey);

                resources = resources.concat(nodeResources);
            }
      }

      return resources;
    };

    /*
    * Checks that the input contains dimension information.
    *
    * @param {string} resourceData The string we want to check.
    *
    * @returns boolean True if resourceData starts with SPECIAL_DATA_DIMENSION_PREFIX, false otherwise.
    */
    ResourceTimingDecompression.isDimensionData = function(resourceData) {
        return resourceData &&
            resourceData.substring(0, SPECIAL_DATA_DIMENSION_PREFIX.length) === SPECIAL_DATA_DIMENSION_PREFIX;
    };

    /**
    * Extract height, width, y and x from a string.
    *
    * @param {string} resourceData A string containing dimension data.
    *
    * @returns {object} Dimension data with keys defined by DIMENSION_NAMES.
    */
    ResourceTimingDecompression.decompressDimension = function(resourceData) {
        var dimensions, i;
        var dimensionData = {};

        // If the string does not contain dimension information, do nothing.
        if (!this.isDimensionData(resourceData)) {
            return dimensionData;
        }

        // Remove special prefix
        resourceData = resourceData.substring(SPECIAL_DATA_DIMENSION_PREFIX.length);

        dimensions = resourceData.split(",");

        // The data should contain at least height/width.
        if (dimensions.length < 2) {
            return dimensionData;
        }

        // Base 36 decode and assign to correct keys of dimensionData.
        for (i = 0; i < dimensions.length; i++) {
            if (dimensions[i] === "") {
                dimensionData[this.REV_DIMENSION_NAMES[i]] = 0;
            } else {
                dimensionData[this.REV_DIMENSION_NAMES[i]] = parseInt(dimensions[i], 36);
            }
        }

        return dimensionData;
    };

    /**
    * Adds dimension data to the given resource.
    *
    * @param {object} resource The resource we want to edit.
    * @param {object} dimensionData The dimension data we want to add.
    *
    * @returns {object} The resource with added dimensions.
    */
    ResourceTimingDecompression.addDimension = function(resource, dimensionData) {
        // If the resource or data are not defined, do nothing.
        if (!resource || !dimensionData) {
            return resource;
        }

        // Add all the dimensions to our resource.
        for (var key in this.DIMENSION_NAMES) {
            if (this.DIMENSION_NAMES.hasOwnProperty(key) &&
                dimensionData.hasOwnProperty(key)) {
                resource[key] = dimensionData[key];
            }
        }

        return resource;
    };

    /**
     * Compute a list of cells based on the start/end times of the
     * given array of resources.
     * The returned list of cells is sorted in chronological order.
     *
     * @param {array} rts array of resource timings.
     *
     * @returns {array} Array of cells.
     */
    ResourceTimingDecompression.getSortedCells = function(rts) {
        // We have exactly 2 events per resource (start and end).
        // var cells = new Array(rts.length * 2);

        var cells = [];
        for (var i = 0; i < rts.length; i++) {
            // Ignore resources with duration <= 0
            if (rts[i].responseEnd <= rts[i].startTime) {
                continue;
            }
            // Increment on resource start
            cells.push({
                ts: rts[i].startTime,
                val: 1.0
            });
            // Decrement on resource end
            cells.push({
                ts: rts[i].responseEnd,
                val: -1.0
            });
        }

        // Sort in chronological order
        cells.sort(function(x, y) {
            return x.ts - y.ts;
        });

        return cells;
    };

    /**
     * Add contributions to the array of cells.
     *
     * @param {array} cells array of cells that need contributions.
     *
     * @returns {array} Array of cells with their contributions.
     */
    ResourceTimingDecompression.addCellContributions = function(cells) {
        var tot = 0.0;
        var incr = 0.0;
        var deleteIdx = [];
        var currentSt = cells[0].ts;
        var cellLen = cells.length;
        var c = {};

        for (var i = 0; i < cellLen; i++) {
            c = cells[i];
            // The next timestamp is the same.
            // We don't want to have cells of duration 0, so
            // we aggregate them.
            if ((i < (cellLen - 1)) && (cells[i + 1].ts === c.ts)) {
                cells[i + 1].val += c.val;
                deleteIdx.push(i);
                continue;
            }

            incr = c.val;
            if (tot > 0) {
                // divide time delta by number of active resources.
                c.val = (c.ts - currentSt) / tot;
            }

            currentSt = c.ts;
            tot += incr;
        }

        // Delete timestamps that don't delimit cells.
        for (i = deleteIdx.length - 1; i >= 0; i--) {
            cells.splice(deleteIdx[i], 1);
        }

        return cells;
    };

    /**
     * Sum the contributions of a single resource based on an array of cells.
     *
     * @param {array} cells Array of cells with their contributions.
     * @param {ResourceTiming} rt a single resource timing object.
     *
     * @returns {number} The total contribution for that resource.
     */
    ResourceTimingDecompression.sumContributions = function(cells, rt) {
        if (!rt || typeof rt.startTime === "undefined" ||
            typeof rt.responseEnd === "undefined") {

            return 0.0;
        }

        var startTime = rt.startTime + 1;
        var responseEnd = rt.responseEnd;

        function getTs(x) {
            return x.ts;
        }

        // Find indices of cells that were affected by our resource.
        var low = this.searchSortedFirst(cells, {ts: startTime}, getTs);
        var up = this.searchSortedLast(cells, {ts: responseEnd}, getTs);

        var tot = 0.0;

        // Sum contributions across all those cells
        for (var i = low; i <= up; i++) {
            tot += cells[i].val;
        }

        return tot;
    };

    /**
     * Adds contribution scores to all resources in the array.
     *
     * @param {array} rts array of resource timings.
     *
     * @returns {array} Array of resource timings with their contributions.
     */
    ResourceTimingDecompression.addContribution = function(rts) {
        if (!rts || rts.length === 0) {
            return rts;
        }

        // Get cells in chronological order.
        var cells = this.getSortedCells(rts);

        // We need at least two cells and they need to begin
        // with a start event. Furthermore, the last timestamp
        // should be > 0.
        if (cells.length < 2 ||
            cells[0].val < 1.0 ||
            cells[cells.length - 1].ts <= 0
        ) {
            return rts;
        }

        // Compute each cell's contribution.
        this.addCellContributions(cells);

        // Total load time for this batch of resources.
        var loadTime = cells[cells.length - 1].ts;

        for (var i = 0; i < rts.length; i++) {
            // Compute the contribution of each resource.
            // Normalize by total load time.
            rts[i].contribution = this.sumContributions(cells, rts[i]) / loadTime;
        }

        return rts;
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
        } else {
            return "other";
        }
    };

    /**
     * Decodes a compressed ResourceTiming data string
     *
     * @param {string} data Compressed timing data
     * @param {string} url  URL
     * @param {array} st server timing entries lookup
     *
     * @returns {ResourceTiming} ResourceTiming pseudo-object (containing all of the properties of a
     * ResourceTiming object)
     */
    ResourceTimingDecompression.decodeCompressedResource = function(data, url, st) {
        if (!data || !url) {
            return {};
        }

        url = ResourceTimingDecompression.reverseHostname(url);
        var initiatorType = parseInt(data[0], 10);
        data = data.length > 1 ? data.split(SPECIAL_DATA_PREFIX) : [];
        var timings = data.length > 0 && data[0].length > 1 ? data[0].substring(1).split(",") : [];
        var sizes = data.length > 1 ? data[1] : "";
        var specialData = data.length > 1 ? data[1] : "";

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
            this.decompressSpecialData(specialData, res, st);
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
     * Decompresses script load type into the specified resource.
     *
     * @param {string} compressed String with a single integer.
     * @param {ResourceTiming} resource ResourceTiming object.
     * @returns {ResourceTiming} ResourceTiming object with decompressed script type.
     */
    ResourceTimingDecompression.decompressScriptType = function(compressed, resource) {
        var data = parseInt(compressed, 10);

        if (!resource) {
            resource = {};
        }

        for (var key in this.SCRIPT_ATTRIBUTES) {
            if (this.SCRIPT_ATTRIBUTES.hasOwnProperty(key)) {
                resource[key] = (data & this.SCRIPT_ATTRIBUTES[key]) === this.SCRIPT_ATTRIBUTES[key];
            }
        }

        return resource;
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

    /**
     * Decompresses special data such as resource size or script type into the given resource.
     *
     * @param {string} compressed Compressed string
     * @param {ResourceTiming} resource ResourceTiming object
     * @param {array} st server timing entries lookup
     * @returns {ResourceTiming} ResourceTiming object with decompressed special data
     */
    ResourceTimingDecompression.decompressSpecialData = function(compressed, resource, st) {
        var dataType;

        if (!compressed || compressed.length === 0) {
            return resource;
        }

        dataType = compressed[0];

        compressed = compressed.substring(1);

        if (dataType === SPECIAL_DATA_SIZE_TYPE) {
            resource = this.decompressSize(compressed, resource);
        } else if (dataType === SPECIAL_DATA_SCRIPT_TYPE) {
            resource = this.decompressScriptType(compressed, resource);
        } else if (dataType === SPECIAL_DATA_SERVERTIMING_TYPE) {
          resource = this.decompressServerTimingEntries(st, compressed, resource);
        }

        return resource;
    };

    /**
     * Reverse the hostname portion of a URL
     *
     * @param {string} url a fully-qualified URL
     * @returns {string} the input URL with the hostname portion reversed, if it can be found
     */
    ResourceTimingDecompression.reverseHostname = function(url) {
        return url.replace(HOSTNAME_REGEX, function(m, p1, p2, p3) {
            // p2 is everything after the first `://` and before the next `/`
            // which includes `<username>:<password>@` and `:<port-number>`, if present
            return p1 + ResourceTimingDecompression.reverseString(p2) + p3;
        });
    };

    /**
     * Reverse a string
     *
     * @param {string} i a string
     * @returns {string} the reversed string
     */
    ResourceTimingDecompression.reverseString = function(i) {
        var l = i.length, o = "";
        while (l--) {
            o += i[l];
        }
        return o;
    };

  /**
   * @param {array} lookup server timing entries lookup
   * @param {string} compressedList server timing entries for a resource
   * @param {ResourceTiming} resource ResourceTiming object.
   * @returns {ResourceTiming} ResourceTiming object with decompressed server timing entries.
   */
  ResourceTimingDecompression.decompressServerTimingEntries = function(lookup, compressedList, resource) {
    if (lookup && compressedList) {
      resource.serverTiming = compressedList.split(",").map(
        function(compressedEntry) {
          return this.decompressServerTiming(lookup, compressedEntry);
        }, this);
    }
    return resource;
  };

  /**
   * @param {array} lookup server timing entries lookup
   * @param {string} key key into the lookup for one server timing entry
   * @returns {object} server timing entry
   */
  ResourceTimingDecompression.decompressServerTiming = function(lookup, key) {
    var split = key.split(":");
    var duration = Number(split[0]);
    var entryIndex = 0, descriptionIndex = 0;

    if (split.length > 1) {
      var identity = split[1].split(".");
      if (identity[0] !== "") {
        entryIndex = Number(identity[0]);
      }
      if (identity.length > 1) {
        descriptionIndex = Number(identity[1]);
      }
    }

    var name, description = "";
    if (Array.isArray(lookup[entryIndex])) {
      name = lookup[entryIndex][0];
      description = lookup[entryIndex][1 + descriptionIndex] || "";
    } else {
      name = lookup[entryIndex];
    }

    return {
      name: name,
      duration: duration,
      description: description
    };
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
