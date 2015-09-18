"use strict";

//
// Imports
//
var ResourceTimingCompression = require("../src/resourcetiming-compression");
var fs = require("fs");

//
// Action
//
module.exports = function(inputFile, options) {
    var entries = JSON.parse(fs.readFileSync(inputFile));
    var compressed = ResourceTimingCompression.compressResourceTiming(entries);

    var space;
    var outputFile;

    if (options && options.parent) {
        if (options.parent.pretty)
            space = 2;
        if (options.parent.output)
            outputFile = options.parent.output;
    }

    var outputJSON = JSON.stringify(compressed, null, space);

    if (outputFile) {
        fs.writeFileSync(outputFile, outputJSON);
    } else {
        console.log(outputJSON);
    }
};
