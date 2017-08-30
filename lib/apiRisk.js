/*
风控
 */
'use strict';

const baoyueOrderRisk = {
  check(reqObj, productObj, callback) {

    const re = {
      'code': 0,
      'desc': '成功'
    };
    callback(null, re);
  },
  usageUpdate(productKey, provinceName, callback) {
    callback(null);
  }
};