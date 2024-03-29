/*
风控
 */
'use strict';
const ktool = require('ktool');
const kc = require('kc');
const redis = kc.redis.init();
const db = kc.mongo.init();
const vlog = require('vlog').instance(__filename);
const errorCode = require('./errorCode');
const provinceUtil = require('./provinceUtil');



const riskLimitTable = kc.kconfig.get('riskLimitTable');
const blackUserTable = kc.kconfig.get('blackUserTable');

const repeatCheck = function(noRepeatOrderRedisPre, imsi, callback) {
  redis.get(noRepeatOrderRedisPre + imsi, function(err, re) {
    if (err) {
      return callback(vlog.ee(err, 'repeatCheck'));
    }
    if (re) {
      return callback(null, errorCode.err['repeatOrder']);
    }
    callback(null, 0);
  });
};

const repeatSet = function(noRepeatOrderRedisPre, noRepeatOrderTime, imsi) {
  redis.set(noRepeatOrderRedisPre + imsi, '1', noRepeatOrderTime, function(err) {
    if (err) {
      vlog.eo(err, 'repeatSet');
      return;
    }
  });
};

const noRepeatCheck = function(noRepeatOrderRedisPre, noRepeatOrderTime, imsi, callback) {
  if (noRepeatOrderTime === null || noRepeatOrderTime === undefined || noRepeatOrderTime <= 0 || !imsi) {
    return callback(null, 0);
  }
  repeatCheck(noRepeatOrderRedisPre, imsi, function(err, repeatCheckRe) {
    if (err) {
      return callback(vlog.ee(err, 'repeatCheck'));
    }
    if (repeatCheckRe && repeatCheckRe !== 0) {
      // vlog.log('重复请求:%j', reqObj);
      return callback(null, errorCode.err['repeatOrder']);
    }
    callback(null, 0);
    repeatSet(noRepeatOrderRedisPre, noRepeatOrderTime, imsi);

  });
};

// 通过产品类型,判断是否检验重复订购 TODO: 现基于imsi号，后期可改为手机号，目前暂未启用
const repeatOrderCheck = (productType, imsi, noRepeatOrderRedisPre, noRepeatOrderTime, callback) => { // eslint-disable-line
  noRepeatCheck(noRepeatOrderRedisPre, noRepeatOrderTime, imsi, (err, noRepeatRe) => {
    if (err) {
      return callback(vlog.ee(err, 'baoyueRiskCheck:noRepeatCheck', imsi));
    }

    if (noRepeatRe !== 0) {
      return callback(null, errorCode.err['repeatOrder'], errorCode.msg['repeatOrder']);
    }
    return callback(null, 0);
  });
};


// 用户黑名单校验
const blackUserCheck = (phone, callback) => {
  const query = { 'phone': phone };
  db.c(blackUserTable).findOne(query, (err, doc) => {
    if (err) {
      return callback(vlog.ee(err, 'blackUserCheck:findOne', query));
    }
    if (!doc) {
      return callback(null, 0);
    }
    if (doc.state < 0) {
      return callback(null, errorCode.err['blackUser']);
    }
    return callback(null, 0);
  });
};


/*
！！注意此方法不检测product状态是否为10
 */
