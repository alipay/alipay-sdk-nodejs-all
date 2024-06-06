import { Verify } from 'node:crypto';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import urllib, { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'urllib';
import mm from 'mm';
import {
  readFixturesFile, getFixturesFile,
  APP_ID, GATE_WAY,
  STABLE_APP_ID, STABLE_GATE_WAY, STABLE_ENDPOINT, STABLE_APP_PRIVATE_KEY, STABLE_ALIPAY_PUBLIC_KEY,
} from './helper.js';
import {
  AlipayFormData, AlipaySdk, AlipaySdkConfig,
} from '../src/index.js';

const privateKey = readFixturesFile('app-private-key.pem', 'ascii');
const alipayPublicKey = readFixturesFile('alipay-public-key.pem', 'ascii');
const alipayRootCertPath = getFixturesFile('alipayRootCert.crt');
const alipayPublicCertPath = getFixturesFile('alipayCertPublicKey_RSA2.crt');
const appCertPath = getFixturesFile('appCertPublicKey_2021001161683774.crt');

describe('test/alipay.exec.test.ts', () => {
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
  const globalAgent = getGlobalDispatcher();

  beforeEach(() => {
    sdk = new AlipaySdk(sdkBaseConfig);
    sdkStable = new AlipaySdk(sdkStableConfig);
    assert(sdkStable);
  });

  before(() => {
    setGlobalDispatcher(mockAgent);
  });

  after(() => {
    setGlobalDispatcher(globalAgent);
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

    it('test alipay.system.oauth.token', async () => {
      const result = await sdkStable.exec('alipay.system.oauth.token', {
        code: 'abcd', grant_type: 'authorization_code',
      });
      // console.log(result);
      assert.equal(result.msg, 'Invalid Arguments');
      assert.equal(result.code, '40002');
    });

    it('bizContent 和 biz_content 不能同时设置', async () => {
      await assert.rejects(async () => {
        await sdkStable.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
          biz_content: {},
        });
      }, (err: any) => {
        assert.equal(err.name, 'TypeError');
        assert.equal(err.message, '不能同时设置 bizContent 和 biz_content');
        return true;
      });
    });

    it('needEncrypt = true 但是 encryptKey 没有设置', async () => {
      mm(sdkStable.config, 'encryptKey', '');
      await assert.rejects(async () => {
        await sdkStable.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
          needEncrypt: true,
        });
      }, (err: any) => {
        console.log(err);
        assert.equal(err.name, 'TypeError');
        assert.equal(err.message, '请设置 encryptKey 参数');
        return true;
      });
    });

    it('needEncrypt = true 但是服务端解密失败', async () => {
      // {"alipay_security_risk_content_analyze_response":{"code":"40003","msg":"Insufficient Conditions","sub_code":"isv.decryption-error-unknown","sub_msg":"解密出错, 未知错误"},"sign":"fpPCfGS+MLqJzK0Q/W61pNMXMLBogtCxyl0ZiEtOzTKWZBC7hiXe9AGOML0hoXQkJshlRgz8dUPvQNapuZff5TNu16/Va/4bnwLW1V1Og7KaAYlD9jbQPFLJv+YFM3SAXmylLVMatKMbEy2Cb3vn6FVpDrqTspUjhcPH7ACUirIcriFR+FhT9yGypLeOm2wYto0t59H5k5FlcsepdUReBcXP0UbglwjUOHh9TX3/VNQk3s6zoxhUC4ep570gmycEHwg4H1lSJky8M/FADUBr3gd8rynz3S+CbfPaOJoGKraeSzR2iA1bIu1fUN7GjI1wZjR8PfiQI2joNn+Z9OxUgw=="}
      const result = await sdkStable.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        needEncrypt: true,
      });
      assert.equal(result.code, '40003');
      assert.equal(result.msg, 'Insufficient Conditions');
      assert.equal(result.subCode, 'isv.decryption-error-unknown');
      assert.equal(result.subMsg, '解密出错, 未知错误');
      // console.log(result);
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
        assert.equal(err.message, 'HTTP 请求错误, status: 503 (traceId: mock-trace-id)');
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
        assert.equal(err.message, '验签失败，服务端返回的 sign: \'signStr\' 无效, validateStr: \'{"a":1,"b":2},"sign":"signStr"}\' (traceId: mock-trace-id)');
        assert.equal(err.traceId, 'mock-trace-id');
        assert.equal(err.responseDataRaw, '{"alipay_security_risk_content_analyze_response":{"a":1,"b":2},"sign":"signStr"}');
        return true;
      });
    });

    it('should return response format error when response data is empty string', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '', {
        headers: {
          trace_id: 'mock-trace-id',
        },
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
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, 'Response 格式错误 (traceId: mock-trace-id)');
        assert.equal(err.traceId, 'mock-trace-id');
        assert.equal(err.responseDataRaw, '');
        return true;
      });
    });

    it('should config.camelcase default is true', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      const result = await sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      });
      assert.deepEqual(result, {
        aB: 1, cD: 2, traceId: 'mock-trace-id',
      });
    });

    it('should set config.camelcase to false work', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_security_risk_content_analyze_response":{"a_b":1,"c_d":2},"sign":"signStr"}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      const alipaySdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        alipayPublicKey,
        camelcase: false,
      });
      const result = await alipaySdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      });
      assert.deepEqual(result, {
        a_b: 1, c_d: 2, traceId: 'mock-trace-id',
      });
    });

    it('should mock NO_RIGHT Api work', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_commerce_cityfacilitator_station_query_response":{"code":"40004","msg":"Business Failed","subCode":"NO_RIGHT","subMsg":"无权限使用接口"},"sign":"signStr"}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      const result = await sdk.exec('alipay.commerce.cityfacilitator.station.query', {
        bizContent: { cityCode: '440300' },
      });
      assert.deepEqual(result, {
        code: '40004',
        msg: 'Business Failed',
        subCode: 'NO_RIGHT',
        subMsg: '无权限使用接口',
        traceId: 'mock-trace-id',
      });
    });

    it('should execute with options.needEncrypt = true', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, JSON.stringify({
        alipay_open_auth_app_aes_set_response: '4AOYHE0rpPnRnghunsGo+mY02DzANFLwNJJCiHfrNh2oaB2pn33PwOEOvH8mjhkE3Wh/jR+3jHM9nvoFvOsY/SqZbZzamRg9Eh3VkRqOhSM=',
        sign: 'abcde=',
      }), {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      const bizContent = {
        merchantAppId: '2021001170662064',
      };

      const result = await sdk.exec('alipay.open.auth.app.aes.set', {
        bizContent,
        needEncrypt: true,
      });
      assert.deepEqual(result, {
        code: '10000',
        msg: 'Success',
        aesKey: 'cW8mcZgoMGUVp5g7uv7bHw==',
        traceId: 'mock-trace-id',
      });
    });

    it('should return error_response', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"error_response":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      const result = await sdk.exec('alipay.security.risk.content.analyze', {
        bizContent: {
          account_type: 'MOBILE_NO',
          account: '13812345678',
          version: '2.0',
        },
        publicArgs: {},
      });
      assert.deepEqual(result, {
        code: '40002',
        msg: 'Invalid Arguments',
        subCode: 'isv.code-invalid',
        subMsg: '授权码code无效',
        traceId: 'mock-trace-id',
      });
    });

    it('should return invalid response format', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"error_response2":{"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"}}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      await assert.rejects(async () => {
        await sdk.exec('alipay.security.risk.content.analyze', {
          bizContent: {
            account_type: 'MOBILE_NO',
            account: '13812345678',
            version: '2.0',
          },
          publicArgs: {},
        });
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, 'Response 格式错误，返回值 alipay_security_risk_content_analyze_response 找不到 (traceId: mock-trace-id)');
        return true;
      });
    });

    it('证书校验模式 formatUrl 和加签', async () => {
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_open_mock_response":{"msg":"Success","result":"","code":"10000"},"alipay_cert_sn":"4538e7d736df316c15435d5f9d3a8a1f","sign":"IGMZhrPRYzaOGkmibUXF34o262YUaotyi6VzJ6EOsp+MOAg7ywRJI7UN11Xs1i5jI48Borv/i4tH6yiqXJshDRJh6cGyj6wcoZHgiYfwstqtn/6TEVbWxeyLimGG3CX0C76yKAmn/ZMlI+RtOYSz0KCTaGDvlZf6Esp1KnUKfLbzQhZ1sX5o1Tva6L7c8TXOFgK42kkjGvRfGzXKEg4B1CyG2hQZqL6mICgcOIkwAwojmD7UWSwC2a3G6XG9Q5oqi+05ZWldBk+psha2j7FTvYQikAYb7zmvDSE3bNBBh8ekDwrUVGESM4pgUXqMWUlVroiCAC85Zei3A6krREg7Zw=="}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      const sdkWithCert = new AlipaySdk(Object.assign({}, sdkBaseConfig, {
        alipayRootCertPath,
        alipayPublicCertPath,
        appCertPath,
      }));
      const result = await sdkWithCert.exec('alipay.open.mock', {
        bizContent: {
          foo: 'bar',
        },
      }, { validateSign: false });
      assert.deepEqual(result, {
        code: '10000',
        msg: 'Success',
        result: '',
        traceId: 'mock-trace-id',
      });
    });

    it('exec 传递没有文件的 formData 会抛异常提示', async () => {
      const bizContent = {
        out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
        product_code: 'FAST_INSTANT_TRADE_PAY',
        subject: 'abc',
        body: '234',
        // timeout_express: "90m",
        total_amount: '0.01',
      };
      const formData = new AlipayFormData();
      formData.addField('returnUrl', 'https://www.taobao.com');
      formData.addField('bizContent', bizContent);

      await assert.rejects(async () => {
        await sdk.exec('alipay.trade.page.pay', {}, { formData });
      }, (err: any) => {
        assert.equal(err.name, 'TypeError');
        assert.equal(err.message, 'formData 参数不包含文件，你可能是希望获取 POST 表单 HTML，请调用 pageExec() 方法代替');
        return true;
      });
    });
  });

  describe('exec() with multipart', () => {
    let sdk: AlipaySdk;
    before(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        timeout: 10000,
      });
    });

    it('should support exec with options.formData to upload file', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addFile('file_content', '图片.jpg', filePath);

      const result = await sdk.exec('alipay.open.file.upload', {}, {
        formData: form,
        validateSign: true,
      });
      assert.equal(result.code, '10000');
      assert.equal(result.msg, 'Success');
      assert(result.traceId!.length >= 29);
      assert(result.fileId);
      // console.log(result);
    });

    it('支持流式上传文件', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addFile('file_content', '图片.jpg', fs.createReadStream(filePath));

      const result = await sdk.exec('alipay.open.file.upload', {}, {
        formData: form,
        validateSign: true,
      });
      assert.equal(result.code, '10000');
      assert.equal(result.msg, 'Success');
      assert(result.traceId!.length >= 29);
      assert(result.fileId);
      console.log(result);
    });

    it('支持 buffer 上传文件', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addFile('file_content', '图片.jpg', fs.readFileSync(filePath));

      const result = await sdk.exec('alipay.open.file.upload', {}, {
        formData: form,
        validateSign: true,
      });
      assert.equal(result.code, '10000');
      assert.equal(result.msg, 'Success');
      assert(result.traceId!.length >= 29);
      assert(result.fileId);
      console.log(result);
    });

    it('should handle urllib request error', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addFile('file_content', '图片.jpg', filePath);

      mm.error(urllib, 'request');
      await assert.rejects(async () => {
        await sdk.exec('alipay.open.file.upload', {}, {
          formData: form,
          validateSign: true,
        });
      }, /mm mock error/);
    });

    it('multipart should serialize object field and validateSign = true', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('batchNo', '2023041718395879900017017');
      form.addField('imageName', '图片.jpg');
      form.addField('mcc_code', 'A0002_B0201');
      form.addField('shopAddress', {
        countryCode: '156',
        provinceCode: '340000',
        cityCode: '340100',
        districtCode: '340103',
        detailAddress: '合肥市包河区中国视觉人工智能产业港A4',
      });
      form.addFile('shop_scene_pic', '图片.jpg', filePath);
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_open_agent_facetoface_sign_response":{"user_id":"b"},"sign":"xxx"}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });
      mm.data(Verify.prototype, 'verify', true);

      const result = await sdk.exec('alipay.open.agent.facetoface.sign', {}, {
        formData: form,
        validateSign: true,
      });
      assert.deepEqual(result, {
        userId: 'b',
        traceId: 'mock-trace-id',
      });
    });

    it('validate sign error', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('batchNo', '2023041718395879900017017');
      form.addField('imageName', '图片.jpg');
      form.addField('mcc_code', 'A0002_B0201');
      form.addField('shopAddress', {
        countryCode: '156',
        provinceCode: '340000',
        cityCode: '340100',
        districtCode: '340103',
        detailAddress: '合肥市包河区中国视觉人工智能产业港A4',
      });
      form.addFile('shop_scene_pic', '图片.jpg', filePath);
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_open_agent_facetoface_sign_response":{"user_id":"b"},"sign":"xxx"}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      await assert.rejects(async () => {
        await sdk.exec('alipay.open.agent.facetoface.sign', {}, {
          formData: form,
          validateSign: true,
        });
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, '验签失败，服务端返回的 sign: \'xxx\' 无效, validateStr: \'{"user_id":"b"},"sign":"xxx"}\' (traceId: mock-trace-id)');
        assert.equal(err.responseDataRaw, '{"alipay_open_agent_facetoface_sign_response":{"user_id":"b"},"sign":"xxx"}');
        return true;
      });
    });

    it('camelcase is false', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const mockPool = mockAgent.get('https://openapi-sandbox.dl.alipaydev.com');
      mockPool.intercept({
        path: /\/gateway\.do/,
        method: 'POST',
      }).reply(200, '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"mock_image_id","img_url":"mock_image_url"}}', {
        headers: {
          trace_id: 'mock-trace-id',
        },
      });

      const form = new AlipayFormData();
      form.addField('imageType', 'jpg');
      form.addField('imageName', '图片.jpg');
      form.addFile('imageContent', '图片.jpg', filePath);

      const newSdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: false,
        timeout: 10000,
      });

      const result = await newSdk.exec('alipay.offline.material.image.upload', {}, { formData: form });
      assert.deepEqual(result, {
        code: '10000',
        msg: 'Success',
        image_id: 'mock_image_id',
        img_url: 'mock_image_url',
        traceId: 'mock-trace-id',
      });
    });
  });

  describe('exec() with pkcs8', () => {
    let sdk: AlipaySdk;

    beforeEach(() => {
      const pkcs8PrivateKey = readFixturesFile('app-private-key-pkcs8.pem', 'ascii');
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey: pkcs8PrivateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
        timeout: 10000,
        keyType: 'PKCS8',
      });
    });

    // 沙箱网关环境可能不稳定，仅当成功返回时校验。
    it('execute with validateSign is true', async () => {
      const result = await sdk.exec('alipay.offline.market.shop.category.query', {
        bizContent: {},
      });
      console.log(result);
      if (result.code === '10000') {
        assert(result.shopCategoryConfigInfos);
        assert(result.shopCategoryConfigInfos[0]);
      }
    });
  });
});
