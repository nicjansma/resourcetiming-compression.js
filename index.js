//
// For the NodeJS module, export a top-level object with both
// ResourceTimingCompression and ResourceTimingDecompression objects
//
var exports = {
    ResourceTimingCompression: require("./src/resourcetiming-compression"),
    ResourceTimingDecompression: require("./src/resourcetiming-decompression")
};

module.exports = exports;
