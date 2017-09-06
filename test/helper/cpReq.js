/*
模拟合作方请求
 */
'use strict';

const nock = require('nock');
const ktool = require('ktool');
const cck = require('cck');
const testDatas = require('./testDatas');

const vlog = require('vlog').instance(__filename);

const dianboOrder = function dianboOrder(phone, callback) {
  const reqObj = {
    'productKey': testDatas.paras.dianboProductKey,
    'phone': phone || testDatas.newPhone(),
    'fee': '300',
    'imsi': '460110141997290',
    'imei': '99000856081851',
    'cpOrder': 'testcporder20170823',
    'timeStamp': cck.msToTime()
  };
  const cpSec = testDatas.paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.phone + reqObj.fee + reqObj.imsi + reqObj.imei + reqObj.cpOrder + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('baoyueOrder', testDatas.paras.out_url);
  ktool.httpPost(testDatas.paras.out_url2 + 'order', JSON.stringify(reqObj), function(err, re) {
    // ktool.httpPost('http://58.223.2.136/tykj_api/order', JSON.stringify(reqObj), function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'httpPost'));
    }
    //     console.log(`
    // ======== cp order ========
    // ${re}
    // ======== order end =======`);
    callback(null, re);
  });
};

const baoyueOrder = function baoyueOrder(phone, callback) {
  const reqObj = {
    'productKey': testDatas.paras.baoyueProductKey,
    'phone': phone || testDatas.newPhone(),
    // 'orderMount': '1000',
    // 'iccid': '89860315747710835072',
    'imsi': '460110141997290',
    'imei': '99000856081851',
    'cpOrder': 'testcporder20170823',
    'timeStamp': cck.msToTime()
  };
  const cpSec = testDatas.paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.phone + reqObj.imsi + reqObj.imei + reqObj.cpOrder + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('baoyueOrder', testDatas.paras.out_url);
  ktool.httpPost(testDatas.paras.out_url + 'order', JSON.stringify(reqObj), function(err, re) {
    // ktool.httpPost('http://58.223.2.136/tykj_api/order', JSON.stringify(reqObj), function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'httpPost'));
    }
    //     console.log(`
    // ======== cp order ========
    // ${re}
    // ======== order end =======`);
    callback(null, re);
  });
};

const verify = function verify(outUrl, productKey, callback) {
  const reqObj = {
    'productKey': productKey,
    'orderId': testDatas.getOrderId(),
    'verifyCode': '1234',
    'timeStamp': cck.msToTime()
  };
  const cpSec = testDatas.paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.verifyCode + reqObj.orderId + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('baoyueVerify', testDatas.paras.out_url);
  ktool.httpPost(outUrl + 'verify', JSON.stringify(reqObj), function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'httpPost'));
    }
    //     console.log(`
    // ======== cp verify ========
    // ${re}
    // ======== order end =======`);
    callback(null, re);
  });
};

const baoyueVerify = function baoyueVerify(callback) {
  verify(testDatas.paras.out_url, testDatas.paras.baoyueProductKey, callback);
};

const dianboVerify = function dianboVerify(callback) {
  verify(testDatas.paras.out_url2, testDatas.paras.dianboProductKey, callback);
};

const withdraw = function withdraw(phone, callback) {
  const reqObj = {
    'productKey': testDatas.paras.baoyueProductKey,
    'phone': phone || testDatas.getPhone(),
    'timeStamp': cck.msToTime()
  };
  const cpSec = testDatas.paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.phone + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('withdraw', testDatas.paras.out_url);
  ktool.httpPost(testDatas.paras.out_url + 'withdraw', JSON.stringify(reqObj), function(err, re) {
    // ktool.httpPost('http://58.223.2.136/tykj_api/order', JSON.stringify(reqObj), function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'httpPost'));
    }
    callback(null, re);
  });
};

const search = function search(phone, callback) {
  const reqObj = {
    'productKey': testDatas.paras.baoyueProductKey,
    'phone': phone || testDatas.getPhone(),
    'timeStamp': cck.msToTime()
  };
  const cpSec = testDatas.paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.phone + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('search', testDatas.paras.out_url);
  ktool.httpPost(testDatas.paras.out_url + 'search', JSON.stringify(reqObj), function(err, re) {
    // ktool.httpPost('http://58.223.2.136/tykj_api/order', JSON.stringify(reqObj), function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'httpPost'));
    }
    callback(null, re);
  });
};

// 模拟CP接收回调
const receiveSync = function receiveSync(callback) {
  nock(testDatas.paras.cpUrl)
    .post('/noti')
    .reply(200, function(uri, requestBody) {
      try {
        // console.log('cp noti receiveSync:%j', requestBody);
        const reqJson = requestBody;
        if (reqJson.re + '' === '0') {
          callback(null, 0);
          return 'ok';
        }
        callback(null, -4);
        return 'ok';
      } catch (e) {
        console.error(e.stack);
        callback(null, -5);
        return 'ok';
      }
    });
};

exports.withdraw = withdraw;
exports.search = search;
exports.receiveSync = receiveSync;
exports.baoyueOrder = baoyueOrder;
exports.dianboOrder = dianboOrder;
exports.dianboVerify = dianboVerify;
exports.baoyueVerify = baoyueVerify;