// 包月风控校验
const baoyueRiskCheck = (phone, productKey, callback) => {
  provinceUtil.findProvinceObjByPhone(phone, (err, provinceObj) => {
    const query = {
      'productKey': productKey,
      'provinceName': provinceObj.provinceName
    };
    // console.log(query);
    db.c(riskLimitTable).findOne(query, (err, doc) => {
      if (err) {
        return callback(vlog.ee(err, 'baoyueRiskCheck:findOne', query));
      }
      if (!doc) {
        return callback(null, 0, provinceObj.provinceName, provinceObj.cityName); // 若未找到风控记录,则暂时全开放
      }

      if (doc.state === -1) {
        return callback(null, errorCode.err['provinceClosed'], provinceObj.provinceName, provinceObj.cityName);
      }
      //riskLimitTable中的blackCity表示屏蔽城市
      if (doc.blackCity && provinceObj.cityName && doc.blackCity.indexOf(provinceObj.cityName) >= 0) {
        return callback(null, errorCode.err['blackCity'], provinceObj.provinceName, provinceObj.cityName);
      }

      if (doc.state === 0 && doc.dayUserLimit > 0 && (doc.dayUserNum >= doc.dayUserLimit)) {
        return callback(null, errorCode.err['dayRiskLimit'], provinceObj.provinceName, provinceObj.cityName);
      } else if (doc.state === 0 && doc.monthUserLimit > 0 && (doc.monthUserNum >= doc.monthUserLimit)) {
        return callback(null, errorCode.err['monthRiskLimit'], provinceObj.provinceName, provinceObj.cityName);
      } else {
        return callback(null, 0, provinceObj.provinceName, provinceObj.cityName);
      }
    });
  });
};


// 包月风控表用户发展量更新
const baoyueUserNumUpdate = (apiName, productObj, userId, provinceName, fee, callback = ktool.defaultCallback(null, __filename)) => {
  const query = {
    'productKey': productObj.key,
    'provinceName': provinceName
  };
  const updateMap = {
    '$inc': { 'dayUserNum': 1, 'monthUserNum': 1 }
  };
  db.c(riskLimitTable).updateOne(query, updateMap, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'baoyueUserNumUpdate:updateOne', query));
    }
    callback(null);
  });
};

// 点播风控表收入更新
const dianboCostUpdate = (apiName, productObj, userId, provinceName, fee, callback = ktool.defaultCallback(null, __filename)) => {
  const feeInt = parseInt(fee);
  const option = { 'upsert': true };
  db.c(apiName + '_user').updateOne({ 'userId': userId, 'productKey': productObj.key }, { '$inc': { 'dianBoDayUserCost': feeInt, 'dianBoMonthUserCost': feeInt } }, option, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'dianboCostUpdate:update user', userId, productObj));
    }
    const query = {
      'productKey': productObj.key,
      'provinceName': provinceName
    };
    db.c(riskLimitTable).updateOne(query, { '$inc': { 'dayFeeAmount': feeInt, 'monthFeeAmount': feeInt } }, (err) => {
      if (err) {
        return callback(vlog.ee(err, 'dianboCostUpdate:updateOne', userId, productObj));
      }
      callback(null);
    });
  });
};

//点播用户表日月限检查
const vrDianboUserRisk = function vrDianboUserRisk(apiName, userId, fee, dianBoDayUserCostLimit, dianBoMonthUserCostLimit, callback) {
  // console.log(apiName, userId, fee, dianBoDayUserCostLimit, dianBoMonthUserCostLimit);
  fee = fee || 0;
  dianBoDayUserCostLimit = dianBoDayUserCostLimit || 0;
  dianBoMonthUserCostLimit = dianBoMonthUserCostLimit || 0;
  db.c(apiName + '_user').findOne({ 'userId': userId }, (err, userOne) => {
    if (err) {
      return callback(vlog.ee(err, 'vrDianboUserRisk', userId, apiName));
    }
    if (!userOne) {
      return callback(null, 0);
    }

    if (dianBoDayUserCostLimit > 0 && userOne.dianBoDayUserCost + fee > dianBoDayUserCostLimit) {
      return callback(null, errorCode.err.dianBoDayUserCost);
    }
    if (dianBoMonthUserCostLimit > 0 && userOne.dianBoMonthUserCost + fee > dianBoMonthUserCostLimit) {
      return callback(null, errorCode.err.dianBoMonthUserCost);
    }
    callback(null, 0);
  });
};


