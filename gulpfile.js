(function(root) {
    "use strict";

    var gulp = require("gulp");
    var eslint = require("gulp-eslint");
    var uglify = require("gulp-uglify");
    var mocha = require("gulp-spawn-mocha");
    var rename = require("gulp-rename");
    var Server = require("karma").Server;
    var path = require("path");
    var fs = require("fs");

    gulp.task("lint", function() {
        gulp.src(["*.js", "src/*.js", "test/*.js"])
            .pipe(eslint())
            .pipe(eslint.format())
            .pipe(eslint.failAfterError());
    });

    gulp.task("lint:build", function() {
        gulp.src(["*.js", "src/*.js", "test/*.js"])
            .pipe(eslint())
            .pipe(eslint.format())
            .pipe(eslint.format("checkstyle", fs.createWriteStream("eslint.xml")));
    });

    gulp.task("compress", function() {
        gulp.src("src/*.js")
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

    gulp.task("mocha-tap", ["mocha"], function() {
        return gulp.src("test/test-*.js",
            {
                read: false
            })
        .pipe(mocha({
            reporter: "tap",
            output: "./test/mocha.tap"
        }));
    });

    gulp.task("karma", ["mocha", "mocha-tap"], function(done) {
        new Server({
            configFile: path.join(__dirname, "karma.config.js"),
            singleRun: true
        }, done).start();
    });

    gulp.task("all", ["default"]);
    gulp.task("test", ["mocha", "mocha-tap", "karma"]);
    gulp.task("default", ["lint", "lint:build", "compress", "test"]);
    gulp.task("travis", ["default"]);
}());
