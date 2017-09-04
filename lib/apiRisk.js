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



const riskLimitTable = ktool.kconfig.get('riskLimitTable');
const blackUserTable = ktool.kconfig.get('blackUserTable');

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
  provinceUtil.findProvinceByPhone(phone, (err, provinceName) => {
    const query = {
      'productKey': productKey,
      'provinceName': provinceName
    };
    // console.log(query);
    db.c(riskLimitTable).findOne(query, (err, doc) => {
      if (err) {
        return callback(vlog.ee(err, 'baoyueRiskCheck:findOne', query));
      }

      if (!doc) {
        return callback(null, 0, provinceName); // 若未找到风控记录,则暂时全开放
      }

      if (doc.state === -1) {
        return callback(null, errorCode.err['provinceClosed'], provinceName);
      }
      if (doc.state === 0 && doc.dayUserLimit !== 0 && (doc.dayUserNum >= doc.dayUserLimit)) {
        return callback(null, errorCode.err['dayRiskLimit'], provinceName);
      } else if (doc.state === 0 && doc.monthUserLimit !== 0 && (doc.monthUserNum >= doc.monthUserLimit)) {
        return callback(null, errorCode.err['monthRiskLimit'], provinceName);
      } else {
        return callback(null, 0, provinceName);
      }
    });
  });
};


// 包月风控表用户发展量更新
const baoyueUserNumUpdate = (apiName, productObj, userId, provinceName, callback = ktool.defaultCallback(null, __filename)) => {
  const query = {
    'productKey': productObj.productKey,
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

// 点播、翼支付风控表收入更新  //TODO: 需要product表中有fee字段
const dianboCostUpdate = (apiName, productObj, userId, provinceName, callback = ktool.defaultCallback(null, __filename)) => {
  const query = {
    'productKey': productObj.productKey,
    'provinceName': provinceName
  };
  const updateMap = {
    '$inc': { 'dayFeeNum': parseInt(productObj.fee), 'monthFeeNum': parseInt(productObj.fee) }
  };
  db.c(riskLimitTable).updateOne(query, updateMap, (err) => {
    if (err) {
      return callback(vlog.ee(err, 'dianboCostUpdate:updateOne', userId, productObj));
    }
    db.c(apiName + '_user').findOne({ 'userId': userId }, (err, userOne) => {
      if (err) {
        return callback(vlog.ee(err, 'dianboCostUpdate:find user', userId, productObj));
      }
      const updateMap = { 'dianBoDayCost': productObj.fee, 'dianBoMonthCost': productObj.fee };
      const updateSet = {};
      if (!userOne.dianBoDayCost) {
        updateSet['$set'] = updateMap;
      } else {
        updateSet['$inc'] = updateMap;
      }
      db.c(apiName + '_user').updateOne({ 'userId': userId }, updateSet, (err) => {
        if (err) {
          return callback(vlog.ee(err, 'dianboCostUpdate:update user'));
        }
        callback(null);
      });
    });
  });
};


const vrDianboUserCheck = function vrDianboUserCheck(apiName, userId, fee, dianBoCostPerDay, dianBoCostPerMonth, callback) {
  if (!fee || !dianBoCostPerDay) {
    return callback(null, 0);
  }
  db.c(apiName + '_user').findOne({ 'userId': userId }, (err, userOne) => {
    if (err) {
      return callback(vlog.ee(err, 'vrDianboUserCheck', userId, apiName));
    }
    if (userOne.dianBoDayCost + fee > dianBoCostPerDay) {
      return callback(null, errorCode.err.dianBoDayUserCost);
    }
    if (userOne.dianBoMonthCost + fee > dianBoCostPerMonth) {
      return callback(null, errorCode.err.dianBoMonthUserCost);
    }
    callback(null, 0);
  });
};


// 短验方式的点播,风控校验
const vrDianboRiskCheck = (apiName, phone, productKey, callback) => {
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
      if (doc.state === 0 && doc.dayFeeLimit !== 0 && (doc.dayFeeNum >= doc.dayFeeLimit)) {
        return callback(null, errorCode.err['dayRiskLimit'], provinceName);
      } else if (doc.state === 0 && doc.monthFeeLimit !== 0 && (doc.monthFeeNum >= doc.monthFeeLimit)) {
        return callback(null, errorCode.err['monthRiskLimit'], provinceName);
      }
      vrDianboUserCheck(apiName, phone, doc.fee, doc.dianBoCostPerDay, doc.dianBoCostPerMonth, (err, vrDianboUserCheckRe) => {
        if (err) {
          return callback(vlog.ee(err, 'vrDianboUserCheck', phone, apiName));
        }
        return callback(null, vrDianboUserCheckRe, provinceName);
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
      baoyueRiskCheck(reqObj.phone, productObj.productKey, (err, rsikRe, provinceName) => {
        if (err) {
          return callback(vlog.ee(err, 'baoyueRisk:baoyueRiskCheck', reqObj));
        }
        productObj.provinceName = provinceName;
        const re = {
          'code': rsikRe,
          'desc': errorCode.codeMsg(rsikRe)
        };
        callback(null, re);
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
      vrDianboRiskCheck(apiName, reqObj.phone, productObj.productKey, (err, rsikRe, provinceName) => {
        if (err) {
          return callback(vlog.ee(err, 'vrDianboRiskCheck', reqObj, productObj));
        }
        const re = {
          'code': rsikRe,
          'desc': errorCode.codeMsg(rsikRe)
        };
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