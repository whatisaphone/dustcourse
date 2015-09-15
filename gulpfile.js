var browserify = require('browserify');
var gulp = require('gulp');
var plumber = require('gulp-plumber');
var sourcemaps = require('gulp-sourcemaps');
var merge = require('merge-stream');
var stylus = require('gulp-stylus');
var typescript = require('gulp-typescript');
var uglify = require('gulp-uglify');
var gutil = require('gulp-util');
var nib = require('nib');
var tsify = require('tsify');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');

gulp.task('server', function () {
    var tsProject = typescript.createProject('./website/tsconfig.json');
    return merge(
        tsProject.src()
            .pipe(plumber())
            .pipe(typescript(tsProject))
            .pipe(gulp.dest('./build/website')),
        gulp.src('./website/static/**/*')
            .pipe(gulp.dest('build/website/static')),
        gulp.src('./website/views/**/*')
            .pipe(gulp.dest('build/website/views'))
    );
});

gulp.task('js', function () {
    return browserify({entries: './website/js/index.ts'})
        .plugin(tsify)
        .bundle()
            .on('error', function (err) { console.log(err); this.emit('end'); })
            .pipe(source('index.js'))
            .pipe(buffer())
            .pipe(gulp.env.dev ? sourcemaps.init() : gutil.noop())
            .pipe(gulp.env.dev ? gutil.noop() : uglify())
            .pipe(gulp.env.dev ? sourcemaps.write() : gutil.noop())
            .pipe(gulp.dest('build/website/static'));
});

gulp.task('css', function () {
    return gulp.src('./website/css/index.styl')
        .pipe(plumber())
        .pipe(stylus({paths: ['vendor'], use: [nib()], compress: !gulp.env.dev}))
        .pipe(gulp.dest('./build/website/static'));
});

gulp.task('build-website', ['server', 'js', 'css']);

gulp.task('watch-website', ['server', 'js', 'css'], function () {
    gulp.watch('website/**/*', ['server']);
    gulp.watch('website/**/*.ts', ['js']);
    gulp.watch('website/**/*.styl', ['css']);
});
