# gulp-append-url-version
To append url version params with md5 for background/background-image in css files.


## Usage

```
gulp.src([
		'./**/*.css'
])
.pipe(appendUrlVersion({
	//@optional
	debug: true,
	//@optional
	onComplete: function (cssFile, newContent) {
		//u can overwrite the original file here
	},
	//@optional
	resolveUrlToFilePath: function (cssFile, href) {
		//resolve the absolute file path
		//default return path.resolve(cssFile.path, url.parse(href).pathname);
	},
	//@optional
	check: function (cssFile, cssMeta, href) {
		/*
		cssMeta: is a meata data described every css prop and its values,
		refer to https://github.com/reworkcss/css
		 */
	}
}))
.pipe(gulp.dest('./dist'));
```