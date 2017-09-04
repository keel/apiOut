/*
模拟计费平台协议
 */
'use strict';
const nock = require('nock');
const ktool = require('ktool');
ktool.kconfig.init();
const cck = require('cck');
const vlog = require('vlog').instance(__filename);

const api_in_url = 'http://abcd.com';

// 定死的测试用参数
const api_in_paras = {
  'baoyueType': 101,
  'dianboType': 102,
  'baoyueProductKey': 'aaaaaaaaaaaa',
  'dianboProductKey': 'bbbbbbbbbbbb',
  'baoyueFeeCode': '1888888888',
  'dianboFeeCode': '19999999999',
  'appId': 'example_appid',
  'cpid': '58183ea95024dc575880b9d9',
  'apiInOrderUrl': api_in_url + '/serv/getvrcode',
  'apiInVerifyUrl': api_in_url + '/serv/billing',
  'sync_url': 'http://localhost:' + ktool.kconfig.get('syncStartPort') + '/sync',
  'out_url': 'http://localhost:' + ktool.kconfig.get('startPort') + '/'
};

let orderId = ktool.randomStr(20);
const createOrderId = function createOrderId() {
  orderId = ktool.randomStr(20);
  return orderId;
};

const getOrderId = function getOrderId() {
  return orderId;
};
// let mock_order;
// let mock_verify;

// const logCallback = (fnName) => (err, re) => {
//   if (err) {
//     return console.error(fnName, err);
//   }
//   console.log(fnName + ' re:%j', re.result);
// };

const createBaoYueProduct = function createBaoYueProduct(db, callback) {
  const eid = db.idObj('507f1f77bcf86cd799439011');
  const productExample = {
    'name': 'example包月',
    'type': api_in_paras.baoyueType, //与example.js相同
    'key': api_in_paras.baoyueProductKey,
    'ismpPid': '0',
    'cpid': api_in_paras.cpid,
    'orderUrl': api_in_paras.apiInOrderUrl,
    'verifyUrl': api_in_paras.apiInVerifyUrl,
    'needCallBack': 1,
    'callbackUrl': '', //TODO 暂不发回调
    'state': 10,
    'appId': api_in_paras.appId,
    'feeCode': api_in_paras.baoyueFeeCode,
    'fee': 1000
  };
  db.c(ktool.kconfig.get('productTable')).update({ _id: eid }, { '$set': productExample }, { 'upsert': true }, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'createBaoYueProduct'));
    }
    console.log('createBaoYueProduct done.');
    callback(null);
  });
};

const createDianBoProduct = function createDianBoProduct(db, callback) {
  const eid = db.idObj('507f1f77bcf86cd799439012');
  const productExample = {
    'name': 'example点播',
    'type': api_in_paras.dianboType, //与example.js相同
    'key': api_in_paras.baoyueProductKey,
    'ismpPid': '0',
    'cpid': api_in_paras.cpid,
    'orderUrl': api_in_paras.apiInOrderUrl,
    'verifyUrl': api_in_paras.apiInVerifyUrl,
    'needCallBack': 1,
    'callbackUrl': '',
    'state': 10,
    'appId': api_in_paras.appId,
    'feeCode': api_in_paras.dianboFeeCode,
    'fee': 1000
  };
  db.c(ktool.kconfig.get('productTable')).update({ _id: eid }, { '$set': productExample }, { 'upsert': true }, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'createBaoYueProduct'));
    }
    console.log('createDianBoProduct done.');
    callback(null);
  });
};

const clearExampleProducts = function clearExampleProducts(db) {
  db.c(ktool.kconfig.get('productTable')).deleteOne({ 'type': 101 });
  db.c(ktool.kconfig.get('productTable')).deleteOne({ 'type': 102 });
  console.log('example products cleaned.');
};



const nockAppIn = function nockAppIn() {
  nock(api_in_url)
    .post('/serv/getvrcode')
    .reply(200, function(uri, requestBody) {
      try {
        const reqJson = requestBody;
        const checkParaRe = cck.checkBatch([
          [reqJson.app_id, 'strLen', [2, 20]],
          [reqJson.phone, 'strLen', [11, 20]],
          [reqJson.fee_id, 'strLen', [2, 20]]
        ]);
        if (checkParaRe.length > 0) {
          return { 'res_code': -888, 'message': 'order参数错误' + checkParaRe };
        }

        //TODO 校验签名

        return { 'res_code': 0, 'message': '短信验证码已成功发送', 'trade_id': createOrderId() };
      } catch (e) {
        console.error(e.stack);
        return { 'res_code': -999, 'message': 'order请求参数错误' };
      }
    });

  nock(api_in_url)
    .post('/serv/billing')
    .reply(200, function(uri, requestBody) {
      try {
        const reqJson = requestBody;
        const checkParaRe = cck.checkBatch([
          [reqJson.app_id, 'strLen', [2, 20]],
          [reqJson.fee_id, 'strLen', [2, 20]],
          [reqJson.trade_id, 'strLen', [15, 25]],
          [reqJson.sms_code, 'strLen', [4, 10]]
        ]);
        if (checkParaRe.length > 0) {
          return { 'res_code': -888, 'message': 'verify参数错误' + checkParaRe };
        }

        //TODO 校验签名


        return { 'res_code': 0, 'message': '同步计费成功', 'trade_id': getOrderId() };
      } catch (e) {
        console.error(e.stack);
        return { 'res_code': -999, 'message': 'verify请求参数错误' };
      }
    });

};
const nockClean = function nockClean() {
  nock.cleanAll();
};
const mock_sync = function mock_sync(syncType, isSucc, callback) {
  const syncRe = {
    'charge_result': 0,
    'sync_type': syncType || 100, //100为订购，300为退订
    'trade_id': getOrderId()
  };
  if (!isSucc) {
    syncRe.code = -1999;
    syncRe.message = 'sync订购失败';
  } else {
    syncRe.message = 'sync订购成功';
  }
  ktool.httpPost(api_in_paras.sync_url, JSON.stringify(syncRe), (err, syncRe) => {
    if (err) {
      return callback(vlog.ee(err, 'mock_sync', getOrderId()));
    }
    // console.log('syncRe:%j',syncRe);
    try {
      const syncReJson = JSON.parse(syncRe);
      if (syncReJson.res_code === '0') {
        return callback(null, 0);
      }
      return callback(null, -1);
    } catch (e) {
      console.error(e.stack);
      //TODO 一次失败可能重试,这里暂不考虑
      return callback(null, -2);
    }
  });
};
exports.createOrderId = createOrderId;
exports.getOrderId = getOrderId;
exports.createDianBoProduct = createDianBoProduct;
exports.createBaoYueProduct = createBaoYueProduct;
exports.clearExampleProducts = clearExampleProducts;
exports.nockAppIn = nockAppIn;
exports.mock_sync = mock_sync;
exports.nockClean = nockClean;
exports.api_in_paras = api_in_paras;