(function() {
    "use strict";

    var gulp = require("gulp");
    var eslint = require("gulp-eslint");
    var uglify = require("gulp-uglify");
    var mocha = require("gulp-spawn-mocha");
    var rename = require("gulp-rename");
    var Server = require("karma").Server;
    var path = require("path");
    var fs = require("fs");
    var gls = require("gulp-live-server");

    gulp.task("lint", function() {
        return gulp.src(["*.js", "src/*.js", "test/*.js"])
            .pipe(eslint())
            .pipe(eslint.format())
            .pipe(eslint.failAfterError());
    });

    gulp.task("lint:build", function() {
        return gulp.src(["*.js", "src/*.js", "test/*.js"])
            .pipe(eslint())
            .pipe(eslint.format())
            .pipe(eslint.format("checkstyle", fs.createWriteStream("eslint.xml")));
    });

    gulp.task("compress", function() {
        return gulp.src("src/*.js")
            .pipe(rename({
                suffix: ".min"
            }))
            .pipe(uglify({ mangle: true }))
            .pipe(gulp.dest("dist"));
    });

    gulp.task("mocha", function() {
        return gulp.src("test/test-*.js",
            {
                read: false
            })
            .pipe(mocha());
    });

    gulp.task("mocha-tap", gulp.series("mocha", function() {
        return gulp.src("test/test-*.js",
            {
                read: false
            })
            .pipe(mocha({
                reporter: "tap",
                output: "./test/mocha.tap"
            }));
    }));

    gulp.task("karma", gulp.series("mocha", "mocha-tap", function(done) {
        new Server({
            configFile: path.join(__dirname, "karma.config.js"),
            singleRun: true
        }, done).start();
    }));

    gulp.task("server", function() {
        var server = gls.new("./test/server.js");

        return server.start();
    });

    gulp.task("test", gulp.series("mocha", "mocha-tap", "karma"));
    gulp.task("test:debug", gulp.series("server"));
    gulp.task("default", gulp.series("lint", "lint:build", "compress", "test"));
    gulp.task("all", gulp.series("default"));
    gulp.task("travis", gulp.series("default"));
}());
