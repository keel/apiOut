/*
模拟计费平台协议,创建和清理测试数据
 */
'use strict';
const nock = require('nock');
const ktool = require('ktool');
const cck = require('cck');
const testDatas = require('./testDatas');
const vlog = require('vlog').instance(__filename);

const nockAppIn = function nockAppIn() {
  nock(testDatas.paras.api_in_url)
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

        return { 'res_code': 0, 'message': '短信验证码已成功发送', 'trade_id': testDatas.createOrderId() };
      } catch (e) {
        console.error(e.stack);
        return { 'res_code': -999, 'message': 'order请求参数错误' };
      }
    });

  nock(testDatas.paras.api_in_url)
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


        return { 'res_code': 0, 'message': '同步计费成功', 'trade_id': testDatas.getOrderId() };
      } catch (e) {
        console.error(e.stack);
        return { 'res_code': -999, 'message': 'verify请求参数错误' };
      }
    });

};

const mock_sync = function mock_sync(syncType, isSucc, callback) {
  const syncRe = {
    'charge_result': 0,
    'sync_type': syncType || 100, //100为订购，300为退订
    'trade_id': testDatas.getOrderId()
  };
  if (!isSucc) {
    syncRe.code = -1999;
    syncRe.message = 'sync订购失败';
  } else {
    syncRe.message = 'sync订购成功';
  }
  ktool.httpPost(testDatas.paras.sync_url, JSON.stringify(syncRe), (err, syncRe) => {
    if (err) {
      return callback(vlog.ee(err, 'mock_sync', testDatas.getOrderId()));
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






exports.nockAppIn = nockAppIn;
exports.mock_sync = mock_sync;