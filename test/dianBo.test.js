'use strict';
const expect = require('chai').expect;
const kc = require('kc');
const db = kc.mongo.init();
const testDatas = require('./helper/testDatas');
const api_in = require('./helper/api_in');
const example2 = require('./helper/example2');
const cpReq = require('./helper/cpReq');
const errorCode = require('../lib/errorCode');
const vlog = require('vlog').instance(__filename);


describe('example2_点播业务测试', function() {

  before(function(done) {
    api_in.nockAppInDianBo();
    example2.start();
    example2.syncStart();
    testDatas.createDianBoProduct(db, function(err) {
      if (err) {
        vlog.eo(err);
        done(err);
        return;
      }
      done();
    });
  });


  after(function() {
    testDatas.clearExampleProducts2(db);
    testDatas.clearTestTables(db, testDatas.paras.apiName2);
    testDatas.nockClean();
  });

  describe('正常点播成功处理流程', function() {
    // this.slow(500);
    it('order 正常点播流程', function(done) {
      cpReq.dianboOrder(null, function(err, re) {
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
    it('verify 正常点播流程', function(done) {
      cpReq.dianboVerify(function(err, re) { //这里与包月请求相同
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

    it('sync 正常点播流程', function(done) {
      cpReq.receiveSync(function(err, notiRe) {
        if (err) {
          vlog.eo(err, 'receiveSync');
          done(err);
          return;
        }
        expect(notiRe).to.eql(0);
        setTimeout(done, 100); //这里等待一段时间等数据库相关数据更新结束
      });
      api_in.mock_sync(testDatas.paras.sync_url2, 100, true, function(err, re) {
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
  describe('点播风控测试', function() {
    beforeEach(function() {
      api_in.nockAppInDianBo();
    });
    afterEach(function() {
      testDatas.nockClean();
    });

    it('黑名单', function(done) {
      const blackUser = testDatas.newPhone();
      const blackUserTable = kc.kconfig.get('blackUserTable');
      db.c(blackUserTable).updateOne({ 'phone': blackUser }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.dianboOrder(blackUser, function(err, re) {
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
      db.c(productTable).updateOne({ 'key': testDatas.paras.dianboProductKey }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.dianboOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.productDown);
          db.c(productTable).updateOne({ 'key': testDatas.paras.dianboProductKey }, { '$set': { 'state': 10 } }, function(err) {
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
      db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': -1 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.dianboOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.provinceClosed);
          db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0 } }, function(err) {
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
      db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'dayFeeLimit': 5, 'dayFeeNum': 5 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.dianboOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.dayRiskLimit);
          db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'dayFeeLimit': 0, 'dayFeeNum': 0 } }, function(err) {
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
      db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'monthFeeLimit': 5, 'monthFeeNum': 5 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        cpReq.dianboOrder(null, function(err, re) {
          if (err) {
            vlog.eo(err);
            done(err);
            return;
          }
          const reJson = JSON.parse(re);
          // console.log('产品下线 order reJson:%j', reJson);
          expect(reJson.re).to.eql(errorCode.err.monthRiskLimit);
          db.c(table).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'state': 0, 'monthFeeLimit': 0, 'monthFeeNum': 0 } }, function(err) {
            if (err) {
              vlog.eo(err);
              return done(err);
            }
            done();
          });
        });
      });
    });

    it('单用户日限到达', function(done) {
      const table = testDatas.paras.apiName2 + '_user';
      const phone = testDatas.newPhone();
      db.c(kc.kconfig.get('riskLimitTable')).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'dianBoDayUserLimit': 300, 'dayFeeLimit': 0, 'monthFeeLimit': 0 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        db.c(table).updateOne({ 'userId': phone }, { '$set': { 'state': 0, 'dianBoDayCost': 300 } }, { 'upsert': true }, function(err) {
          if (err) {
            vlog.eo(err);
            return done(err);
          }
          cpReq.dianboOrder(phone, function(err, re) {
            if (err) {
              vlog.eo(err);
              done(err);
              return;
            }
            const reJson = JSON.parse(re);
            // console.log('产品下线 order reJson:%j', reJson);
            expect(reJson.re).to.eql(errorCode.err.dianBoDayUserCost);
            db.c(kc.kconfig.get('riskLimitTable')).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'dianBoDayUserLimit': 0 } }, function(err) {
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
    it('单用户月限到达', function(done) {
      const table = testDatas.paras.apiName2 + '_user';
      const phone = testDatas.newPhone();
      db.c(kc.kconfig.get('riskLimitTable')).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'dianBoMonthUserLimit': 300, 'dayFeeLimit': 0, 'monthFeeLimit': 0 } }, { 'upsert': true }, function(err) {
        if (err) {
          vlog.eo(err);
          return done(err);
        }
        db.c(table).updateOne({ 'userId': phone }, { '$set': { 'state': 0, 'dianBoMonthCost': 300 } }, { 'upsert': true }, function(err) {
          if (err) {
            vlog.eo(err);
            return done(err);
          }
          cpReq.dianboOrder(phone, function(err, re) {
            if (err) {
              vlog.eo(err);
              done(err);
              return;
            }
            const reJson = JSON.parse(re);
            // console.log('产品下线 order reJson:%j', reJson);
            expect(reJson.re).to.eql(errorCode.err.dianBoMonthUserCost);
            db.c(kc.kconfig.get('riskLimitTable')).updateOne({ 'productKey': testDatas.paras.dianboProductKey, 'provinceName': '江苏' }, { '$set': { 'dianBoMonthUserLimit': 0 } }, function(err) {
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
});