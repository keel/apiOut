/**
 * apiGate用到的各类action,主要包括orderAction,verifyAction,syncAction,withDrawAction,searchAction,可扩展新的action.
 * Action通过名称与apiGate请求URL的次级目录对应, http://host/apiName/order 对应orderAction
 */
'use strict';

const cck = require('cck');
const ktool = require('ktool');
const kc = require('kc');
const db = kc.mongo.init();
const vlog = require('vlog').instance(__filename);


const productTable = ktool.kconfig.get('productTable');

const findProduct = (productKey, callback) => {
  if (!productKey) {
    return callback(null);
  }
  const query = { 'key': productKey };
  db.c(productTable).findOne(query, (err, doc) => {
    if (err) {
      return callback(vlog.ee(err, 'findProduct:findOne', query));
    }
    return callback(null, doc);
  });
};


const concatObj = function(org, addOnObj, keyPre) {
  keyPre = keyPre || '';
  for (const i in addOnObj) {
    org[keyPre + i] = addOnObj[i];
  }
  return org;
};

const syncFindOrder = function(apiName, orderQuery, callback) {
  if (!orderQuery) {
    return callback(null, null);
  }
  db.c(apiName + '_order').findOne(orderQuery, { 'sort': { 'createTime': -1 } }, function(err, orderObj) {
    if (err) {
      return callback(vlog.ee(err, 'syncServer:syncFindOrder', orderQuery));
    }
    if (!orderObj) {
      vlog.error('!!!======= > sync-orderObj not found. table:%j, orderQuery:%j', apiName + '_order', orderQuery);
      return callback(null);
    }
    callback(null, orderObj);
  });
};


const sendToCp = function(apiName, syncObj, orderObj) {
  if (!syncObj.cpNoti) {
    return;
  }
  const sendData = { 're': syncObj.sync_re_code, 'data': syncObj.cpNoti };
  if (!orderObj) {
    vlog.error('sync can not find order:%j', syncObj);
    return;
  }
  findProduct(orderObj.productKey, (err, productObj) => {
    if (!productObj) {
      vlog.error('productKey can not find spProduct:%j', orderObj);
      return;
    }

    if (!productObj.callbackUrl) {
      console.log('未找到回调地址');
      return;
    }
    sendData.data.type = parseInt(syncObj.sync_type);
    sendData.data.orderId = orderObj.orderId;
    sendData.data.cpOrder = orderObj.cpOrder;
    sendData.data.timeStamp = cck.msToTime();
    sendData.data.productKey = orderObj.productKey;
    let signStr = syncObj.sync_re_code + sendData.data.type + orderObj.orderId + orderObj.cpOrder;
    for (const i in syncObj.cpNoti) {
      signStr += syncObj.cpNoti[i];
    }
    signStr += sendData.data.timeStamp;
    // signStr += productObj.cpSecret;
    signStr += productObj.cpid;
    sendData.data.sign = ktool.md5(signStr);

    ktool.httpPost(productObj.callbackUrl, JSON.stringify(sendData), function(err) {
      if (err) {
        vlog.eo(err, 'sendToCp:httpPost', sendData);
        sendData.data.callbackState = -1;
      } else {
        sendData.data.callbackState = 0;
      }
      // sendData.url = orderObj.cp_sync_url;
      sendData.data.url = productObj.callbackUrl;
      sendData.data.re = syncObj.sync_re_code;
      db.c(apiName + '_noti_cp').logToDb(sendData.data);
    });
  });
};

