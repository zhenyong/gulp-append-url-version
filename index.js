'use strict';

var through = require('through2');
var rework = require('rework');
var reworkFunc = require('rework-plugin-function');
var urlUtils = require('url');
var nodePath = require('path');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var extend = require('extend');
var isImage = require('is-image');

var DEBUG = true;

function log() {
  if (DEBUG) {
    console.log.apply(console, arguments);
  }
}

function appendUrlVersion(file, options) {

  var urlObj,
    /*
    for http://www.google.com/a/b/hello.png?age=10&name=1#hash
    the `urlObj` look like: {
      protocol: 'http:',
      slashes: true,
      auth: null,
      host: 'www.google.com',
      port: null,
      hostname: 'www.google.com',
      hash: '#hash',
      search: '?age=10&name=1',
      query: 'age=10&name=1',
      pathname: '/a/b/hello.png',
      path: '/a/b/hello.png?age=10&name=1',
      href: 'http://www.google.com/a/b/hello.png?age=10&name=1#hash'
    }
     */
    pathname, imgFilePath, search, md5Hash, startInfo, endInfo, strLine, newImgUrl;

  var filepath = file.path;
  var basepath = nodePath.dirname(filepath);
  var versionQuery = '';
  var content = file.contents.toString();
  var lines = content.split(/\r?\n/);


  rework(content)
    .use(reworkFunc({
      url: function(href) {
        /*
        meta = {
         type: 'declaration',
         property: 'background',
         value: 'url(/res/www/img/index/button_03.png) no-repeat',
         position: 
             start: { line: 152, column: 202 },
             end: { line: 152, column: 260 },
             }
         source: undefined 
        }
         */
        var meta = this;

        if (!options.check(file, meta, href)) {
          return;
        }

        urlObj = urlUtils.parse(href);
        search = urlObj.search || ''; //maybe '?' or '?key' or '?key=value' ...
        pathname = urlObj.pathname;

        // console.log('>>find image url', pathname);

        // imgFilePath = smartRelativePath(basepath, pathname);
        imgFilePath = options.resolveUrlToFilePath(file, href);

        if (imgFilePath && fs.existsSync(imgFilePath)) {
          newImgUrl = makeVersionParamUrl(urlObj, imgFilePath, options.paramKey);

          startInfo = meta.position.start;
          endInfo = meta.position.end;

          if (startInfo.line != endInfo.line) {
            //TODO log 异常，样式名和值没有在同一行，一般不会吧
          }

          strLine = lines[startInfo.line - 1];
          lines[startInfo.line - 1] = strLine.replace(href, newImgUrl);

          log('complete', newImgUrl);

        } else {
          log('file not exist, path:', imgFilePath);
        }
      }
    }));
  return lines.join(os.EOL);
}



/**
 * 对url添加一个查询参数
 *
 * @param  {UrlObject} urlObj 经过 url.parse() 返回的对象
 * @param  {String} filepath  
 *
 * @return {String}        添加查询参数后生成的新 url
 */
function makeVersionParamUrl(urlObj, filepath, key) {
  var tmp;
  var md5Hash = fileShortMd5(filepath);
  var search = urlObj.search || ''; //可能为 '?' 或者 '?a' 或者 '?a=1' 或者没有
  var newSearch;
  var verReg = new RegExp(key+'=[\\d\\w]+')

  var strVerParam = (key + '=' + md5Hash);

  //has appended before, then replace pair param
  if (verReg.test(search)) {
    newSearch = search.replace(verReg, strVerParam);
    
  } else {

    if (search.length == 1) { //'url?'
      tmp = strVerParam;
    } else if (search.length > 1) { //'url?k=v'
      tmp = '&' + strVerParam;
    } else { // just 'url' without query
      tmp = '?' + strVerParam;
    }
    newSearch = search + tmp;
  }

  urlObj.search = newSearch;
  return urlUtils.format(urlObj);
}

//TODO cache by normalized filepath
function fileShortMd5(filepath) {
  return md5(fs.readFileSync(filepath), 0, 10);
}

/**
 * gen md5 string
 *
 * @param  {String/Buffer} text   
 * @param  {Int} subStart substring start offset
 * @param  {Int} subLen   length of return when use `subStart`
 *
 * @return {String}
 */
function md5(text, subStart, subLen) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(text);
  var result = md5sum.digest('hex');
  return typeof subStart !== undefined ? result.substr(subStart, subLen) : result;
};

var defaultOptions = {
  onComplete: function () {},
  resolveUrlToFilePath: function(cssFile, href) {
    return nodePath.resolve(cssFile.path, urlUtils.parse(href).pathname);
  },
  check: function(file, cssMeta, href) {
    var prop = (cssMeta.property || '').toLowerCase();
    href = urlUtils.parse(href).pathname;
    return (prop == 'background' || prop == 'background-image') && isImage(href);
  },
  paramKey: 'v'
};

/**
 * @param  {[type]} options 
 * {
 *   onComplete: function (file, newContent) {}//exec after handle all the url value
 * }
 *
 * @return {[type]}         [description]
 */
module.exports = function(options) {
  options = extend({}, defaultOptions, options);
  DEBUG = options.debug

  return through.obj(function(file, enc, cb) {
    var modifiedContents = appendUrlVersion(file, options);

    file.contents = new Buffer(modifiedContents);

    if (options.onComplete) {
      options.onComplete(file, modifiedContents);
    }

    this.push(file);

    cb();
  });
};