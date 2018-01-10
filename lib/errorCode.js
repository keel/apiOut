'use strict';

const errData = {
  'ok': [0, '成功'],
  'reqJson': [350201, '请求JSON格式有误'],
  'reqUrl': [350199, '接口url错误'],
  'reqUrlAction': [350199, '接口url指令错误'],
  'reqErr': [350202, '请求参数错误'],
  'black': [350203, '风控限制'],
  'encSms': [350204, '短信处理失败'],
  'spFee': [350205, 'SP费用错误'],
  'signErr': [350206, '签名校验失败'],
  'db': [530201, '内部服务错误'],
  'findProduct': [530202, '产品不存在或状态不正确'],
  'other': [500205, '其他错误'],
  'feeErr': [350207, '费用错误'],
  'province': [350208, '省份关停'],
  'product': [350209, '产品不存在或已下线'],
  'channel': [350210, '渠道不存在'],
  'productDown': [350211, '产品不存在或已下线'],
  'productKey': [350212, '产品KEY错误'],
  'mkSmsOrder': [350213, '创建短信订单失败'],
  'orderMaker': [350214, '创建订单失败'],
  'repeatOrder': [350215, '短时间内重复请求'],
  'orderDayUser': [350216, '每日订购用户数达上限'],
  'limitCheck': [350217, '限额检查失败'],
  'orderNotFound': [350218, '订单未找到'],
  'mkVerify': [350219, '验证码提交失败'],
  'mkOrder': [350220, '订单提交失败'],
  'withdraw': [350221, '退订失败'],
  'search': [350222, '查找记录失败'],
  'noBaoYueLimit': [350230, '未配置包月业务限额'],
  'provinceClosed': [350231, '省份关停'],
  'baoyueRiskLimit': [350232, '包月业务风控达到限额'],
  'blackUser': [350233, '平台黑名单用户'],
  'dayRiskLimit': [350234, '每日风控达到限额'],
  'monthRiskLimit': [350235, '当月风控达到限额'],
  'riskCheck': [350236, '风控处理失败'],
  'monthCountLimit': [350237, '包月业务订购数达到限额'],
  'dianBoDayUserCost': [350238, '每日单用户消费达到限额'],
  'dianBoMonthUserCost': [350239, '当月单用户消费达到限额'],
  'doAction': [350240, 'doAction']
};

const err = {};
const msg = {};
const codeMsgData = {};

for (const i in errData) {
  err[i] = errData[i][0];
  msg[i] = errData[i][1];
  codeMsgData['' + errData[i][0]] = msg[i];
}

const codeMsg = function codeMsg(errCode) {
  return codeMsgData['' + errCode] || 'unknown';
};

const respApi = function respApi(errStr, paras) {
  if (err[errStr] === undefined) {
    return { 're': 55500, 'data': { 'desc': '未知错误' } };
  }
  const outObj = {
    're': err[errStr],
    'data': {
      'desc': msg[errStr]
    }
  };
  if (paras) {
    outObj.data.errParas = paras;
  }
  return JSON.stringify(outObj);
};


exports.err = err;
exports.msg = msg;
exports.codeMsg = codeMsg;
exports.respApi = respApi;