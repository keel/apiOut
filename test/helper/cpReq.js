/*
模拟合作方请求
 */
'use strict';

const ktool = require('ktool');
const cck = require('cck');
const api_in = require('./api_in');

const vlog = require('vlog').instance(__filename);

const baoyueOrder = function baoyueOrder(callback) {
  const reqObj = {
    'productKey': api_in.api_in_paras.baoyueProductKey,
    'phone': '15301589999',
    // 'orderMount': '1000',
    // 'iccid': '89860315747710835072',
    'imsi': '460110141997290',
    'imei': '99000856081851',
    'cpOrder': 'testcporder20170823',
    'timeStamp': cck.msToTime()
  };
  const cpSec = api_in.api_in_paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.phone + reqObj.imsi + reqObj.imei + reqObj.cpOrder + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('baoyueOrder', api_in.api_in_paras.out_url);
  ktool.httpPost(api_in.api_in_paras.out_url + 'order', JSON.stringify(reqObj), function(err, re) {
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

const baoyueVerify = function baoyueVerify(callback) {
  const reqObj = {
    'productKey': api_in.api_in_paras.baoyueProductKey,
    'orderId': api_in.getOrderId(),
    'verifyCode': '1234',
    'timeStamp': cck.msToTime()
  };
  const cpSec = api_in.api_in_paras.cpid;
  const signSrc = '' + reqObj.productKey + reqObj.verifyCode + reqObj.orderId + reqObj.timeStamp + cpSec;
  // console.log('signSrc:%s', signSrc);
  const signStr = ktool.md5(signSrc).toUpperCase();
  reqObj.sign = signStr;
  // console.log('baoyueVerify', api_in.api_in_paras.out_url);
  ktool.httpPost(api_in.api_in_paras.out_url + 'verify', JSON.stringify(reqObj), function(err, re) {
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

//TODO  模拟CP接收回调
const receiveSync = function receiveSync(body, callback) {
  const reJson = JSON.parse(body);

};

exports.baoyueOrder = baoyueOrder;
exports.baoyueVerify = baoyueVerify;