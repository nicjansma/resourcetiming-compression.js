//
// resourcetiming-compression.js
//
// Compresses ResourceTiming data.
//
// See http://nicj.net/compressing-resourcetiming/
//
// https://github.com/nicjansma/resourcetiming-compression.js
//
(function(window) {
    "use strict";

    // save old ResourceTimingCompression object for noConflict()
    var root;
    var previousObj;
    if (typeof window !== "undefined") {
        root = window;
        previousObj = root.ResourceTimingCompression;
    }

    // model
    var ResourceTimingCompression = {};

    //
    // Functions
    //
    /**
     * Changes the value of ResourceTimingCompression back to its original value, returning
     * a reference to the ResourceTimingCompression object.
     *
     * @returns {object} Original ResourceTimingCompression object
     */
    ResourceTimingCompression.noConflict = function() {
        root.ResourceTimingCompression = previousObj;
        return ResourceTimingCompression;
    };

    /**
     * Should hostnames in the compressed trie be reversed or not
     */
    ResourceTimingCompression.HOSTNAMES_REVERSED = true;

    /**
     * Initiator type map
     */
    ResourceTimingCompression.INITIATOR_TYPES = {
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

    // Words that will be broken (by ensuring the optimized trie doesn't contain
    // the whole string) in URLs, to ensure NoScript doesn't think this is an XSS attack
    var DEFAULT_XSS_BREAK_WORDS = [
        /(h)(ref)/gi,
        /(s)(rc)/gi,
        /(a)(ction)/gi
    ];

    // Delimiter to use to break a XSS word
    var XSS_BREAK_DELIM = "\n";

    // Maximum number of characters in a URL
    var DEFAULT_URL_LIMIT = 500;

    // Any ResourceTiming data time that starts with this character is not a time,
    // but something else (like dimension data)
    var SPECIAL_DATA_PREFIX = "*";

    // Dimension data special type
    var SPECIAL_DATA_DIMENSION_TYPE = "0";

    // Dimension data special type
    var SPECIAL_DATA_SIZE_TYPE = "1";

    // Dimension data special type
    var SPECIAL_DATA_SERVERTIMING_TYPE = "3";

    // Regular Expression to parse a URL
    var HOSTNAME_REGEX = /^(https?:\/\/)([^\/]+)(.*)/;

    /**
     * List of URLs (strings or regexs) to trim
     */
    ResourceTimingCompression.trimUrls = [];

    /**
     * Words to break to avoid XSS filters
     */
    ResourceTimingCompression.xssBreakWords = DEFAULT_XSS_BREAK_WORDS;

    /**
     * Converts entries to a Trie:
     * http://en.wikipedia.org/wiki/Trie
     *
     * Assumptions:
     * 1) All entries have unique keys
     * 2) Keys cannot have "|" in their name.
     * 3) All key's values are strings
     *
     * Leaf nodes in the tree are the key's values.
     *
     * If key A is a prefix to key B, key A will be suffixed with "|"
     *
     * @param {object} entries Performance entries
     * @returns {object} A trie
     */
    ResourceTimingCompression.convertToTrie = function(entries) {
        var trie = {}, url, urlFixed, i, value, letters, letter, cur, node;

        for (url in entries) {
            if (!entries.hasOwnProperty(url)) {
                continue;
            }

            urlFixed = url;

            // find any strings to break
            for (i = 0; i < this.xssBreakWords.length; i++) {
                // Add a XSS_BREAK_DELIM character after the first letter.  optimizeTrie will
                // ensure this sequence doesn't get combined.
                urlFixed = urlFixed.replace(this.xssBreakWords[i], "$1" + XSS_BREAK_DELIM + "$2");
            }

            if (!entries.hasOwnProperty(url)) {
                continue;
            }

            value = entries[url];
            letters = urlFixed.split("");
            cur = trie;

            for (i = 0; i < letters.length; i++) {
                letter = letters[i];
                node = cur[letter];

                if (typeof node === "undefined") {
                    // nothing exists yet, create either a leaf if this is the end of the word,
                    // or a branch if there are letters to go
                    cur = cur[letter] = (i === (letters.length - 1) ? value : {});
                } else if (typeof node === "string") {
                    // this is a leaf, but we need to go further, so convert it into a branch
                    cur = cur[letter] = { "|": node };
                } else if (i === (letters.length - 1)) {
                    // this is the end of our key, and we've hit an existing node.  Add our timings.
                    cur[letter]["|"] = value;
                } else {
                    // continue onwards
                    cur = cur[letter];
                }
            }
        }

        return trie;
    };

    /**
     * Optimize the Trie by combining branches with no leaf
     *
     * @param {object} cur Current Trie branch
     * @param {boolean} top Whether or not this is the root node
     *
     * @returns {object} Optimized Trie
     */
    ResourceTimingCompression.optimizeTrie = function(cur, top) {
        var num = 0, node, ret, topNode;

        // capture trie keys first as we'll be modifying it
        var keys = [];

        for (node in cur) {
            if (cur.hasOwnProperty(node)) {
                keys.push(node);
            }
        }

        for (var i = 0; i < keys.length; i++) {
            node = keys[i];
            if (typeof cur[node] === "object") {
                // optimize children
                ret = this.optimizeTrie(cur[node], false);
                if (ret) {
                    // swap the current leaf with compressed one
                    delete cur[node];

                    if (node === XSS_BREAK_DELIM) {
                        // If this node is a newline, which can't be in a regular URL,
                        // it's due to the XSS patch.  Remove the placeholder character,
                        // and make sure this node isn't compressed by incrementing
                        // num to be greater than one.
                        node = ret.name;
                        num++;
                    } else {
                        node = node + ret.name;
                    }
                    cur[node] = ret.value;
                }
            }
            num++;
        }

        if (num === 1) {
            // compress single leafs
            if (top) {
                // top node gets special treatment so we're not left with a {node:,value:} at top
                topNode = {};
                topNode[node] = cur[node];
                return topNode;
            }

            // other nodes we return name and value separately
            return { name: node, value: cur[node] };
        } else if (top) {
            // top node with more than 1 child, return it as-is
            return cur;
        }

        // more than two nodes and not the top, we can't compress any more
        return false;
    };

    /**
     * Trims the timing, returning an offset from the startTime in ms
     *
     * @param {number} time Time
     * @param {number} startTime Start time
     *
     * @returns {number} Number of ms from start time
     */
    ResourceTimingCompression.trimTiming = function(time, startTime) {
        if (typeof time !== "number") {
            time = 0;
        }

        if (typeof startTime !== "number") {
            startTime = 0;
        }

        // strip from microseconds to milliseconds only
        var timeMs = Math.round(time ? time : 0),
            startTimeMs = Math.round(startTime ? startTime : 0);

        return timeMs === 0 ? 0 : (timeMs - startTimeMs);
    };

    /**
     * Attempts to get the navigationStart time for a frame.
     *
     * @param {Frame} frame IFRAME
     *
     * @returns {number} navigationStart time, or 0 if not accessible
     */
    ResourceTimingCompression.getNavStartTime = function(frame) {
        /* eslint no-unused-vars: ["error", { "varsIgnorePattern": "frameLoc" }] */
        var navStart = 0, frameLoc;

        if (!frame) {
            return navStart;
        }

        try {
            // Try to access location.href first to trigger any Cross-Origin
            // warnings.  There's also a bug in Chrome ~48 that might cause
            // the browser to crash if accessing X-O frame.performance.
            // https://code.google.com/p/chromium/issues/detail?id=585871
            // This variable is not otherwise used.
            frameLoc = frame.location && frame.location.href;

            if (("performance" in frame) &&
            frame.performance &&
            frame.performance.timing &&
            frame.performance.timing.navigationStart) {
                navStart = frame.performance.timing.navigationStart;
            }
        } catch (e) {
            // swallow all access exceptions
        }

        return navStart;
    };

    /**
     * Gets all of the performance entries for a frame and its subframes
     *
     * @param {Frame} frame Frame
     * @param {boolean} isTopWindow This is the top window
     * @param {string} offset Offset in timing from root IFRA
     * @param {number} depth Recursion depth
     * @returns {PerformanceEntry[]} Performance entries
     */
    ResourceTimingCompression.findPerformanceEntriesForFrame = function(frame, isTopWindow, offset, depth) {
        var entries = [], i, navEntries, navStart, frameNavStart, frameOffset, navEntry, t, frameLoc, rtEntry;

        if (typeof isTopWindow === "undefined") {
            isTopWindow = true;
        }

        if (typeof offset === "undefined") {
            offset = 0;
        }

        if (typeof depth === "undefined") {
            depth = 0;
        }

        if (depth > 10) {
            return entries;
        }

        try {
            navStart = this.getNavStartTime(frame);

            // get sub-frames' entries first
            if (frame.frames) {
                for (i = 0; i < frame.frames.length; i++) {
                    frameNavStart = this.getNavStartTime(frame.frames[i]);
                    frameOffset = 0;
                    if (frameNavStart > navStart) {
                        frameOffset = offset + (frameNavStart - navStart);
                    }

                    entries = entries.concat(
                        this.findPerformanceEntriesForFrame(frame.frames[i], false, frameOffset, ++depth));
                }
            }

            try {
                // Try to access location.href first to trigger any Cross-Origin
                // warnings.  There's also a bug in Chrome ~48 that might cause
                // the browser to crash if accessing X-O frame.performance.
                // https://code.google.com/p/chromium/issues/detail?id=585871
                // This variable is not otherwise used.
                frameLoc = frame.location && frame.location.href;

                if (!("performance" in frame) ||
                    !frame.performance ||
                    !frame.performance.getEntriesByType) {
                    return entries;
                }
            } catch (e) {
                // NOP
                return entries;
            }

            // add an entry for the top page
            if (isTopWindow) {
                navEntries = frame.performance.getEntriesByType("navigation");
                if (navEntries && navEntries.length === 1) {
                    navEntry = navEntries[0];

                    // replace document with the actual URL
                    entries.push({
                        name: frame.location.href,
                        startTime: 0,
                        initiatorType: "html",
                        redirectStart: navEntry.redirectStart,
                        redirectEnd: navEntry.redirectEnd,
                        fetchStart: navEntry.fetchStart,
                        domainLookupStart: navEntry.domainLookupStart,
                        domainLookupEnd: navEntry.domainLookupEnd,
                        connectStart: navEntry.connectStart,
                        secureConnectionStart: navEntry.secureConnectionStart,
                        connectEnd: navEntry.connectEnd,
                        requestStart: navEntry.requestStart,
                        responseStart: navEntry.responseStart,
                        responseEnd: navEntry.responseEnd,
                        serverTiming: navEntry.serverTiming || []
                    });
                } else if (frame.performance.timing) {
                    // add a fake entry from the timing object
                    t = frame.performance.timing;

                    //
                    // Avoid browser bugs:
                    // 1. navigationStart being 0 in some cases
                    // 2. responseEnd being ~2x what navigationStart is
                    //    (ensure the end is within 60 minutes of start)
                    //
                    if (t.navigationStart !== 0 &&
                        t.responseEnd <= (t.navigationStart + (60 * 60 * 1000))) {
                        entries.push({
                            name: frame.location.href,
                            startTime: 0,
                            initiatorType: "html",
                            redirectStart: t.redirectStart ? (t.redirectStart - t.navigationStart) : 0,
                            redirectEnd: t.redirectEnd ? (t.redirectEnd - t.navigationStart) : 0,
                            fetchStart: t.fetchStart ? (t.fetchStart - t.navigationStart) : 0,
                            domainLookupStart: t.domainLookupStart ? (t.domainLookupStart - t.navigationStart) : 0,
                            domainLookupEnd: t.domainLookupEnd ? (t.domainLookupEnd - t.navigationStart) : 0,
                            connectStart: t.connectStart ? (t.connectStart - t.navigationStart) : 0,
                            secureConnectionStart: t.secureConnectionStart ?
                                (t.secureConnectionStart - t.navigationStart) :
                                0,
                            connectEnd: t.connectEnd ? (t.connectEnd - t.navigationStart) : 0,
                            requestStart: t.requestStart ? (t.requestStart - t.navigationStart) : 0,
                            responseStart: t.responseStart ? (t.responseStart - t.navigationStart) : 0,
                            responseEnd: t.responseEnd ? (t.responseEnd - t.navigationStart) : 0
                        });
                    }
                }
            }

            // offset all of the entries by the specified offset for this frame
            var frameEntries = frame.performance.getEntriesByType("resource");
            var frameFixedEntries = [];

            for (i = 0; frameEntries && i < frameEntries.length; i++) {
                t = frameEntries[i];
                rtEntry = {
                    name: t.name,
                    initiatorType: t.initiatorType,
                    startTime: t.startTime + offset,
                    redirectStart: t.redirectStart ? (t.redirectStart + offset) : 0,
                    redirectEnd: t.redirectEnd ? (t.redirectEnd + offset) : 0,
                    fetchStart: t.fetchStart ? (t.fetchStart + offset) : 0,
                    domainLookupStart: t.domainLookupStart ? (t.domainLookupStart + offset) : 0,
                    domainLookupEnd: t.domainLookupEnd ? (t.domainLookupEnd + offset) : 0,
                    connectStart: t.connectStart ? (t.connectStart + offset) : 0,
                    secureConnectionStart: t.secureConnectionStart ? (t.secureConnectionStart + offset) : 0,
                    connectEnd: t.connectEnd ? (t.connectEnd + offset) : 0,
                    requestStart: t.requestStart ? (t.requestStart + offset) : 0,
                    responseStart: t.responseStart ? (t.responseStart + offset) : 0,
                    responseEnd: t.responseEnd ? (t.responseEnd + offset) : 0
                };
                if (t.encodedBodySize || t.decodedBodySize || t.transferSize) {
                    rtEntry.encodedBodySize = t.encodedBodySize;
                    rtEntry.decodedBodySize = t.decodedBodySize;
                    rtEntry.transferSize = t.transferSize;
                }
                if (t.serverTiming && t.serverTiming.length) {
                    rtEntry.serverTiming = t.serverTiming;
                }
                frameFixedEntries.push(rtEntry);
            }

            entries = entries.concat(frameFixedEntries);
        } catch (e) {
            return entries;
        }

        return entries;
    };

    /**
     * Converts a number to base-36.
     *
     * If not a number or a string, or === 0, return "". This is to facilitate
     * compression in the timing array, where "blanks" or 0s show as a series
     * of trailing ",,,," that can be trimmed.
     *
     * If a string, return a string.
     *
     * @param {number} n Number
     * @returns {string} Base-36 number, empty string, or string
     */
    ResourceTimingCompression.toBase36 = function(n) {
        if (typeof n === "number" && n !== 0) {
            return n.toString(36);
        }

        return typeof n === "string" ? n : "";
    };

    /**
     * Finds all remote resources in the selected window that are visible, and returns an object
     * keyed by the url with an array of height,width,top,left as the value
     *
     * @param {Window} win Window to search
     * @returns {Object} Object with URLs of visible assets as keys, and Array[height, width, top, left] as value
     */
    ResourceTimingCompression.getVisibleEntries = function(win) {
        // lower-case tag names should be used:
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
        var els = ["img", "iframe", "image"], entries = {}, x, y, doc = win.document, a = doc.createElement("A");

        // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
        x = (win.pageXOffset !== undefined)
            ? win.pageXOffset
            : (doc.documentElement || doc.body.parentNode || doc.body).scrollLeft;

        y = (win.pageYOffset !== undefined)
            ? win.pageYOffset
            : (doc.documentElement || doc.body.parentNode || doc.body).scrollTop;

        // look at each IMG and IFRAME
        els.forEach(function(elname) {
            var elements = doc.getElementsByTagName(elname), el, i, rect, src;

            for (i = 0; i < elements.length; i++) {
                el = elements[i];

                // look at this element if it has a src attribute, and we haven't already looked at it
                if (el) {
                    // src = IMG, IFRAME
                    // xlink:href = svg:IMAGE
                    src = el.currentSrc || el.src || el.getAttribute("src") || el.getAttribute("xlink:href");

                    // change src to be relative
                    a.href = src;
                    src = a.href;

                    if (src && !entries[src]) {
                        rect = el.getBoundingClientRect();

                        // Require both height & width to be non-zero
                        // IE <= 8 does not report rect.height/rect.width so we need offsetHeight & width
                        if ((rect.height || el.offsetHeight)
                            && (rect.width || el.offsetWidth)) {
                            entries[src] = [
                                (rect.height || el.offsetHeight),
                                (rect.width || el.offsetWidth),
                                Math.round(rect.top + y),
                                Math.round(rect.left + x),
                            ];

                            // If this is an image, it has a naturalHeight & naturalWidth
                            // if these are different from its display height and width, we should report that
                            // because it indicates scaling in HTML
                            // If the image came from a srcset, then the naturalHeight/Width will be density corrected.
                            // We get the actual physical dimensions by assigning the image to an uncorrected Image
                            // object.
                            // This should load from in-memory cache, so there should be no extra load.
                            var realImg = new Image();
                            realImg.onload = function() {
                                if (
                                    (realImg.naturalHeight || realImg.naturalWidth)
                                    &&
                                    (
                                        entries[src][0] !== realImg.naturalHeight
                                        ||
                                        entries[src][1] !== realImg.naturalWidth
                                    )
                                ) {
                                    entries[src].push(realImg.naturalHeight, realImg.naturalWidth);
                                }
                            };
                            realImg.src = el.src;

                        }
                    }
                }
            }
        });

        return entries;
    };

    /**
     * Determines if the value is in the specified array
     *
     * @param {object} val Value
     * @param {object[]} ary Array
     *
     * @returns {boolean} True if the value is in the array
     */
    ResourceTimingCompression.inArray = function(val, ary) {
        var i;

        if (typeof val === "undefined" || typeof ary === "undefined" || !ary.length) {
            return false;
        }

        for (i = 0; i < ary.length; i++) {
            if (ary[i] === val) {
                return true;
            }
        }

        return false;
    };

    /**
     * Gathers a filtered list of performance entries.
     * @param {Window} win The Window
     * @param {number} from Only get timings from
     * @param {number} to Only get timings up to
     * @param {string[]} initiatorTypes Array of initiator types
     * @returns {ResourceTiming[]} Matching ResourceTiming entries
     */
    ResourceTimingCompression.getFilteredResourceTiming = function(win, from, to, initiatorTypes) {
        var entries = this.findPerformanceEntriesForFrame(win, true, 0, 0),
            i, e,
            navStart = this.getNavStartTime(win), countCollector = {};

        if (!entries || !entries.length) {
            return {
                entries: []
            };
        }

        var filteredEntries = [];
        for (i = 0; i < entries.length; i++) {
            e = entries[i];

            // skip non-resource URLs
            if (e.name.indexOf("about:") === 0 ||
                e.name.indexOf("javascript:") === 0) {
                continue;
            }

            // TODO: skip URLs we don't want to report

            // if the user specified a "from" time, skip resources that started before then
            if (from && (navStart + e.startTime) < from) {
                continue;
            }

            // if we were given a final timestamp, don't add any resources that started after it
            if (to && (navStart + e.startTime) > to) {
                // We can also break at this point since the array is time sorted
                break;
            }

            // if given an array of initiatorTypes to include, skip anything else
            if (typeof initiatorTypes !== "undefined" && initiatorTypes !== "*" && initiatorTypes.length) {
                if (!e.initiatorType || !this.inArray(e.initiatorType, initiatorTypes)) {
                    continue;
                }
            }

            ResourceTimingCompression.accumulateServerTimingEntries(countCollector, e.serverTiming);
            filteredEntries.push(e);
        }

        var lookup = ResourceTimingCompression.compressServerTiming(countCollector);
        return {
            entries: filteredEntries,
            serverTiming: {
                lookup: lookup,
                indexed: ResourceTimingCompression.indexServerTiming(lookup)
            }
        };
    };

    /**
     * Gets compressed content and transfer size information, if available
     *
     * @param {ResourceTiming} resource ResourceTiming object
     *
     * @returns {string} Compressed data (or empty string, if not available)
     */
    ResourceTimingCompression.compressSize = function(resource) {
        var sTrans, sEnc, sDec, sizes;

        // check to see if we can add content sizes
        if (resource.encodedBodySize ||
            resource.decodedBodySize ||
            resource.transferSize) {
            //
            // transferSize: the size of the fetched resource ("over the wire"), including the response header fields
            // and the response payload body. It can be 0 in the case of X-O, or if it was fetched from a cache.
            //
            // encodedBodySize: the size of the response payload body after applying encoding (e.g. gzipped size).  It
            // is 0 if X-O.
            //
            // decodedBodySize: the size of response payload body after removing encoding (e.g. the original content
            // size). It is 0 if X-O.
            //
            // Here are the possible combinations of values: [encodedBodySize, transferSize, decodedBodySize]
            //
            // Cross-Origin resources w/out Timing-Allow-Origin set: [0, 0, 0] -> [0, 0, 0] -> [empty]
            // 204: [0, t, 0] -> [0, t, 0] -> [e, t-e] -> [, t]
            // 304: [e, t: t <=> e, d: d>=e] -> [e, t-e, d-e]
            // 200 non-gzipped: [e, t: t>=e, d: d=e] -> [e, t-e]
            // 200 gzipped: [e, t: t>=e, d: d>=e] -> [e, t-e, d-e]
            // retrieved from cache non-gzipped: [e, 0, d: d=e] -> [e]
            // retrieved from cache gzipped: [e, 0, d: d>=e] -> [e, _, d-e]
            //
            sTrans = resource.transferSize;
            sEnc = resource.encodedBodySize;
            sDec = resource.decodedBodySize;

            // convert to an array
            sizes = [
                sEnc,
                sTrans ? sTrans - sEnc : "_",
                sDec - sEnc
            ];

            // change everything to base36 and remove any trailing ,s
            return sizes.map(this.toBase36).join(",").replace(/,+$/, "");
        }

        return "";
    };

    /**
     * Cleans up a URL by removing the query string (if configured), and
     * limits the URL to the specified size.
     *
     * @param {string} url URL to clean
     * @param {number} urlLimit Maximum size, in characters, of the URL
     *
     * @returns {string} Cleaned up URL
     */
    ResourceTimingCompression.cleanupURL = function(url, urlLimit) {
        var qsStart;

        if (!url || Object.prototype.toString.call(url) === "[object Array]") {
            return "";
        }

        if (typeof urlLimit !== "undefined" && url && url.length > urlLimit) {
            // We need to break this URL up.  Try at the query string first.
            qsStart = url.indexOf("?");
            if (qsStart !== -1 && qsStart < urlLimit) {
                url = url.substr(0, qsStart) + "?...";
            } else {
                // No query string, just stop at the limit
                url = url.substr(0, urlLimit - 3) + "...";
            }
        }

        return url;
    };

    /**
     * Trims the URL according to the specified URL trim patterns,
     * then applies a length limit.
     *
     * @param {string} url URL to trim
     * @param {string} urlsToTrim List of URLs (strings or regexs) to trim
     * @returns {string} Trimmed URL
     */
    ResourceTimingCompression.trimUrl = function(url, urlsToTrim) {
        var i, urlIdx, trim;

        if (url && urlsToTrim) {
            // trim the payload from any of the specified URLs
            for (i = 0; i < urlsToTrim.length; i++) {
                trim = urlsToTrim[i];

                if (typeof trim === "string") {
                    urlIdx = url.indexOf(trim);
                    if (urlIdx !== -1) {
                        url = url.substr(0, urlIdx + trim.length) + "...";
                        break;
                    }
                } else if (trim instanceof RegExp) {
                    if (trim.test(url)) {
                        // replace the URL with the first capture group
                        url = url.replace(trim, "$1") + "...";
                    }
                }
            }
        }

        // apply limits
        return this.cleanupURL(url, DEFAULT_URL_LIMIT);
    };

    /**
     * Gathers performance entries and compresses the result.
     * @param {Window} [win] The Window
     * @param {number} [from] Only get timings from
     * @param {number} [to] Only get timings up to
     * @returns {object} Optimized performance entries trie
     */
    ResourceTimingCompression.getResourceTiming = function(win, from, to) {
        /* eslint no-script-url:0 */
        if (typeof win === "undefined") {
            win = window;
        }

        var ret = ResourceTimingCompression.getFilteredResourceTiming(win, from, to);
        var entries = ret.entries, serverTiming = ret.serverTiming;

        if (!entries || !entries.length) {
            return {};
        }

        return ResourceTimingCompression.compressResourceTiming(win, entries, serverTiming);
    };

    /**
     * Optimizes the specified set of performance entries.
     * @param {Window} win The Window
     * @param {object} entries Performance entries
     * @param {object} serverTiming object containing `lookup` and `indexed`
     * @returns {object} Optimized performance entries trie
     */
    ResourceTimingCompression.compressResourceTiming = function(win, entries, serverTiming) {
        /* eslint no-script-url:0 */
        var i, e, results = {}, initiatorType, url, data, visibleEntries = {};

        // gather visible entries on the page
        visibleEntries = this.getVisibleEntries(win);

        for (i = 0; i < entries.length; i++) {
            e = entries[i];

            //
            // Compress the RT data into a string:
            //
            // 1. Start with the initiator type, which is mapped to a number.
            // 2. Put the timestamps into an array in a set order (reverse chronological order),
            //    which pushes timestamps that are more likely to be zero (duration since
            //    startTime) towards the end of the array (eg redirect* and domainLookup*).
            // 3. Convert these timestamps to Base36, with empty or zero times being an empty string
            // 4. Join the array on commas
            // 5. Trim all trailing empty commas (eg ",,,")
            //

            // prefix initiatorType to the string
            initiatorType = this.INITIATOR_TYPES[e.initiatorType];
            if (typeof initiatorType === "undefined") {
                initiatorType = 0;
            }

            data = initiatorType + [
                this.trimTiming(e.startTime, 0),
                this.trimTiming(e.responseEnd, e.startTime),
                this.trimTiming(e.responseStart, e.startTime),
                this.trimTiming(e.requestStart, e.startTime),
                this.trimTiming(e.connectEnd, e.startTime),
                this.trimTiming(e.secureConnectionStart, e.startTime),
                this.trimTiming(e.connectStart, e.startTime),
                this.trimTiming(e.domainLookupEnd, e.startTime),
                this.trimTiming(e.domainLookupStart, e.startTime),
                this.trimTiming(e.redirectEnd, e.startTime),
                this.trimTiming(e.redirectStart, e.startTime)
            ].map(this.toBase36).join(",").replace(/,+$/, "");

            // add content and transfer size info
            var compSize = this.compressSize(e);
            if (compSize !== "") {
                data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_SIZE_TYPE + compSize;
            }

            if (e.serverTiming && e.serverTiming.length) {
                data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_SERVERTIMING_TYPE +
                e.serverTiming.reduce(function(stData, entry, entryIndex) { /* eslint no-loop-func:0 */
                    var duration = String(entry.duration);
                    if (duration.substring(0, 2) === "0.") {
                    // lop off the leading 0
                        duration = duration.substring(1);
                    }
                    var lookupKey = ResourceTimingCompression.identifyServerTimingEntry(
                      serverTiming.indexed[entry.name].index,
                      serverTiming.indexed[entry.name].descriptions[entry.description]);
                    stData += (entryIndex > 0 ? "," : "") + duration + lookupKey;
                    return stData;
                }, "");
            }

            url = this.trimUrl(e.name, this.trimUrls);
            if (ResourceTimingCompression.HOSTNAMES_REVERSED) {
                url = this.reverseHostname(url);
            }

            // if this entry already exists, add a pipe as a separator
            if (results[url] !== undefined) {
                results[url] += "|" + data;
            } else if (visibleEntries[url] !== undefined) {
                // For the first time we see this URL, add resource dimensions if we have them
                // We use * as an additional separator to indicate it is not a new resource entry
                // The following characters will not be URL encoded:
                // *!-.()~_ but - and . are special to number representation so we don't use them
                // After the *, the type of special data (ResourceTiming = 0) is added
                results[url] =
                    SPECIAL_DATA_PREFIX +
                    SPECIAL_DATA_DIMENSION_TYPE +
                    visibleEntries[url].map(this.toBase36).join(",").replace(/,+$/, "")
                    + "|"
                    + data;
            } else {
                results[url] = data;
            }
        }

        return {
            restiming: this.optimizeTrie(this.convertToTrie(results), true),
            servertiming: serverTiming.lookup
        };
    };

    /**
     * Reverse the hostname portion of a URL
     *
     * @param {string} url a fully-qualified URL
     * @returns {string} the input URL with the hostname portion reversed, if it can be found
     */
    ResourceTimingCompression.reverseHostname = function(url) {
        return url.replace(HOSTNAME_REGEX, function(m, p1, p2, p3) {
            // p2 is everything after the first `://` and before the next `/`
            // which includes `<username>:<password>@` and `:<port-number>`, if present
            return p1 + ResourceTimingCompression.reverseString(p2) + p3;
        });
    };

    /**
     * Reverse a string
     *
     * @param {string} i a string
     * @returns {string} the reversed string
     */
    ResourceTimingCompression.reverseString = function(i) {
        var l = i.length, o = "";
        while (l--) {
            o += i[l];
        }
        return o;
    };

    /**
     * Given an array of server timing entries (from the resource timing entry),
     * [initialize and] increment our count collector of the following format: {
     *   "metric-one": {
     *     count: 3,
     *     counts: {
     *       "description-one": 2,
     *       "description-two": 1,
     *     }
     *   }
     * }
     *
     * @param {Object} countCollector Per-beacon collection of counts
     * @param {Array} serverTimingEntries Server Timing Entries from a Resource Timing Entry
     */
    ResourceTimingCompression.accumulateServerTimingEntries = function(countCollector, serverTimingEntries) {
        (serverTimingEntries || []).forEach(function(entry) {
            if (typeof countCollector[entry.name] === "undefined") {
                countCollector[entry.name] = {
                    count: 0,
                    counts: {}
                };
            }
            var metric = countCollector[entry.name];
            metric.counts[entry.description] = metric.counts[entry.description] || 0;
            metric.counts[entry.description]++;
            metric.count++;
        });
    };

    /**
     * Given our count collector of the format: {
     *   "metric-two": {
     *     count: 1,
     *     counts: {
     *       "description-three": 1,
     *     }
     *   },
     *   "metric-one": {
     *     count: 3,
     *     counts: {
     *       "description-one": 1,
     *       "description-two": 2,
     *     }
     *   }
     * }
     *
     * , return the lookup of the following format: [
     *   ["metric-one", "description-two", "description-one"],
     *   ["metric-two", "description-three"],
     * ]
     *
     * Note: The order of these arrays of arrays matters: there are more server timing entries with
     * name === "metric-one" than "metric-two", and more "metric-one"/"description-two" than
     * "metric-one"/"description-one".
     *
     * @param {Object} countCollector Per-beacon collection of counts
     * @returns {Array} compressed lookup array
     */
    ResourceTimingCompression.compressServerTiming = function(countCollector) {
        return Object.keys(countCollector).sort(function(metric1, metric2) {
            return countCollector[metric2].count - countCollector[metric1].count;
        }).reduce(function(array, name) {
            var sorted = Object.keys(countCollector[name].counts).sort(function(description1, description2) {
                return countCollector[name].counts[description2] -
            countCollector[name].counts[description1];
            });

      /* eslint no-inline-comments:0 */
            array.push(sorted.length === 1 && sorted[0] === "" ?
          name : // special case: no non-empty descriptions
          [name].concat(sorted));
            return array;
        }, []);
    };

    /**
     * Given our lookup of the format: [
     *   ["metric-one", "description-one", "description-two"],
     *   ["metric-two", "description-three"],
     * ]
     *
     * , create a O(1) name/description to index values lookup dictionary of the format: {
     *   metric-one: {
     *     index: 0,
     *     descriptions: {
     *       "description-one": 0,
     *       "description-two": 1,
     *     }
     *   }
     *   metric-two: {
     *     index: 1,
     *     descriptions: {
     *       "description-three": 0,
     *     }
     *   }
     * }
     *
     * @param {Array} lookup compressed lookup array
     * @returns {Object} indexed version of the compressed lookup array
     */
    ResourceTimingCompression.indexServerTiming = function(lookup) {
        return lookup.reduce(function(serverTimingIndex, compressedEntry, entryIndex) {
            var name, descriptions;
            if (Array.isArray(compressedEntry)) {
                name = compressedEntry[0];
                descriptions = compressedEntry.slice(1).reduce(
                    function(descriptionCollector, description, descriptionIndex) {
                        descriptionCollector[description] = descriptionIndex;
                        return descriptionCollector;
                    }, {});
            } else {
                name = compressedEntry;
                descriptions = {
                    "": 0
                };
            }

            serverTimingIndex[name] = {
                index: entryIndex,
                descriptions: descriptions
            };
            return serverTimingIndex;
        }, {});
    };

    /**
     * Given entryIndex and descriptionIndex, create the shorthand key into the lookup
     * response format is ":<entryIndex>.<descriptionIndex>"
     * either/both entryIndex or/and descriptionIndex can be omitted if equal to 0
     * the "." can be ommited if descriptionIndex is 0
     * the ":" can be ommited if entryIndex and descriptionIndex are 0
     *
     * @param {Integer} entryIndex index of the entry
     * @param {Integer} descriptionIndex index of the description
     * @returns {String} key into the compressed lookup
     */
    ResourceTimingCompression.identifyServerTimingEntry = function(entryIndex, descriptionIndex) {
        var s = "";
        if (entryIndex) {
            s += entryIndex;
        }
        if (descriptionIndex) {
            s += "." + descriptionIndex;
        }
        if (s.length) {
            s = ":" + s;
        }
        return s;
    };

    //
    // Export to the appropriate location
    //
    if (typeof define === "function" && define.amd) {
        //
        // AMD / RequireJS
        //
        define([], function() {
            return ResourceTimingCompression;
        });
    } else if (typeof module !== "undefined" && module.exports) {
        //
        // Node.js
        //
        module.exports = ResourceTimingCompression;
    } else if (typeof root !== "undefined") {
        //
        // Browser Global
        //
        root.ResourceTimingCompression = ResourceTimingCompression;
    }
}(typeof window !== "undefined" ? window : undefined));
