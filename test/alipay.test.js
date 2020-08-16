'use strict';

require('should');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const moment = require('moment');

const FormData = require('../lib/form').default;
const AlipaySdk = require('../lib/alipay').default;
const privateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key.pem', 'ascii');
const alipayPublicKey = fs.readFileSync(__dirname + '/fixtures/alipay-public-key.pem', 'ascii');
const notifyAlipayPublicKeyV1 = fs.readFileSync(__dirname + '/fixtures/alipay-notify-sign-public-key-v1.pem', 'ascii');
const notifyAlipayPublicKeyV2 = fs.readFileSync(__dirname + '/fixtures/alipay-notify-sign-public-key-v2.pem', 'ascii');

const sandbox = sinon.createSandbox();
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
      sandbox.stub(sdk, 'postString').rejects(new Error('custom error.'));

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
      sandbox.stub(sdk, 'postString').rejects({
        status: 503,
        text: sinon.stub().resolves("myerror")
      });

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        }
      }).catch(function(err){
        err.should.eql({
            serverResult: { status: 503, data: "myerror" },
            errorMessage: '[AlipaySdk]HTTP 请求错误'
        });
        done();
      })
    });

    it('validateSign error', function(done) {
      sandbox.stub(sdk, 'postString')
        .resolves('{"alipay_security_risk_content_analyze_response":{"a":1,"b":2},"sign":"signStr"}');
      sandbox.stub(sdk, 'checkResponseSign').returns(false);

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
      sandbox.stub(sdk, 'postString')
        .resolves('{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}');
      sandbox.stub(sdk, 'checkResponseSign').returns(true);

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
      sandbox.stub(alipaySdk, 'postString')
        .resolves('{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}');
      sandbox.stub(alipaySdk, 'checkResponseSign').returns(true);

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
      sandbox.stub(sdk, 'postString')
        .resolves('{"alipay_commerce_cityfacilitator_station_query_response":{"code":"40004","msg":"Business Failed","subCode":"NO_RIGHT","subMsg":"无权限使用接口"},"sign":"signStr"}');

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
      sandbox.stub(sdk, 'postString').rejects(new Error('custom error.'));

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

    it('error response', function(done) {
      sandbox.stub(sdk, 'postString')
        .resolves('{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}');
      sandbox.stub(sdk, 'checkResponseSign').returns(true);

      sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      }, { validateSign: true }).then(function(data){
        done();
      }).catch(e => {
        e.should.eql({
          serverResult: {
            status: 200,
            data: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}'
          },
          errorMessage: '[AlipaySdk]HTTP 请求错误',
        });
        done();
      })
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

      this.timeout(20000);

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

    it('upload by uri', function(done) {
      const infoLog = [];
      const errorLog = [];
      const log = {
        info(...args) { infoLog.push(args.join('')) },
        error(...args) { errorLog.push(args.join('')) },
      }
      const filePath = 'https://lidvdsgz.cdn.bspapp.com/2138306492-pretest/901abc40-8024-11e9-ba2f-f31ddc563146.png';

      const form = new FormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '测试图片.jpg');
      form.addFile('imageContent', '测试图片.jpg', filePath);

      this.timeout(20000);

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

      sandbox.stub(sdk, 'checkResponseSign').returns(false);
      sandbox.stub(sdk, 'postString').resolves('{"alipay_offline_material_image_upload_response":{"a":"b"}}');

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { formData: form, validateSign: true })
        .then(() => {
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

      sandbox.stub(sdk, "postString").rejects({ error: 'custom error.' });

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

    it('error response', function(done) {
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

      const response = '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}';

      sandbox.stub(sdk, 'checkResponseSign').returns(false);
      sandbox.stub(sdk, "postString").resolves(response);

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { log, formData: form, validateSign: true })
        .then(() => {
          done();
        }).catch(err => {
          err.should.eql({
            serverResult: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}',
            errorMessage: '[AlipaySdk]HTTP 请求错误',
          });
          done();
        });
    });

    it('camelcase is false', function(done) {
      const filePath = path.join(__dirname, './fixtures/demo.jpg');

      const form = new FormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '海底捞.jpg');
      form.addFile('imageContent', '海底捞.jpg', filePath);

      this.timeout(20000);

      const newSdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: false,
        timeout: 10000,
      })

      const response = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"mock_image_id","img_url":"mock_image_url"}}';
      sandbox.stub(newSdk, "postString").resolves(response);

      newSdk
        .exec('alipay.offline.material.image.upload', {
        }, { formData: form })
        .then(ret => {
          ret.should.eql({
            code: '10000',
            msg: 'Success',
            image_id: 'mock_image_id',
            img_url: 'mock_image_url',
          });
          done();
        }).catch(done)
    });

    it('validate sign is false', function(done) {
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

      const response = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"u16noGtTSH-r9UI0FGmIfAAAACMAAQED","image_url":"https://oalipay-dl-django.alicdn.com/rest/1.0/image?fileIds=u16noGtTSH-r9UI0FGmIfAAAACMAAQED&zoom=original"}}';
      sandbox.stub(sdk, "postString").resolves(response);

      sdk
        .exec('alipay.offline.material.image.upload', {
        }, { log, formData: form })
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

    it('disable log', function(done) {
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
        }, { formData: formData })
        .then(ret => {
          const url = decodeURIComponent(ret);

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
        alipayPublicKey: notifyAlipayPublicKeyV2,
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

    describe('verify sign should delete sign_type', function() {
      beforeEach(function() {
        let notifyAlipayPublicKeyV1 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqObrdC7hrgAVM98tK0nv3hSQRGGKT4lBsQjHiGjeYZjOPIPHR5knm2jnnz/YGIXIofVHkA/tAlBAd5DrY7YpvI4tP5EONLtZKC2ghBMx7McI2wRD0xiqzxOQr1FuhZGJ8/AUokBzJrzY+aGX2xcOrxFYRlFilvVLTXg4LWjR1tdPkO6+i7wQZAIVMClPkwVRZEbaERRHlKqTzv2gGv5rDU8gRoe1LeaN+6BlbTqHWkQcNCUNrA8C6l17XAXGKDsm/9TFWwO8EPHHHCaQdjtV5/FdcWIt+L8SR1ss7EXTjYDFtxcKVv9rEoY1lX8T4mX+GbXfZHraG5NCF1+XioL5JwIDAQAB';
        sdk = new AlipaySdk({
          gateway: GATE_WAY,
          appId: APP_ID,
          privateKey: privateKey,
          alipayPublicKey: notifyAlipayPublicKeyV1,
          camelcase: true,
        });
      });

      it.only('with sign_type arguments verify success', function() {
        const postData = {
          gmt_create: '2019-08-15 15:37:55',
          charset: 'utf-8',
          seller_email: 'z97-yuquerevenue@service.aliyun.com',
          subject: '语雀空间 500人规模',
          sign:
           'QUxj7MQ0NQT++AyDbykzTw6iWflrgfY7EIssTaNfJaDkOHqZAFv3hbr97h+z/LCkmnqkBq+V81uHtb3q+i19W1B7FlMNfJB8XPSFD3xdHXEzvj9ccFTE9gxCEG+3oub4TeNe+rrOCt+3cfOFRh5jZzAiZbEZQem3ZMdhIHz/I6TVGNWuPOL4Wr56/Vjq57BLZUPKYpDo7DVfNEYeu0dZ76irMhE4a5FJ26c6qQu9gnG6NmKhtn+tSI6859RKF9bzptbM49klrliVnjBI4m6y7f329Ur9lecC/UlbIo3vKDFmcsLlADKu64FT5jjyRVaVQcP64khZdJwRdzrJ5QxxxQ==',
          buyer_id: '2088102534368455',
          invoice_amount: '0.10',
          notify_id: '2019081500222153759068450559621257',
          fund_bill_list: '[{amount:"0.10",fundChannel:"ALIPAYACCOUNT"}]',
          notify_type: 'trade_status_sync',
          trade_status: 'TRADE_SUCCESS',
          receipt_amount: '0.10',
          buyer_pay_amount: '0.10',
          app_id: '2019073166072302',
          sign_type: 'RSA2',
          seller_id: '2088531891668739',
          gmt_payment: '2019-08-15 15:37:58',
          notify_time: '2019-08-15 15:37:59',
          version: '1.0',
          out_trade_no: '20190815153750722-564-55',
          total_amount: '0.10',
          trade_no: '2019081522001468450509133591',
          auth_app_id: '2019073166072302',
          buyer_logon_id: 'xud***@126.com',
          point_amount: '0.00' }

        sdk.checkNotifySign(postData).should.eql(true);
      });

      it('without sign_type arguments verify success', function() {
        const postData = {
          gmt_create: '2019-08-15 15:56:22',
          charset: 'utf-8',
          seller_email: 'z97-yuquerevenue@service.aliyun.com',
          subject: '语雀空间 500人规模',
          sign:
           'QfTb8tqE1BMhS5qAnXtvsF3/jBkEvu9q9en0pdbBUDDjvKycZhQb7h8GDs4FKfi049PynaNuatxSgLb/nLWZpXyyh0LEWdK2S6Ri7nPwrVgOs08zugLO20vOQz44y3ti2Ncm8/wZts1Fr2gZ7pShnVX3d1B50hbsXnObT1r/U8ONNQjWXd0HIul4TG+Q3fm3svmSvFEy0WnzuhcyHPX5Gm4ELNctL6Qd5YniGJFNcc7kopHYtI/XD9YCKCH6Ct02rzUs9i11C9CsadtZn+WhxF26Dqt9sGEFajkJ8cxUTLi8+VCpLHsgPE8P0y095uQcDdK0YjCh4x7wVSov+lrmOQ==',
          buyer_id: '2088102534368455',
          invoice_amount: '0.10',
          notify_id: '2019081500222155624068450559358070',
          fund_bill_list: [ { amount: '0.10', fundChannel: 'ALIPAYACCOUNT' } ],
          notify_type: 'trade_status_sync',
          trade_status: 'TRADE_SUCCESS',
          receipt_amount: '0.10',
          buyer_pay_amount: '0.10',
          app_id: '2019073166072302',
          sign_type: 'RSA2',
          seller_id: '2088531891668739',
          gmt_payment: '2019-08-15 15:56:24',
          notify_time: '2019-08-15 15:56:25',
          version: '1.0',
          out_trade_no: '20190815155618536-564-57',
          total_amount: '0.10',
          trade_no: '2019081522001468450512505578',
          auth_app_id: '2019073166072302',
          buyer_logon_id: 'xud***@126.com',
          point_amount: '0.00' };
  
        sdk.checkNotifySign(postData).should.eql(true);
      });

      it('verify fail', function() {
        const postData = {
          app_id: '2018121762595097',
          auth_app_id: '2018121762595097',
          buyer_id: '2088512613526436',
          buyer_logon_id: '152****6706',
          buyer_pay_amount: '0.01',
          charset: 'utf-8',
          fund_bill_list: [{ amount: '0.01', fundChannel: 'PCREDIT' }],
          gmt_create: '2019-05-23 14:13:56',
          gmt_payment: '2019-05-23 14:17:13',
          invoice_amount: '0.01',
          notify_id: '2019052300222141714026431019971405',
          notify_time: '2019-05-23 14:17:14',
          notify_type: 'trade_status_sync',
          out_trade_no: 'tpxy23962362669658',
          point_amount: '0.00',
          receipt_amount: '0.01',
          seller_email: 'myapp@alitest.com',
          seller_id: '2088331578818800',
          sign: 'T946S2qyNFAXLhAaRgNMmatxH6SO3MyWYFnTamQOgW1iAcheL/Zz+VoizwvEc6mTEwYewvvKS1wNkMQ1oEajMUHv9+cXQ9IFvU/qKS9Ktvw5xHvCaK0fj7LsVcQ7VxfyT3kSvXUDfKDP4cHSPuSZKwM2ybkzr53bIH9OUTpTQd2d3J0rbdf76OoUt+XF9vwqj7OVE7AGjH2HPWp842DgL/YVy4qeA9N2uFKRevT3YUskjaRxuI/E66reNjTMFhbjEqGLKvMcDD4BaQXnibq9ojAj60589fBwzKk3yWsVQmqGfksMQoheVMtZ3lAw4o2ty3TFngbVFFLwgx8FDpBZ9Q==',
          sign_type: 'RSA2',
          subject: 'tpxy2222896485',
          total_amount: '0.01',
          trade_no: '111111112019052322001426431037869358',
          trade_status: 'TRADE_SUCCESS',
          version: '1.0'
        };
  
        sdk.checkNotifySign(postData).should.eql(false);
      });
    });

    describe('verify sign should not delete sign_type', function () {
      it('with sign_type arguments verify success', function() {
        const postData = {
          app_id: '2017122801303261',
          charset: 'UTF-8',
          commodity_order_id: '2019030800000018079639',
          contactor: '技术支持测试的公司',
          merchant_pid: '2088721996721370',
          method: 'alipay.open.servicemarket.order.notify',
          name: '技术支持测试的公司',
          notify_id: '2019030800222102023008121054923345',
          notify_time: '2019-03-08 10:20:23',
          notify_type: 'servicemarket_order_notify',
          order_item_num: '1',
          order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
          order_time: '2019-03-08 10:20:08',
          phone: '17826894615',
          service_code: '58621634',
          sign:
           'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
          sign_type: 'RSA2',
          timestamp: '2019-03-08 10:20:23',
          title: '麦禾商城模版',
          total_price: '0.00',
          version: '1.0',
        };
  
        sdk.checkNotifySign(postData).should.eql(true);
      });
  
      it('without sign_type arguments verify success', function() {
        const postData = {
          app_id: '2017122801303261',
          charset: 'UTF-8',
          commodity_order_id: '2019030800000018079639',
          contactor: '技术支持测试的公司',
          merchant_pid: '2088721996721370',
          method: 'alipay.open.servicemarket.order.notify',
          name: '技术支持测试的公司',
          notify_id: '2019030800222102023008121054923345',
          notify_time: '2019-03-08 10:20:23',
          notify_type: 'servicemarket_order_notify',
          order_item_num: '1',
          order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
          order_time: '2019-03-08 10:20:08',
          phone: '17826894615',
          service_code: '58621634',
          sign:
           'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
          timestamp: '2019-03-08 10:20:23',
          title: '麦禾商城模版',
          total_price: '0.00',
          version: '1.0',
        };
  
        sdk.checkNotifySign(postData).should.eql(true);
      });

      it('verify fail', function(){
        const postData = {
          app_id: '2017122801303261',
          charset: 'UTF-8',
          commodity_order_id: '2019030800000018079639',
          contactor: '技术支持测试的公司',
          merchant_pid: '2088721996721370',
          method: 'alipay.open.servicemarket.order.notify',
          name: '技术支持测试的公司',
          notify_id: '2019030800222102023008121054923345',
          notify_time: '2019-03-08 10:20:23',
          notify_type: 'servicemarket_order_notify',
          order_item_num: '1',
          order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
          order_time: '2019-03-08 10:20:08',
          phone: '17826894615',
          service_code: '58621634111',
          sign:
           'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
          sign_type: 'RSA2',
          timestamp: '2019-03-08 10:20:23',
          title: '麦禾商城模版',
          total_price: '0.00',
          version: '1.0',
        };
  
        sdk.checkNotifySign(postData).should.eql(false);
      });
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

      this.timeout(20000);

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
