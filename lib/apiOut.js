/**
 * 将外部请求的API转为内部请求,具体实现由apiIn实现后, 再返回给外部,不同的计费通道独立一个项目.
 * 统计分析查询管理由外部apiOutPortal实现
 */
'use strict';

const cck = require('cck');
const ktool = require('ktool');
const http = require('http');
const errorCode = require('./errorCode');
const apiActions = require('./apiActions');
const apiRisk = require('./apiRisk');
const provinceUtil = require('./provinceUtil');
const resetByDay = require('./resetByDay');
const vlog = require('vlog').instance(__filename);



const contentTypeHeader = { 'Content-Type': 'application/json' };


const mkSignedOrderResp = function mkSignedOrderResp(code, desc, orderId, cpid) {
  const now = cck.msToTime();
  const signedObj = {
    're': code,
    'data': {
      'desc': desc,
      'timeStamp': now
    }
  };
  if (orderId) {
    signedObj.data.orderId = orderId;
  }
  const signSrc = '' + code + (orderId || '') + now + cpid;
  const sign = ktool.md5(signSrc).toUpperCase();
  signedObj.data.sign = sign;
  return signedObj;
};


const mkResp = function(reState, data) {
  const outObj = {
    're': reState,
    'data': data
  };
  return JSON.stringify(outObj);
};

const reqCheck = function(reqTxt, mapChecker, reqCheckArr, callback) {
  let reqObj = null;
  try {
    reqObj = JSON.parse(reqTxt);
  } catch (e) {
    // db.c(orderTable,).logToDb( 'state': errorCode.err['reqJson'], 'reqTxt': reqTxt });
    return callback(vlog.ee(e, 'jsonParse'), errorCode.respApi('reqJson'));
  }
  const checkRe = mapChecker.check(reqObj);
  if (checkRe.length > 0) {
    return callback(vlog.ee(new Error('reqCheck'), 'reqCheck', checkRe), errorCode.respApi('reqErr', checkRe));
  }

  apiActions.findProduct(reqObj.productKey, (err, productObj) => {
    if (err) {
      return callback(vlog.ee(err, 'reqCheck:findProduct', reqTxt), errorCode.respApi('findProduct'));
    }
    if (!productObj || productObj.state < 10) {
      return callback(null, reqObj); //产品不存在或已下线，这里不返回productObj
    }
    // const signTarget = '' + reqObj.productKey + reqObj.imsi + reqObj.cpOrder + reqObj.timeStamp + productObj.cpSecret;
    let signTarget = '';
    for (let k = 0; k < reqCheckArr.length; k++) {
      signTarget += reqObj[reqCheckArr[k][0]];
    }
    signTarget += productObj.cpid;
    // vlog.log('signTarget:%j', signTarget);
    const sign = ktool.md5(signTarget).toUpperCase();
    if (sign !== reqObj.sign) {
      return callback(vlog.ee(new Error('reqCheck:signErr'), 'signErr', sign), errorCode.respApi('signErr'));
    }
    callback(null, reqObj, productObj);
  });
};

const httpRe = function(resp, stateCode, respTxt) {
  resp.writeHead(stateCode, contentTypeHeader);
  resp.write(respTxt);
  resp.end();
};

const createServer = function createServer(serverName, respFun) {
  const apiServer = http.createServer(function(req, resp) {
    let body = '';
    req.on('data', function(chunk) {
      body += chunk;
    });
    req.on('end', function() {
      //过滤健康检查
      body = body.trim();
      if (body === '' && req.url.length < 40) {
        resp.end('');
        return;
      }
      if (!respFun) {
        return httpRe(resp, 404, '404001');
      }
      respFun(req, body, function(err, respStr) {
        if (err) {
          vlog.eo(err, 'api req error', body);
        }
        //!! 无论是否错误,respObj保证有值,必须返回
        respStr = respStr || '{ "re": 500 }';
        httpRe(resp, 200, respStr);
      });

    });
  });
  apiServer.on('clientError', function(err) {
    if (err) {
      vlog.eo(err, serverName + '_server clientError');
      return;
    }
  });
  apiServer.on('close', function(err) {
    if (err) {
      vlog.eo(err, 'close');
      return;
    }
    vlog.log(serverName + '_server closed. -------' + cck.msToTimeWithMs());
  });
  return apiServer;
};

const addMapChecker = function addMapChecker(serverConf) {
  for (const i in serverConf.actions) {
    const action = serverConf.actions[i];
    action.mapChecker = cck.mapChecker(action.reqParas);
    if (null === action.mapChecker && action.reqParas) {
      vlog.error('==> addMapChecker错误, action:%j', action);
    }
  }
};

