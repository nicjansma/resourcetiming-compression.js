# resourcetiming-compression.js

v1.3.2

[http://nicj.net](http://nicj.net)

Licensed under the MIT license

## Introduction

`resourcetiming-compression.js` compresses data from [ResourceTiming](http://www.w3.org/TR/resource-timing/).  A
companion script, `resourcetiming-decompression.js`, converts the compressed data back to the original form.

[ResourceTiming](http://www.w3.org/TR/resource-timing/) is a W3C web-perf API that exposes all of the page's resources' network timing information to the
developer and is available in most [modern browsers](http://caniuse.com/#feat=resource-timing).  The interface
`performance.getEntriesByType('resource')` returns a list of resources with information about each resource's URL, why it was downloaded, and
a dozen timestamps.  Collecting this information is easy, but beaconing all of this data back to a data warehouse can
be a challenge because of the amount of data available for each resource.  On a typical page, which might have over
100 resources, you could easily see 50 KB of ResourceTiming data per page-load.

`resourcetiming-compression.js` applies several data-compression techniques to reduce the size of your serialized
ResourceTiming data to about 15% of it's original size in many cases.  See
[this nicj.net blog post](http://nicj.net/compressing-resourcetiming/) for a description of these techniques.

`resourcetiming-decompression.js` is a companion script that will take the compressed ResourceTiming data and
builds it back to its original ResourceTiming form (eg. `performance.getEntriesByType('resource')`) for analysis.

NOTE: `resourcetiming-compression.js` is the same code that drives the `restiming.js` plugin for
[Boomerang](https://github.com/lognormal/boomerang/), but also includes the `resourcetiming-decompression.js` component.

## Download

Releases are available for download from [GitHub](https://github.com/nicjansma/resourcetiming-compression.js).

__Development:__ [resourcetiming-compression.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/src/resourcetiming-compression.js) - 30kb

__Production:__ [resourcetiming-compression.min.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/dist/resourcetiming-compression.min.js) - 2.4kb (minified / gzipped)

__Development:__ [resourcetiming-decompression.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/src/resourcetiming-decompression.js) - 8.8kb

__Production:__ [resourcetiming-decompression.min.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/dist/resourcetiming-decompression.min.js) - 1kb (minified / gzipped)

resourcetiming-compression.js is also available as the [npm resourcetiming-compression module](https://npmjs.org/package/resourcetiming-compression). You can install
using  Node Package Manager (npm):

    npm install resourcetiming-compression

resourcetiming-compression.js is also available via [bower](http://bower.io/). You can install using:

    bower install resourcetiming-compression

## Usage

Please see the [W3C ResourceTiming API Reference](http://www.w3.org/TR/resource-timing/) for details on how to use the
ResourceTiming API.

### resourcetiming-compression.js

To include resourcetiming-compression.js, simply include it via a script tag:

```html
<script type="text/javascript" src="resourcetiming-compression.min.js"></script>
```

Once included in the page, a top-level `ResourceTimingCompression` object is available on `window`.  If AMD
or CommonJS environments are detected, it will simply expose itself via those methods.

From the NPM module:
```js
var ResourceTimingCompression = require("resourcetiming-compression").ResourceTimingCompression;
```

To get all of the compressed resources, you can simply call:

```js
var {restiming, servertiming} = ResourceTimingCompression.getResourceTiming();
```

### resourcetiming-decompression.js

To include resourcetiming-decompression.js, simply include it via a script tag:

```html
<script type="text/javascript" src="resourcetiming-decompression.min.js"></script>
```

Once included in the page, a top-level `ResourceTimingDecompression` object is available on `window`.  If AMD
or CommonJS environments are detected, it will simply expose itself via those methods.

From the NPM module:
```js
var ResourceTimingDecompression = require("resourcetiming-compression").ResourceTimingDecompression;
```
To decompress your resources, you can simply call:

```js
var original = ResourceTimingDecompression.decompressResources(restiming, servertiming);
```

## Compressed Data

Please see this [blog post](http://nicj.net/compressing-resourcetiming/) for a more detailed description of the compression
format.

### Trie

Each ResourceTiming entry (e.g. URL) is first combined into an [optimized Trie](http://en.wikipedia.org/wiki/Trie):

```
{
    "http://": {
        "foo.com/": {
            "|": "0,a",
            "js/foo.js": "370,1z,1c|390,1,2",
            "css/foo.css": "48c,5k,14*0a"
        }
    }
}
```

The above Trie contains data for the following URLs:

* `http://foo.com/` (the `|` leaf node)
* `http://foo.com/js/foo.js` (contains two entries as designated by `|` in the middle of the value)
* `http://foo.com/css/foo.css`

Some notes:

* A leaf node _key_ of `|` means an entry for the Trie up to that point.
    This may happen if a URL is a common prefix of other entries.
    The URL would not contain the `|`.
* A _value_ containing `|` means the URL has multiple entries (e.g. the same URL has multiple hits)
* A _value_ containing `*[n]` means "special data" is encoded for that URL, such as dimensions, sizes, Server Timing, etc.
    See below for more details.

### Initiator Types

The very first character for every ResourceTiming entry is its `initiatorType`.

For example:

```
{
    "http://foo.com/js/foo.js": "370,1z,1c"
}
```

`3` is the initiator of `foo.js`, which maps to `script`.

The mapping is defined as:

```
INITIATOR_TYPES = {
    "other": 0,
    "img": 1,
    "link": 2,
    "script": 3,
    "css": 4,
    "xmlhttprequest": 5,
    "html": 6,
    "image": 7,
    "beacon": 8,
    "fetch": 9,
    "iframe": "a",
    "subdocument": "a",
    "body": "b",
    "input": "c",
    "frame": "a",
    "object": "d",
    "video": "e",
    "audio": "f",
    "source": "g",
    "track": "h",
    "embed": "i",
    "eventsource": "j",
    "navigation": 6,
    "early-hints": "k",
    "ping": "l",
    "font": "m"
}
```

### Resource Timestamps

After the `initiatorType`, each entry contains the resource's timestamps in the following order:

```
[initiatorType][startTime],[responseEnd],[responseStart],
[requestStart],[connectEnd],[secureConnectionStart],[connectStart],
[domainLookupEnd],[domainLookupStart],[redirectEnd],[redirectStart]
```

Each entry is [Base36](https://en.wikipedia.org/wiki/Base36) encoded.

`startTime` is the [Base36](https://en.wikipedia.org/wiki/Base36) value of the `startTime` timestamp.

All of the other timestamps are the [Base36](https://en.wikipedia.org/wiki/Base36) value of their offset from `startTime`.

All trailing `,0`s are removed and can be assumed to be the same as `0` or missing when decoding.

For example:

```
{
    "http://foo.com/js/foo.js": "370,1z,1c"
}
```

Results in:

```
{
    "name": "http://blah.com/js/foo.js",
    "initiatorType": "script",
    "startTime": 252,
    "responseEnd": 323,
    "responseStart": 300
}
```

With every other timestamp being `0`.

### Special Data

Additional information about each resource is encoded with special "special data" delimiters (`*[type]`).

The special data types are:

* `0`: Dimensions
* `1`: Sizes
* `2`: `<script>` attributes
* `3`: ServerTiming
* `4`: `<link rel=>` value
* `5`: Namespaced data
* `6`: Service Worker Start time
* `7`: `nextHopProtocol` data

Details about each special data follows.

### Resource Dimensions

If available, when [compressing the resources](http://nicj.net/compressing-resourcetiming/) via `compressResourceTiming()`,
any resource that has a visible component on the page (such as an `IMG` element) will have its `height` `width` `top`
and `left` values captured and included in the compressed data as well.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*0`.

For each resource, multiple hits to the same URL are separated by a pipe (`|`) character:

```
{
  // this resource was loaded twice with timings 70,1z,1c and 90,1,2
  "http://blah.com/js/foo.js": "370,1z,1c|390,1,2"
}
```

If the resource has visible elements on the page, they will be appended to this list of timings with a special prefix
of `*0` ([Base36](https://en.wikipedia.org/wiki/Base36) encoded):

```
{
  // this resource was loaded twice with timings 70,1z,1c and 90,1,2 and had
  // dimensions of height = 1, width = 5, top = 10 and left = 11
  "http://blah.com/js/foo.js": "370,1z,1c|390,1,2|*01,5,a,b"
}
```

### Resource Sizes

If available via [ResourceTiming2](https://www.w3.org/TR/resource-timing/), when [compressing the resources](http://nicj.net/compressing-resourcetiming/)
via `compressResourceTiming()`, the resource's `transferSize`, `encodedBodySize` and `decodedBodySize`
will be captured and included in the compressed data as well.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*1`.

The data will be stored in the order of: `[e, t, d]`.

* `e`:
    * If a [Base36](https://en.wikipedia.org/wiki/Base36) encoded number, `e` is the value of `encodedBodySize` (`encodedBodySize = parseInt(e, 36)`)
    * If missing, `encodedBodySize` was `0` (no body, just headers)
* `t`:
    * If a [Base36](https://en.wikipedia.org/wiki/Base36) encoded number, `t` is the `transferSize` increase in size over `encodedBodySize` (`transferSize = parseInt(e, 36) + parseInt(t, 36)`)
    * If the value of `"_"`, `transferSize` is `0` (cached)
    * If missing, `transferSize` was either `0` (cached) or `undefined` (unknown)
* `d`:
    * If a [Base36](https://en.wikipedia.org/wiki/Base36) encoded number, `d` is the `decodedBodySize` increase in size over `encodedBodySize` (`decodedBodySize = parseInt(e, 36) + parseInt(d, 36)`)
    * If missing, `decodedBodySize` was equal to `encodedBodySize` (the request was not encoded)

For example:

```
{
  // this resource was loaded with timings 70,1z,1c and had sizes set
  "http://blah.com/js/foo.js": "370,1z,1c*1a,b,c"
}
```

Results in:

* `encodedBodySize` = `parseInt("a", 36)` = `10`
* `transferSize` = `parseInt("a", 36) + parseInt("b", 36)` = `21`
* `decodedBodySize` = `parseInt("a", 36) + parseInt("c", 36)` = `22`

### Script Data

`<script>` elements have attributes such as `async` and `defer`.  These attributes, plus its location (`<head>`
or `<body>`) will be included for any `<script>` elements.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*2`.

The data is encoded as a bitmask:

* `async` attribute has a value of `0x1`
* `defer` attribute has a value of `0x2`
* If the `<script>` was in the body, the location will be set to `0x4`.  Otherwise, the script was in the `<head>`

For example:

```
{
  // this resource was loaded with timings 70,1z,1c and had script attributes of async/defer/body set
  "http://blah.com/js/foo.js": "370,1z,1c*27"
}
```

### Server Timing

Server Timing entries are included on Resource- and NavigationTiming entries as `serverTiming`.
They must have a `name`, _might_ have a non-empty `description`, and will likely have a non-zero `duration`.
This compression is built on the presumption that resources will have Server Timing entries with unique `duration`s 
pointing mostly to the same `name` and `description`s.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*3`.

There are two parts to this compression:

1. A "lookup" data structure containing all of the unique `name` and `description` pairs (an array of arrays, sorted with most-common first)
2. For each resource timing entry, a list of duration and key pairs, where duration is the `duration` of the
    Server Timing entry and the key maps to the name and description in (1)

For example:

```javascript
performance.getEntriesByName(<path/to/resource1>)[0].serverTiming === [{
  name: 'm1',
  duration: 1,
  description: 'desc1'
}, {
  name: 'm2',
  duration: 2,
  description: 'desc3'
}]

performance.getEntriesByName(<path/to/resource2>)[0].serverTiming === [{
  name: 'm1',
  duration: 3,
  description: 'desc1'
}, {
  name: 'm1',
  duration: 4,
  description: 'desc2'
}]
```

* `getResourceTiming()` will return a `servertiming` "lookup" will all of the unique pairs of name and description, equal to:

    `[[m1, desc1, desc2], [m2, desc3]]`

* We supplement the compressed resource timing data with comma-separated list of the form: `<duration>:<entryIndex>.<descriptionIndex>`.
    * For "resource1", we add: `1:0.0,2:1.0`
    * For "resource2", we add: `3:0.0,4:0.1`

* To save bytes, we will omit the zeroes, and irrelevant separators. So, from our example:
    * For "resource1", we add: `1,2:1`
    * For "resource2", we add: `3,4:.1`

* And lastly, were there only one `description` for a given `name` and it was empty-string, then we simplify that array entry:

    `[["description1", ""], ...]` would become `["description1", ...]`

For example:

```
{
  // this resource was loaded with timings 70,1z,1c and had ServerTimings
  "http://blah.com/js/foo.js": "370,1z,1c*3100,:1"
}
```

With `servertiming` data of:

```
["edge", ["cdn-cache", "HIT", "MISS"], "origin"]
```

Results in two ServerTiming entries:

```
[
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
]
```

### LINK type

`<link>` elements have attributes such as `rel`.  Known `rel` types will be included for any `<link>` elements.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*4`.

```
REL_TYPES = {
    "prefetch": 1,
    "preload": 2,
    "prerender": 3,
    "stylesheet": 4
};
```

For example:

```
{
  // this resource was loaded with timings 70,1z,1c and had a known link rel
  "http://blah.com/js/foo.js": "270,1z,1c*41"
}
```

Results in:

* `foo.js` was a `<link>` node (`initiatorType` = `2`) and was a `prefetch`

### Namespaced data

Namespaced data can be used to extend ResourceTiming compression with any other data that is desired.

If the `ResourceTiming` entry itself has a `_data` attribute, the key/value pairs will be included in the compressed 
ResourceTiming data.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the
list of timings with a special prefix of `*5`.

For example:

```
{
  // this resource was loaded with timings 70,1z,1c and had a known link rel
  "http://blah.com/js/foo.js": "270,1z,1c*5abc:123,def:z"
}
```

Results in:

```
{
    "name": "http://blah.com/js/foo.js",
    "initiatorType": "script",
    "startTime": 252,
    "responseEnd": 323,
    "responseStart": 300,
    "_data": {
        "abc": "123",
        "def": "z"
    }
}
```

### Service Worker Timing

ResourceTiming's [`workerStart`](https://www.w3.org/TR/resource-timing-2/#dom-performanceresourcetiming-workerstart)
timestamp is when the Service Worker was started, if active.  The difference between `workerStart` and `fetchStart`
is how long it took the Service Worker to startup.

`workerStart` was not included in the original ResourceTiming Compression timestamp array, so it is included after
the regular timestamps as a "special value" if available.  The data will be appended to the list of timings with
a special prefix of `*6`:

```
*6[Base36(workerStart-startTime)],[Base36(fetchStart-startTime)]
```

Note that both `workerStart` and `fetchStart` are included in this data, as `fetchStart` is not normally included
in the ResourceTiming Compression timestamp array: it can be inferred to be `startTime` or `redirectEnd` if there
was no Service Worker active.

For example:

```
{
  // this resource has Service Worker workerStart timing
  "abc": "31,b*62,3"
}
```

Results in:

* `initiatorType` = `3` = `script`
* `startTime` = `parseInt("1", 36)` = `1`
* `responseEnd` = `parseInt("b", 36) + startTime` = `12`
* `workerStart` = `parseInt("2", 36) + startTime` = `3`
* `fetchStart` = `parseInt("3", 36) + startTime` = `4`

### `nextHopProtocol` data

ResourceTiming's [`nextHopProtocol`](https://www.w3.org/TR/resource-timing-2/#dom-performanceresourcetiming-nexthopprotocol)
is the final connection's ALPN negotiated protocol, such as `http/1.1`, `h2` or `h3`.

Note: `http/` is replaced with `h` so `http/1` is consistent with H2 and H3.

The data will be appended to the list of timings with
a special prefix of `*7`:

```
*7[h1|h1.1|h2|h3|...]
```

### Resource Contributions

We call contribution of a resource to a page the proportion of the total load time that can be blamed on that resource.
We want contribution scores to encourage parallelization and not only short resources.

It enables us to study resource impact in a more meaningful way over simply looking at raw load times.

Here is an example with only 2 resources to get some intuition into how it works:

```
    0                                        100ms
A   |-----------------------------------------|

                      50ms                   100ms
B                      |----------------------|
```

The contribution of resource A is 50ms for the 0-50ms time range and 50ms/2 for the 50ms to 100ms time range because
it overlaps with B. We get:

`contribution_A = (50 + 50 / 2) / 100 = .75`

`contribution_B = (50 / 2) / 100 = .25`

This is computed based on all the resources in a single beacon. It is not done by default because it is computationally
expensive.

Here is a code example to add contributions to your own resources:

```js
var original = ResourceTimingDecompression.decompressResources(rtData);
// "original" is now an array of resource timings.

ResourceTimingDecompression.addContribution(original);
// Resources in "original" now have a field "contribution".
```

## Tests

### resourcetiming-compression.js tests

Tests are provided in the ``test/`` directory, and can be run via ``mocha``:

    mocha test/*

Or via ``gulp``:

    gulp test

## Version History

* v1.3.2 - 2022-08-30
    * Add `nextHopProtocol` data
    * Upgrade some package dependencies
* v1.3.1 - 2020-08-05
    * Add `fetchStart` for Service Worker Startup data
* v1.3.0 - 2020-07-09
    * Support for compressing namespaced data
    * Support for Service Worker Start timing
* v1.2.4 - 2019-07-16
    * Optional `skipDimensions` for `getResourceTiming()` and `compressResourceTiming()`
* v1.2.3 - 2019-05-09
    * Decode `initiatorType` above 9 properly
* v1.2.2 - 2019-05-09
    * Add additional `initiatorType` values
* v1.2.1 - 2018-11-26:
    * Add root-level `compression` and `decompression` exports
* v1.2.0 - 2018-11-26:
    * `ResourceTimingCompression.getVisibleEntries`: Fixed onload bug, updated to work with `<PICTURE>` elements
    * `ResourceTimingCompression`: Dimensions work with `HOSTNAMES_REVERSED`
    * Tests: Added getResourceTiming() tests
* v1.1.0 - 2018-09-11:
    * Decompresses properly when multiple special entries exist
    * Compress and decompress `LINK rel` and `SCRIPT` attributes
    * Decompress namespaced data
    * Adds new `INITIATOR_TYPES`
* v1.0.2 - 2018-07-06:
    * Fixed decompression when multiple special entries exist
* v1.0.1 - 2018-04-13:
    * Make hostname reversal configurable (#20)
    * Add `naturalHeight` and `naturalWidth` to dimensionData (#20)
* v1.0.0 - 2017-08-29:
    * **Breaking Changes**:
        * Reverses hostnames in Trie entries ([#10]) for better compression
        * `getResourceTiming()` now returns an object of `{ restiming, servertiming }`
            instead of just `restiming` (#17)
    * **New Features**:
        * Adds ServerTiming data if available (#17)
        * Adds new initiator types (#15): `beacon`, `fetch`
        * Resource contribution scores (#16)
        * Adds `async`, `body` and `defer` flags for `SCRIPT` types (#16)
        * Adds `naturalHeight` and `naturalWidth` for dimensions (#16)
    * **Bug Fixes**:
        * Fixes max IFRAME recursion depth of 10 (#9)
        * Fixes compression algorithm for gzipped zero-byte payloads (#14)
* v0.3.4 - 2016-10-20:
    * Better `src` attribute capture and HREF handling (3796c2ae)
    * Look at `rect.height|width` for dimensions (3796c2ae)
* v0.3.3 - 2016-10-20:
    * Handle SVG:image elements (0177ee6e)
* v0.3.2 - 2016-10-20:
    * Decodes resource dimensions (#6)
* v0.3.1 - 2016-07-15:
    * Fixed capturing of resource sizes (bytes) (#4)
* v0.3.0 - 2016-07-11:
    * Captures dimensions (px) of resources (d54d5be4)
    * Captures resource sizes (bytes) from ResourceTiming2 (d54d5be4)
    * Breaks certain URLs up slightly so they don't trigger XSS filters (d54d5be4)
    * Limits URLs to 500 characters, and adds the ability to trim other URLs (d54d5be4)
    * Don't go more than 10 IFRAMEs deep (to avoid recursion bugs) (d54d5be4)
    * Fixes browser bugs with incorrect timings (d54d5be4)
* v0.2.2 - 2016-06-01:
    * Add 'html' initiatorType for root page (91a91404)
* v0.2.1 - 2016-04-04:
    * Protect against X-O frame access that crashes some browsers (f48c1915)
* v0.2.0 - 2015-11-23:
    * Adds a CLI (#2)
    * Export both ResourceTimingCompression and ResourceTimingDecompression from main module (567682b7)
* v0.1.2 - 2015-02-25:
    * Fixed initiatorType parsing (#1)
* v0.1.1 - 2015-02-13:
    * Fixed how redirectStart and fetchStart are calculated (567682b7)
* v0.1.0 - 2014-10-17:
    * Initial version
