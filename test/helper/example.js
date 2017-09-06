/*
使用apiOut的样例,此为包月业务
 */
'use strict';
const apiOut = require('../../lib/apiOut');
const apiRisk = require('../../lib/apiRisk');
const apiActions = require('../../lib/apiActions');
// const querystring = require('querystring');
const kc = require('kc');
const db = kc.mongo.init();
const ktool = require('ktool');
const testDatas = require('./testDatas');
const kconfig = kc.kconfig;
const vlog = require('vlog').instance(__filename);
const apiName = testDatas.paras.apiName; //自定义名称
const apiType = testDatas.paras.baoyueType; //自定义类型, 双数为点播，单数为包月，对应product表类型


const mkOrder = function mkOrder(reqObj, productObj, callback) {
  const orderReq = {
    'app_id': productObj.appId,
    'fee_id': productObj.feeCode,
    'phone': reqObj.phone,
    'sign': 'signStr' //mock不进行sign校验
  };
  // console.log('order action,reqObj:%j, productObj:%j \n%j', reqObj, productObj, JSON.stringify(orderReq));
  ktool.httpPost(productObj.orderUrl, JSON.stringify(orderReq), (err, orderRe) => {
    if (err) {
      return callback(vlog.ee(err, 'mkOrder:httpPost', reqObj));
    }
    try {
      const orderReJson = JSON.parse(orderRe);
      const respObj = {
        'code': (orderReJson.res_code + '' === '0') ? '0' : orderReJson.res_code + '',
        'desc': orderReJson.message,
        'orderId': orderReJson.trade_id, //使用计费平台的trade_id 作为本平台的orderId，如果计费平台的不能用，则需要自己生成一个平台唯一的orderId
        'plus': {
          'trade_id': orderReJson.trade_id, //额外记录到order表的字段,可用于后面的verify或sync
          'pid': productObj.feeCode // 用于sync时能直接从order表取到feeCode
        }
      };
      return callback(null, respObj);
    } catch (e) {
      return callback(vlog.ee(e, 'mkOrder:re', reqObj));
    }
  });
};

const mkVerify = function mkVerify(verifyCode, orderObj, callback) {
  const reqObj = {
    'app_id': orderObj.appId,
    'fee_id': orderObj.feeCode,
    'sms_code': verifyCode,
    'trade_id': orderObj.orderId, //这里orderId在order时直接使用了trade_id,如果orderId没有使用trade_id，则通过order表的trade_id字段获取(即:'trade_id':orderObj.trade_id)
    'sign': 'signStr'
  };
  ktool.httpPost(orderObj.verifyUrl, JSON.stringify(reqObj), (err, verifyRe) => {
    if (err) {
      return callback(vlog.ee(err, 'mkVerify:httpPost', reqObj));
    }
    try {
      const verifyReJson = JSON.parse(verifyRe);
      const respObj = {
        'code': (verifyReJson.res_code + '' === '0') ? '0' : verifyReJson.res_code + '',
        'desc': verifyReJson.message
      };
      return callback(null, respObj);
    } catch (e) {
      return callback(vlog.ee(e, 'mkOrder:re', reqObj));
    }
  });
};


const withdraw = function withdraw(cpReqObj, productObj, callback) {
  const reqObj = {
    'app_id': productObj.appId,
    'fee_id': productObj.feeCode,
    'phone': cpReqObj.phone,
    'sign': 'signStr'
  };
  // console.log('withdrawUrl:%j',productObj.withdrawUrl);
  ktool.httpPost(productObj.withdrawUrl, JSON.stringify(reqObj), (err, withdrawRe) => {
    if (err) {
      return callback(vlog.ee(err, 'withdraw:httpPost', reqObj));
    }
    try {
      const withdrawReJson = JSON.parse(withdrawRe);
      const respObj = {
        'code': (withdrawReJson.res_code + '' === '0') ? '0' : withdrawReJson.res_code + '',
        'desc': withdrawReJson.message
      };
      return callback(null, respObj);
    } catch (e) {
      return callback(vlog.ee(e, 'withdraw:re', reqObj));
    }
  });
};

