/**
 * 省份按号码查找并合并到表,生成province表,使用provinceSeq:seq开头的redis键进行缓存
 */
'use strict';

const vlog = require('vlog').instance(__filename);
const kc = require('kc');
const http = require('http');
const querystring = require('querystring');
const mongo = kc.mongo.init();
const redis = kc.redis.init();
const request = require('request');
const iconv = require('iconv-lite');
const cck = require('cck');

const provinceTable = kc.kconfig.get('provinceTable');
const provinceRedisPre = 'provinceSeq:seq:';


const findProvinceByPhone = function(phone, callback) {
  const seq = phone.substring(0, 7);
  redis.hgetall(provinceRedisPre + seq, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'findProvinceByPhone:hgetall:' + seq));
    }
    if (re && re.provinceName) {
      return callback(null, re.provinceName);
    }
    callback(null, 'unknown');
    vlog.warn('findProvinceByPhone:can not find province in redis, will find it. seq:%j', phone);

    try {
      getProvinceAndPush(phone);
    } catch (e) {
      vlog.error(e.stack);
    }
  });
};

const findProvinceObjByPhone = function(phone, callback) {
  const seq = phone.substring(0, 7);
  redis.hgetall(provinceRedisPre + seq, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'findProvinceByPhone:hgetall:' + seq));
    }
    if (re && re.provinceName) {
      return callback(null, re);
    }
    callback(null, { 'provinceName': 'unknown' });
    vlog.warn('findProvinceObjByPhone:can not find province in redis, will find it. seq:%j', phone);
    try {
      getProvinceAndPush(phone);
    } catch (e) {
      vlog.error(e.stack);
    }
  });
};

const sendHttpGet = function(url, callback) {
  http.get(url, function(res) {
    const statusCode = res.statusCode;
    // const contentType = res.headers['content-type'];
    let error;
    if (statusCode !== 200) {
      error = new Error('Request Failed.\n Status Code: ' + statusCode);
    }
    if (error) {
      vlog.error(error);
      // consume response data to free up memory
      res.resume();
      return;
    }

    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', function(chunk) {
      rawData += chunk;
    });
    res.on('end', function() {
      try {
        const parsedData = JSON.parse(rawData);
        callback(null, parsedData);
      } catch (e) {
        vlog.eo(e, 'sendHttpGet');
      }
    });
  }).on('error', function(e) {
    vlog.eo(e, 'sendHttpGet2');
  });
};


const sendHttpGetForip138 = function(phone, callback) {
  const options = {
    'url': 'http://www.ip138.com:8080/search.asp?mobile=' + phone + '&action=mobile',
    'encoding': null,
    'headers': {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, sdch',
      'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4',
      'Connection': 'keep-alive',
      // 'Cookie': 'pgv_pvi=6607202304; pgv_si=s9736693760; ASPSESSIONIDSACTBATB=OLMDECIDKNLAJGPOAHHHLPGI',
      'Host': 'www.ip138.com:8080',
      // 'Referer': 'http://www.ip138.com:8080/search.asp?mobile=' + phone + '&action=mobile',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36'
    }
  };

  request(options, function(err, res, body) {
    if (err) {
      vlog.eo(err, '');
      return;
    }
    if (res.statusCode !== 200) {
      vlog.error('ip138 err', res.statusCode);
      return;
    }

    callback(null, iconv.decode(body, 'gb2312'));
  });
};

