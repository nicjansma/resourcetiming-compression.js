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
    // Constants / Config
    //

    /**
     * Should hostnames in the compressed trie be reversed or not
     */
    ResourceTimingCompression.HOSTNAMES_REVERSED = true;

    /**
     * Initiator type map
     */
    ResourceTimingCompression.INITIATOR_TYPES = {
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
        "html": 6,
        /** IMAGE element inside a SVG */
        "image": 7,
        /** [sendBeacon]{@link https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon} */
        "beacon": 8,
        /** [Fetch API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API} */
        "fetch": 9,
        /** An IFRAME */
        "iframe": "a",
        /** IE11 and Edge (some versions) send "subdocument" instead of "iframe" */
        "subdocument": "a",
        /** BODY element */
        "body": "b",
        /** INPUT element */
        "input": "c",
        /** FRAME element */
        "frame": "a",
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
        /** The root HTML page itself */
        "navigation": 6,
        /** Early Hints */
        "early-hints": "k",
        /** HTML <a> ping Attribute */
        "ping": "l",
        /** CSS font at-rule */
        "font": "m"
    };

    // Words that will be broken (by ensuring the optimized trie doesn't contain
    // the whole string) in URLs, to ensure NoScript doesn't think this is an XSS attack
    ResourceTimingCompression.DEFAULT_XSS_BREAK_WORDS = [
        /(h)(ref)/gi,
        /(s)(rc)/gi,
        /(a)(ction)/gi
    ];

    // Delimiter to use to break a XSS word
    ResourceTimingCompression.XSS_BREAK_DELIM = "\n";

    // Maximum number of characters in a URL
    ResourceTimingCompression.DEFAULT_URL_LIMIT = 500;

    // Any ResourceTiming data time that starts with this character is not a time,
    // but something else (like dimension data)
    ResourceTimingCompression.SPECIAL_DATA_PREFIX = "*";

    // Dimension data
    ResourceTimingCompression.SPECIAL_DATA_DIMENSION_TYPE = "0";

    // Size data
    ResourceTimingCompression.SPECIAL_DATA_SIZE_TYPE = "1";

    // Script attributes
    ResourceTimingCompression.SPECIAL_DATA_SCRIPT_TYPE = "2";
    // The following make up a bitmask
    ResourceTimingCompression.SPECIAL_DATA_SCRIPT_ASYNC_ATTR = 0x1;
    ResourceTimingCompression.SPECIAL_DATA_SCRIPT_DEFER_ATTR = 0x2;
    // 0 => HEAD, 1 => BODY
    ResourceTimingCompression.SPECIAL_DATA_SCRIPT_LOCAT_ATTR = 0x4;

    // ServerTiming data: .serverTiming field
    ResourceTimingCompression.SPECIAL_DATA_SERVERTIMING_TYPE = "3";

    // Link attributes
    ResourceTimingCompression.SPECIAL_DATA_LINK_ATTR_TYPE = "4";

    // Namespaced data
    ResourceTimingCompression.SPECIAL_DATA_NAMESPACED_TYPE = "5";

    // Service worker type: .workerStart field
    ResourceTimingCompression.SPECIAL_DATA_SERVICE_WORKER_TYPE = "6";

    // Next Hop Protocol: .nextHopProtocol field
    ResourceTimingCompression.SPECIAL_DATA_PROTOCOL = "7";

    // Content-Type .contentType field
    ResourceTimingCompression.SPECIAL_DATA_CONTENT_TYPE = "8";

    // Delivery Type: .deliveryType field
    ResourceTimingCompression.SPECIAL_DATA_DELIVERY_TYPE = "9";

    // Render Blocking Status: .renderBlockingStatus field
    ResourceTimingCompression.SPECIAL_DATA_RENDER_BLOCKING_STATUS = "a";

    // Response Status: .responseStatus field
    ResourceTimingCompression.SPECIAL_DATA_RESPONSE_STATUS = "b";

    /**
     * These are the only `rel` types that might be reference-able from
     * ResourceTiming.
     *
     * https://html.spec.whatwg.org/multipage/links.html#linkTypes
     *
     * @enum {number}
     */
    ResourceTimingCompression.REL_TYPES = {
        "prefetch": 1,
        "preload": 2,
        "prerender": 3,
        "stylesheet": 4
    };

    // Regular Expression to parse a URL
    ResourceTimingCompression.HOSTNAME_REGEX = /^(https?:\/\/)([^/]+)(.*)/;

    /**
     * List of URLs (strings or regexs) to trim
     */
    ResourceTimingCompression.trimUrls = [];

    /**
     * Words to break to avoid XSS filters
     */
    ResourceTimingCompression.xssBreakWords = ResourceTimingCompression.DEFAULT_XSS_BREAK_WORDS;

    //
    // Value maps
    //
    /**
     * Map of .contentType strings to values
     */
    ResourceTimingCompression.contentTypeMap = {
        // next value to assign
        next: 15,
        // pre-set value count
        pre: 15,
        // pre-fill with some common ones
        vals: {
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
            // TODO?
        }
    };

    /**
     * Map of .deliveryType strings to values
     */
    ResourceTimingCompression.deliveryTypeMap = {
        // next value to assign
        next: 2,
        // pre-set value count
        pre: 2,
        // pre-fill with some common ones
        // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
        vals: {
            "cache": 0,
            "navigational-prefetch": 1
        }
    };

    /**
     * Map of .nextHopProtocol strings to values.
     *
     * NOTE: Incoming data has 'http/' changed to just 'h' to normalize
     */
    ResourceTimingCompression.nextHopProtocolMap = {
        // next value to assign
        next: 6,
        // pre-set value count
        pre: 6,
        // pre-fill with some common ones
        // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/nextHopProtocol
        vals: {
            "h2": 0,
            "h0.9": 1,
            "h1.0": 2,
            "h1.1": 3,
            "h2c": 4,
            "h3": 5
        }
    };

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
     * Rounds up the timing value
     *
     * @param {number} time Time
     * @returns {number} Rounded up timestamp
     */
    ResourceTimingCompression.roundUpTiming = function(time) {
        if (typeof time !== "number") {
            time = 0;
        }

        return Math.ceil(time ? time : 0);
    };

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
            if (!Object.prototype.hasOwnProperty.call(entries, url)) {
                continue;
            }

            urlFixed = url;

            // find any strings to break
            for (i = 0; i < this.xssBreakWords.length; i++) {
                // Add a XSS_BREAK_DELIM character after the first letter.  optimizeTrie will
                // ensure this sequence doesn't get combined.
                urlFixed = urlFixed.replace(
                    this.xssBreakWords[i],
                    "$1" + this.XSS_BREAK_DELIM + "$2");
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
            if (Object.prototype.hasOwnProperty.call(cur, node)) {
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

                    if (node === this.XSS_BREAK_DELIM) {
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
        var entries = [], i, navEntries, navStart, frameNavStart, frameOffset, navEntry, t, frameLoc, rtEntry,
            links = {}, scripts = {}, a;

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

            a = frame.document.createElement("a");

            // get all scripts as an object keyed on script.src
            this.collectResources(a, scripts, "script");
            this.collectResources(a, links, "link");

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
                        serverTiming: navEntry.serverTiming || [],
                        nextHopProtocol: navEntry.nextHopProtocol
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
                    responseEnd: t.responseEnd ? (t.responseEnd + offset) : 0,
                    nextHopProtocol: t.nextHopProtocol
                };

                if (t.encodedBodySize || t.decodedBodySize || t.transferSize) {
                    rtEntry.encodedBodySize = t.encodedBodySize;
                    rtEntry.decodedBodySize = t.decodedBodySize;
                    rtEntry.transferSize = t.transferSize;
                }

                if (t.serverTiming && t.serverTiming.length) {
                    rtEntry.serverTiming = t.serverTiming;
                }

                // If this is a script, set its flags
                this.updateScriptFlags(scripts, t, rtEntry);

                // Update link flags
                this.updateLinkFlags(links, t, rtEntry);

                frameFixedEntries.push(rtEntry);
            }

            entries = entries.concat(frameFixedEntries);
        } catch (e) {
            return entries;
        }

        return entries;
    };

    /**
     * Sets .scriptAttrs flags for a compressed RT entry for <script> tags
     *
     * @param {object[]} scripts Scripts array
     * @param {ResourceTiming} entry ResourceTiming entry from the frame
     * @param {object} rtEntry Compressed RT entry
     */
    ResourceTimingCompression.updateScriptFlags = function(scripts, entry, rtEntry) {
        if ((entry.initiatorType === "script" || entry.initiatorType === "link") && scripts[entry.name]) {
            var s = scripts[entry.name];

            // Add async & defer based on attribute values
            rtEntry.scriptAttrs = (s.async ? this.SPECIAL_DATA_SCRIPT_ASYNC_ATTR : 0) |
                (s.defer ? this.SPECIAL_DATA_SCRIPT_DEFER_ATTR : 0);

            while (s.nodeType === 1 && s.nodeName !== "BODY") {
                s = s.parentNode;
            }

            // Add location by traversing up the tree until we either hit BODY or document
            rtEntry.scriptAttrs |= (s.nodeName === "BODY" ?
                this.SPECIAL_DATA_SCRIPT_LOCAT_ATTR : 0);
        }
    };

    /**
     * Sets .linkAttrs flags for a compressed RT entry for <link> tags
     *
     * @param {object[]} links Links array
     * @param {ResourceTiming} entry ResourceTiming entry from the frame
     * @param {object} rtEntry Compressed RT entry
     */
    ResourceTimingCompression.updateLinkFlags = function(links, entry, rtEntry) {
        // If this is a link, set its flags
        if (entry.initiatorType === "link" && links[entry.name]) {
            // split on ASCII whitespace
            // eslint-disable-next-line no-control-regex
            links[entry.name].rel.split(/[\u0009\u000A\u000C\u000D\u0020]+/).find(function(rel) {
                // eslint-disable-line no-loop-func
                // `rel`s are case insensitive
                rel = rel.toLowerCase();

                // only report the `rel` if it's from the known list
                if (ResourceTimingCompression.REL_TYPES[rel]) {
                    rtEntry.linkAttrs = ResourceTimingCompression.REL_TYPES[rel];
                    return true;
                }

                return false;
            });
        }
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
     * Collect external resources by tagName
     *
     * @param {Element} a an anchor element
     * @param {Object} obj object of resources where the key is the url
     * @param {string} tagName tag name to collect
     */
    ResourceTimingCompression.collectResources = function(a, obj, tagName) {
        Array.prototype
            .forEach
            .call(a.ownerDocument.getElementsByTagName(tagName), function(r) {
                // Get canonical URL
                a.href = r.currentSrc || r.src || r.getAttribute("xlink:href") || r.href;

                // only get external resource
                if (a.href.match(/^https?:\/\//)) {
                    obj[a.href] = r;
                }
            });
    };

    /**
     * Finds all remote resources in the selected window that are visible, and returns an object
     * keyed by the url with an array of height,width,top,left as the value
     *
     * @param {Window} win Window to search
     * @returns {Object} Object with URLs of visible assets as keys, and Array[height, width, top, left] as value
     */
    ResourceTimingCompression.getVisibleEntries = function(win) {
        if (!win) {
            return {};
        }

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

                if (!el) {
                    continue;
                }

                // look at this element if it has a src attribute or xlink:href, and we haven't already looked at it
                // currentSrc = IMG inside a PICTURE element or IMG srcset
                // src = IMG, IFRAME
                // xlink:href = svg:IMAGE
                src = el.currentSrc ||
                    el.src ||
                    (typeof el.getAttribute === "function" &&
                        (el.getAttribute("src")) || el.getAttribute("xlink:href"));

                // make src absolute
                a.href = src;
                src = a.href;

                if (!src || entries[src]) {
                    continue;
                }

                rect = el.getBoundingClientRect();

                // Require both height & width to be non-zero
                // IE <= 8 does not report rect.height/rect.width so we need offsetHeight & width
                if ((rect.height || el.offsetHeight) && (rect.width || el.offsetWidth)) {
                    entries[src] = [
                        rect.height || el.offsetHeight,
                        rect.width || el.offsetWidth,
                        Math.round(rect.top + y),
                        Math.round(rect.left + x)
                    ];

                    // If this is an image, it has a naturalHeight & naturalWidth
                    // if these are different from its display height and width, we should report that
                    // because it indicates scaling in HTML
                    if (!el.naturalHeight && !el.naturalWidth) {
                        continue;
                    }

                    // If the image came from a srcset, then the naturalHeight/Width will be density corrected.
                    // We get the actual physical dimensions by assigning the image to an uncorrected Image object.
                    // This should load from in-memory cache, so there should be no extra load.
                    var realImg, nH, nW;

                    if (el.currentSrc &&
                        (el.srcset ||
                          (el.parentNode &&
                           el.parentNode.nodeName &&
                           el.parentNode.nodeName.toUpperCase() === "PICTURE"))) {
                        realImg = el.isConnected ? el.ownerDocument.createElement("IMG") : new window.Image();
                        realImg.src = src;
                    } else {
                        realImg = el;
                    }

                    nH = realImg.naturalHeight || el.naturalHeight;
                    nW = realImg.naturalWidth || el.naturalWidth;

                    if ((nH || nW) && (entries[src][0] !== nH || entries[src][1] !== nW)) {
                        entries[src].push(nH, nW);
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

            this.accumulateServerTimingEntries(countCollector, e.serverTiming);
            filteredEntries.push(e);
        }

        var lookup = this.compressServerTiming(countCollector);
        return {
            entries: filteredEntries,
            serverTiming: {
                lookup: lookup,
                indexed: this.indexServerTiming(lookup)
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
        return this.cleanupURL(url, this.DEFAULT_URL_LIMIT);
    };

    /**
     * Gathers performance entries and compresses the result.
     * @param {Window} [win] The Window
     * @param {number} [from] Only get timings from
     * @param {number} [to] Only get timings up to
     * @param {boolean} skipDimensions Skip gathering resource dimensions
     * @returns {object} Optimized performance entries trie
     */
    ResourceTimingCompression.getResourceTiming = function(win, from, to, skipDimensions) {
        /* eslint no-script-url:0 */
        if (typeof win === "undefined") {
            win = window;
        }

        var ret = this.getFilteredResourceTiming(win, from, to);
        var entries = ret.entries, serverTiming = ret.serverTiming;

        if (!entries || !entries.length) {
            return {};
        }

        return this.compressResourceTiming(win, entries, serverTiming, skipDimensions);
    };

    /**
    * Guesses whether or not a resource is a cache hit.
    *
    * We can get this directly from the beacon if it has ResourceTiming2 sizing
    * data, and the resource is same-origin or has TAO.
    *
    * For all other cases, we have to guess based on the timing
    *
    * @param {PerformanceResourceTiming} entry ResourceTiming entry
    *
    * @returns {boolean} True if we estimate it was a cache hit.
    */
    ResourceTimingCompression.isCacheHit = function(entry) {
        // if we transferred bytes, it must not be a cache hit
        // (will return false for 304 Not Modified)
        if (entry.transferSize > 0) {
            return false;
        }

        // if the body size is non-zero, it must mean this is a
        // ResourceTiming2 browser, this was same-origin or TAO,
        // and transferSize was 0, so it was in the cache
        if (entry.decodedBodySize > 0) {
            return true;
        }

        // fall back guessing based on duration (non-RT2 or cross-origin)
        return entry.duration < 30;
    };

    /**
     * Gets a string value mapped to a number/character.  Builds a map
     * of seen values to numbers/characters over time.
     *
     * @param {object} map Values map
     * @param {string} value Value to check
     *
     * @returns {string} Mapped value character
     */
    ResourceTimingCompression.getValueMapFor = function(map, value) {
        if (typeof map.vals[value] === "undefined") {
            map.vals[value] = map.next;

            return (map.next++).toString(36);
        }

        return map.vals[value] === 0 ? "" : map.vals[value].toString(36);
    };

    /**
     * Gets a values map suitable for a beacon.
     *
     * All values are converted to a string array.
     *
     * @param {object} map Values map
     *
     * @returns {string[]} String array
     */
    ResourceTimingCompression.getValuesMapForBeacon = function(map) {
        var ary = [];

        var skip = map.pre;

        for (var value in map.vals) {
            // skip any well-known
            if (skip-- > 0) {
                continue;
            }

            ary.push(value);
        }

        return ary;
    };

    /**
     * Optimizes the specified set of performance entries.
     * @param {Window} win The Window
     * @param {object} entries Performance entries
     * @param {object} serverTiming Object containing `lookup` and `indexed`
     * @param {boolean} skipDimensions Skip gathering resource dimensions
     * @returns {object} Optimized performance entries trie
     */
    ResourceTimingCompression.compressResourceTiming = function(win, entries, serverTiming, skipDimensions) {
        /* eslint no-script-url:0 */
        var i, e, results = {}, initiatorType, url, finalUrl, data, visibleEntries = {};

        if (!skipDimensions) {
            // gather visible entries on the page
            visibleEntries = this.getVisibleEntries(win);
        }

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
                data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_SIZE_TYPE +
                    compSize;
            }

            if (Object.prototype.hasOwnProperty.call(e, "scriptAttrs")) {
                data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_SCRIPT_TYPE +
                    e.scriptAttrs;
            }

            if (Object.prototype.hasOwnProperty.call(e, "linkAttrs")) {
                data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_LINK_ATTR_TYPE +
                    e.linkAttrs;
            }

            if (e.serverTiming && e.serverTiming.length) {
                data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_SERVERTIMING_TYPE +
                    e.serverTiming.reduce(function(stData, entry, entryIndex) { /* eslint no-loop-func:0 */
                        var duration = String(entry.duration);
                        if (duration.substring(0, 2) === "0.") {
                            // lop off the leading 0
                            duration = duration.substring(1);
                        }
                        var lookupKey = this.identifyServerTimingEntry(
                            serverTiming.indexed[entry.name].index,
                            serverTiming.indexed[entry.name].descriptions[entry.description]);
                        stData += (entryIndex > 0 ? "," : "") + duration + lookupKey;
                        return stData;
                    }, "");
            }

            if (e.workerStart && typeof e.workerStart === "number" && e.workerStart !== 0) {
                // Has Service worker timing data that's non zero. Resource request not intercepted
                // by Service worker always return 0 as per MDN
                // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/workerStart

                // Lets round it and offset from startTime. We are going to round up the workerStart
                // timing specifically. We are doing this to avoid the issue where the case of Service
                // worker timestamps being sub-milliseconds more than startTime getting incorrectly
                // marked as 0ms (due to round down).
                // We feel marking such cases as 0ms, after rounding down, for workerStart would present
                // more incorrect indication to the user. Hence the decision to round up.
                var workerStartOffset = this.trimTiming(
                    this.roundUpTiming(e.workerStart), e.startTime);

                var fetchStartOffset = this.trimTiming(
                    this.roundUpTiming(e.fetchStart), e.startTime);

                data += this.SPECIAL_DATA_PREFIX
                    + this.SPECIAL_DATA_SERVICE_WORKER_TYPE
                    + this.toBase36(workerStartOffset)
                    + ((fetchStartOffset !== workerStartOffset) ?
                        ("," + this.toBase36(fetchStartOffset)).replace(/,+$/, "") : "");

            }

            finalUrl = url = this.trimUrl(e.name, this.trimUrls);
            if (this.HOSTNAMES_REVERSED) {
                finalUrl = this.reverseHostname(url);
            }

            // nextHopProtocol handling
            if (Object.prototype.hasOwnProperty.call(e, "nextHopProtocol") &&
                e.nextHopProtocol !== "" &&
                !this.isCacheHit(e)) {
                // change http/1.1 to h1.1 to be consistent with h2 & h3.
                data += this.SPECIAL_DATA_PREFIX
                    + this.SPECIAL_DATA_PROTOCOL
                    + this.getValueMapFor(this.nextHopProtocolMap, e.nextHopProtocol.replace("http/", "h"));
            }

            if (Object.prototype.hasOwnProperty.call(e, "contentType")) {
                data += this.SPECIAL_DATA_PREFIX
                    + this.SPECIAL_DATA_CONTENT_TYPE
                    + this.getValueMapFor(this.contentTypeMap, e.contentType);
            }

            if (Object.prototype.hasOwnProperty.call(e, "deliveryType")) {
                data += this.SPECIAL_DATA_PREFIX
                    + this.SPECIAL_DATA_DELIVERY_TYPE
                    + this.getValueMapFor(this.deliveryTypeMap, e.deliveryType);
            }

            if (Object.prototype.hasOwnProperty.call(e, "renderBlockingStatus")) {
                // only add if blocking
                if (e.renderBlockingStatus === "blocking") {
                    data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_RENDER_BLOCKING_STATUS;
                }
            }

            if (e.hasOwnProperty("responseStatus")) {
                // don't add for 200
                if (e.responseStatus !== 200) {
                    data += this.SPECIAL_DATA_PREFIX +
                    this.SPECIAL_DATA_RESPONSE_STATUS +
                    this.toBase36(e.responseStatus);
                }
            }

            if (!Object.prototype.hasOwnProperty.call(e, "_data")) {
                // if this entry already exists, add a pipe as a separator
                if (results[finalUrl] !== undefined) {
                    results[finalUrl] += "|" + data;
                } else if (visibleEntries[url] !== undefined) {
                    // For the first time we see this URL, add resource dimensions if we have them
                    // We use * as an additional separator to indicate it is not a new resource entry
                    // The following characters will not be URL encoded:
                    // *!-.()~_ but - and . are special to number representation so we don't use them
                    // After the *, the type of special data (ResourceTiming = 0) is added
                    results[finalUrl] =
                        this.SPECIAL_DATA_PREFIX +
                        this.SPECIAL_DATA_DIMENSION_TYPE +
                        visibleEntries[url].map(this.toBase36).join(",").replace(/,+$/, "")
                        + "|"
                        + data;
                } else {
                    results[finalUrl] = data;
                }
            } else {
                var namespacedData = "";
                for (var key in e._data) {
                    if (Object.prototype.hasOwnProperty.call(e._data, key)) {
                        namespacedData += this.SPECIAL_DATA_PREFIX
                            + this.SPECIAL_DATA_NAMESPACED_TYPE
                            + key
                            + ":"
                            + e._data[key];
                    }
                }

                if (typeof results[url] === "undefined") {
                    // we haven't seen this resource yet, treat this potential stub as the canonical version
                    results[url] = data + namespacedData;
                } else {
                    // we have seen this resource before
                    // forget the timing data of `e`, just supplement the previous entry with the new `namespacedData`
                    results[url] += namespacedData;
                }
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
        return url.replace(this.HOSTNAME_REGEX, function(m, p1, p2, p3) {
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