// 短验方式的点播,风控校验
const vrDianboRiskCheck = (apiName, phone, fee, productKey, callback) => {
  provinceUtil.findProvinceByPhone(phone, (err, provinceName) => {
    const query = {
      'productKey': productKey,
      'provinceName': provinceName
    };
    db.c(riskLimitTable).findOne(query, (err, doc) => {
      if (err) {
        return callback(vlog.ee(err, 'vrDianboRiskCheck:findOne' + riskLimitTable, query));
      }
      if (!doc) {
        return callback(null, 0, provinceName); // 若没有找到风控记录,则暂时全开放
      }
      if (doc.state === -1) {
        return callback(null, errorCode.err['provinceClosed'], provinceName);
      }
      if (doc.state === 0 && doc.dayFeeLimit > 0 && (doc.dayFeeAmount >= doc.dayFeeLimit)) {
        return callback(null, errorCode.err['dayRiskLimit'], provinceName);
      } else if (doc.state === 0 && doc.monthFeeLimit > 0 && (doc.monthFeeAmount >= doc.monthFeeLimit)) {
        return callback(null, errorCode.err['monthRiskLimit'], provinceName);
      }
      // console.log('doc:%j', doc, fee);
      vrDianboUserRisk(apiName, phone, parseInt(fee), doc.dianBoDayUserCostLimit, doc.dianBoMonthUserCostLimit, (err, vrDianboUserRiskRe) => {
        if (err) {
          return callback(vlog.ee(err, 'vrDianboUserRisk', phone, apiName));
        }
        return callback(null, vrDianboUserRiskRe, provinceName);
      });
    });
  });
};



const baoyueRisk = {
  check(apiName, reqObj, productObj, callback) {
    blackUserCheck(reqObj.phone, (err, blackUserCheckRe) => {
      if (err) {
        return callback(vlog.ee(err, 'baoyueRisk:blackUserCheck', reqObj));
      }
      if (blackUserCheckRe !== 0) {
        return callback(null, { 'code': errorCode.err.blackUser, 'desc': errorCode.msg.blackUser });
      }
      baoyueRiskCheck(reqObj.phone, productObj.key, (err, rsikRe, provinceName) => {
        if (err) {
          return callback(vlog.ee(err, 'baoyueRisk:baoyueRiskCheck', reqObj));
        }
        const re = {
          'code': rsikRe,
          'desc': errorCode.codeMsg(rsikRe)
        };
        callback(null, re, provinceName);
      });
    });
  },
  'usageUpdate': baoyueUserNumUpdate
};

const vrDianBoRisk = {
  check(apiName, reqObj, productObj, callback) {
    blackUserCheck(reqObj.phone, (err, blackUserCheckRe) => {
      if (err) {
        return callback(vlog.ee(err, 'baoyueRisk:blackUserCheck', reqObj));
      }
      if (blackUserCheckRe !== 0) {
        return callback(null, { 'code': errorCode.err.blackUser, 'desc': errorCode.msg.blackUser });
      }
      vrDianboRiskCheck(apiName, reqObj.phone, reqObj.fee, productObj.key, (err, rsikRe, provinceName) => {
        if (err) {
          return callback(vlog.ee(err, 'vrDianboRiskCheck', reqObj, productObj));
        }
        const re = {
          'code': rsikRe,
          'desc': errorCode.codeMsg(rsikRe)
        };
        // console.log('re:%j', re);
        callback(null, re, provinceName);
      });
    });
  },
  'usageUpdate': dianboCostUpdate
};

const defaultRisk = {
  check(apiName, reqObj, productObj, callback) {
    const re = {
      'code': 0,
      'desc': 'ok'
    };
    if (!reqObj.phone) {
      return callback(null, re);
    }
    provinceUtil.findProvinceByPhone(reqObj.phone, (err, provinceName) => {
      productObj.provinceName = provinceName;
      callback(null, re, provinceName);
    });
  }
};


exports.defaultRisk = defaultRisk;
exports.baoyueRisk = baoyueRisk;
exports.vrDianBoRisk = vrDianBoRisk;