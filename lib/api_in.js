/*
负责在内部与具体的计费平台对接
 */
'use strict';
const apiOut = require('./apiOut');
const apiRisk = require('./apiRisk');
const querystring = require('querystring');
const apiActions = require('./apiActions');
const kconfig = require('ktool').kconfig;
const vlog = require('vlog').instance(__filename);
const apiName = 'tykj';
const apiType = 11; //双数为点播，单数为包月，对应product表类型


const outActions = {
  'order': {
    'reqParas': [
      ['productKey', /^[A-Za-z0-9]{12}$/g],
      ['phone', /^1[\d]{10}$/g],
      ['imsi', /^[A-Za-z0-9]{10,20}$/g],
      ['imei', /^[A-Za-z0-9]{10,20}$/g],
      ['cpOrder', /^\w{0,50}$/g],
      ['timeStamp', /^(\d{4})-(0\d{1}|1[0-2])-(0\d{1}|[12]\d{1}|3[01]) (0\d{1}|1\d{1}|2[0-3]):[0-5]\d{1}:([0-5]\d{1})$/i]
    ],
    'riskChecker': apiRisk.baoyueRiskChecker,
    doAction(reqObj, productObj, callback) {
      //mkOrder(reqObj, productObj, callback);
      const respObj = {
        'code': '0',
        'desc': 'ok',
        'orderId': 'orderId',
        'plus': {
          'pid': productObj.feeCode
        }
      };
      callback(null, respObj);
    }
  },
  'verify': {
    'reqParas': [
      ['productKey', /^[A-Za-z0-9]{12}$/g],
      ['verifyCode', /^[A-Za-z0-9]{4}$/g],
      ['orderId', /^[\w-]{0,50}$/g],
      ['timeStamp', /^(\d{4})-(0\d{1}|1[0-2])-(0\d{1}|[12]\d{1}|3[01]) (0\d{1}|1\d{1}|2[0-3]):[0-5]\d{1}:([0-5]\d{1})$/i]
    ],
    doAction(reqObj, productObj, callback) {
      apiActions.verify(apiName, reqObj, productObj, (err, orderObj) => {
        if (err) {
          return callback(vlog.ee(err, 'verify:' + apiName));
        }
        // mkVerify(reqObj.verifyCode, orderObj, callback);
        callback(null, { 'code': 0, 'desc': 'ok' });
      });
    }
  }
};

const syncAction = function(req, body, callback) {
  //--------------------------------------
  //!!!! 注意更新产品时，这里也要更新
  const productMap = {
    'A4B0B95DC06F4991BD95E9010E7D8552': 'A3FFPzZZoAEj'
  };
  //--------------------------------------
  // vlog.log('sync body:%s, url:%s', body, req.url);
  const syncObj = querystring.parse(body);
  const result = syncObj.chargeResult + '';
  const reObj = {
    'sync_re_code': '0', //"0"是成功，其他是错误码
    'sync_re_desc': syncObj.chargeDesc,
    'sync_type': 0, //0为订购请求，3为退订请求
    'sync_obj': syncObj, //sync原始数据，将存入sync表
    'sync_query': { 'orderSn': syncObj.orderSn }, //此次通知的唯一标识
    'sync_user': syncObj.IMSI, //用于用户关系表生成的用户phone
    'sync_feeId': syncObj.chargeId, //用于用户关系表生成的计费点ID,注意同一计费点退订请求请保持与订购一致
    'respBody': '{"res_code":"0"}', // 不同基地的异步通知接口回传的post body内容(string）
    'cpNoti': { 'imsi': syncObj.IMSI }, //传给cp的部分内容,如果为null则不传给cp,api_out会加上orderId和cpOrder及状态(json)
    'orderQuery': { 'imsi': syncObj.IMSI, 'productKey': productMap[syncObj.chargeId] } //更新原order表内容的条件,如果为null则不更新,注意为null时也无法通知cp,因为无法定位productKey
  };

  if (result === '-100') {
    reObj.sync_type = 3;
  } else if (result === '-99') {
    reObj.sync_type = 0;
  } else {
    reObj.sync_re_code = result;
  }
  callback(null, reObj);
};

const outServer = {
  'serverName': apiName + '_out',
  'port': kconfig.get('startPort'),
  'serverType': 'out',
  'actions': outActions
};

const syncServer = {
  'serverName': apiName + '_sync',
  'port': kconfig.get('syncStartPort'),
  'serverType': 'sync',
  'actions': {
    'sync': {
      'riskChecker': apiRisk.baoyueOrderRisk,
      'doAction': syncAction
    }
  }
};



//orderAction,verifyAction,syncAction,withDrawAction,searchAction

const api_out = apiOut.instance(apiName, apiType, [outServer, syncServer]);

exports.start = api_out.servers.out.start;
exports.syncStart = api_out.servers.sync.start;