const serverMap = {
  out(apiName, apiType, serverConf) {
    const respFun = function respFun(req, body, callback) {
      const pathArr = req.url.split('/');
      // vlog.log('pathArr:%j', pathArr);
      if (pathArr.length < 2) {
        return callback(null, errorCode.respApi('reqUrl'));
      }
      const actionName = pathArr[pathArr.length - 1];
      // console.log('actionName:%j', actionName);
      const action = serverConf.actions[actionName];
      if (!action) {
        return callback(null, errorCode.respApi('reqUrlAction'));
      }
      reqCheck(body, action.mapChecker, action.reqParas, (err, reqCheckRe, productObj) => {
        if (err) {
          vlog.eo(err, serverConf.serverName, req.url, body);
          return callback(null, reqCheckRe); //reqCheckRe已经mkResp过了
        }
        // console.log('reqObj:%j, productObj:%j', reqCheckRe, productObj);
        if (!productObj) {
          // vlog.error('产品未找到!', serverConf.serverName, req.url, body);
          return callback(null, errorCode.respApi('productDown'));
        }
        const riskChecker = action.riskChecker || apiRisk.defaultRisk;
        // console.log('reqObj:%j, productObj:%j',reqCheckRe,productObj);
        riskChecker.check(apiName, reqCheckRe, productObj, (err, riskCheckRe, provinceName) => {
          if (err) {
            return callback(vlog.ee(err, 'riskChecker', body), errorCode.respApi('riskCheck'));
          }
          if (riskCheckRe.code !== 0) {
            return callback(null, mkResp(riskCheckRe.code, { 'desc': riskCheckRe.desc }));
          }
          action.doAction(reqCheckRe, productObj, (err, actionRe) => {
            if (err) {
              return callback(vlog.ee(err, 'doAction', reqCheckRe), errorCode.respApi('doAction')); //异常情况不需要mkResp,外部会处理成500错误
            }
            // 这里加入从risk check过程中找到的provinceName
            if (provinceName) {
              actionRe.provinceName = provinceName;
            }
            //search,withdraw等请求利用desc字段传输,可以不影响sign,orderId为空string时不参与sign
            const respObj = mkSignedOrderResp(actionRe.code, actionRe.desc, actionRe.orderId, productObj.cpid);
            //处理cp响应
            callback(null, JSON.stringify(respObj));
            //处理日志
            const logAction = apiActions.actionMap[actionName + 'Log'];
            if (logAction) {
              logAction(apiName, action, actionRe, reqCheckRe, productObj);
            }
          });
        });
      });
    };
    addMapChecker(serverConf);
    return createServer(serverConf.serverName, respFun);
  },
  sync(apiName, apiType, serverConf) {
    const respFun = function respFun(req, body, callback) {
      const syncAction = serverConf.actions.sync;
      if (!syncAction) {
        return null;
      }
      syncAction.doAction(req, body, (err, actionRe) => {
        if (err) {
          return callback(vlog.ee(err, 'syncAction'), (actionRe) ? actionRe.respBody : '{"re":-9999}');
        }
        callback(null, actionRe.respBody);
        // console.log('actionRe:%j',actionRe);
        const logAction = apiActions.actionMap['sync'];
        if (logAction) {
          logAction(apiName, apiType, syncAction, actionRe);
        }
      });
    };
    return createServer(serverConf.serverName, respFun);
  }
};



const instance = function instance(apiName, apiType, servers) {
  const me = {};
  me.apiName = apiName;
  me.apiType = apiType;
  me.servers = {};
  for (let i = 0, len = servers.length; i < len; i++) {
    const serverConfOne = servers[i];
    const serverCreator = serverMap[serverConfOne.serverType];
    if (!serverCreator) {
      vlog.error('apiOut:instance:servers:serverType ERROR', serverConfOne.serverType);
      continue;
    }
    const serverOne = serverCreator(me.apiName, me.apiType, serverConfOne);
    me.servers[serverConfOne.serverType] = {
      'server': serverOne,
      start() {
        serverOne.listen(serverConfOne.port);
        vlog.info('=== [' + me.apiName + '_' + serverConfOne.serverType + '_server] === start:[%d] -- %s', serverConfOne.port, cck.msToTimeWithMs());
      }
    };
  }
  return me;
};


exports.instance = instance;
exports.apiActions = apiActions;
exports.apiRisk = apiRisk;
exports.errorCode = errorCode;
exports.provinceUtil = provinceUtil;
exports.resetByDay = resetByDay;