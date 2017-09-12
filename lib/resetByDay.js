/*
每天0点和每月0点定期更新表的某些字段为0
 */
'use strict';

const kc = require('kc');
const cck = require('cck');
const mongo = kc.mongo.init();
const redis = kc.redis.init();

const vlog = require('vlog').instance(__filename);

const sleep = 1000 * 30;
const redisKey = 'resetByDay:nextResetTime';

let nextResetTime = 0;
const tables = kc.kconfig.get('resetByDay');

// console.log('tables:%j', tables);

const resetTable = function(tableName, resetColArr, callback) {
  callback = callback || function(err) {
    if (err) {
      vlog.eo(err, 'resetTable', tableName, resetColArr);
      return;
    }
    // console.log('resetTable nextResetTime:%j', nextResetTime);
    vlog.info('done:%s %j - %j nextResetTime:%j', tableName, resetColArr, cck.msToTime(), cck.msToTime(nextResetTime));
  };
  const set = {};
  for (let i = 0; i < resetColArr.length; i++) {
    set[resetColArr[i]] = 0;
  }
  // console.log('set:%j', set, tableName,nextResetTime);
  mongo.c(tableName).updateMany({}, { '$set': set }, { 'multi': true }, callback);
};

const isMonthChanged = function(nextResetTime) {
  const lastTime = new Date(nextResetTime - 1000 * 60 * 60 * 24);
  const nextTime = new Date(nextResetTime);
  if (lastTime.getMonth() !== nextTime.getMonth()) {
    return true;
  }
  return false;
};


const getNextTime = function() {
  const now = new Date();
  const tomorrow = now.getTime() + 1000 * 60 * 60 * 24;
  return new Date(tomorrow).setHours(0, 0, 10, 0);
};


const checkReset = function() {
  const now = new Date().getTime();
  // console.log('nextResetTime:%j', nextResetTime);
  if (now < nextResetTime) {
    return;
  }
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const set = [t.dayCol];
    if (t.monthCol && isMonthChanged(nextResetTime)) {
      set.push(t.monthCol);
    }
    resetTable(t.tableName, set);
  }
  nextResetTime = getNextTime();
  redis.set(redisKey, nextResetTime, function(err) {
    if (err) {
      vlog.eo(err, 'redis set key');
      return;
    }
    vlog.info('[redis] set nextResetTime:%j', cck.msToTime(nextResetTime));
  });
};


const start = function() {
  redis.get(redisKey, function(err, re) {
    if (err) {
      vlog.eo(err, 'redis get key');
      return;
    }
    if (!re) {
      nextResetTime = getNextTime();
      redis.set(redisKey, nextResetTime, function(err) {
        if (err) {
          vlog.eo(err, 'redis set key');
          return;
        }
        vlog.info('[redis] set nextResetTime:%j', cck.msToTime(nextResetTime));
      });
    } else {
      nextResetTime = parseInt(re);
    }
    vlog.info('[resetByDay] started. ---------- nextResetTime:%s', cck.msToTime(nextResetTime));
    setInterval(checkReset, sleep);
  });
};

exports.start = start;
