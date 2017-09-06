'use strict';
const expect = require('chai').expect;
const kc = require('kc');
const db = kc.mongo.init();
const testDatas = require('./helper/testDatas');
const api_in = require('./helper/api_in');
const example = require('./helper/example');
const cpReq = require('./helper/cpReq');
const errorCode = require('../lib/errorCode');
const vlog = require('vlog').instance(__filename);


describe('example1_包月业务测试', function() {

  before(function(done) {
    api_in.nockAppIn();
    example.start();
    example.syncStart();
    testDatas.createBaoYueProduct(db, function(err) {
      if (err) {
        vlog.eo(err);
        done(err);
        return;
      }
      done();
    });
  });


  after(function() {
    testDatas.clearExampleProducts(db);
    testDatas.clearTestTables(db, testDatas.paras.apiName);
    testDatas.nockClean();
  });

  describe('正常包月成功处理流程', function() {
    // this.slow(500);
    it('order 包月正常流程', function(done) {
      cpReq.baoyueOrder(null, function(err, re) {
        if (err) {
          console.error(err);
          done(err);
          return;
        }
        const reJson = JSON.parse(re);
        // console.log('order reJson:%j', reJson);
        expect(reJson.re).to.eql('0');
        done();
      });
    });
    it('verify 包月正常流程', function(done) {
      cpReq.baoyueVerify(function(err, re) {
        if (err) {
          console.error(err);
          done(err);
          return;
        }
        const reJson = JSON.parse(re);
        // console.log('verify reJson:%j', reJson);
        expect(reJson.re).to.eql('0');
        done();
      });
    });

    it('sync 包月正常流程', function(done) {
      cpReq.receiveSync(function(err, notiRe) {
        if (err) {
          vlog.eo(err, 'receiveSync');
          done(err);
          return;
        }
        expect(notiRe).to.eql(0);
        setTimeout(done, 100); //这里等待一段时间等数据库相关数据更新结束
      });
      api_in.mock_sync(testDatas.paras.sync_url, 100, true, function(err, re) {
        if (err) {
          console.error(err);
          done(err);
          return;
        }
        // console.log('sync re:%j', re);
        expect(re + '').to.eql('0');
        //TODO 还有很多需要确定的值
      });
    });
  });
  describe('包月风控测试', function() {
    beforeEach(function() {
      api_in.nockAppIn();
    });
    afterEach(function() {
      testDatas.nockClean();
    });
    //黑名单用户

    //产品下线
    //省份关停
    //日限
    //月限
    it('黑名单', function(done) {
      const blackUser = testDatas.newPhone();
      const blackUserTable = kc.kconfig.get('blackUserTable');
      db.c(blackUserTable).updateOne({ 'phone': blackUser }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.baoyueOrder(blackUser, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('黑名单 用户:%j, order reJson:%j', blackUser, reJson);
          expect(reJson.re).to.eql(errorCode.err.blackUser);
          db.c(blackUserTable).deleteMany({ 'phone': blackUser }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });

    it('产品下线', function(done) {
      const productTable = kc.kconfig.get('productTable');
      db.c(productTable).updateOne({ 'key': testDatas.paras.baoyueProductKey }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.baoyueOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.productDown);
          db.c(productTable).updateOne({ 'key': testDatas.paras.baoyueProductKey }, { '$set': { 'state': 10 } }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });

    it('省份关停', function(done) {
      const table = kc.kconfig.get('riskLimitTable');
      db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.baoyueOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.provinceClosed);
          db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0 } }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });

    it('日限到达', function(done) {
      const table = kc.kconfig.get('riskLimitTable');
      db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'dayUserLimit': 5, 'dayUserNum': 5 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.baoyueOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.dayRiskLimit);
          db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'dayUserLimit': 0, 'dayUserNum': 0 } }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });

    it('月限到达', function(done) {
      const table = kc.kconfig.get('riskLimitTable');
      db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'monthUserLimit': 5, 'monthUserNum': 5 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.baoyueOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.monthRiskLimit);
          db.c(table).updateOne({ 'productKey': testDatas.paras.baoyueProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'monthUserLimit': 0, 'monthUserNum': 0 } }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });
  });
  //TODO 模拟各类失败情况
});