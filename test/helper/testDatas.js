'use strict';

const nock = require('nock');
const ktool = require('ktool');
ktool.kconfig.init();
const vlog = require('vlog').instance(__filename);

const api_in_url = 'http://abcd.com';

// 定死的测试用参数
const paras = {
  'apiName': 'example1',
  'apiName2': 'example2',
  'api_in_url': api_in_url,
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
  'apiInOrderUrl2': api_in_url + '/dianbo/getvrcode',
  'apiInVerifyUrl2': api_in_url + '/dianbo/billing',
  'sync_url': 'http://localhost:' + ktool.kconfig.get('syncStartPort') + '/sync',
  'out_url': 'http://localhost:' + ktool.kconfig.get('startPort') + '/',
  'sync_url2': 'http://localhost:' + ktool.kconfig.get('syncStartPort2') + '/sync',
  'out_url2': 'http://localhost:' + ktool.kconfig.get('startPort2') + '/',
  'cpUrl': 'http://xyz.com',
  'cpNotiUrl': 'http://xyz.com/noti'
};

let orderId = ktool.randomStr(20);
const createOrderId = function createOrderId() {
  orderId = ktool.randomStr(20);
  return orderId;
};

const getOrderId = function getOrderId() {
  return orderId;
};

let phone = 15301580000;
const getPhone = function getPhone() {
  return phone + '';
};

const newPhone = function newPhone() {
  phone++;
  return phone + '';
};

const createBaoYueProduct = function createBaoYueProduct(db, callback) {
  const eid = db.idObj('507f1f77bcf86cd799439011');
  const productExample = {
    'name': 'example包月',
    'type': paras.baoyueType, //与example.js相同
    'key': paras.baoyueProductKey,
    'ismpPid': '0',
    'cpid': paras.cpid,
    'orderUrl': paras.apiInOrderUrl,
    'verifyUrl': paras.apiInVerifyUrl,
    'needCallBack': 1,
    'callbackUrl': paras.cpNotiUrl,
    'state': 10,
    'appId': paras.appId,
    'feeCode': paras.baoyueFeeCode,
    'fee': 1000
  };
  db.c(ktool.kconfig.get('productTable')).updateOne({ _id: eid }, { '$set': productExample }, { 'upsert': true }, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'createBaoYueProduct'));
    }
    const riskData = { 'productName': paras.apiName, 'state': 0, 'monthUserLimit': 0, 'monthUserNum': 0, 'dayUserLimit': 0, 'dayUserNum': 0, 'dayFeeLimit': 0, 'monthFeeLimit': 0, 'dayFeeNum': 0, 'monthFeeNum': 0 };
    db.c(ktool.kconfig.get('riskLimitTable')).updateOne({ 'productKey': paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': riskData }, { 'upsert': true }, (err) => {
      if (err) {
        return callback(vlog.ee(err, 'createBaoYueProduct:riskRule'));
      }

      console.log('createBaoYueProduct done.');
      callback(null);

    });
  });
};

const createDianBoProduct = function createDianBoProduct(db, callback) {
  const eid = db.idObj('507f1f77bcf86cd799439012');
  const productExample = {
    'name': 'example点播',
    'type': paras.dianboType, //与example.js相同
    'key': paras.dianboProductKey,
    'ismpPid': '0',
    'cpid': paras.cpid,
    'orderUrl': paras.apiInOrderUrl2,
    'verifyUrl': paras.apiInVerifyUrl2,
    'needCallBack': 1,
    'callbackUrl': paras.cpNotiUrl,
    'state': 10,
    'appId': paras.appId,
    'feeCode': paras.dianboFeeCode
  };

  db.c(ktool.kconfig.get('productTable')).updateOne({ _id: eid }, { '$set': productExample }, { 'upsert': true }, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'createDianBoProduct'));
    }
    const riskData = { 'productName': paras.apiName, 'state': 0, 'monthUserLimit': 0, 'monthUserNum': 0, 'dayUserLimit': 0, 'dayUserNum': 0, 'dayFeeNum': 0, 'monthFeeNum': 0, 'dianBoDayUserLimit': 0, 'dianBoMonthUserLimit': 0 };
    db.c(ktool.kconfig.get('riskLimitTable')).updateOne({ 'productKey': paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': riskData }, { 'upsert': true }, (err) => {
      if (err) {
        return callback(vlog.ee(err, 'createDianBoProduct:riskRule'));
      }

      console.log('createDianBoProduct done.');
      callback(null);

    });
  });
};


const clearTestTables = function clearTestTables(db, apiName) {
  db.c(apiName + '_order').drop();
  db.c(apiName + '_sync').drop();
  db.c(apiName + '_user').drop();
  db.c(apiName + '_noti_cp').drop();
  db.c(apiName + '_withdraw').drop();
  db.c(apiName + '_search').drop();
  console.log(apiName + '_* tables droped.');
};

const clearExampleProducts = function clearExampleProducts(db) {
  db.c(ktool.kconfig.get('productTable')).deleteMany({ 'type': 101 });
  db.c(ktool.kconfig.get('riskLimitTable')).deleteMany({ 'productKey': paras.baoyueProductKey });
  console.log('example1 products cleaned.');
};
const clearExampleProducts2 = function clearExampleProducts2(db) {
  db.c(ktool.kconfig.get('productTable')).deleteMany({ 'type': 102 });
  db.c(ktool.kconfig.get('riskLimitTable')).deleteMany({ 'productKey': paras.dianboProductKey });
  console.log('example2 products cleaned.');
};

const nockClean = function nockClean() {
  nock.cleanAll();
};

const checkTableData = function checkTableData(db, table, query, len, compareFn, callback) {
  db.c(table).query(query, (err, queryRe) => {
    if (err) {
      return vlog.eo(err, 'checkTableData:query');
    }
    if (queryRe.length < len) {
      return callback(null, 'len error' + queryRe.length);
    }
    const compareArr = [];
    for (let i = 0, len = queryRe.length; i < len; i++) {
      if (!compareFn(queryRe[i])) {
        compareArr.push(queryRe);
      }
    }
    if (compareArr.length > 0) {
      return callback(null, compareArr);
    }
    callback(null, 'ok');
  });
};


exports.getPhone = getPhone;
exports.newPhone = newPhone;
exports.checkTableData = checkTableData;
exports.clearTestTables = clearTestTables;
exports.createOrderId = createOrderId;
exports.getOrderId = getOrderId;
exports.createDianBoProduct = createDianBoProduct;
exports.createBaoYueProduct = createBaoYueProduct;
exports.clearExampleProducts = clearExampleProducts;
exports.clearExampleProducts2 = clearExampleProducts2;
exports.nockClean = nockClean;
exports.paras = paras;