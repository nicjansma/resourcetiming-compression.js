# resourcetiming-compression.js

v0.3.4

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

Once included in the page, a top-level `ResourceTimingCompression` object is available on `window`.  If AMD or CommonJS environments are detected, it will simply expose itself via those methods.

From the NPM module:
```js
var ResourceTimingCompression = require("resourcetiming-compression").ResourceTimingCompression;
```

To get all of the compressed resources, you can simply call:

```js
var rtData = ResourceTimingCompression.getResourceTiming();
```

### resourcetiming-decompression.js

To include resourcetiming-decompression.js, simply include it via a script tag:

```html
<script type="text/javascript" src="resourcetiming-decompression.min.js"></script>
```

Once included in the page, a top-level `ResourceTimingDecompression` object is available on `window`.  If AMD or CommonJS environments are detected, it will simply expose itself via those methods.

From the NPM module:
```js
var ResourceTimingDecompression = require("resourcetiming-compression").ResourceTimingDecompression;
```
To decompress your resources, you can simply call:

```js
var original = ResourceTimingDecompression.decompressResources(rtData);
```

## Resource Dimensions

If available, when [compressing the resources](http://nicj.net/compressing-resourcetiming/) via `compressResourceTiming()`, any resource that has a visible component on the page (such as an `IMG` element) will have its `height` `width` `top` and `left` values captured and included in the compressed data as well.

This information is encoded as a "special value" in the resource's timings array.

For each resource, multiple hits to the same URL are separated by a pipe (`|`) character:

```
{
  // this resource was loaded twice with timings 70,1z,1c and 90,1,2
  "http://blah.com/js/foo.js": "370,1z,1c|390,1,2"
}
```

(See the [blog post](http://nicj.net/compressing-resourcetiming/) for a description of how to interpret the values)

If the resource has visible elements on the page, they will be appended to this list of timings with a special prefix of `*0` ([Base36](https://en.wikipedia.org/wiki/Base36) encoded):

```
{
  // this resource was loaded twice with timings 70,1z,1c and 90,1,2 and had
  // dimensions of height = 1, width = 5, top = 10 and left = 11
  "http://blah.com/js/foo.js": "370,1z,1c|390,1,2|*01,5,a,b"
}
```

## Resource Sizes

If available via [ResourceTiming2](https://www.w3.org/TR/resource-timing/), when [compressing the resources](http://nicj.net/compressing-resourcetiming/) via `compressResourceTiming()`, the resource's `transferSize`, `encodedBodySize` and `decodedBodySize` will be captured and included in the compressed data as well.

This information is encoded as a "special value" in the resource's timings array.  They will be appended to the list of timings with a special prefix of `*1`:

The data will be stored in the order of: `[e, t, d]`.

* `e`: `encodedBodySize` is the [Base36](https://en.wikipedia.org/wiki/Base36) decoded value (`encodedBodySize = parseInt(e, 36)`)
* `t`:
    * If a Base36 encoded number, `t` is the `transferSize` increase in size over `encodedBodySize` (`transferSize = parseInt(e, 36) + parseInt(t, 36)`)
    * If the value of `"_"`, `transferSize` is `0`
    * If missing, `transferSize` was either `0` or `undefined`
* `d`:
    * If a Base36 encoded number, `d` is the `decodedBodySize` increase in size over `encodedBodySize` (`decodedBodySize = parseInt(e, 36) + parseInt(d, 36)`)
    * If `0`, `encodedBodySize` is `0`
    * If missing, `encodedBodySize` was either `0` or `undefined`

Taking the following example:

```
{
  // this resource was loaded twice with timings 70,1z,1c and 90,1,2 and had
  // transferSize
  "http://blah.com/js/foo.js": "370,1z,1c|390,1,2|*1a,b,c"
}
```

Results in:

* `encodedBodySize` = `parseInt("a", 36)` = `10`
* `transferSize` = `parseInt("a", 36) + parseInt("b", 36)` = `21`
* `decodedBodySize` = `parseInt("a", 36) + parseInt("c", 36)` = `22`

## Tests

### resourcetiming-compression.js tests

Tests are provided in the ``test/`` directory, and can be run via ``mocha``:

    mocha test/*

Or via ``gulp``:

    gulp test

## Version History

* v0.3.4 - 2016-10-20:
    * Better `src` attribute capture and HREF handling
    * Look at `rect.height|width` for dimensions
* v0.3.3 - 2016-10-20: Handle SVG:image elements
* v0.3.2 - 2016-10-20: Decodes resource dimensions
* v0.3.1 - 2016-07-15: Fixed capturing of resource sizes (bytes)
* v0.3.0 - 2016-07-11:
    * Captures dimensions (px) of resources
    * Captures resource sizes (bytes) from ResourceTiming2
    * Breaks certain URLs up slightly so they don't trigger XSS filters
    * Limits URLs to 500 characters, and adds the ability to trim other URLs
    * Don't go more than 10 IFRAMEs deep (to avoid recursion bugs)
    * Fixes browser bugs with incorrect timings
* v0.2.2 - 2016-06-01: Add 'html' initiatorType for root page
* v0.2.1 - 2016-04-04: Protect against X-O frame access that crashes some browsers
* v0.2.0 - 2015-11-23: Export both ResourceTimingCompression and ResourceTimingDecompression from main module
* v0.1.2 - 2015-02-25: Fixed initiatorType parsing
* v0.1.1 - 2015-02-13: Fixed how redirectStart and fetchStart are calculated
* v0.1.0 - 2014-10-17: Initial version
