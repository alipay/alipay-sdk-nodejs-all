import fs from 'node:fs';
// import { format } from 'node:util';
// import path from 'node:path';
import { strict as assert } from 'node:assert';
import urllib, { MockAgent, setGlobalDispatcher } from 'urllib';
// import { YYYYMMDDHHmmss } from 'utility';
import mm from 'mm';
import {
  readFixturesFile, getFixturesFile,
  APP_ID, GATE_WAY,
  STABLE_APP_ID, STABLE_GATE_WAY, STABLE_ENDPOINT, STABLE_APP_PRIVATE_KEY, STABLE_ALIPAY_PUBLIC_KEY,
} from './helper.js';
import { AlipayFormData, AlipayRequestError, AlipaySdk, AlipaySdkConfig } from '../src/index.js';

const privateKey = readFixturesFile('app-private-key.pem', 'ascii');
const alipayPublicKey = readFixturesFile('alipay-public-key.pem', 'ascii');
// const notifyAlipayPublicKeyV2 = fs.readFileSync(getFixturesFile('alipay-notify-sign-public-key-v2.pem'), 'ascii');
// const alipayRootCertPath = getFixturesFile('alipayRootCert.crt');
// const alipayPublicCertPath = getFixturesFile('alipayCertPublicKey_RSA2.crt');
// const appCertPath = getFixturesFile('appCertPublicKey_2021001161683774.crt');