const search = function search(cpReqObj, productObj, callback) {
  const reqObj = {
    'app_id': productObj.appId,
    'fee_id': productObj.feeCode,
    'phone': cpReqObj.phone,
    'sign': 'signStr'
  };
  ktool.httpPost(productObj.searchUrl, JSON.stringify(reqObj), (err, searchRe) => {
    if (err) {
      return callback(vlog.ee(err, 'search:httpPost', reqObj));
    }
    try {
      const searchReJson = JSON.parse(searchRe);
      const respObj = {
        'code': searchReJson.res_code + '',
        'desc': searchReJson.message || searchReJson.results
      };
      return callback(null, respObj);
    } catch (e) {
      return callback(vlog.ee(e, 'search:re', reqObj));
    }
  });
};


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
    'riskChecker': apiRisk.baoyueRisk,
    doAction: mkOrder
  },
  'verify': {
    'reqParas': [
      ['productKey', /^[A-Za-z0-9]{12}$/g],
      ['verifyCode', /^[A-Za-z0-9]{4}$/g],
      ['orderId', /^[\w-]{0,50}$/g],
      ['timeStamp', /^(\d{4})-(0\d{1}|1[0-2])-(0\d{1}|[12]\d{1}|3[01]) (0\d{1}|1\d{1}|2[0-3]):[0-5]\d{1}:([0-5]\d{1})$/i]
    ],
    doAction(reqObj, productObj, callback) {
      apiActions.actionMap.verify(apiName, reqObj, productObj, (err, orderObj) => {
        if (err) {
          return callback(vlog.ee(err, 'verify:' + apiName));
        }
        mkVerify(reqObj.verifyCode, orderObj, callback);
      });
    }
  },
  'withdraw': apiActions.actionMap.withdraw(withdraw),
  'search': apiActions.actionMap.search(search)
};

const syncAction = function(req, body, callback) {

  // vlog.log('sync body:%s, url:%s', body, req.url);

  const syncObj = JSON.parse(body);
  const result = syncObj.charge_result + '';
  // 如果计费平台sync信息中没有phone和feeCode，则需要做一次查找，如果有则不需要
  db.c(apiName + '_order').findOne({ 'orderId': syncObj.trade_id }, { 'sort': { 'createTime': -1 } }, (err, orderRe) => {
    if (err) {
      return callback(vlog.ee(err, 'syncAction', body));
    }

    const sync_user = (orderRe) ? orderRe.phone : null;
    const sync_feeId = (orderRe) ? orderRe.pid : null;

    const reObj = {
      'sync_re_code': result, //"0"是成功，其他是错误码
      'sync_re_desc': syncObj.message, //这里的描述将透传给CP，一般直接用sync的信息
      'sync_type': (syncObj.sync_type === 100) ? 0 : 3, //0为订购请求，3为退订请求,需要转换,其他值用计费平台原值
      'sync_obj': syncObj, //sync原始数据，将存入sync表
      'sync_query': { 'trade_id': syncObj.trade_id }, //此次通知的唯一标识,用于防止同一sync多次发送
      'sync_user': sync_user, //用于用户关系表生成的用户phone
      'sync_feeId': sync_feeId, //用于用户关系表生成的计费点ID,注意同一计费点退订请求请保持与订购一致
      // 'sync_fee': orderRe.fee, //点播时需要传计费点价格，不需要feeId
      'respBody': '{"res_code":"0"}', // 不同基地的异步通知接口回传的post body内容(string）
      'cpNoti': { 'phone': orderRe.phone }, //传给cp的部分内容,如果为null则不传给cp,api_out会加上orderId和cpOrder及状态(json)
      'orderQuery': { 'orderId': syncObj.trade_id } //更新原order表内容的条件,如果为null则不更新,注意为null时也无法通知cp,因为无法定位productKey
    };

    callback(null, reObj);

  });


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
      'riskChecker': apiRisk.baoyueRisk,
      'doAction': syncAction
    }
  }
};



//orderAction,verifyAction,syncAction,withdrawAction,searchAction

const api_out = apiOut.instance(apiName, apiType, [outServer, syncServer]);

exports.start = api_out.servers.out.start;
exports.syncStart = api_out.servers.sync.start;