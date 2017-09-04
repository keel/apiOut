'use strict';
const expect = require('chai').expect;
const kc = require('kc');
const db = kc.mongo.init();
const api_in = require('./helper/api_in');
const example = require('./helper/example');
const cpReq = require('./helper/cpReq');
const vlog = require('vlog').instance(__filename);


describe('example_包月业务测试', function() {

  before(function(done) {
    api_in.nockAppIn();
    example.start();
    example.syncStart();
    api_in.createBaoYueProduct(db, function(err) {
      if (err) {
        return vlog.eo(err);
      }
      done();
    });
  });
  after(function() {
    api_in.clearExampleProducts(db);
    api_in.nockClean();
  });

  describe('测试order', function() {
    // this.slow(500);
    it('order 正常响应', function(done) {
      cpReq.baoyueOrder(function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        const reJson = JSON.parse(re);
        console.log('order reJson:%j', reJson);
        expect(reJson.re).to.equal('0');
        done();
      });
    });
    it('verify 正常响应', function(done) {
      cpReq.baoyueVerify(function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        const reJson = JSON.parse(re);
        console.log('verify reJson:%j', reJson);
        expect(reJson.re).to.equal('0');
        done();
      });
    });

    it('sync 正常响应', function(done) {
      api_in.mock_sync(100, true, function(err, re) {
        if (err) {
          console.error(err);
          done();
          return;
        }
        console.log('sync re:%j', re);
        expect(re + '').to.equal('0');
        //TODO 还有很多需要确定的值


        setTimeout(done, 200); //这里等待一段时间等数据库相关数据更新结束
      });
    });
  });

  //TODO 模拟各类失败,risk情况

  //TODO 点播测试

});