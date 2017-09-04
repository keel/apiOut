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
        return vlog.eo(err);
      }
      done();
    });
  });


  after(function() {
    testDatas.clearExampleProducts(db);
    // testDatas.clearTestTables();
    testDatas.nockClean();
  });

  describe('正常成功处理流程', function() {
    // this.slow(500);
    it('order 正常流程', function(done) {
      cpReq.baoyueOrder(null, function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        const reJson = JSON.parse(re);
        console.log('order reJson:%j', reJson);
        expect(reJson.re).to.eql('0');
        done();
      });
    });
    it('verify 正常流程', function(done) {
      cpReq.baoyueVerify(function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        const reJson = JSON.parse(re);
        console.log('verify reJson:%j', reJson);
        expect(reJson.re).to.eql('0');
        done();
      });
    });

    it('sync 正常流程', function(done) {
      cpReq.receiveSync(function(err, notiRe) {
        if (err) {
          return vlog.eo(err, 'receiveSync');
        }
        expect(notiRe).to.eql(0);
        setTimeout(done, 100); //这里等待一段时间等数据库相关数据更新结束
      });
      api_in.mock_sync(100, true, function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        console.log('sync re:%j', re);
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
          console.log('黑名单 用户:%j, order reJson:%j', blackUser, reJson);
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
          console.log('产品下线 order reJson:%j', reJson);
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
  });
  //TODO 模拟各类失败,risk情况

  //TODO 点播测试

});