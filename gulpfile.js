var gulp = require('gulp');
var typescript = require('gulp-typescript');
var stylus = require('gulp-stylus');
var nib = require('nib');
var browserify = require('browserify');
var tsify = require('tsify');
var source = require('vinyl-source-stream');
var merge = require('merge-stream');
var plumber = require('gulp-plumber');

gulp.task('server', function () {
    return merge(
        gulp.src('./website/index.ts')
            .pipe(plumber())
            .pipe(typescript({module: 'commonjs'})).js
            .pipe(gulp.dest('./build/website')),
        gulp.src('./website/views/**/*')
            .pipe(gulp.dest('build/website/views'))
    );
});

gulp.task('js', function () {
    return browserify({entries: './website/js/index.ts'})
        .plugin(tsify)
        .bundle()
            .on('error', function (err) {
                console.log(err);
                this.emit('end');
            })
            .pipe(source('index.js'))
            .pipe(gulp.dest('build/website/static'));
});

gulp.task('css', function () {
    return gulp.src('./website/css/index.styl')
        .pipe(plumber())
        .pipe(stylus({paths: ['vendor'], use: [nib()]}))
        .pipe(gulp.dest('./build/website/static'));
});

gulp.task('build-website', ['server', 'js', 'css']);

gulp.task('watch-website', ['server', 'js', 'css'], function () {
    gulp.watch('website/**/*', ['server']);
    gulp.watch('website/**/*.ts', ['js']);
    gulp.watch('website/**/*.styl', ['css']);
});
