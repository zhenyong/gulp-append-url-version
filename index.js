'use strict';

var through = require('through2');
var rework = require('rework');
var reworkFunc = require('rework-plugin-function');
var urlUtils = require('url');
var nodePath = require('path');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');

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

        if (!checkIfNeed(meta, href)) {
          return;
        }

        urlObj = urlUtils.parse(href);
        search = urlObj.search || ''; //maybe '?' or '?key' or '?key=value' ...
        pathname = urlObj.pathname;

        // console.log('>>find image url', pathname);

        imgFilePath = smartRelativePath(basepath, pathname);

        if (imgFilePath && fs.existsSync(imgFilePath)) {
          newImgUrl = makeVersionParamUrl(urlObj, imgFilePath);

          startInfo = meta.position.start;
          endInfo = meta.position.end;

          if (startInfo.line != endInfo.line) {
            //TODO log 异常，样式名和值没有在同一行，一般不会吧
          }

          strLine = lines[startInfo.line - 1];
          lines[startInfo.line - 1] = strLine.replace(href, newImgUrl);

          // console.log(newImgUrl);

        } else {
          // console.warn('file not exist, path:', imgFilePath);
        }
      }
    }));
  return lines.join(os.EOL);
}



/**
 * 
 * @param  {Object} decl css style meta object like:
 
 *
 * @return {Bool}      if return false，will not handle this resource url ...
 */
function checkIfNeed(cssMeta, href) {
  var cssProp = (cssMeta.property || '').toLowerCase();

  if (cssProp !== 'background' && cssProp !== 'background-image') {
    return false;
  }

  if (!/\b\.(gif|jpg|png|jpeg)\b/i.test(href)) {
    return false;
  }

  return true;
}

/**
 * 对url添加一个查询参数
 *
 * @param  {UrlObject} urlObj 经过 url.parse() 返回的对象
 * @param  {String} filepath  
 *
 * @return {String}        添加查询参数后生成的新 url
 */
function makeVersionParamUrl(urlObj, filepath) {
  var tmp;
  var name = '_v';
  var md5Hash = fileShortMd5(filepath);
  var search = urlObj.search || ''; //可能为 '?' 或者 '?a' 或者 '?a=1' 或者没有
  var newSearch;
  var verReg = /_v=[\d\w]{10}/;

  var strVerParam = (name + '=' + md5Hash);

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

/**
 * 根据资源的相对路径（以'/'开头）和一个“不完全准确”的基本路径，生成资源的绝对路径
 *
 * 例如:
 * base 是 D:\work\YQTrackV5\YQTrack.Web\res\global\css
 * sub 是 \res\www\img\help\arrow.png
 * 返回 D:\work\YQTrackV5\YQTrack.Web\res\www\img\help\arrow.png
 */
//TODO 这部分只针对 17track,暴露配置
function smartRelativePath(base, sub) {
  base = nodePath.normalize(base);
  sub = nodePath.normalize(sub);
  var sepReg = /[/\\]/;
  var trimSepReg = /^[/\\]|[/\\]$/g;
  var baseArr = base.replace(trimSepReg, '').split(sepReg);
  var subArr = sub.replace(trimSepReg, '').split(sepReg);
  var matchPart = subArr[0];
  for (var i = 0, len = baseArr.length; i < len; i++) {
    if (matchPart === baseArr[i]) {
      return baseArr.slice(0, i).concat(subArr).join(nodePath.sep);
    }
  }
  return null;
}

/**
 * [exports description]
 *
 * @param  {[type]} options 
 * {
 *   onComplete: function (file, newContent) {}//exec after handle all the url value
 * }
 *
 * @return {[type]}         [description]
 */
module.exports = function(options) {
  options = options || {};

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