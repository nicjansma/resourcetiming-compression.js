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
    // Constants / Config
    //

    /**
     * Are hostnames in the compressed trie reversed or not
     */
    ResourceTimingDecompression.HOSTNAMES_REVERSED = true;

    /**
     * Initiator type map
     */
    ResourceTimingDecompression.INITIATOR_TYPES = {
        /** Unknown type */
        "other": 0,
        /** IMG element */
        "img": 1,
        /** LINK element (i.e. CSS) */
        "link": 2,
        /** SCRIPT element */
        "script": 3,
        /** Resource referenced in CSS */
        "css": 4,
        /** XMLHttpRequest */
        "xmlhttprequest": 5,
        /** The root HTML page itself */
        "navigation": 6,
        /** IMAGE element inside a SVG */
        "image": 7,
        /** [sendBeacon]{@link https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon} */
        "beacon": 8,
        /** [Fetch API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API} */
        "fetch": 9,
        /** FRAME element */
        "frame": "a",
        /** BODY element */
        "body": "b",
        /** INPUT element */
        "input": "c",
        /** OBJECT element */
        "object": "d",
        /** VIDEO element */
        "video": "e",
        /** AUDIO element */
        "audio": "f",
        /** SOURCE element */
        "source": "g",
        /** TRACK element */
        "track": "h",
        /** EMBED element */
        "embed": "i",
        /** EventSource */
        "eventsource": "j",
        /** Early Hints */
        "early-hints": "k",
        /** HTML <a> ping Attribute */
        "ping": "l",
        /** CSS font at-rule */
        "font": "m"
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
        "scriptAsync": 0x1,
        "scriptDefer": 0x2,
        "scriptBody": 0x4
    };

    /**
     * These are the only `rel` types that might be reference-able from
     * ResourceTiming.
     *
     * https://html.spec.whatwg.org/multipage/links.html#linkTypes
     *
     * @enum {number}
     */
    ResourceTimingDecompression.REL_TYPES = {
        "prefetch": 1,
        "preload": 2,
        "prerender": 3,
        "stylesheet": 4
    };

    /**
     * Known Content-Types.
     *
     * May be appended if the page encounters new ones.
     *
     * @enum {number}
     */
    ResourceTimingDecompression.CONTENT_TYPES = {
        "application/json": 0,
        "application/xml": 1,
        "font/woff": 2,
        "font/woff2": 3,
        "image/avif": 4,
        "image/gif": 5,
        "image/jpeg": 6,
        "image/png": 7,
        "image/svg+xml": 8,
        "image/webp": 9,
        "image/x-icon": 10,
        "text/css": 11,
        "text/html": 12,
        "text/javascript": 13,
        "text/plain": 14,
    };

    /**
     * Known Next Hop Protocols.
     *
     * May be appended if the page encounters new ones.
     *
     * @enum {number}
     */
    ResourceTimingDecompression.NEXT_HOP_PROTOCOLS = {
        "h2": 0,
        "h0.9": 1,
        "h1.0": 2,
        "h1.1": 3,
        "h2c": 4,
        "h3": 5
    };

    /**
     * Known Delivery Types.
     *
     * May be appended if the page encounters new ones.
     *
     * @enum {number}
     */
    ResourceTimingDecompression.DELIVERY_TYPES = {
        "cache": 0,
        "navigational-prefetch": 1
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
            if (Object.prototype.hasOwnProperty.call(origMap, key)) {
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

    /**
     * Reverse link rel attribute map
     */
    ResourceTimingDecompression.REV_REL_TYPES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.REL_TYPES);

    /**
     * Reverse Next Hop Protocol Map
     */
    ResourceTimingDecompression.REV_NEXT_HOP_PROTOCOLS = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.NEXT_HOP_PROTOCOLS);

    /**
     * Reverse Content-Type map
     */
    ResourceTimingDecompression.REV_CONTENT_TYPES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.CONTENT_TYPES);

    /**
     * Reverse Next Hop Protocol Map
     */
    ResourceTimingDecompression.REV_DELIVERY_TYPES = ResourceTimingDecompression.
        getRevMap(ResourceTimingDecompression.DELIVERY_TYPES);

    //
    // Special Datas
    //

    // Any ResourceTiming data time that starts with this character is not a time,
    // but something else (like dimension data)
    ResourceTimingDecompression.SPECIAL_DATA_PREFIX = "*";

    // Dimension data
    ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_TYPE = "0";
    ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_PREFIX = ResourceTimingDecompression.SPECIAL_DATA_PREFIX +
        ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_TYPE;

    // Size data
    ResourceTimingDecompression.SPECIAL_DATA_SIZE_TYPE = "1";

    // Script attributes
    ResourceTimingDecompression.SPECIAL_DATA_SCRIPT_TYPE = "2";

    // ServerTiming data: .serverTiming field
    ResourceTimingDecompression.SPECIAL_DATA_SERVERTIMING_TYPE = "3";

    // Link attributes
    ResourceTimingDecompression.SPECIAL_DATA_LINK_ATTR_TYPE = "4";

    // Namespaced data
    ResourceTimingDecompression.SPECIAL_DATA_NAMESPACED_TYPE = "5";

    // Service worker type: .workerStart field
    ResourceTimingDecompression.SPECIAL_DATA_SERVICE_WORKER_TYPE = "6";

    // Next Hop Protocol: .nextHopProtocol field
    ResourceTimingDecompression.SPECIAL_DATA_PROTOCOL = "7";

    // Content-Type .contentType field
    ResourceTimingDecompression.SPECIAL_DATA_CONTENT_TYPE = "8";

    // Delivery Type: .deliveryType field
    ResourceTimingDecompression.SPECIAL_DATA_DELIVERY_TYPE = "9";

    // Render Blocking Status: .renderBlockingStatus field
    ResourceTimingDecompression.SPECIAL_DATA_RENDER_BLOCKING_STATUS = "a";

    // Response Status: .responseStatus field
    ResourceTimingDecompression.SPECIAL_DATA_RESPONSE_STATUS = "b";

    // Regular Expression to parse a URL
    ResourceTimingDecompression.HOSTNAME_REGEX = /^(https?:\/\/)([^/]+)(.*)/;

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
            if (!Object.prototype.hasOwnProperty.call(rt, key)) {
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

                    if (resourceData.length > 0 &&
                        resourceData[0] === ResourceTimingDecompression.SPECIAL_DATA_PREFIX) {
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

    /**
     * Checks that the input contains dimension information.
     *
     * @param {string} resourceData The string we want to check.
     *
     * @returns {boolean} True if resourceData starts with SPECIAL_DATA_DIMENSION_PREFIX, false otherwise.
     */
    ResourceTimingDecompression.isDimensionData = function(resourceData) {
        return resourceData &&
            resourceData.substring(0, ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_PREFIX.length)
                === ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_PREFIX;
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
        resourceData = resourceData.substring(ResourceTimingDecompression.SPECIAL_DATA_DIMENSION_PREFIX.length);

        dimensions = resourceData.split(",");

        // The data should contain at least height/width.
        if (dimensions.length < 2) {
            return dimensionData;
        }

        // If x is 0, and the last dimension, then it will be excluded, so initialize to 0
        // If x & y are 0, and the last dimensions, then both will be excluded, so initialize to 0
        dimensionData.y = 0;
        dimensionData.x = 0;

        // Base 36 decode and assign to correct keys of dimensionData.
        for (i = 0; i < dimensions.length; i++) {
            if (dimensions[i] === "") {
                dimensionData[this.REV_DIMENSION_NAMES[i]] = 0;
            } else {
                dimensionData[this.REV_DIMENSION_NAMES[i]] = parseInt(dimensions[i], 36);
            }
        }

        // If naturalHeight and naturalWidth are missing, then they are the same as height and width
        if (!Object.prototype.hasOwnProperty.call(dimensionData, "naturalHeight")) {
            dimensionData.naturalHeight = dimensionData.height;
        }
        if (!Object.prototype.hasOwnProperty.call(dimensionData, "naturalWidth")) {
            dimensionData.naturalWidth = dimensionData.width;
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
            if (Object.prototype.hasOwnProperty.call(this.DIMENSION_NAMES, key) &&
                Object.prototype.hasOwnProperty.call(dimensionData, key)) {
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
        var low = this.searchSortedFirst(cells, { ts: startTime }, getTs);
        var up = this.searchSortedLast(cells, { ts: responseEnd }, getTs);

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
        if (Object.prototype.hasOwnProperty.call(this.REV_INITIATOR_TYPES, index)) {
            return this.REV_INITIATOR_TYPES[index];
        }

        return "other";
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

        if (ResourceTimingDecompression.HOSTNAMES_REVERSED) {
            url = ResourceTimingDecompression.reverseHostname(url);
        }

        var initiatorType = isNaN(parseInt(data[0], 10)) ? data[0] : parseInt(data[0], 10);
        data = data.length > 1 ? data.split(ResourceTimingDecompression.SPECIAL_DATA_PREFIX) : [];
        var timings = data.length > 0 && data[0].length > 1 ? data[0].substring(1).split(",") : [];
        var specialData = data.length > 1 ? data.slice(1) : [];

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
        // NOTE: This may be later modified by Service Worker special data, which has the real timestamp if needed
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
        for (i = 0; i < specialData.length; i++) {
            this.decompressSpecialData(specialData[i], res, st);
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
            if (Object.prototype.hasOwnProperty.call(this.SCRIPT_ATTRIBUTES, key)) {
                resource[key] = (data & this.SCRIPT_ATTRIBUTES[key]) === this.SCRIPT_ATTRIBUTES[key];
            }
        }

        return resource;
    };

    /**
     * Decompresses link attributes
     *
     * @param {string} compressed String with a single integer.
     * @param {ResourceTiming} resource ResourceTiming object.
     * @returns {ResourceTiming} ResourceTiming object with decompressed link attribute type.
     */
    ResourceTimingDecompression.decompressLinkAttrType = function(compressed, resource) {
        var data = parseInt(compressed, 10);

        if (!resource) {
            resource = {};
        }

        if (Object.prototype.hasOwnProperty.call(this.REV_REL_TYPES, data)) {
            resource.rel = this.REV_REL_TYPES[data];
        }

        return resource;
    };

    /**
     * Decompresses size information back into the specified resource
     *
     * @param {string} compressed Compressed string
     * @param {ResourceTiming} resource ResourceTiming object
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
     * Decompresses namespaced data back into the specified resource
     *
     * @param {string} compressed Compressed string
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with namespaced data
     */
    ResourceTimingDecompression.decompressNamespacedData = function(compressed, resource) {
        resource = resource || {};

        if (typeof compressed === "string") {
            var delimiter = ":";
            var colon = compressed.indexOf(delimiter);
            if (colon > 0) {
                var key = compressed.substring(0, colon);
                var value = compressed.substring(colon + delimiter.length);

                resource._data = resource._data || {};
                if (Object.prototype.hasOwnProperty.call(resource._data, key)) {
                    // we are adding our 2nd or nth value (n > 2) for this key
                    if (!Array.isArray(resource._data[key])) {
                        // we are adding our 2nd value for this key, convert to array before pushing
                        resource._data[key] = [resource._data[key]];
                    }

                    // push it onto the array
                    resource._data[key].push(value);
                } else {
                    // we are adding our 1st value for this key
                    resource._data[key] = value;
                }
            }
        }

        return resource;
    };

    /**
     * Decompresses service worker data
     *
     * @param {string} compressed Compressed string
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with decompressed special data
     */
    ResourceTimingDecompression.decompressServiceWorkerData = function(compressed, resource) {
        resource = resource || {};

        if (typeof compressed === "string") {
            var splitCompressed = compressed.split(",");

            var offset = parseInt(splitCompressed[0], 36);
            resource.workerStart = resource.startTime + offset;

            // if fetchStart is set, also use that instead of the inferred startTime/redirectEnd
            if (splitCompressed[1]) {
                resource.fetchStart = resource.startTime + parseInt(splitCompressed[1], 36);
            }
        }

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

        if (dataType === ResourceTimingDecompression.SPECIAL_DATA_SIZE_TYPE) {
            resource = this.decompressSize(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_SCRIPT_TYPE) {
            resource = this.decompressScriptType(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_SERVERTIMING_TYPE) {
            resource = this.decompressServerTimingEntries(st, compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_LINK_ATTR_TYPE) {
            resource = this.decompressLinkAttrType(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_NAMESPACED_TYPE) {
            resource = this.decompressNamespacedData(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_SERVICE_WORKER_TYPE) {
            resource = this.decompressServiceWorkerData(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_PROTOCOL) {
            resource = this.decompressNextHopProtocol(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_CONTENT_TYPE) {
            resource = this.decompressContentType(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_DELIVERY_TYPE) {
            resource = this.decompressDeliveryType(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_RENDER_BLOCKING_STATUS) {
            resource = this.decompressRenderBlockingStatus(compressed, resource);
        } else if (dataType === ResourceTimingDecompression.SPECIAL_DATA_RESPONSE_STATUS) {
            resource = this.decompressResponseStatus(compressed, resource);
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
        return url.replace(ResourceTimingDecompression.HOSTNAME_REGEX, function(m, p1, p2, p3) {
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
     * Decompress a list of compressed server timing entries for a resource
     *
     * @param {array} lookup server timing entries lookup
     * @param {string} compressedList server timing entries for a resource
     * @param {ResourceTiming} resource ResourceTiming object.
     * @returns {ResourceTiming} ResourceTiming object with decompressed server timing entries.
     */
    ResourceTimingDecompression.decompressServerTimingEntries = function(lookup, compressedList, resource) {
        if (typeof resource === "undefined") {
            resource = {};
        }

        if (lookup && compressedList) {
            resource.serverTiming = compressedList.split(",").map(function(compressedEntry) {
                return this.decompressServerTiming(lookup, compressedEntry);
            }, this);
        }
        return resource;
    };

    /**
     * Decompress a compressed server timing entry for a resource
     *
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

    /**
     * Decompress a nextHopProtocol value
     *
     * @param {string} compressed Compressed nextHopProtocol key
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with nextHopProtocol set
     */
    ResourceTimingDecompression.decompressNextHopProtocol = function(compressed, resource) {
        resource = resource || {};

        if (compressed && compressed.length >= 2) {
            // initial version, where the full protocol was sent
            if (compressed.substr(0, 2) === "h0") {
                resource.nextHopProtocol = compressed.replace(/^h0/, "http/0");
            } else if (compressed.substr(0, 2) === "h1") {
                resource.nextHopProtocol = compressed.replace(/^h1/, "http/1");
            } else {
                resource.nextHopProtocol = compressed;
            }
        } else {
            var compressedVal = parseInt(compressed || 0, 36);
            resource.nextHopProtocol = this.REV_NEXT_HOP_PROTOCOLS[compressedVal];
        }

        return resource;
    };

    /**
     * Decompress a contentType value
     *
     * @param {string} compressed Compressed contentType key
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with contentType set
     */
    ResourceTimingDecompression.decompressContentType = function(compressed, resource) {
        resource = resource || {};

        var compressedVal = parseInt(compressed || 0, 36);
        resource.contentType = this.REV_CONTENT_TYPES[compressedVal];
        return resource;
    };

    /**
     * Decompress a deliveryType value
     *
     * @param {string} compressed Compressed deliveryType key
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with deliveryType set
     */
    ResourceTimingDecompression.decompressDeliveryType = function(compressed, resource) {
        resource = resource || {};

        var compressedVal = parseInt(compressed || 0, 36);
        resource.deliveryType = this.REV_DELIVERY_TYPES[compressedVal];
        return resource;
    };

    /**
     * Decompress a renderBlockingStatus value
     *
     * @param {string} compressed Compressed renderBlockingStatus key
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with renderBlockingStatus set
     */
    ResourceTimingDecompression.decompressRenderBlockingStatus = function(compressed, resource) {
        resource = resource || {};

        // existence means blocking
        resource.renderBlockingStatus = "blocking";
        return resource;
    };

    /**
     * Decompress a responseStatus value
     *
     * @param {string} compressed Compressed responseStatus key
     * @param {ResourceTiming} resource ResourceTiming object
     * @returns {ResourceTiming} ResourceTiming object with responseStatus set
     */
    ResourceTimingDecompression.decompressResponseStatus = function(compressed, resource) {
        resource = resource || {};

        resource.responseStatus = compressed ? parseInt(compressed, 36) : 200;
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
