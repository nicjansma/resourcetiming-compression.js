var gulp = require('gulp');
var eslint = require('gulp-eslint');
var uglify = require('gulp-uglify');
var mocha = require('gulp-mocha');
var rename = require('gulp-rename');

gulp.task('lint', function () {
    gulp.src(['src/*.js'])
        .pipe(eslint())
        .pipe(eslint.format());
});

gulp.task('compress', function() {
    gulp.src('src/*.js')
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(uglify({ mangle: true }))
        .pipe(gulp.dest('dist'));
});

gulp.task('test', function () {
    return gulp.src('test/*.js', {read: false})
        .pipe(mocha());
});

gulp.task('all', ['default']);
gulp.task('default', ['lint', 'compress', 'test']);
gulp.task('travis', ['default']);