describe('test/alipay.test.ts', () => {
  afterEach(mm.restore);

  let sdk: AlipaySdk;
  const sdkBaseConfig: AlipaySdkConfig = {
    gateway: GATE_WAY,
    appId: APP_ID,
    privateKey,
    signType: 'RSA2',
    alipayPublicKey,
    camelcase: true,
    timeout: 10000,
    encryptKey: 'aYA0GP8JEW+D7/UFaskCWA==',
  };
  let sdkStable: AlipaySdk;
  const sdkStableConfig: AlipaySdkConfig = {
    gateway: STABLE_GATE_WAY,
    endpoint: STABLE_ENDPOINT,
    appId: STABLE_APP_ID,
    privateKey: STABLE_APP_PRIVATE_KEY,
    signType: 'RSA2',
    alipayPublicKey: STABLE_ALIPAY_PUBLIC_KEY,
    camelcase: true,
    timeout: 10000,
    encryptKey: 'aYA0GP8JEW+D7/UFaskCWA==',
  };

  const mockAgent = new MockAgent();
  setGlobalDispatcher(mockAgent);

  beforeEach(() => {
    sdk = new AlipaySdk(sdkBaseConfig);
    sdkStable = new AlipaySdk(sdkStableConfig);
    assert(sdkStable);
  });

  describe('config error', () => {
    it('appId is null', () => {
      try {
        new AlipaySdk({
          alipayPublicKey,
          gateway: GATE_WAY,
          privateKey,
        } as any);
      } catch (err: any) {
        assert.equal(err.message, 'config.appId is required');
      }
    });

    it('privateKey is null', () => {
      try {
        new AlipaySdk({
          appId: '111',
          alipayPublicKey,
          gateway: GATE_WAY,
        } as any);
      } catch (err: any) {
        assert.equal(err.message, 'config.privateKey is required');
      }
    });

    it('formatKey', () => {
      const noWrapperPrivateKey = fs.readFileSync(getFixturesFile('app-private-key-no-wrapper.pem'), 'ascii');
      const noWrapperPublicKey = fs.readFileSync(getFixturesFile('alipay-public-key-no-wrapper.pem'));
      const alipaySdk = new AlipaySdk({
        appId: '111',
        privateKey,
        alipayPublicKey,
        gateway: GATE_WAY,
      });

      assert.equal(alipaySdk.config.privateKey,
        `-----BEGIN RSA PRIVATE KEY-----\n${noWrapperPrivateKey}\n-----END RSA PRIVATE KEY-----`);
      assert.equal(alipaySdk.config.alipayPublicKey,
        `-----BEGIN PUBLIC KEY-----\n${noWrapperPublicKey}\n-----END PUBLIC KEY-----`);
    });

    it('formatKey with pkcs8', () => {
      const pkcs8PrivateKey = fs.readFileSync(getFixturesFile('app-private-key-pkcs8-no-wrapper.pem'), 'ascii');
      const alipaySdk = new AlipaySdk({
        appId: '111',
        privateKey: pkcs8PrivateKey,
        alipayPublicKey,
        gateway: GATE_WAY,
        keyType: 'PKCS8',
      });

      assert.equal(alipaySdk.config.privateKey,
        `-----BEGIN PRIVATE KEY-----\n${pkcs8PrivateKey}\n-----END PRIVATE KEY-----`);
    });
  });

  describe('curl()', () => {
    it('POST 验证调用成功', async () => {
      // https://opendocs.alipay.com/open-v3/b6702530_alipay.user.info.share?scene=common&pathHash=d03d61a2
      await assert.rejects(async () => {
        await sdkStable.curl('POST', '/v3/alipay/user/info/share', {
          auth_token: '20120823ac6ffaa4d2d84e7384bf983531473993',
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert.equal(err.message, '无效的访问令牌');
        assert.equal(err.links!.length, 1);
        assert.equal(err.code, 'invalid-auth-token');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 401);
        return true;
      });
    });

    it('POST 文件上传', async () => {
      // https://opendocs.alipay.com/open-v3/5aa91070_alipay.open.file.upload?scene=common&pathHash=c8e11ccc
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addFile('file_content', '图片.jpg', filePath);

      const uploadResult = await sdkStable.curl<{
        file_id: string;
      }>('POST', '/v3/alipay/open/file/upload', form);
      assert(uploadResult.data.file_id);
      assert.equal(uploadResult.responseHttpStatus, 200);
      assert(uploadResult.traceId);
    });

    it('GET 验证调用成功', async () => {
      // https://opendocs.alipay.com/open-v3/c166c117_alipay.user.certify.open.query?scene=common&pathHash=ee31ddc1
      // await assert.rejects(async () => {
      //   await sdkStable.curl('GET', '/v3/alipay/user/certify/open/query', {
      //     certify_id: 'OC201809253000000393900404029253',
      //   });
      // }, err => {
      //   assert(err instanceof AlipayRequestError);
      //   assert.equal(err.message, '无效的访问令牌');
      //   assert.equal(err.links!.length, 1);
      //   assert.equal(err.code, 'invalid-auth-token');
      //   assert(err.traceId);
      //   assert.equal(err.responseHttpStatus, 401);
      //   return true;
      // });
      // https://opendocs.alipay.com/open-v3/5ea1017e_alipay.open.auth.userauth.relationship.query?scene=common&pathHash=0d3291b4
      await assert.rejects(async () => {
        await sdkStable.curl('GET', '/v3/alipay/open/auth/userauth/relationship/query', {
          scopes: 'auth_user,auth_zhima',
          open_id: '074a1CcTG1LelxKe4xQC0zgNdId0nxi95b5lsNpazWYoCo5',
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert.equal(err.message, 'appid和openid不匹配');
        assert.equal(err.code, 'app-openid-not-match');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 400);
        return true;
      });
      // https://opendocs.alipay.com/open-v3/d6c4d425_alipay.data.dataservice.bill.downloadurl.query?scene=common&pathHash=cc65bfb0
      const tradeResult = await sdkStable.curl<{
        bill_download_url: string;
      }>('GET', '/v3/alipay/data/dataservice/bill/downloadurl/query', {
        bill_type: 'trade',
        bill_date: '2016-04-05',
      });
      assert.equal(tradeResult.responseHttpStatus, 200);
      assert(tradeResult.traceId);
      assert(tradeResult.data.bill_download_url);
      // https://github.com/alipay/alipay-sdk-java-all/blob/9c2d7099579a42c454b0e00e3755a640758d0ae4/v3/docs/AlipayMarketingActivityApi.md
      await assert.rejects(async () => {
        await sdkStable.curl('GET', '/v3/alipay/marketing/activity/2016042700826004508401111111', {
          merchantId: '2088202967380463',
          merchantAccessMode: 'AGENCY_MODE',
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert.equal(err.message, '参数有误活动不存在');
        assert.equal(err.code, 'INVALID_PARAMETER');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 400);
        return true;
      });
    });
  });

  describe('exec()', () => {
    it('验证调用成功', async () => {
      const result = await sdkStable.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
      });
      assert.equal(result.code, '10000');
      assert.equal(result.msg, 'Success');
      // assert.equal(result.eventId, 'dCndJuYFvjVCT4sDkvPpPsoG5Xzbv3aH');
      assert.equal(result.needQuery, 'no_need');
      assert.equal(result.resultAction, 'PASSED');
      assert(result.traceId);
    });

    it('mock request error', async () => {
      mm.error(urllib, 'request', 'exec mock error');
      await assert.rejects(async () => {
        await sdk.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
        });
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, 'HttpClient Request error: exec mock error');
        assert.equal(err.cause.name, 'MockError');
        return true;
      });
    });

    it('配置了 config.wsServiceUrl', async () => {
      const wsServiceUrl = 'http://openapi-ztt-1.gz00b.dev.alipay.net';
      const sdk = new AlipaySdk({
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        wsServiceUrl,
      });

      let requestURL: string;
      mm(urllib, 'request', async (url: string) => {
        requestURL = url;
        throw new Error('mock error');
      });
      await assert.rejects(async () => {
        await sdk.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
        });
      }, (err: any) => {
        const url = 'ws_service_url=http%3A%2F%2Fopenapi-ztt-1.gz00b.dev.alipay.net&sign=';
        assert(requestURL.includes(url));
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, 'HttpClient Request error: mock error');
        return true;
      });
    });

    it('should throw error when status is not 200', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(503, {
        message: 'mock 400 bad request',
      }, {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      await assert.rejects(async () => {
        const result = await sdk.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
        });
        console.log(result);
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, 'HTTP 请求错误, status: 503');
        assert.equal(err.traceId, 'mock-trace-id');
        assert.equal(err.responseDataRaw, '{"message":"mock 400 bad request"}');
        return true;
      });
    });

    it('should mock validateSign fail', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, {
        alipay_security_risk_content_analyze_response: { a: 1, b: 2 },
        sign: 'signStr',
      }, {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      mm(sdk, 'checkResponseSign', () => { return false; });

      await assert.rejects(async () => {
        await sdk.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
          publicArgs: {},
        }, {
          validateSign: true,
        });
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, '验签失败');
        assert.equal(err.traceId, 'mock-trace-id');
        assert.equal(err.responseDataRaw, '{"alipay_security_risk_content_analyze_response":{"a":1,"b":2},"sign":"signStr"}');
        return true;
      });
    });

    // it('response error', function(done) {
    //   const response = {
    //     status: 200,
    //     data: undefined,
    //     headers: { trace_id: 'mock-trace-id' },
    //   };
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve(response);
    //   });

    //   sdk.exec('alipay.security.risk.content.analyze', {
    //     bizContent: {
    //       account_type: 'MOBILE_NO',
    //       account: '13812345678',
    //       version: '2.0',
    //     },
    //   }).catch(function(err) {
    //     err.should.eql({
    //       serverResult: response,
    //       errorMessage: '[AlipaySdk]Response 格式错误',
    //     });
    //     done();
    //   });
    // });

    // it('config.camelcase is true', function(done) {
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve({
    //       status: 200,
    //       data: '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}',
    //       headers: { trace_id: 'mock-trace-id' },
    //     });
    //   });
    //   sandbox.stub(sdk, 'checkResponseSign', () => { return true; });

    //   sdk.exec('alipay.security.risk.content.analyze', {
    //     bizContent: {
    //       account_type: 'MOBILE_NO',
    //       account: '13812345678',
    //       version: '2.0',
    //     },
    //     publicArgs: {},
    //   }, { validateSign: true }).then(function(data) {
    //     data.should.eql({ aB: 1, cD: 2, traceId: 'mock-trace-id' });
    //     done();
    //   });
    // });

    // it('config.camelcase is false', function(done) {
    //   const alipaySdk = new AlipaySdk({
    //     gateway: GATE_WAY,
    //     appId: APP_ID,
    //     privateKey,
    //     alipayPublicKey,
    //     camelcase: false,
    //   });
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve({
    //       status: 200,
    //       data: '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}',
    //     });
    //   });
    //   sandbox.stub(alipaySdk, 'checkResponseSign', () => { return true; });

    //   const result = alipaySdk.exec('alipay.security.risk.content.analyze', {
    //     bizContent: {
    //       account_type: 'MOBILE_NO',
    //       account: '13812345678',
    //       version: '2.0',
    //     },
    //     publicArgs: {},
    //   }, { validateSign: true }).then(function(data) {
    //     data.should.eql({ a_b: 1, c_d: 2 });
    //     done();
    //   });
    // });

    // it('NO_RIGHT Api', function(done) {
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve({
    //       status: 200,
    //       data: '{"alipay_commerce_cityfacilitator_station_query_response":{"code":"40004","msg":"Business Failed","subCode":"NO_RIGHT","subMsg":"无权限使用接口"},"sign":"signStr"}',
    //     });
    //   });

    //   sdk
    //     .exec('alipay.commerce.cityfacilitator.station.query', {
    //       bizContent: { cityCode: '440300' },
    //     })
    //     .then(ret => {
    //       ret.should.eql({
    //         code: '40004',
    //         msg: 'Business Failed',
    //         subCode: 'NO_RIGHT',
    //         subMsg: '无权限使用接口',
    //       });
    //       done();
    //     }).catch(e => {
    //       done();
    //     });
    // });

    // it('execute needEncrypt', function(done) {
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve({
    //       status: 200,
    //       data: JSON.stringify({
    //         alipay_open_auth_app_aes_set_response: '4AOYHE0rpPnRnghunsGo+mY02DzANFLwNJJCiHfrNh2oaB2pn33PwOEOvH8mjhkE3Wh/jR+3jHM9nvoFvOsY/SqZbZzamRg9Eh3VkRqOhSM=',
    //         sign: 'abcde=',
    //       }),
    //     });
    //   });

    //   const bizContent = {
    //     merchantAppId: '2021001170662064',
    //   };

    //   sdk
    //     .exec('alipay.open.auth.app.aes.set', {
    //       bizContent,
    //       needEncrypt: true,
    //     })
    //     .then(ret => {
    //       ret.should.eql({
    //         code: '10000',
    //         msg: 'Success',
    //         aesKey: 'cW8mcZgoMGUVp5g7uv7bHw==',
    //       });

    //       done();
    //     }).catch(error => {
    //       error.should.eql(false);
    //       done();
    //     });
    // });

    // it('error log enable', function(done) {
    //   const infoLog = [];
    //   const errorLog = [];
    //   const log = {
    //     info(...args) { infoLog.push(args.join('')); },
    //     error(...args) { errorLog.push(args.join('')); },
    //   };
    //   sandbox.stub(urllib, 'request', () => {
    //     return new Promise(() => {
    //       throw Error('custom error.');
    //     });
    //   });

    //   sdk
    //     .exec('alipay.security.risk.content.analyze', {
    //       bizContent: {
    //         appName: 'cmsmng',
    //         appScene: 'papilio-alipay',
    //         publishDate: YYYYMMDDHHmmss(),
    //         accountId: 'hanwen.sah',
    //         accountType: '0',
    //         appMainScene: 'papilio-alipay',
    //         appMainSceneId: '12345678',
    //         appSceneDataId: 'activity159571',
    //         text: '重要告知12313：1. ，，报备文件编号为众安备-家财【2014】主8号，由众安在线财产保险股份有限公司（即“本公司”）承保，本公司业务流程全程在线，叶1良辰12313, 好好学习。',
    //         linkUrls: [],
    //         pictureUrls: [
    //           'http://alipay-rmsdeploy-dev-image.oss-cn-hangzhou-zmf.aliyuncs.com/rmsportal/UvfTktYfmcBCshhCdeycbPqlXNRcZvKR.jpg',
    //         ],
    //       },
    //     }, { log })
    //     .then(() => {
    //       done();
    //     }).catch(() => {
    //       (infoLog[0].indexOf('[AlipaySdk]start exec, url: %s') > -1).should.eql(true);
    //       (errorLog[0].indexOf('[AlipaySdk]exec error') > -1).should.eql(true);
    //       done();
    //     });
    // });

    // it('error response', function(done) {
    //   sandbox.stub(urllib, 'request', () => {
    //     return Promise.resolve({
    //       status: 200,
    //       data: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}',
    //     });
    //   });
    //   sandbox.stub(sdk, 'checkResponseSign', () => { return true; });

    //   sdk.exec('alipay.security.risk.content.analyze', {
    //     bizContent: {
    //       account_type: 'MOBILE_NO',
    //       account: '13812345678',
    //       version: '2.0',
    //     },
    //     publicArgs: {},
    //   }, { validateSign: true }).then(function(data) {
    //     done();
    //   }).catch(e => {
    //     e.should.eql({
    //       serverResult: {
    //         status: 200,
    //         data: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}',
    //       },
    //       errorMessage: '[AlipaySdk]HTTP 请求错误',
    //       traceId: undefined,
    //     });
    //     done();
    //   });
    // });

    // it('证书校验模式 formatUrl和加签', function(done) {
    //   sandbox.stub(urllib, 'request', function(url) {
    //     const urlKeyPart = 'app_cert_sn=866efef280dec9137a87d047ac446315&alipay_root_cert_sn=687b59193f3f462dd5336e5abf83c5d8_02941eef3187dddf3d3b83462e1dfcf6&method=alipay.open.mock&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2';
    //     (url.indexOf(urlKeyPart) > 0).should.be.true();
    //     return Promise.resolve({
    //       status: 200,
    //       data: '{"alipay_open_mock_response":{"msg":"Success","result":"","code":"10000"},"alipay_cert_sn":"4538e7d736df316c15435d5f9d3a8a1f","sign":"IGMZhrPRYzaOGkmibUXF34o262YUaotyi6VzJ6EOsp+MOAg7ywRJI7UN11Xs1i5jI48Borv/i4tH6yiqXJshDRJh6cGyj6wcoZHgiYfwstqtn/6TEVbWxeyLimGG3CX0C76yKAmn/ZMlI+RtOYSz0KCTaGDvlZf6Esp1KnUKfLbzQhZ1sX5o1Tva6L7c8TXOFgK42kkjGvRfGzXKEg4B1CyG2hQZqL6mICgcOIkwAwojmD7UWSwC2a3G6XG9Q5oqi+05ZWldBk+psha2j7FTvYQikAYb7zmvDSE3bNBBh8ekDwrUVGESM4pgUXqMWUlVroiCAC85Zei3A6krREg7Zw=="}',
    //     });
    //   });
    //   sandbox.stub(sdk, 'checkResponseSign', () => { return true; });

    //   const sdkWithCert = new AlipaySdk(Object.assign({}, sdkBaseConfig, {
    //     alipayRootCertPath,
    //     alipayPublicCertPath,
    //     appCertPath,
    //   }));
    //   sdkWithCert.exec('alipay.open.mock', {
    //     bizContent: {
    //       foo: 'bar',
    //     },
    //   }, { validateSign: false }).then(function(data) {
    //     done();
    //   });
    // });
  });

  // describe('multipartExec', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //       timeout: 10000,
  //     });
  //   });

  //   it('normal', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(format(...args)); },
  //       error(...args) { errorLog.push(format(...args)); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('biz_code', 'openpt_appstore');
  //     form.addFile('file_content', '图片.jpg', filePath);

  //     this.timeout(20000);

  //     sdk
  //       .exec('alipay.open.file.upload', {
  //       }, { log, formData: form, validateSign: true })
  //       .then(ret => {
  //         console.log(ret);
  //         ret.code.should.eql('10000');
  //         ret.msg.should.eql('Success');
  //         (!ret.fileId).should.eql(false);

  //         infoLog.length.should.eql(2);
  //         (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
  //         (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
  //         // include trace_id
  //         infoLog[1].should.match(/,"trace_id":"\w+",/);
  //         errorLog.should.eql([]);
  //         ret.traceId.length.should.eql(29);

  //         done();
  //       }).catch(done);
  //   });

  //   it('multipart should serialize object field', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('batchNo', '2023041718395879900017017');
  //     form.addField('imageName', '图片.jpg');
  //     form.addField('mcc_code', 'A0002_B0201');
  //     form.addField('shopAddress', {
  //       countryCode: '156',
  //       provinceCode: '340000',
  //       cityCode: '340100',
  //       districtCode: '340103',
  //       detailAddress: '合肥市包河区中国视觉人工智能产业港A4',
  //     });
  //     form.addFile('shop_scene_pic', '图片.jpg', filePath);
  //     this.timeout(20000);

  //     sandbox.stub(sdk, 'checkResponseSign', () => { return true; });
  //     sandbox.stub(urllib, 'request', function(url, options) {
  //       if (typeof options.data.shop_address !== 'string') {
  //         return Promise.reject('serialize failure');
  //       }
  //       return Promise.resolve({ data: '{"alipay_open_agent_facetoface_sign_response":{"a":"b"}}' });
  //     });

  //     sdk
  //       .exec('alipay.open.agent.facetoface.sign', {
  //       }, { log, formData: form, validateSign: true })
  //       .then(ret => {
  //         done();
  //       }).catch(done);
  //   });

  //   it('sign error', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     sandbox.stub(sdk, 'checkResponseSign', () => { return false; });
  //     sandbox.stub(urllib, 'request', function(url, options) {
  //       return Promise.resolve({ data: '{"alipay_offline_material_image_upload_response":{"a":"b"}}' });
  //     });

  //     sdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { formData: form, validateSign: true })
  //       .then(() => {
  //         done();
  //       }).catch(err => {
  //         err.should.eql({
  //           serverResult: '{"alipay_offline_material_image_upload_response":{"a":"b"}}',
  //           errorMessage: '[AlipaySdk]验签失败',
  //           traceId: undefined,
  //         });
  //         done();
  //       });
  //   });

  //   it('error log enable', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(JSON.stringify(args)); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     sandbox.stub(urllib, 'request', function(url, options) {
  //       throw ({ error: 'custom error.' });
  //     });

  //     sdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { log, formData: form })
  //       .then(() => {
  //         done();
  //       }).catch(err => {
  //         // err.message.should.eql('[AlipaySdk]exec error');
  //         errorLog[0].should.eql('[{"error":"custom error.","message":"[AlipaySdk]exec error"}]');
  //         (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
  //         done();
  //       });
  //   });

  //   it('error response', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     sandbox.stub(sdk, 'checkResponseSign', () => { return false; });
  //     sandbox.stub(urllib, 'request', function(url, options) {
  //       return Promise.resolve({
  //         data: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}',
  //         headers: { trace_id: 'mock-trace-id' },
  //       });
  //     });

  //     sdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { log, formData: form, validateSign: true })
  //       .then(() => {
  //         done();
  //       }).catch(err => {
  //         err.should.eql({
  //           serverResult: '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}',
  //           errorMessage: '[AlipaySdk]HTTP 请求错误',
  //           traceId: 'mock-trace-id',
  //         });
  //         done();
  //       });
  //   });

  //   it('response parse error', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new AlipayFormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     sandbox.stub(sdk, 'checkResponseSign', () => { return false; });
  //     sandbox.stub(urllib, 'request', function(url, options) {
  //       return {};
  //     });

  //     sdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { log, formData: form, validateSign: true })
  //       .then(() => {
  //         done();
  //       }).catch(err => {
  //         err.should.eql({
  //           serverResult: undefined,
  //           errorMessage: '[AlipaySdk]Response 格式错误',
  //         });
  //         done();
  //       });
  //   });

  //   it('camelcase is false', function(done) {
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     sandbox.stub(urllib, 'request', function({}, callback) {
  //       return Promise.resolve({ data: '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"mock_image_id","img_url":"mock_image_url"}}' });
  //     });

  //     const form = new AlipayFormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     this.timeout(20000);

  //     const newSdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: false,
  //       timeout: 10000,
  //     });

  //     newSdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { formData: form })
  //       .then(ret => {
  //         ret.should.eql({
  //           code: '10000',
  //           msg: 'Success',
  //           image_id: 'mock_image_id',
  //           img_url: 'mock_image_url',
  //         });
  //         done();
  //       }).catch(done);
  //   });

  //   it('validate sign is false', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const filePath = path.join(__dirname, './fixtures/demo.jpg');

  //     const form = new FormData();
  //     form.addField('imageType', 'jpg');
  //     form.addField('imageName', '图片.jpg');
  //     form.addFile('imageContent', '图片.jpg', filePath);

  //     sandbox.stub(urllib, 'request', () => {
  //       return Promise.resolve({ data: '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"u16noGtTSH-r9UI0FGmIfAAAACMAAQED","image_url":"https://oalipay-dl-django.alicdn.com/rest/1.0/image?fileIds=u16noGtTSH-r9UI0FGmIfAAAACMAAQED&zoom=original"}}' });
  //     });

  //     sdk
  //       .exec('alipay.offline.material.image.upload', {
  //       }, { log, formData: form })
  //       .then(ret => {
  //         ret.code.should.eql('10000');
  //         ret.msg.should.eql('Success');
  //         (!ret.imageId).should.eql(false);
  //         (ret.imageUrl.indexOf('https://oalipay-dl-django.alicdn.com') > -1).should.eql(true);

  //         infoLog.length.should.eql(2);
  //         (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
  //         (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
  //         errorLog.should.eql([]);

  //         done();
  //       }).catch(done);
  //   });
  // });

  // describe('pageExec', () => {
  //   let sdk;
  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //     });
  //   });

  //   it('post', async () => {
  //     const result = await sdk.pageExec('alipay.trade.page.pay', {
  //       method: 'POST',
  //       bizContent: {
  //         out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //         product_code: 'FAST_INSTANT_TRADE_PAY',
  //         subject: 'abc',
  //         body: '234',
  //         // timeout_express: "90m",
  //         total_amount: '0.01',
  //       },
  //       returnUrl: 'https://www.taobao.com',
  //     });
  //     (result.indexOf('method=alipay.trade.page.pay') > -1).should.eql(true);
  //     (result.indexOf('<input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;') > -1).should.eql(true);
  //     (result.indexOf(sdkVersion) > -1).should.eql(true);
  //   });

  //   it('get', async () => {
  //     const result = await sdk.pageExec('alipay.trade.page.pay', {
  //       method: 'GET',
  //       bizContent: {
  //         out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //         product_code: 'FAST_INSTANT_TRADE_PAY',
  //         subject: 'abc',
  //         body: '234',
  //         // timeout_express: "90m",
  //         total_amount: '0.01',
  //       },
  //       returnUrl: 'https://www.taobao.com',
  //     });
  //     const url = decodeURIComponent(result);
  //     (url.indexOf('method=alipay.trade.page.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=') > -1).should.eql(true);
  //     (url.indexOf('{"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}') > -1).should.eql(true);
  //     (url.indexOf(sdkVersion) > -1).should.eql(true);
  //   });
  // });

  // describe('pageExec - legacy form data', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //     });
  //   });

  //   it('post', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const bizContent = {
  //       out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //       product_code: 'FAST_INSTANT_TRADE_PAY',
  //       subject: 'abc',
  //       body: '234',
  //       // timeout_express: "90m",
  //       total_amount: '0.01',
  //     };
  //     const formData = new AlipayFormData();
  //     formData.addField('returnUrl', 'https://www.taobao.com');
  //     formData.addField('bizContent', bizContent);

  //     sdk
  //       .exec('alipay.trade.page.pay', {
  //       }, { log, formData })
  //       .then(ret => {
  //         (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
  //         errorLog.length.should.eql(0);
  //         (ret.indexOf('method=alipay.trade.page.pay') > -1).should.eql(true);
  //         (ret.indexOf('<input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;') > -1).should.eql(true);
  //         (ret.indexOf(sdkVersion) > -1).should.eql(true);
  //         done();
  //       }).catch(done);
  //   });

  //   it('get', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };
  //     const bizContent = {
  //       out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //       product_code: 'FAST_INSTANT_TRADE_PAY',
  //       subject: 'abc',
  //       body: '234',
  //       // timeout_express: "90m",
  //       total_amount: '0.01',
  //     };
  //     const formData = new AlipayFormData();
  //     formData.setMethod('get');
  //     formData.addField('returnUrl', 'https://www.taobao.com');
  //     formData.addField('bizContent', JSON.stringify(bizContent));

  //     sdk
  //       .exec('alipay.trade.page.pay', {
  //       }, { log, formData })
  //       .then(ret => {
  //         const url = decodeURIComponent(ret);
  //         (infoLog[0].indexOf('[AlipaySdk]start exec url') > -1).should.eql(true);
  //         errorLog.length.should.eql(0);

  //         (url.indexOf('method=alipay.trade.page.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=') > -1).should.eql(true);
  //         (url.indexOf('{"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}') > -1).should.eql(true);
  //         (url.indexOf(sdkVersion) > -1).should.eql(true);
  //         done();
  //       }).catch(done);
  //   });

  //   it('get - bizContent stringify is optional', async () => {
  //     const bizContent = {
  //       out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //       product_code: 'FAST_INSTANT_TRADE_PAY',
  //       subject: 'abc',
  //       body: '234',
  //       total_amount: '0.01',
  //     };

  //     const stringified = JSON.stringify(bizContent);

  //     // 第一次执行，stringified
  //     const formData = new AlipayFormData();
  //     formData.setMethod('get');
  //     formData.addField('returnUrl', 'https://www.taobao.com');
  //     formData.addField('bizContent', stringified);


  //     const result1 = await sdk.exec('alipay.trade.page.pay', {
  //     }, { formData });
  //     const url1 = decodeURIComponent(result1);
  //     const index1 = url1.indexOf(stringified);

  //     // 第二次执行，传源对象
  //     const form2 = new AlipayFormData();
  //     form2.setMethod('get');
  //     form2.addField('returnUrl', 'https://www.taobao.com');
  //     form2.addField('bizContent', bizContent);

  //     const result2 = await sdk.exec('alipay.trade.page.pay', {
  //     }, { formData: form2 });


  //     const url2 = decodeURIComponent(result2);

  //     const index2 = url2.indexOf(stringified);

  //     // 两者的效果应该一样，都被 stringified，由于签名不同，判断位置相等即可。
  //     index1.should.eql(index2);
  //     url1.should.eql(url2);
  //     (index1 > -1).should.eql(true);

  //   });

  //   it('disable log', function(done) {
  //     const bizContent = {
  //       out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //       product_code: 'FAST_INSTANT_TRADE_PAY',
  //       subject: 'abc',
  //       body: '234',
  //       // timeout_express: "90m",
  //       total_amount: '0.01',
  //     };
  //     const formData = new FormData();
  //     formData.setMethod('get');
  //     formData.addField('returnUrl', 'https://www.taobao.com');
  //     formData.addField('bizContent', JSON.stringify(bizContent));

  //     sdk
  //       .exec('alipay.trade.page.pay', {
  //       }, { formData })
  //       .then(ret => {
  //         const url = decodeURIComponent(ret);
  //         (url.indexOf('method=alipay.trade.page.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=') > -1).should.eql(true);
  //         (url.indexOf('{"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}') > -1).should.eql(true);
  //         (url.indexOf(sdkVersion) > -1).should.eql(true);
  //         done();
  //       }).catch(done);
  //   });
  // });

  // describe('sdkExec', () => {
  //   let sdk;
  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //     });
  //   });

  //   it('normal', async () => {
  //     const result = await sdk.sdkExec('alipay.trade.app.pay', {
  //       bizContent: {
  //         out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
  //         product_code: 'FAST_INSTANT_TRADE_PAY',
  //         subject: 'abc',
  //         body: '234',
  //         // timeout_express: "90m",
  //         total_amount: '0.01',
  //       },
  //       returnUrl: 'https://www.taobao.com',
  //     });

  //     const urlDecodedStr = decodeURIComponent(result);
  //     urlDecodedStr.indexOf('method=alipay.trade.app.pay').should.be.above(-1);
  //     urlDecodedStr.indexOf('biz_content={"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}').should.be.above(-1);
  //   });
  // });

  // describe('getSignStr', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //     });
  //   });

  //   it('normal', () => {
  //     const originStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},"sign":"P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}';

  //     const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

  //     signStr.should.eql('{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
  //   });

  //   it('include \\r\\n\\s', () => {
  //     const originStr = `{"alipay_offline_material_image_upload_response"
  //       :
  //       {"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},

  //         "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

  //     const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

  //     signStr.should.eql('{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
  //   });

  //   it('include sign key in data', () => {
  //     const originStr = `{"alipay_offline_material_image_upload_response"
  //       :
  //       {"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},

  //         "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

  //     const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');

  //     signStr.should.eql('{"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
  //   });
  // });

  // describe('checkResponseSign', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       alipayPublicKey,
  //       camelcase: true,
  //     });
  //   });

  //   it('alipayPublicKey is null', function(done) {
  //     const newSdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       alipayPublicKey,
  //     });
  //     delete newSdk.config.alipayPublicKey;
  //     const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\/\/oalipay-dl-django.alicdn.com\/rest\/1.0\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';

  //     const result = newSdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response');
  //     result.should.eql(true);
  //     done();
  //   });

  //   it('alipayPublicKey is empty', function(done) {
  //     const newSdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       alipayPublicKey,
  //     });
  //     newSdk.config.alipayPublicKey = '';
  //     const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';

  //     const result = newSdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response');
  //     result.should.eql(true);
  //     done();
  //   });

  //   it('signStr is null', function(done) {
  //     const result = sdk.checkResponseSign(null, 'alipay_offline_material_image_upload_response');
  //     result.should.eql(false);
  //     done();
  //   });

  //   it('normal', function(done) {
  //     // 从实测中获取，公钥修改后需要变更
  //     const signStr = '{"alipay_open_file_upload_response":{"code":"10000","msg":"Success","file_id":"CAxAToWB1JsAAAAAAAAAAAAADgSLAQBr"},"sign":"F+LDzpTNiavn7xVZPGuPCSSVRSmWzJGgtuji6tVELGEaqMaNj0jRKXUEr5nloZJBBmwEnddOyCjjepMmrTKTvoOqQ0Efxpr/R1iEeHTHVbb/Q8TTh6Up5gHJDkILdaWS2q1cWeQ6VT+HQY9P3WRXS7uhILHuDODIhpAyCu5KhWGt0rMCIG+Im6NODJP2oohtSCtmTFXg58HH587Z2y2bdbjzOxLvzD9IrU1imghXQ2S/Q+wMIvRk9on6cWnBLkrNvJKapA2ReNGWOwyuASvB9zDVzhMPbR+3mfRGkVDxsq5HYLjBKGskJMXHw0HuugZij6ScRuaLPODhmHwr/pJ9yw=="}';
  //     const result = sdk.checkResponseSign(signStr, 'alipay_open_file_upload_response');
  //     result.should.eql(true);
  //     done();
  //   });
  // });

  // describe('checkNotifySign', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       alipayPublicKey: notifyAlipayPublicKeyV2,
  //       camelcase: true,
  //     });
  //   });

  //   it('alipayPublicKey is null', () => {
  //     const sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey,
  //       camelcase: true,
  //     });

  //     sdk.checkNotifySign({}).should.eql(false);
  //   });

  //   it('postData.sign is null', () => {
  //     sdk.checkNotifySign({}).should.eql(false);
  //   });

  //   describe('verify sign should delete sign_type', () => {
  //     beforeEach(() => {
  //       const notifyAlipayPublicKeyV1 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqObrdC7hrgAVM98tK0nv3hSQRGGKT4lBsQjHiGjeYZjOPIPHR5knm2jnnz/YGIXIofVHkA/tAlBAd5DrY7YpvI4tP5EONLtZKC2ghBMx7McI2wRD0xiqzxOQr1FuhZGJ8/AUokBzJrzY+aGX2xcOrxFYRlFilvVLTXg4LWjR1tdPkO6+i7wQZAIVMClPkwVRZEbaERRHlKqTzv2gGv5rDU8gRoe1LeaN+6BlbTqHWkQcNCUNrA8C6l17XAXGKDsm/9TFWwO8EPHHHCaQdjtV5/FdcWIt+L8SR1ss7EXTjYDFtxcKVv9rEoY1lX8T4mX+GbXfZHraG5NCF1+XioL5JwIDAQAB';
  //       sdk = new AlipaySdk({
  //         gateway: GATE_WAY,
  //         appId: APP_ID,
  //         privateKey,
  //         alipayPublicKey: notifyAlipayPublicKeyV1,
  //         camelcase: true,
  //       });
  //     });

  //     it('with sign_type arguments verify success', () => {
  //       const postData = {
  //         gmt_create: '2019-08-15 15:56:22',
  //         charset: 'utf-8',
  //         seller_email: 'z97-yuquerevenue@service.aliyun.com',
  //         subject: '语雀空间 500人规模',
  //         sign:
  //          'QfTb8tqE1BMhS5qAnXtvsF3/jBkEvu9q9en0pdbBUDDjvKycZhQb7h8GDs4FKfi049PynaNuatxSgLb/nLWZpXyyh0LEWdK2S6Ri7nPwrVgOs08zugLO20vOQz44y3ti2Ncm8/wZts1Fr2gZ7pShnVX3d1B50hbsXnObT1r/U8ONNQjWXd0HIul4TG+Q3fm3svmSvFEy0WnzuhcyHPX5Gm4ELNctL6Qd5YniGJFNcc7kopHYtI/XD9YCKCH6Ct02rzUs9i11C9CsadtZn+WhxF26Dqt9sGEFajkJ8cxUTLi8+VCpLHsgPE8P0y095uQcDdK0YjCh4x7wVSov+lrmOQ==',
  //         buyer_id: '2088102534368455',
  //         invoice_amount: '0.10',
  //         notify_id: '2019081500222155624068450559358070',
  //         fund_bill_list: [{ amount: '0.10', fundChannel: 'ALIPAYACCOUNT' }],
  //         notify_type: 'trade_status_sync',
  //         trade_status: 'TRADE_SUCCESS',
  //         receipt_amount: '0.10',
  //         buyer_pay_amount: '0.10',
  //         sign_type: 'RSA2',
  //         app_id: '2019073166072302',
  //         seller_id: '2088531891668739',
  //         gmt_payment: '2019-08-15 15:56:24',
  //         notify_time: '2019-08-15 15:56:25',
  //         version: '1.0',
  //         out_trade_no: '20190815155618536-564-57',
  //         total_amount: '0.10',
  //         trade_no: '2019081522001468450512505578',
  //         auth_app_id: '2019073166072302',
  //         buyer_logon_id: 'xud***@126.com',
  //         point_amount: '0.00' };

  //       sdk.checkNotifySign(postData).should.eql(true);
  //     });

  //     it('without sign_type arguments verify success', () => {
  //       const postData = {
  //         gmt_create: '2019-08-15 15:56:22',
  //         charset: 'utf-8',
  //         seller_email: 'z97-yuquerevenue@service.aliyun.com',
  //         subject: '语雀空间 500人规模',
  //         sign:
  //          'QfTb8tqE1BMhS5qAnXtvsF3/jBkEvu9q9en0pdbBUDDjvKycZhQb7h8GDs4FKfi049PynaNuatxSgLb/nLWZpXyyh0LEWdK2S6Ri7nPwrVgOs08zugLO20vOQz44y3ti2Ncm8/wZts1Fr2gZ7pShnVX3d1B50hbsXnObT1r/U8ONNQjWXd0HIul4TG+Q3fm3svmSvFEy0WnzuhcyHPX5Gm4ELNctL6Qd5YniGJFNcc7kopHYtI/XD9YCKCH6Ct02rzUs9i11C9CsadtZn+WhxF26Dqt9sGEFajkJ8cxUTLi8+VCpLHsgPE8P0y095uQcDdK0YjCh4x7wVSov+lrmOQ==',
  //         buyer_id: '2088102534368455',
  //         invoice_amount: '0.10',
  //         notify_id: '2019081500222155624068450559358070',
  //         fund_bill_list: [{ amount: '0.10', fundChannel: 'ALIPAYACCOUNT' }],
  //         notify_type: 'trade_status_sync',
  //         trade_status: 'TRADE_SUCCESS',
  //         receipt_amount: '0.10',
  //         buyer_pay_amount: '0.10',
  //         app_id: '2019073166072302',
  //         seller_id: '2088531891668739',
  //         gmt_payment: '2019-08-15 15:56:24',
  //         notify_time: '2019-08-15 15:56:25',
  //         version: '1.0',
  //         out_trade_no: '20190815155618536-564-57',
  //         total_amount: '0.10',
  //         trade_no: '2019081522001468450512505578',
  //         auth_app_id: '2019073166072302',
  //         buyer_logon_id: 'xud***@126.com',
  //         point_amount: '0.00' };

  //       sdk.checkNotifySign(postData).should.eql(true);
  //     });

  //     it('verify fail', () => {
  //       const postData = {
  //         app_id: '2018121762595097',
  //         auth_app_id: '2018121762595097',
  //         buyer_id: '2088512613526436',
  //         buyer_logon_id: '152****6706',
  //         buyer_pay_amount: '0.01',
  //         charset: 'utf-8',
  //         fund_bill_list: [{ amount: '0.01', fundChannel: 'PCREDIT' }],
  //         gmt_create: '2019-05-23 14:13:56',
  //         gmt_payment: '2019-05-23 14:17:13',
  //         invoice_amount: '0.01',
  //         notify_id: '2019052300222141714026431019971405',
  //         notify_time: '2019-05-23 14:17:14',
  //         notify_type: 'trade_status_sync',
  //         out_trade_no: 'tpxy23962362669658',
  //         point_amount: '0.00',
  //         receipt_amount: '0.01',
  //         seller_email: 'myapp@alitest.com',
  //         seller_id: '2088331578818800',
  //         sign: 'T946S2qyNFAXLhAaRgNMmatxH6SO3MyWYFnTamQOgW1iAcheL/Zz+VoizwvEc6mTEwYewvvKS1wNkMQ1oEajMUHv9+cXQ9IFvU/qKS9Ktvw5xHvCaK0fj7LsVcQ7VxfyT3kSvXUDfKDP4cHSPuSZKwM2ybkzr53bIH9OUTpTQd2d3J0rbdf76OoUt+XF9vwqj7OVE7AGjH2HPWp842DgL/YVy4qeA9N2uFKRevT3YUskjaRxuI/E66reNjTMFhbjEqGLKvMcDD4BaQXnibq9ojAj60589fBwzKk3yWsVQmqGfksMQoheVMtZ3lAw4o2ty3TFngbVFFLwgx8FDpBZ9Q==',
  //         sign_type: 'RSA2',
  //         subject: 'tpxy2222896485',
  //         total_amount: '0.01',
  //         trade_no: '111111112019052322001426431037869358',
  //         trade_status: 'TRADE_SUCCESS',
  //         version: '1.0',
  //       };

  //       sdk.checkNotifySign(postData).should.eql(false);
  //     });

  //     it('verify with decode', () => {
  //       try {
  //         sdk.checkNotifySign({
  //           bizContent: '{"key":"value % has special charactar"}',
  //           sign: 'test',
  //         });
  //       } catch (e) {
  //         e.message.includes('URI malformed').should.eql(true);
  //       }
  //     });

  //     it('verify without decode', () => {
  //       let hasError = false;
  //       try {
  //         sdk.checkNotifySign({
  //           bizContent: '{"key":"value % has special charactar"}',
  //           sign: 'test',
  //         }, true);
  //       } catch (e) {
  //         hasError = true;
  //       }
  //       hasError.should.eql(false);
  //     });
  //   });

  //   describe('verify sign should not delete sign_type', () => {
  //     it('with sign_type arguments verify success', () => {
  //       const postData = {
  //         app_id: '2017122801303261',
  //         charset: 'UTF-8',
  //         commodity_order_id: '2019030800000018079639',
  //         contactor: '技术支持测试的公司',
  //         merchant_pid: '2088721996721370',
  //         method: 'alipay.open.servicemarket.order.notify',
  //         name: '技术支持测试的公司',
  //         notify_id: '2019030800222102023008121054923345',
  //         notify_time: '2019-03-08 10:20:23',
  //         notify_type: 'servicemarket_order_notify',
  //         order_item_num: '1',
  //         order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
  //         order_time: '2019-03-08 10:20:08',
  //         phone: '17826894615',
  //         service_code: '58621634',
  //         sign:
  //          'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
  //         sign_type: 'RSA2',
  //         timestamp: '2019-03-08 10:20:23',
  //         title: '麦禾商城模版',
  //         total_price: '0.00',
  //         version: '1.0',
  //       };

  //       sdk.checkNotifySign(postData).should.eql(true);
  //     });

  //     it('without sign_type arguments verify success', () => {
  //       const postData = {
  //         app_id: '2017122801303261',
  //         charset: 'UTF-8',
  //         commodity_order_id: '2019030800000018079639',
  //         contactor: '技术支持测试的公司',
  //         merchant_pid: '2088721996721370',
  //         method: 'alipay.open.servicemarket.order.notify',
  //         name: '技术支持测试的公司',
  //         notify_id: '2019030800222102023008121054923345',
  //         notify_time: '2019-03-08 10:20:23',
  //         notify_type: 'servicemarket_order_notify',
  //         order_item_num: '1',
  //         order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
  //         order_time: '2019-03-08 10:20:08',
  //         phone: '17826894615',
  //         service_code: '58621634',
  //         sign:
  //          'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
  //         timestamp: '2019-03-08 10:20:23',
  //         title: '麦禾商城模版',
  //         total_price: '0.00',
  //         version: '1.0',
  //       };

  //       sdk.checkNotifySign(postData).should.eql(true);
  //     });

  //     it('verify fail', () => {
  //       const postData = {
  //         app_id: '2017122801303261',
  //         charset: 'UTF-8',
  //         commodity_order_id: '2019030800000018079639',
  //         contactor: '技术支持测试的公司',
  //         merchant_pid: '2088721996721370',
  //         method: 'alipay.open.servicemarket.order.notify',
  //         name: '技术支持测试的公司',
  //         notify_id: '2019030800222102023008121054923345',
  //         notify_time: '2019-03-08 10:20:23',
  //         notify_type: 'servicemarket_order_notify',
  //         order_item_num: '1',
  //         order_ticket: '29b1c37d99ab48c5bd5bdaeaeaefbB37',
  //         order_time: '2019-03-08 10:20:08',
  //         phone: '17826894615',
  //         service_code: '58621634111',
  //         sign:
  //          'MsK5SCw8oqLw4f0hiNSd5OVGXxBY3wnQeT8vn5PklJSZFWSZbK4hQbNvkp4ZezeXQH514cEv0ul6Qow8yh6e6yM06LfEL+EZjcpZ0nxzFGRNQ5qq2AUc1OaXQdk92AGvxh+Iq4NGpPQFBd4D8EBJa3NJd8+czMfQskceosOQFqUtLQMYa5DPs+VpN7VM5BdXjaVIuKn5d9Wm2B9dI9ObIM+YRySDkZZPv14DVmUvcrcqJfOR8aHvtSd7B4l92wUQPQgQKNcOQho7xOHS/Bk+Y74AZL2y7TkNmdDoq9OGsThuF5tDW9rI9nVwXxOtsuB+bstra+W7aw9x9DvkKgdSRw==',
  //         sign_type: 'RSA2',
  //         timestamp: '2019-03-08 10:20:23',
  //         title: '麦禾商城模版',
  //         total_price: '0.00',
  //         version: '1.0',
  //       };

  //       sdk.checkNotifySign(postData).should.eql(false);
  //     });
  //   });

  // });

  // describe('execute, pkcs8', () => {
  //   let sdk;

  //   beforeEach(() => {
  //     const pkcs8PrivateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key-pkcs8.pem', 'ascii');
  //     sdk = new AlipaySdk({
  //       gateway: GATE_WAY,
  //       appId: APP_ID,
  //       privateKey: pkcs8PrivateKey,
  //       signType: 'RSA2',
  //       alipayPublicKey,
  //       camelcase: true,
  //       timeout: 10000,
  //       keyType: 'PKCS8',
  //     });
  //   });

  //   // 沙箱网关环境可能不稳定，仅当成功返回时校验。
  //   it('execute with validateSign is true', function(done) {
  //     const infoLog = [];
  //     const errorLog = [];
  //     const log = {
  //       info(...args) { infoLog.push(args.join('')); },
  //       error(...args) { errorLog.push(args.join('')); },
  //     };

  //     this.timeout(20000);

  //     sdk
  //       .exec('alipay.offline.market.shop.category.query', {
  //         bizContent: {},
  //       }, { log })
  //       .then(ret => {
  //         if (ret.code === '10000') {
  //           (ret.shopCategoryConfigInfos.length > 0).should.eql(true);

  //           ret.shopCategoryConfigInfos[0].should.have.property('id');
  //           ret.shopCategoryConfigInfos[0].should.have.property('level');
  //           ret.shopCategoryConfigInfos[0].should.have.property('link');
  //           ret.shopCategoryConfigInfos[0].should.have.property('isLeaf');
  //           ret.shopCategoryConfigInfos[0].should.have.property('nm');

  //           infoLog.length.should.eql(2);
  //           (infoLog[0].indexOf('[AlipaySdk]start exec') > -1).should.eql(true);
  //           (infoLog[1].indexOf('[AlipaySdk]exec response') > -1).should.eql(true);
  //           errorLog.should.eql([]);
  //         }

  //         done();
  //       }).catch(done);
  //   });
  // });
});