const syncAction = function syncAction(apiName, apiType, action, respObj) {
  if (!respObj.sync_obj) {
    vlog.error('no sync_obj:%j', respObj);
    return;
  }
  respObj.sync_type = parseInt(respObj.sync_type);
  //记录sync表
  respObj.sync_obj.sync_re_code = respObj.sync_re_code;
  respObj.sync_obj.sync_type = respObj.sync_type;
  respObj.sync_obj.createTime = new Date().getTime();
  respObj.sync_obj.cTime = cck.msToTime();
  // db.c(apiName + '_sync').logToDb(respObj.sync_obj);
  syncFindOrder(apiName, respObj.orderQuery, function(err, orderObj) {
    if (err) {
      vlog.eo(err, 'syncFindOrder', respObj);
      return;
    }
    const userRelationUpdate = {};
    // 未找到orderObj时syncTable和userTable中不包含productKey信息
    if (orderObj) {
      respObj.sync_obj.productKey = orderObj.productKey;
      userRelationUpdate.productKey = orderObj.productKey; //包月业务分包后，用户需要按productKey区分,这里注意如果没有找到orderObj，相关的分渠道统计数据会有差
      userRelationUpdate.phone = orderObj.phone; //有的userId为非phone的情况（IMSI），在客服系统中需要查询phone
      userRelationUpdate.provinceName = orderObj.provinceName; //order表中有provinceName
    }

    // 更新sync表
    // 通过sync_query防止sync重复
    delete respObj.sync_obj._id;
    db.c(apiName + '_sync').updateOne(respObj.sync_query, { '$set': respObj.sync_obj }, { upsert: true }, function(err) {
      if (err) {
        vlog.eo(err, 'update sync_obj', respObj);
        return;
      }
    });

    // console.log('sync orderObj:%j', orderObj);
    //用户关系表更新
    if (respObj.sync_user && respObj.sync_re_code + '' === '0') {
      const userRelation = {
        'userId': respObj.sync_user
      };
      const updateMap = {};
      if (apiType % 2 !== 0) {
        //包月
        if (respObj.sync_feeId) {
          userRelation.feeId = respObj.sync_feeId;
        }
      } else {
        //点播
        updateMap['$inc'] = { 'dianBoDayCost': orderObj.fee || respObj.sync_fee || 0, 'dianBoMonthCost': orderObj.fee || respObj.sync_fee || 0 };
      }
      const now = new Date().getTime();
      userRelationUpdate['time_' + respObj.sync_type] = now;
      userRelationUpdate['ctime_' + respObj.sync_type] = cck.msToTime(now);
      userRelationUpdate.state = respObj.sync_type;
      userRelationUpdate.updateTime = now;
      updateMap['$set'] = userRelationUpdate;
      db.c(apiName + '_user').updateOne(userRelation, updateMap, { upsert: true }, function(err) {
        if (err) {
          vlog.eo(err, 'update sync_obj', respObj);
          return;
        }
      });
    }

    // 未找到orderObj时，无法向合作方发回调以及更新order表的sync相关字段
    if (!orderObj) {
      return;
    }

    //向合作方发回调通知
    sendToCp(apiName, respObj, orderObj);

    // 对于订购操作,将sync更新到order表
    if (respObj.sync_type === 0) {
      // console.log('sync update order', apiName + '_order', respObj.sync_type, orderObj._id);
      db.c(apiName + '_order').updateOne({ '_id': orderObj._id }, { '$set': { 'sync_re_code': respObj.sync_re_code, 'sync_re_desc': respObj.sync_re_desc, 'state': (respObj.sync_re_code === '0') ? 4 : 3 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err, 'sendToCp,update orderTable', respObj);
          return;
        }
      });
      if (respObj.sync_re_code + '' === '0') {
        findProduct(orderObj.productKey, (err, productObj) => {
          if (err) {
            return vlog.eo(err, 'sync:findProduct');
          }
          const riskChecker = action.riskChecker;
          if (riskChecker && riskChecker.usageUpdate) {
            riskChecker.usageUpdate(apiName, productObj, orderObj.phone, orderObj.provinceName, parseInt(orderObj.fee));
          }
          // if (parseInt(productObj.type) === 2) {
          //   dianboFeeNumUpdate(orderObj.productKey, orderObj.provinceName, parseInt(orderObj.fee));
          // } else {
          //   baoyueUserNumUpdate(orderObj.productKey, orderObj.provinceName, function(err) {
          //     if (err) {
          //       return vlog.eo(err, 'baoyueLimitUpdate error');
          //     }
          //   });
          // }
        });
      }
    }
  });
};


const orderLog = function orderLog(apiName, action, actionRe, reqObj, productObj) {
  let saveObj = {
    'fee': productObj.fee,
    'cpSecret': productObj.cpid,
    'state': -1
  };
  for (let i = 0; i < action.reqParas.length; i++) {
    saveObj[action.reqParas[i][0]] = reqObj[action.reqParas[i][0]];
  }
  saveObj = concatObj(saveObj, actionRe);
  saveObj.order_re_code = saveObj.code;
  saveObj.order_re_desc = saveObj.desc;
  delete saveObj.code;
  delete saveObj.desc;
  saveObj.state = 1;
  // saveObj.provinceName = provinceName; //TODO 注意这里的provinceName需要在actionRe中加上,因为是从risk中取的，而action调用risk后可拿到provinceName
  if (actionRe.plus) {
    for (const j in actionRe.plus) {
      saveObj[j] = actionRe.plus[j];
    }
    delete saveObj.plus;
  }
  db.c(apiName + '_order').logToDb(saveObj);
};

const verifyLog = function verifyLog(apiName, action, actionRe, reqObj) {
  actionRe.verify_createTime = new Date().getTime();
  actionRe.state = 2;
  actionRe.verify_re_code = actionRe.code;
  actionRe.verify_re_desc = actionRe.desc;
  delete actionRe.code;
  delete actionRe.desc;
  // console.log('set actionRe:%j', actionRe);
  db.c(apiName + '_order').updateOne({ 'orderId': reqObj.orderId }, { '$set': actionRe }, { 'upsert': true, 'multi': false }, function(err) {
    if (err) {
      vlog.eo(err, 'verify update', actionRe);
    }
  });
};


const actionMap = {
  verify(apiName, reqObj, productObj, callback) {
    db.c(apiName + '_order').findOne({ 'orderId': reqObj.orderId }, { 'sort': { 'createTime': -1 } }, function(err, orderObj) {
      if (err) {
        return callback(vlog.ee(err, 'verify:findOne', reqObj));
      }
      if (!orderObj) {
        vlog.error('no order found. orderTable:%s,orderId:%j', apiName + '_order', reqObj.orderId);
        return callback(vlog.ee(new Error('orderId error', reqObj, productObj)));
      }
      orderObj = concatObj(orderObj, productObj);
      callback(null, orderObj);
    });
  },
  orderLog,
  verifyLog,
  'verify2Log': verifyLog,
  'sync': syncAction, //注意sync对应的是apiOut里面的sync Server，所以参数不一样
  withDraw(apiName, action, actionRe, reqObj, productObj) {

  },
  search(apiName, action, actionRe, reqObj, productObj) {

  }
};


exports.actionMap = actionMap;
exports.findProduct = findProduct;