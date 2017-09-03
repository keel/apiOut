'use strict';
const expect = require('chai').expect;
const kc = require('kc');
const db = kc.mongo.init();
const api_in = require('./helper/api_in');
const example = require('./helper/example');
const cpReq = require('./helper/cpReq');


describe('example_baoyue', function() {

  before(function() {
    api_in.createBaoYueProduct(db);
    api_in.nockAppIn();
    example.start();
    example.syncStart();
  });
  after(function() {
    api_in.clearExampleProducts(db);
    api_in.nockClean();
  });

  // const testWaitInit = function testWaitInit() {
  describe('测试order', function() {
    it('order 正常响应', function(done) {
      cpReq.baoyueOrder((err, re) => {
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
      cpReq.baoyueVerify((err, re) => {
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
      api_in.mock_sync(100, true, api_in.api_in_paras.baoyueOrderId, (err, re) => {
        if (err) {
          console.error(err);
          done();
          return;
        }
        console.log('sync re:%j', re);
        expect(re + '').to.equal('0');
        //TODO 还有很多需要确定的值

        done();
      });
    });
  });
  // };

  // setTimeout(testWaitInit, 1000);


});