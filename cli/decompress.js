"use strict";

//
// Imports
//
var ResourceTimingDecompression = require("../src/resourcetiming-decompression");
var fs = require("fs");

//
// Action
//
module.exports = function(inputFile, options) {
    var rt = JSON.parse(fs.readFileSync(inputFile));
    var decompressed = ResourceTimingDecompression.decompressResources(rt);

    var space;
    var outputFile;

    if (options && options.parent) {
        if (options.parent.pretty) {
            space = 2;
        }
        if (options.parent.output) {
            outputFile = options.parent.output;
        }
    }

    var outputJSON = JSON.stringify(decompressed, null, space);

    if (outputFile) {
        fs.writeFileSync(outputFile, outputJSON);
    } else {
        console.log(outputJSON);
    }
};
