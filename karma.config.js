module.exports = function(config) {
    "use strict";

    config.set({
        basePath: "./",

        port: 4000,
        runnerPort: 4001,
        logLevel: config.LOG_INFO,

        colors: true,
        autoWatch: false,

        frameworks: ["mocha", "expect"],
        reporters: ["progress", "coverage", "tap"],
        browsers: ["ChromeHeadlessNoSandbox"],

        // you can define custom flags
        customLaunchers: {
            ChromeHeadlessNoSandbox: {
                base: "ChromeHeadless",
                flags: ["--no-sandbox"]
            }
        },

        files: [
            "src/*.js",
            "test/test-*.js"
        ],

        coverageReporter: {
            type: "html",
            dir: "test/coverage/"
        },

        tapReporter: {
            outputFile: "test/karma.tap"
        }
    });
};