const getProvinceForip138 = function(phone, callback) {
  sendHttpGetForip138(phone, function(err, htmlText) {
    if (err) {
      return callback(vlog.ee(err, 'getProvinceForip138', phone));
    }
    const originalHtmlText = htmlText;
    const inx = htmlText.indexOf('卡号归属地');
    htmlText = htmlText.substring(inx);
    htmlText = htmlText.replace(/<!--.+-->/gi, '').toLowerCase();
    let inx2 = htmlText.indexOf('</td>');
    inx2 = htmlText.indexOf('>', inx2 + 5) + 1;
    const inx3 = htmlText.indexOf('</td>', inx2);
    htmlText = htmlText.substring(inx2, inx3);
    const pTxtArr = htmlText.split('&nbsp;');
    const provinceName = pTxtArr[0];
    let cityName = '';
    let operator = '';
    if (pTxtArr.length >= 2 && pTxtArr[1].length > 0) {
      cityName = pTxtArr[1];
      const shiPo = cityName.lastIndexOf('市');
      if (shiPo > 0) {
        cityName = cityName.substring(0, shiPo);
      }
    }
    if (originalHtmlText.match(/电信/g)) {
      operator = '电信';
    } else if (originalHtmlText.match(/联通/g)) {
      operator = '联通';
    } else if (originalHtmlText.match(/移动/g)) {
      operator = '移动';
    } else {
      operator = 'unknown';
    }
    try {
      const result = { 'province': provinceName, 'city': cityName, 'areacode': '', 'zip': '', 'company': operator, 'card': '' };
      // console.log(result);
      return callback(null, result);
    } catch (e) {
      vlog.eo(e, 'getProvinceForip138');
      return callback(vlog.ee(e, 'getProvinceForip138', phone));
    }
  });
};


/**
 * 查询号码归属地-不入库
 * @param phone
 * @param callback
 */
const getProvince = function(phone, callback) {
  let url = 'http://apis.juhe.cn/mobile/get';
  const data = { 'phone': phone, 'key': '5b94b9852716307d6f7272c555a03d1a', 'dtype': 'json' };
  url += '?' + querystring.stringify(data);
  sendHttpGet(url, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'getProvince', phone));
    }
    //正确代码示例{ resultcode: '200',reason: 'Return Successd!',result: {'province':'湖北','city':'恩施','areacode':','zip':'445000','company':'电信','card':'},error_code: 0}
    //未查到数据信息，但是接口请求正确
    // 代码示例{ resultcode: '200',reason: 'Return Successd!',result: {'province':'','city':'','areacode':','zip':'','company':'','card':'},error_code: 0}
    //错误代码示例{'resultcode':'101','reason':'错误的请求KEY!','result':null,'error_code':10001}
    if (re.resultcode !== '200') {
      vlog.log(re, '请求接口返回错误代码');
      return callback(null, re);
    }
    callback(null, re.result);
  });
};

/**
 * 查询号码归属地-入库
 * @param phone
 * @param callback
 */
const getProvinceAndPush = function(phone, callback) {
  /**
   { province: '湖北',
     city: '恩施',
     areacode: '',
     zip: '445000',
     company: '电信',
     card: '' }
   */
  callback = callback || function(err) {
    if (err) {
      return callback(vlog.ee(err, 'getProvinceAndPush', phone));
    }
  };
  getProvinceForip138(phone, function(err, result) {
    if (err) {
      return callback(vlog.ee(err, '归属地未找到->getProvinceForip138'));
    }

    if (cck.check(result.province, 'strLen', 2)) {
      push(phone, result);
      callback(null, result);
      return;
    }
    getProvince(phone, function(err, re) {
      if (err) {
        return callback(vlog.ee(err, 'getProvinceAndPush', phone));
      }
      //第一个源未找到归属地，查找另一个源
      if (cck.check(re.province, 'strLen', 2)) {
        push(phone, re);
        return callback(null, re);
      } else {
        return callback(null, { 'province': 'unknown', 'city': '' });
      }
    });
  });
};

/**
 * 入库，添加缓存
 * @param phone
 * @param re
 */
const push = function(phone, re) {
  if (!re.province || re.province.length < 2) {
    return;
  }
  const seq = phone.substring(0, 7);
  const setMap = { 'provinceName': re.province, 'cityName': re.city };
  if (re.company) {
    setMap.company = re.company;
  }

  // 入库操作
  mongo.c(provinceTable).updateOne({ 'seq': seq }, { '$set': setMap }, { 'upsert': true }, function(err) {
    if (err) {
      vlog.eo(err, 'add province seq to mongo 存储失败');
    }
  });

  redis.hmset(provinceRedisPre + seq, setMap, function(err) {
    if (err) {
      vlog.eo(err, 'add province seq to redis 存储失败');
    }
  });
};




exports.getProvinceForip138 = getProvinceForip138;
exports.getProvince = getProvince;
exports.getProvinceAndPush = getProvinceAndPush;
exports.findProvinceByPhone = findProvinceByPhone;
exports.findProvinceObjByPhone = findProvinceObjByPhone;



// getProvinceForip138('15385012233', function(err, re){});