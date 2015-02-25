# resourcetiming-compression.js

v0.1.2

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

__Development:__ [resourcetiming-compression.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/src/resourcetiming-compression.js) - 15kb

__Production:__ [resourcetiming-compression.min.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/dist/resourcetiming-compression.min.js) - 4.5kb (minified / gzipped)

__Development:__ [resourcetiming-decompression.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/src/resourcetiming-decompression.js) - 6.5kb

__Production:__ [resourcetiming-decompression.min.js](https://github.com/nicjansma/resourcetiming-compression.js/raw/master/dist/resourcetiming-decompression.min.js) - 2kb (minified / gzipped)

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

To decompress your resources, you can simply call:

```js
var original = ResourceTimingDecompression.decompressResources(rtData);
```

## Tests

### resourcetiming-compression.js tests

Tests are provided in the ``test/`` directory, and can be run via ``mocha``:

    mocha test/*

Or via ``gulp``:

    gulp test

## Version History

* v0.1.2 - 2015-02-25: Fixed initiatorType parsing
* v0.1.1 - 2015-02-13: Fixed how redirectStart and fetchStart are calculated
* v0.1.0 - 2014-10-17: Initial version
