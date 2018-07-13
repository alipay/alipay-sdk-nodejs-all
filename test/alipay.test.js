'use strict';

require('should');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const urllib = require('urllib');
const moment = require('moment');
const request = require('request');

const FormData = require('../lib/form').default;
const AlipaySdk = require('../lib/alipay').default;
const privateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key.pem', 'ascii');
const alipayPublicKey = fs.readFileSync(__dirname + '/fixtures/alipay-public-key.pem', 'ascii');

const sandbox = sinon.sandbox.create();
const pkgJson = require('../package.json');
const sdkVersion = `alipay-sdk-nodejs-${pkgJson.version}`;

const APP_ID = '2016073100135823';
const GATE_WAY = 'https://openapi.alipaydev.com/gateway.do';

describe('sdk', function() {
  afterEach(function() {
    sandbox.restore();
  });

  describe('config error', function() {
    it('appId is null', function() {
      try {
        const sdk = new AlipaySdk({
          alipayPublicKey,
          gateway: GATE_WAY,
          privateKey: privateKey,
        });
      } catch (e) {
        (e.toString().indexOf('config.appId is required') > -1).should.eql(true);
      }
    });

    it('privateKey is null', function() {
      try {
        const sdk = new AlipaySdk({
          appId: '111',
          alipayPublicKey,
          gateway: GATE_WAY,
        });
      } catch (e) {
        (e.toString().indexOf('config.privateKey is required') > -1).should.eql(true);
      }
    });
    
    it('formatKey', function() {
      const noWrapperPrivateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key-no-wrapper.pem', 'ascii');
      const noWrapperPublicKey = fs.readFileSync(__dirname + '/fixtures/alipay-public-key-no-wrapper.pem', 'ascii');
      const alipaySdk = new AlipaySdk({
        appId: '111',
        privateKey: privateKey,
        alipayPublicKey: alipayPublicKey,
        gateway: GATE_WAY,
      });

      alipaySdk.config.privateKey.should.eql(`-----BEGIN RSA PRIVATE KEY-----\n${noWrapperPrivateKey}\n-----END RSA PRIVATE KEY-----`);
      alipaySdk.config.alipayPublicKey.should.eql(`-----BEGIN PUBLIC KEY-----\n${noWrapperPublicKey}\n-----END PUBLIC KEY-----`);
    });
    
    it('formatKey with pkcs8', function() {
      const pkcs8PrivateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key-pkcs8.pem', 'ascii');
      const alipaySdk = new AlipaySdk({
        appId: '111',
        privateKey: pkcs8PrivateKey,
        alipayPublicKey,
        gateway: GATE_WAY,
        keyType: 'PKCS8',
      });

      alipaySdk.config.privateKey.should.eql(`-----BEGIN PRIVATE KEY-----\n${pkcs8PrivateKey}\n-----END PRIVATE KEY-----`);
    });
  });

  describe('execute', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        timeout: 10000,
      })
    });

    it('request error.', function (done) {
      sandbox.stub(urllib, 'request', function() {
        return new Promise(function() {
          throw Error('custom error.');
        });
      });

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        }
      }).catch(function(err){
        (err.toString().indexOf('[AlipaySdk]exec error') > -1).should.eql(true);
        done();
      });
    });

    it('status not 200', function (done) {
      sandbox.stub(urllib, 'request', function() {
        return Promise.resolve({ status: 503 })
      });

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        }
      }).catch(function(err){
        err.should.eql({
            serverResult: { status: 503 },
            errorMessage: '[AlipaySdk]HTTP 请求错误'
        });
        done();
      })
    });

    it('validateSign error', function(done) {
      sandbox.stub(urllib, 'request', function() {
        return Promise.resolve({
          status: 200,
          data: '{"alipay_security_risk_content_analyze_response":{"a":1,"b":2},"sign":"signStr"}',
        });
      });
      sandbox.stub(sdk, 'checkResponseSign', function() { return false; });

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      }, { validateSign: true }).catch(function(err){
        err.should.eql({
          serverResult: {
            status: 200,
            data: '{"alipay_security_risk_content_analyze_response":{"a":1,"b":2},"sign":"signStr"}'
          },
          errorMessage: '[AlipaySdk]验签失败'
        });
        done();
      })
    });

    it('config.camelcase is true', function(done) {
      sandbox.stub(urllib, 'request', function() {
        return Promise.resolve({
          status: 200,
          data: '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}',
        });
      });
      sandbox.stub(sdk, 'checkResponseSign', function() { return true; });

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      }, { validateSign: true }).then(function(data){
        data.should.eql({ aB: 1, cD: 2 });
        done();
      })
    });

    it('config.camelcase is false', function(done) {
      const alipaySdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        alipayPublicKey,
        camelcase: false,
      });
      sandbox.stub(urllib, 'request', function() {
        return Promise.resolve({
          status: 200,
          data: '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}',
        })
      });
      sandbox.stub(alipaySdk, 'checkResponseSign', function() { return true; });

      const result = alipaySdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      }, { validateSign: true }).then(function(data){
        data.should.eql({ a_b: 1, c_d: 2 });
        done();
      })
    });

    it('NO_RIGHT Api', function(done) {
      sdk
        .exec('alipay.commerce.cityfacilitator.station.query', {
          bizContent: { cityCode: '440300' },
        })
        .then(ret => {
          ret.should.eql({
            code: '40004',
            msg: 'Business Failed',
            subCode: 'NO_RIGHT',
            subMsg: '无权限使用接口',
          })
          done();
        }).catch (e => {
          done();
        })
    });

    it('execute with validateSign is true', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }

      sdk
        .exec('alipay.offline.market.shop.category.query', {
          bizContent: {},
        }, { log, validateSign: true })
        .then(ret => {
          ret.code.should.eql('10000');
          ret.msg.should.eql('Success');
          (ret.shopCategoryConfigInfos.length > 0).should.eql(true);

          ret.shopCategoryConfigInfos[0].should.have.property('id');
          ret.shopCategoryConfigInfos[0].should.have.property('level');
          ret.shopCategoryConfigInfos[0].should.have.property('link');
          ret.shopCategoryConfigInfos[0].should.have.property('isLeaf');
          ret.shopCategoryConfigInfos[0].should.have.property('nm');

          infoLog.length.should.eql(2);
          (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
          (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
          errorLog.should.eql([]);

          done();
        }).catch(done)
    });

    it('error log enable', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      sandbox.stub(urllib, 'request', function() {
        return new Promise(function() {
          throw Error('custom error.');
        });
      });

      sdk
        .exec('alipay.security.risk.content.analyze', {
          bizContent: {
            appName: 'cmsmng',
            appScene: 'papilio-alipay',
            publishDate: moment().format('YYYY-MM-DD HH:mm:ss'),
            accountId: 'hanwen.sah',
            accountType: '0',
            appMainScene: 'papilio-alipay',
            appMainSceneId: '12345678',
            appSceneDataId: 'activity159571',
            text: '重要告知12313：1. ，，报备文件编号为众安备-家财【2014】主8号，由众安在线财产保险股份有限公司（即“本公司”）承保，本公司业务流程全程在线，叶1良辰12313, 好好学习。',
            linkUrls: [],
            pictureUrls: [
              'http://alipay-rmsdeploy-dev-image.oss-cn-hangzhou-zmf.aliyuncs.com/rmsportal/UvfTktYfmcBCshhCdeycbPqlXNRcZvKR.jpg',
            ],
          },
        }, { log })
        .then(function() {
          done();
        }).catch(function() {
          (infoLog[0].indexOf('[AlipaySdk]start exec, url: %s') > -1).should.eql(true);
          (errorLog[0].indexOf('[AlipaySdk]exec error') > -1).should.eql(true);
          done();
        });
    });
  });

  describe('multipartExec', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        timeout: 10000,
      })
    });

    it('normal', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      const filePath = path.join(__dirname, './fixtures/demo.jpg');

      const form = new FormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '海底捞.jpg');
      form.addFile('imageContent', '海底捞.jpg', filePath);

      this.timeout(10000);

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { log, formData: form, validateSign: true })
        .then(ret => {
          ret.code.should.eql('10000');
          ret.msg.should.eql('Success');
          (!ret.imageId).should.eql(false);
          (ret.imageUrl.indexOf('https://oalipay-dl-django.alicdn.com') > -1).should.eql(true);

          infoLog.length.should.eql(2);
          (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
          (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
          errorLog.should.eql([]);

          done();
        }).catch(done)
    });

    it('sign error', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      const filePath = path.join(__dirname, './fixtures/demo.jpg');

      const form = new FormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '海底捞.jpg');
      form.addFile('imageContent', '海底捞.jpg', filePath);

      sandbox.stub(sdk, 'checkResponseSign', function() { return false; });
      sandbox.stub(request, 'post', function(option, callback) {
        return callback(null, {} , '{"alipay_offline_material_image_upload_response":{"a":"b"}}');
      });

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { log, formData: form, validateSign: true })
        .then(ret => {
          done();
        }).catch(err => {
          err.should.eql({
            serverResult: '{"alipay_offline_material_image_upload_response":{"a":"b"}}',
            errorMessage: '[AlipaySdk]验签失败',
          });
          done();
        });
    });

    it('error log enable', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')); },
        error(...args) { errorLog.push(JSON.stringify(args)); },
      }
      const filePath = path.join(__dirname, './fixtures/demo.jpg');

      const form = new FormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '海底捞.jpg');
      form.addFile('imageContent', '海底捞.jpg', filePath);

      sandbox.stub(request, 'post', function(option, callback) {
        return callback({ error: 'custom error.' }, {} , '{"a":"b"}');
      });

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { log, formData: form })
        .then(() => {
          done();
        }).catch((err) => {
          err.message.should.eql('[AlipaySdk]exec error');
          errorLog[0].should.eql('[{"error":"custom error.","message":"[AlipaySdk]exec error"}]');
          (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
          done();
        })
    });
  });
  
  describe('pageExec', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
      })
    });

    it('post', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      const bizContent = {
        out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
        product_code: "FAST_INSTANT_TRADE_PAY",
        subject: "abc",
        body: "234",
        // timeout_express: "90m",
        total_amount: "0.01"
      }
      const formData = new FormData();
      formData.addField('returnUrl', 'https://www.taobao.com');
      formData.addField('bizContent', bizContent);

      sdk
        .exec('alipay.trade.page.pay', {
        }, { log, formData: formData })
        .then(ret => {
          (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
          errorLog.length.should.eql(0);
          (ret.indexOf('method=alipay.trade.page.pay') > -1).should.eql(true);
          (ret.indexOf(`<input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;`) > -1).should.eql(true);
          (ret.indexOf(sdkVersion) > -1).should.eql(true);
          done();
        }).catch(done)
    });

    it('get', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      const bizContent = {
        out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
        product_code: "FAST_INSTANT_TRADE_PAY",
        subject: "abc",
        body: "234",
        // timeout_express: "90m",
        total_amount: "0.01"
      }
      const formData = new FormData();
      formData.setMethod('get');
      formData.addField('returnUrl', 'https://www.taobao.com');
      formData.addField('bizContent', JSON.stringify(bizContent));

      sdk
        .exec('alipay.trade.page.pay', {
        }, { log, formData: formData })
        .then(ret => {
          const url = decodeURIComponent(ret);
          (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
          errorLog.length.should.eql(0);

          (url.indexOf('method=alipay.trade.page.pay&app_id=2016073100135823&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=') > -1).should.eql(true);
          (url.indexOf('{"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}') > -1).should.eql(true);
          (url.indexOf(sdkVersion) > -1).should.eql(true);
          done();
        }).catch(done)
    });
  });

  describe('getSignStr', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
      })
    });

    it('normal', function() {
      const originStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},"sign":"P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}';

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

      signStr.should.eql('{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });

    it('include \\r\\n\\s', function() {
      const originStr = `{"alipay_offline_material_image_upload_response"
        :  
        {"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},
        
          "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

      signStr.should.eql('{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });

    it('include sign key in data', function() {
      const originStr = `{"alipay_offline_material_image_upload_response"
        :  
        {"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},
        
          "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

      signStr.should.eql('{"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });
  });

  describe('checkResponseSign', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        alipayPublicKey,
        camelcase: true,
      })
    });

    it('alipayPublicKey is null', function(done) {
      const newSdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        alipayPublicKey,
      });
      delete newSdk.config.alipayPublicKey;
      const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\/\/oalipay-dl-django.alicdn.com\/rest\/1.0\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';

      const result = newSdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response');
      result.should.eql(true);
      done();
    });

    it('alipayPublicKey is empty', function(done) {
      const newSdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        alipayPublicKey,
      });
      newSdk.config.alipayPublicKey = '';
      const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';

      const result = newSdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response');
      result.should.eql(true);
      done();
    });

    it('signStr is null', function(done) {
      const result = sdk.checkResponseSign(null, 'alipay_offline_material_image_upload_response');
      result.should.eql(false);
      done();
    });

    it('normal', function(done) {
      const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"akGwYYaFTai3r1uB0ww-1QAAACMAAQQD","image_url":"https:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=akGwYYaFTai3r1uB0ww-1QAAACMAAQQD&zoom=original"},"sign":"PAb3IueJzGe/pU/fRAPjwIs543Kc/A6D0rz03AMejwr8h8rDc6FhDJDnz3fGLDdQP7ctjtQwwJW3pmdZZcGmp4lb/5YYgtoK6McjnRr4ER/raJLYn1IbpzkowhGow2esA/XeDblIAYUbZjU6ts0IqNncrZrCknDWHpaZXwGuaU7CUBk74xBeMeja7rEEkFlm9MRtiQNYnum/cGVtcDv/aQ8KkPyAD58oJiAzoXv0R6jFhlZtAWv+M0SaOlhTpZh1K6wlP+1Umiqdvqbc1oWdfpv75a+lGTkGHMy8K7/bnAGm20IRsisSv1B5rpJyeGfrVf6tb4MZ7vG4w0rS0c2hfA=="}';

      const result = sdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response');
      result.should.eql(true);
      done();
    });
  });

  describe('checkNotifySign', function() {
    let sdk;

    beforeEach(function() {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        alipayPublicKey,
        camelcase: true,
      });
    });

    it('alipayPublicKey is null', function() {
      const sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        camelcase: true,
      });

      sdk.checkNotifySign({}).should.eql(false);
    });

    it('postData.sign is null', function() {
      sdk.checkNotifySign({}).should.eql(false);
    });

    it('normal', function() {
      const postData = {
        discount: '0.00',
        payment_type: 1,
        subject: { a: 'b' },
        trade_no: '2013082244524842',
        buyer_email: 'dlw***@gmail.com',
        gmt_create: '2013-08-22 14:45:23',
        notify_type: 'trade_status_sync',
        quantity: '1',
        out_trade_no: '082215222612710',
        seller_id: '2088501624816263',
        notify_time: '2013-08-22 14:45:24',
        body: '测试测试',
        trade_status: 'TRADE_SUCCESS',
        is_total_fee_adjust: 'N',
        total_fee: '1.00',
        gmt_payment: '2013-08-22 14:45:24',
        seller_email: 'xxx@alipay.com',
        price: '1.00',
        buyer_id: '2088602315385429',
        notify_id: '64ce1b6ab92d00ede0ee56ade98fdf2f4c',
        use_coupon: 'N',
        sign_type: 'RSA',
        sign: '1glihU9DPWee+UJ82u3+mw3Bdnr9u01at0M/xJnPsGuHh+JA5bk3zbWaoWhU6GmLab3dIM4JNdktTcEUI9/FBGhgfLO39BKX/eBCFQ3bXAmIZn4l26fiwoO613BptT44GTEtnPiQ6+tnLsGlVSrFZaLB9FVhrGfipH2SWJcnwYs=',
      }
      
      sdk.checkNotifySign(postData).should.eql(false);
    });
  });

  describe('execute, pkcs8', function() {
    let sdk;

    beforeEach(function() {
      const pkcs8PrivateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key-pkcs8.pem', 'ascii');
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: '2016080500175094',
        privateKey: pkcs8PrivateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        timeout: 10000,
        keyType: 'PKCS8',
      })
    });

    it('execute with validateSign is true', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }

      this.timeout(10000);

      sdk
        .exec('alipay.offline.market.shop.category.query', {
          bizContent: {},
        }, { log })
        .then(ret => {
          ret.code.should.eql('10000');
          ret.msg.should.eql('Success');
          (ret.shopCategoryConfigInfos.length > 0).should.eql(true);

          ret.shopCategoryConfigInfos[0].should.have.property('id');
          ret.shopCategoryConfigInfos[0].should.have.property('level');
          ret.shopCategoryConfigInfos[0].should.have.property('link');
          ret.shopCategoryConfigInfos[0].should.have.property('isLeaf');
          ret.shopCategoryConfigInfos[0].should.have.property('nm');

          infoLog.length.should.eql(2);
          (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
          (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
          errorLog.should.eql([]);

          done();
        }).catch(done)
    });
  });
});
