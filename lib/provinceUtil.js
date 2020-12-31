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
const ktool = require('ktool');
// const iconv = require('iconv-lite');
const cck = require('cck');

const provinceTable = kc.kconfig.get('provinceTable');
const provinceRedisPre = 'provinceSeq:seq:';



// 初始化号段表到redis,仅需要在某个项目中手动执行一次
const buildProvineSeqToRedis = function() {
  const cacheTables = [
    'provinceSeq#seq',
  ];
  kc.iCache.cacheMake('redis', 'mongo', cacheTables, function(err) {
    if (err) {
      vlog.eo(err, 'cacheMake', cacheTables);
      return;
    }
    vlog.log('===> cacheTables done.');
  });
};

// const t2345 = function(phone, callback) {
//   ktool.httpGet('http://tools.2345.com/frame/black/mobile/' + phone, (err, re) => {
//     if (err) {
//       return vlog.eo(err, '');
//     }
//     const htmlStr = iconv.decode(re, 'gb2312');
//     let p1 = htmlStr.indexOf('/haoma/shouji/' + phone);
//     p1 = htmlStr.indexOf('号码归属地', p1) + 6;
//     let p2 = htmlStr.indexOf('手机卡类型', p1);
//     if (p1 < 0 || p2 < 0) {
//       vlog.log(htmlStr);
//       return callback(null, { 'city': 'unknown', 'province': 'unknown' });
//     }
//     const htmls2 = htmlStr.substring(p1, p2);
//     // console.log(htmls2);
//     p1 = htmls2.indexOf('<strong>') + 8;
//     p2 = htmls2.indexOf('</strong>', p1);
//     if (p1 < 0 || p2 < 0) {
//       vlog.log(htmls2);
//       return callback(null, { 'city': 'unknown', 'province': 'unknown' });
//     }
//     const locationStr = htmls2.substring(p1, p2).trim();
//     // console.log(locationStr);
//     const provincePo = locationStr.indexOf('省');
//     if (provincePo < 0) {
//       if (locationStr.length < 2) {
//         vlog.log(htmls2);
//         return callback(null, { 'city': 'unknown', 'province': 'unknown' });
//       }
//       let cityPo = 2;
//       let province = locationStr.substring(0, cityPo);

//       if (province === '内蒙') {
//         province = '内蒙古';
//         cityPo = 3;
//       } else if (province === '黑龙') {
//         province = '黑龙江';
//         cityPo = 3;
//       } else if(province === '未知'){
//         province = 'unknown';
//       }
//       const city = locationStr.substring(cityPo);
//       return callback(null, { city, province });
//     }
//     const province = locationStr.substring(0, provincePo);
//     const city = locationStr.substring(provincePo + 1).replace(/市/g, '');
//     // console.log('re:[%s]', locationStr);
//     callback(null, { city, province });
//   });
// };


const findProvinceByPhone = function(phone, callback) {
  if (!phone || !phone.length || phone.length < 8) {
    return callback(null, 'unknown');
  }
  const seq = phone.substring(0, 7);
  redis.hgetall(provinceRedisPre + seq, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'findProvinceByPhone:hgetall:' + seq));
    }
    if (re && re.provinceName) {
      return callback(null, re.provinceName);
    }
    // t2345(phone, (err, re) => {
    //   if (err) {
    //     vlog.eo(err, 't2345', phone);
    //     return callback(null, 'unknown');
    //   }
    //   if (re && re.province) {
    //     callback(null, re.province);
    //     push(phone, re);
    //     return;
    //   }
    //   callback(null, 'unknown');
    // });

    callback(null, 'unknown');
    // vlog.warn('findProvinceByPhone:can not find province in redis, will find it. seq:%j', phone);
    // try {
    //   getProvinceAndPush(phone);
    // } catch (e) {
    //   vlog.error(e.stack);
    // }
  });
};

const findProvinceObjByPhone = function(phone, callback) {
  if (!phone || !phone.length || phone.length < 8) {
    return callback(null, 'unknown');
  }
  const seq = phone.substring(0, 7);
  redis.hgetall(provinceRedisPre + seq, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'findProvinceByPhone:hgetall:' + seq));
    }
    if (re && re.provinceName) {
      return callback(null, re);
    }
    callback(null, { 'provinceName': 'unknown' });
    // vlog.warn('findProvinceObjByPhone:can not find province in redis, will find it. seq:%j', phone);
    // try {
    //   getProvinceAndPush(phone);
    // } catch (e) {
    //   vlog.error(e.stack);
    // }
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
    'headers': {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Referer': 'https://www.ip138.com',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
    }
  };
  const url = 'https://www.ip138.com/mobile.asp?mobile=' + phone + '&action=mobile';
  ktool.httpGet(url, options, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'sendHttpGetForip138', phone));
    }
    const reStr = '' + re;
    // callback(null, iconv.decode(reStr, 'gb2312'));
    callback(null, reStr);
  });
};



const parseIp138 = function(htmlText) {
  try {
    const originalHtmlText = htmlText;
    const inx = htmlText.indexOf('卡号归属地');
    htmlText = htmlText.substring(inx);
    htmlText = htmlText.replace(/<!--.+?-->/gi, '').toLowerCase();
    let inx2 = htmlText.indexOf('</td>');
    inx2 = htmlText.indexOf('>', inx2 + 5) + 1;
    const inx3 = htmlText.indexOf('</td>', inx2);
    htmlText = htmlText.substring(inx2, inx3);
    htmlText = htmlText.replace(/<.+?>/gi, '').toLowerCase();
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
    const result = { 'province': provinceName, 'city': cityName, 'areacode': '', 'zip': '', 'company': operator, 'card': '' };
    // console.log(result);
    return result;
  } catch (e) {
    vlog.eo(e, 'getProvinceForip138');
    return null;
  }
};


const getProvinceForip138 = function(phone, callback) {
  sendHttpGetForip138(phone, function(err, htmlText) {
    if (err) {
      return callback(vlog.ee(err, 'getProvinceForip138', phone));
    }
    const re = parseIp138(htmlText);
    if (re && re.province) {
      callback(null, re);
    } else {
      callback();
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
    if (result) {
      if (cck.check(result.province, 'strLen', 2)) {
        push(phone, result);
        callback(null, result);
        return;
      }
    }

    // getProvince(phone, function(err, re) {
    //   if (err) {
    //     return callback(vlog.ee(err, 'getProvinceAndPush', phone));
    //   }
    //   //第一个源未找到归属地，查找另一个源
    //   if (cck.check(re.province, 'strLen', 2)) {
    //     push(phone, re);
    //     return callback(null, re);
    //   } else {
    //     return callback(null, { 'province': 'unknown', 'city': '' });
    //   }
    // });
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
exports.buildProvineSeqToRedis = buildProvineSeqToRedis;


// t2345('18107333556', (err, re) => {
//   if (err) {
//     return vlog.eo(err, '');
//   }
//   console.log(re);
// });




//