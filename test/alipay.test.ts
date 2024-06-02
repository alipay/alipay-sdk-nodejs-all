import fs from 'node:fs';
import { randomUUID, Verify } from 'node:crypto';
import { strict as assert } from 'node:assert';
import urllib, { MockAgent, setGlobalDispatcher } from 'urllib';
import mm from 'mm';
import {
  readFixturesFile, getFixturesFile,
  APP_ID, GATE_WAY,
  STABLE_APP_ID, STABLE_GATE_WAY, STABLE_ENDPOINT, STABLE_APP_PRIVATE_KEY, STABLE_ALIPAY_PUBLIC_KEY,
} from './helper.js';
import {
  AlipayFormData, AlipayFormStream, AlipayRequestError, AlipaySdk, AlipaySdkConfig,
} from '../src/index.js';

const privateKey = readFixturesFile('app-private-key.pem', 'ascii');
const alipayPublicKey = readFixturesFile('alipay-public-key.pem', 'ascii');
const notifyAlipayPublicKeyV2 = readFixturesFile('alipay-notify-sign-public-key-v2.pem', 'ascii');
const alipayRootCertPath = getFixturesFile('alipayRootCert.crt');
const alipayPublicCertPath = getFixturesFile('alipayCertPublicKey_RSA2.crt');
const appCertPath = getFixturesFile('appCertPublicKey_2021001161683774.crt');

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
          body: {
            auth_token: '20120823ac6ffaa4d2d84e7384bf983531473993',
          },
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert.match(err.message, /无效的访问令牌/);
        assert.equal(err.links!.length, 1);
        assert.equal(err.code, 'invalid-auth-token');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 401);
        return true;
      });
    });

    it('POST 文件上传，使用 AlipayFormData', async () => {
      // https://opendocs.alipay.com/open-v3/5aa91070_alipay.open.file.upload?scene=common&pathHash=c8e11ccc
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addField('foo', '{"bar":"bar value"}');
      form.addField('foo-array', '[{"bar":"bar value"}]');
      form.addFile('file_content', '图片.jpg', filePath);

      const uploadResult = await sdkStable.curl<{
        file_id: string;
      }>('POST', '/v3/alipay/open/file/upload', { form });
      // console.log(uploadResult);
      assert(uploadResult.data.file_id);
      assert.equal(uploadResult.responseHttpStatus, 200);
      assert(uploadResult.traceId);
    });

    it('POST 文件上传，使用 AlipayFormData with body', async () => {
      // https://opendocs.alipay.com/open-v3/5aa91070_alipay.open.file.upload?scene=common&pathHash=c8e11ccc
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addFile('file_content', '图片.jpg', filePath);

      const uploadResult = await sdkStable.curl<{
        file_id: string;
      }>('POST', '/v3/alipay/open/file/upload', {
        form,
        body: {
          biz_code: 'openpt_appstore',
        },
      });
      console.log(uploadResult);
      assert(uploadResult.data.file_id);
      assert.equal(uploadResult.responseHttpStatus, 200);
      assert(uploadResult.traceId);
    });

    it('POST 文件上传，使用 AlipayFormStream with body', async () => {
      // https://opendocs.alipay.com/open-v3/5aa91070_alipay.open.file.upload?scene=common&pathHash=c8e11ccc
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormStream();
      form.file('file_content', filePath, '图片.jpg');

      const uploadResult = await sdkStable.curl<{
        file_id: string;
      }>('POST', '/v3/alipay/open/file/upload', {
        form,
        body: {
          biz_code: 'openpt_appstore',
        },
      });
      // console.log(uploadResult);
      assert(uploadResult.data.file_id);
      assert.equal(uploadResult.responseHttpStatus, 200);
      assert(uploadResult.traceId);
    });

    it('GET 文件上传抛异常提示', async () => {
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addField('foo', '{"bar":"bar value"}');
      form.addField('foo-array', '[{"bar":"bar value"}]');
      form.addFile('file_content', '图片.jpg', filePath);

      await assert.rejects(async () => {
        await sdkStable.curl<{
          file_id: string;
        }>('GET', '/v3/alipay/open/file/upload', { form });
      }, /GET \/ HEAD 请求不允许提交 body 或 form 数据/);
    });

    it('form 不是正确类型', async () => {
      await assert.rejects(async () => {
        await sdkStable.curl<{
          file_id: string;
        }>('POST', '/v3/alipay/open/file/upload', { form: {} as any });
      }, /options\.form 必须是 AlipayFormData 或者 AlipayFormStream 类型/);
    });

    it('mock urllib request error', async () => {
      mm.error(urllib, 'request');
      const filePath = getFixturesFile('demo.jpg');
      const form = new AlipayFormData();
      form.addField('biz_code', 'openpt_appstore');
      form.addField('foo', '{"bar":"bar value"}');
      form.addField('foo-array', '[{"bar":"bar value"}]');
      form.addFile('file_content', '图片.jpg', filePath);
      await assert.rejects(async () => {
        await sdkStable.curl<{
          file_id: string;
        }>('POST', '/v3/alipay/open/file/upload', { form });
      }, /HttpClient Request error, mm mock error/);
    });

    it.skip('POST /v3/alipay/open/app/qrcode/create', async () => {
      // https://opendocs.alipay.com/open-v3/76c2627e_alipay.open.app.qrcode.create?scene=common&pathHash=b9d6d275
      const result = await sdkStable.curl<{
        file_id: string;
      }>('POST', '/v3/alipay/open/app/qrcode/create', {
        body: {
          url_param: 'page/component/component-pages/view/view',
          query_param: 'x=1',
          describe: '二维码描述',
        },
      });
      console.log(result);
    });

    it('POST /v3/alipay/user/deloauth/detail/query', async () => {
      // https://opendocs.alipay.com/open-v3/668cd27c_alipay.user.deloauth.detail.query?pathHash=3ab93168
      const result = await sdkStable.curl('POST', '/v3/alipay/user/deloauth/detail/query', {
        body: {
          date: '20230102',
          offset: 20,
          limit: 1,
        },
      });
      console.log(result);
      assert.equal(result.responseHttpStatus, 200);
    });

    it.skip('POST /v3/alipay/trade/pay', async () => {
      // https://opendocs.alipay.com/open-v3/08c7f9f8_alipay.trade.pay?scene=32&pathHash=8bf49b74
      const result = await sdkStable.curl('POST', '/v3/alipay/trade/pay', {
        body: {
          time_expire: '2021-12-31 10:05:00',
          extend_params: {
            sys_service_provider_id: '2088511833207846',
            tc_installment_order_id: '2015042321001004720200028594',
            industry_reflux_info: '{\\"scene_code\\":\\"metro_tradeorder\\",\\"channel\\":\\"xxxx\\",\\"scene_data\\":{\\"asset_name\\":\\"ALIPAY\\"}}',
            specified_seller_name: 'XXX的跨境小铺',
            royalty_freeze: 'true',
            card_type: 'S0JP0000',
            trade_component_order_id: '2023060801502300000008810000005657',
          },
          query_options: [
            'fund_bill_list',
            'voucher_detail_list',
            'discount_goods_detail',
          ],
          settle_info: {
            settle_period_time: '7d',
            settle_detail_infos: [
              {
                amount: '0.1',
                trans_in: 'A0001',
                settle_entity_type: 'SecondMerchant',
                summary_dimension: 'A0001',
                actual_amount: '0.1',
                settle_entity_id: '2088xxxxx;ST_0001',
                trans_in_type: 'cardAliasNo',
              },
            ],
          },
          subject: 'Iphone6 16G',
          is_async_pay: false,
          operator_id: 'yx_001',
          product_code: 'FACE_TO_FACE_PAYMENT',
          buyer_id: '2088202954065786',
          body: 'Iphone6 16G',
          buyer_open_id: '074a1CcTG1LelxKe4xQC0zgNdId0nxi95b5lsNpazWYoCo5',
          auth_no: '2016110310002001760201905725',
          scene: 'bar_code',
          sub_merchant: {
            merchant_id: '2088000603999128',
            merchant_type: 'alipay',
          },
          auth_confirm_mode: 'COMPLETE',
          timeout_express: '90m',
          bkagent_req_info: {
            merch_code: '123412341234',
            acq_code: '12345678901234',
            device_type: '02',
            location: '+37.28/-121.268',
            serial_num: '123123123123',
          },
          seller_id: '2088102146225135',
          terminal_id: 'NJ_T_001',
          store_id: 'NJ_001',
          pay_params: {
            async_type: 'NORMAL_ASYNC',
            retry_type: 'NONE',
          },
          agreement_params: {
            deduct_permission: '2021571176714791277815457854545',
            agreement_no: '20170322450983769228',
            apply_token: 'MDEDUCT0068292ca377d1d44b65fa24ec9cd89132f',
            auth_confirm_no: '423979',
          },
          goods_detail: [
            {
              out_sku_id: 'outSku_01',
              goods_name: 'ipad',
              quantity: 1,
              price: '2000',
              out_item_id: 'outItem_01',
              goods_id: 'apple-01',
              goods_category: '34543238',
              categories_tree: '124868003|126232002|126252004',
              show_url: 'http://www.alipay.com/xxx.jpg',
            },
          ],
          auth_code: '28763443825664394',
          discountable_amount: '80.00',
          out_trade_no: '20150320010101001',
          advance_payment_type: 'ENJOY_PAY_V2',
          total_amount: '88.88',
          request_org_pid: '2088201916734621',
          undiscountable_amount: '8.88',
          promo_params: {
            actual_order_time: '2018-09-25 22:47:33',
          },
        },
      });
      console.log(result);
      assert.equal(result.responseHttpStatus, 200);
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
          query: {
            scopes: 'auth_user,auth_zhima',
            open_id: '074a1CcTG1LelxKe4xQC0zgNdId0nxi95b5lsNpazWYoCo5',
          },
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert.match(err.message, /appid和openid不匹配 \(traceId: \w+\)/);
        assert.equal(err.code, 'app-openid-not-match');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 400);
        return true;
      });
      // https://opendocs.alipay.com/open-v3/d6c4d425_alipay.data.dataservice.bill.downloadurl.query?scene=common&pathHash=cc65bfb0
      const tradeResult = await sdkStable.curl<{
        bill_download_url: string;
      }>('GET', '/v3/alipay/data/dataservice/bill/downloadurl/query', {
        query: {
          bill_type: 'trade',
          bill_date: '2016-04-05',
        },
      });
      assert.equal(tradeResult.responseHttpStatus, 200);
      assert(tradeResult.traceId);
      assert(tradeResult.data.bill_download_url);
      // https://github.com/alipay/alipay-sdk-java-all/blob/9c2d7099579a42c454b0e00e3755a640758d0ae4/v3/docs/AlipayMarketingActivityApi.md
      await assert.rejects(async () => {
        await sdkStable.curl('GET', '/v3/alipay/marketing/activity/2016042700826004508401111111', {
          query: {
            merchantId: '2088202967380463',
            merchantAccessMode: 'AGENCY_MODE',
          },
        });
      }, err => {
        assert(err instanceof AlipayRequestError);
        assert(err.message);
        assert(err.code);
        // assert.match(err.message, /参数有误活动不存在/);
        // assert.equal(err.code, 'INVALID_PARAMETER');
        assert(err.traceId);
        assert.equal(err.responseHttpStatus, 400);
        return true;
      });
    });
  });

  describe('sse(), curlStream()', () => {
    if (!process.env.TEST_ALIPAY_APP_ID) {
      return;
    }
    // 测试密钥维护找@苏千，https://u.alipay.cn/_25tzRNHiQZU
    const sdk = new AlipaySdk({
      appId: process.env.TEST_ALIPAY_APP_ID,
      privateKey: process.env.TEST_ALIPAY_APP_PRIVATE_KEY!,
      signType: 'RSA2',
      alipayPublicKey: process.env.TEST_ALIPAY_PUBLIC_KEY,
      timeout: 10000,
    });

    it('SSE 请求成功', async () => {
      // https://qingai.alipay.com
      const agentId = process.env.TEST_QINGAI_AGENT_ID;
      if (!agentId) {
        return;
      }
      // https://openapi.alipay.com/v3/stream/alipay/cloud/nextbuilder/agent/chat/generate
      const url = '/v3/stream/alipay/cloud/nextbuilder/agent/chat/generate';
      const iterator = sdk.sse('POST', url, {
        body: {
          agent_id: agentId,
          outer_user_id: agentId,
          query: '你是谁',
          request_id: randomUUID(),
        },
      });
      let count = 0;
      for await (const item of iterator) {
        console.log(item);
        assert(item.event);
        assert(item.data);
        assert.equal(typeof item.data, 'string');
        count++;
      }
      assert(count >= 2);

      // const iterator2 = sdk.sse('POST', url, {
      //   body: {
      //     agent_id: agentId,
      //     outer_user_id: agentId,
      //     query: 'hello world',
      //     request_id: randomUUID(),
      //   },
      // });
      // count = 0;
      // for await (const item of iterator2) {
      //   console.log(item);
      //   assert(item.event);
      //   assert(item.data);
      //   assert.equal(typeof item.data, 'string');
      //   count++;
      // }
      // assert(count >= 2);

      // 并发
      // await Promise.all([
      //   (async () => {
      //     const iterator = sdk.sse('POST', url, {
      //       body: {
      //         agent_id: agentId,
      //         outer_user_id: agentId,
      //         // query: '你能做什么，请详细描述',
      //         query: '你是谁',
      //         request_id: randomUUID(),
      //       },
      //     });
      //     let count = 0;
      //     for await (const item of iterator) {
      //       // console.log('#1', item);
      //       assert(item.event);
      //       assert(item.data);
      //       assert.equal(typeof item.data, 'string');
      //       count++;
      //     }
      //     assert(count >= 2);
      //   })(),
      //   (async () => {
      //     const iterator = sdk.sse('POST', url, {
      //       body: {
      //         agent_id: agentId,
      //         outer_user_id: agentId,
      //         // query: '你是谁，详细介绍',
      //         query: 'hello',
      //         request_id: randomUUID(),
      //       },
      //     });
      //     let count = 0;
      //     for await (const item of iterator) {
      //       // console.log('#2', item);
      //       assert(item.event);
      //       assert(item.data);
      //       assert.equal(typeof item.data, 'string');
      //       count++;
      //     }
      //     assert(count >= 2);
      //   })(),
      // ]);
    });

    it('curlStream 请求成功', async () => {
      const url = '/v3/stream/alipay/cloud/nextbuilder/agent/chat/generate';
      const { stream } = await sdk.curlStream('POST', url, {
        body: {
          session_id: randomUUID(),
          agent_id: '202405AP00045923',
          outer_user_id: '2088002032947123',
          query: '你好',
          request_id: randomUUID(),
        },
      });
      for await (const item of stream) {
        assert(Buffer.isBuffer(item));
        console.log('item %o', item.toString());
      }
    });

    it('curlStream response status >= 400', async () => {
      const url = '/v3/stream/alipay/cloud/nextbuilder/agent/chat/generateNotFound';
      await assert.rejects(async () => {
        await sdk.curlStream('POST', url, {
          body: {
            session_id: randomUUID(),
            agent_id: '202405AP00045923',
            outer_user_id: '2088002032947123',
            query: '你好',
            request_id: randomUUID(),
          },
        });
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.code, 'invalid-method');
        assert.equal(err.responseHttpStatus, 400);
        assert.match(err.message, /不存在的方法名 \(traceId: \w+\)/);
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

  describe('pageExec()', () => {
    let sdk: AlipaySdk;
    before(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
      });
    });

    it('post return form html', async () => {
      const html = sdk.pageExec('alipay.trade.page.pay', {
        method: 'POST',
        bizContent: {
          out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
          product_code: 'FAST_INSTANT_TRADE_PAY',
          subject: 'abc',
          body: '234',
          // timeout_express: "90m",
          total_amount: '0.01',
        },
        returnUrl: 'https://www.taobao.com',
      });
      assert(html.trim().startsWith('<form action="https://openapi-sandbox.dl.alipaydev.com/gateway.do?method=alipay.trade.page.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp='));
      assert(html.includes('<input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;:&quot;ALIPfdf1211sdfsd12gfddsgs3&quot;,&quot;product_code&quot;:&quot;FAST_INSTANT_TRADE_PAY&quot;,&quot;subject&quot;:&quot;abc&quot;,&quot;body&quot;:&quot;234&quot;,&quot;total_amount&quot;:&quot;0.01&quot;}" />'),
        'should includes biz_content');
      assert(html.includes(`<input type="hidden" name="alipay_sdk" value="${sdk.version}" />`),
        'should includes sdk version');
      assert(html.includes('<script>document.forms["alipaySDKSubmit'));
    });

    it('get return http url', async () => {
      const result = sdk.pageExec('alipay.trade.page.pay', {
        method: 'GET',
        bizContent: {
          out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
          product_code: 'FAST_INSTANT_TRADE_PAY',
          subject: 'abc',
          body: '234',
          // timeout_express: "90m",
          total_amount: '0.01',
        },
        returnUrl: 'https://www.taobao.com',
      });
      assert(result.startsWith('https://openapi-sandbox.dl.alipaydev.com/gateway.do?method=alipay.trade.page.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp='));
      const url = decodeURIComponent(result);
      assert(url.includes('&biz_content={"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}'));
      assert(url.includes(`&alipay_sdk=${sdk.version}&`));
    });
  });

  describe('sdkExec()', () => {
    let sdk: AlipaySdk;
    before(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
      });
    });

    it('should work', async () => {
      const result = sdk.sdkExec('alipay.trade.app.pay', {
        bizContent: {
          out_trade_no: 'ALIPfdf1211sdfsd12gfddsgs3',
          product_code: 'FAST_INSTANT_TRADE_PAY',
          subject: 'abc',
          body: '234',
          // timeout_express: "90m",
          total_amount: '0.01',
        },
        returnUrl: 'https://www.taobao.com',
      });

      assert(result.startsWith('method=alipay.trade.app.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp='));
      const urlDecodedStr = decodeURIComponent(result);
      assert(urlDecodedStr.startsWith('method=alipay.trade.app.pay&app_id=2021000122671080&charset=utf-8&version=1.0&sign_type=RSA2&timestamp='));
      assert(urlDecodedStr.includes('&return_url=https://www.taobao.com&biz_content={"out_trade_no":"ALIPfdf1211sdfsd12gfddsgs3","product_code":"FAST_INSTANT_TRADE_PAY","subject":"abc","body":"234","total_amount":"0.01"}&sign='));
    });
  });

  describe('getSignStr()', () => {
    let sdk: AlipaySdk;
    before(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        signType: 'RSA2',
        alipayPublicKey,
        camelcase: true,
      });
    });

    it('normal', () => {
      const originStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},"sign":"P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}';

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');
      assert.equal(signStr, '{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });

    it('include \\r\\n\\s', () => {
      const originStr = `{"alipay_offline_material_image_upload_response"
        :
        {"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},

          "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');
      assert.equal(signStr, '{"code":"10000","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });

    it('include sign key in data', () => {
      const originStr = `{"alipay_offline_material_image_upload_response"
        :
        {"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"},

          "sign"  :  "P8xrBWqZCUv11UrEBjhQ4Sk3hyj4607qehO2VbKIS0hWa4U+NeLlOftqTyhGv+x1lzfqN590Y/8CaNIzEEg06FiNWJlUFM/uEFJLzSKGse4MjHbblpiSzI3eCV5RzxH26wZbEd9wyVYYi0pHFBf35UrBva47g7b5EuKCHfoVA95/zin9fAyb3xhhiHhmfGaWIDV/1LmE2vtqtOHQnISbY/deC71U614ySZ3YB97ws8npCcCJ+tgZvhHPkMRGvmyYPCRDB/aIN/sKDSLtfPp0u8DxE8pHLvCHm3wR84MQxqNbKgpd8NTKNvH+obELsbCrqPhjW7qI48634qx6enDupw=="}`;

      const signStr = sdk.getSignStr(originStr, 'alipay_offline_material_image_upload_response');
      assert.equal(signStr, '{"code":"10000","sign":"xxx","msg":"Success","image_id":"Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=Zp1Nm6FDTZaEuSSniGd5awAAACMAAQED&zoom=original"}');
    });
  });

  describe('checkResponseSign', () => {
    let sdk: AlipaySdk;
    beforeEach(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        alipayPublicKey,
        camelcase: true,
      });
    });

    it('should ignore check when alipayPublicKey is null', () => {
      mm(sdk.config, 'alipayPublicKey', null);
      const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\/\/oalipay-dl-django.alicdn.com\/rest\/1.0\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';

      sdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response', '', '');
    });

    it('should ignore check when alipayPublicKey is empty string', () => {
      mm(sdk.config, 'alipayPublicKey', '');
      const signStr = '{"alipay_offline_material_image_upload_response":{"code":"10000","msg":"Success","image_id":"1ni-WScMQcWsJRE2AYCo9AAAACMAAQED","image_url":"http:\\/\\/oalipay-dl-django.alicdn.com\\/rest\\/1.0\\/image?fileIds=1ni-WScMQcWsJRE2AYCo9AAAACMAAQED&zoom=original"},"sign":"K7s88WHQO91LPY+QGbdRtr3rXQWUxDEKvPrVsLfy+r9R4CSK1qbvHkrJ9DXwzm0pdTQPP8xbLl6rSsOiq33f32ZOhX/XzMbOfiC3OLnHHVaH7+rneNopUj1sZQDvz+dUoIMYSQHFLEECKADiJ66S8i5gXD1Hne7aj0b/1LYGPhtxbJdkT8OTDjxd/X/HmVy5xjZShOnM3WcwxUVNyqdOE2BEZbS8Q8P4W20PP/EhZ31N4mOIsCuUNiikhU0tnwjH2pHcv/fh7wzqkEhn1gIHc13o9O7xi4w1hHdQV811bn+n8d+98o+ETClebBQieqA+irBQaXvYTmZi3H+8RJiGwA=="}';
      sdk.checkResponseSign(signStr, 'alipay_offline_material_image_upload_response', '', '');
    });

    it('should error when responseDataRaw is empty', () => {
      assert.throws(() => {
        sdk.checkResponseSign('', 'alipay_offline_material_image_upload_response', '', '');
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, '验签失败，服务端返回值为空无法进行验签');
        return true;
      });
    });

    it('should throw error when sign not match', () => {
      // 从实测中获取，公钥修改后需要变更
      const responseDataRaw = '{"alipay_open_file_upload_response":{"code":"10000","msg":"Success","file_id":"CAxAToWB1JsAAAAAAAAAAAAADgSLAQBr"},"sign":"F+LDzpTNiavn7xVZPGuPCSSVRSmWzJGgtuji6tVELGEaqMaNj0jRKXUEr5nloZJBBmwEnddOyCjjepMmrTKTvoOqQ0Efxpr/R1iEeHTHVbb/Q8TTh6Up5gHJDkILdaWS2q1cWeQ6VT+HQY9P3WRXS7uhILHuDODIhpAyCu5KhWGt0rMCIG+Im6NODJP2oohtSCtmTFXg58HH587Z2y2bdbjzOxLvzD9IrU1imghXQ2S/Q+wMIvRk9on6cWnBLkrNvJKapA2ReNGWOwyuASvB9zDVzhMPbR+3mfRGkVDxsq5HYLjBKGskJMXHw0HuugZij6ScRuaLPODhmHwr/pJ9yw=="}';
      const serverSign = 'wrong-sing';
      assert.throws(() => {
        sdk.checkResponseSign(responseDataRaw, 'alipay_open_file_upload_response', serverSign, '');
      }, (err: any) => {
        assert.equal(err.name, 'AlipayRequestError');
        assert.equal(err.message, '验签失败，服务端返回的 sign: \'wrong-sing\' 无效, validateStr: \'{"code":"10000","msg":"Success","file_id":"CAxAToWB1JsAAAAAAAAAAAAADgSLAQBr"}\'');
        return true;
      });
    });

    it('should work', () => {
      // 从实测中获取，公钥修改后需要变更
      const responseDataRaw = '{"alipay_open_file_upload_response":{"code":"10000","msg":"Success","file_id":"CAxAToWB1JsAAAAAAAAAAAAADgSLAQBr"},"sign":"F+LDzpTNiavn7xVZPGuPCSSVRSmWzJGgtuji6tVELGEaqMaNj0jRKXUEr5nloZJBBmwEnddOyCjjepMmrTKTvoOqQ0Efxpr/R1iEeHTHVbb/Q8TTh6Up5gHJDkILdaWS2q1cWeQ6VT+HQY9P3WRXS7uhILHuDODIhpAyCu5KhWGt0rMCIG+Im6NODJP2oohtSCtmTFXg58HH587Z2y2bdbjzOxLvzD9IrU1imghXQ2S/Q+wMIvRk9on6cWnBLkrNvJKapA2ReNGWOwyuASvB9zDVzhMPbR+3mfRGkVDxsq5HYLjBKGskJMXHw0HuugZij6ScRuaLPODhmHwr/pJ9yw=="}';
      const serverSign = 'F+LDzpTNiavn7xVZPGuPCSSVRSmWzJGgtuji6tVELGEaqMaNj0jRKXUEr5nloZJBBmwEnddOyCjjepMmrTKTvoOqQ0Efxpr/R1iEeHTHVbb/Q8TTh6Up5gHJDkILdaWS2q1cWeQ6VT+HQY9P3WRXS7uhILHuDODIhpAyCu5KhWGt0rMCIG+Im6NODJP2oohtSCtmTFXg58HH587Z2y2bdbjzOxLvzD9IrU1imghXQ2S/Q+wMIvRk9on6cWnBLkrNvJKapA2ReNGWOwyuASvB9zDVzhMPbR+3mfRGkVDxsq5HYLjBKGskJMXHw0HuugZij6ScRuaLPODhmHwr/pJ9yw==';
      sdk.checkResponseSign(responseDataRaw, 'alipay_open_file_upload_response', serverSign, '');
    });
  });

  describe('checkNotifySign', () => {
    let sdk: AlipaySdk;
    beforeEach(() => {
      sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        alipayPublicKey: notifyAlipayPublicKeyV2,
        camelcase: true,
      });
    });

    it('should return false when alipayPublicKey is null', () => {
      const sdk = new AlipaySdk({
        gateway: GATE_WAY,
        appId: APP_ID,
        privateKey,
        camelcase: true,
      });
      assert.equal(sdk.checkNotifySign({}), false);
    });

    it('should return false when postData.sign is null', () => {
      assert.equal(sdk.checkNotifySign({}), false);
    });

    describe('verify sign should delete sign_type', () => {
      beforeEach(() => {
        const notifyAlipayPublicKeyV1 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqObrdC7hrgAVM98tK0nv3hSQRGGKT4lBsQjHiGjeYZjOPIPHR5knm2jnnz/YGIXIofVHkA/tAlBAd5DrY7YpvI4tP5EONLtZKC2ghBMx7McI2wRD0xiqzxOQr1FuhZGJ8/AUokBzJrzY+aGX2xcOrxFYRlFilvVLTXg4LWjR1tdPkO6+i7wQZAIVMClPkwVRZEbaERRHlKqTzv2gGv5rDU8gRoe1LeaN+6BlbTqHWkQcNCUNrA8C6l17XAXGKDsm/9TFWwO8EPHHHCaQdjtV5/FdcWIt+L8SR1ss7EXTjYDFtxcKVv9rEoY1lX8T4mX+GbXfZHraG5NCF1+XioL5JwIDAQAB';
        sdk = new AlipaySdk({
          gateway: GATE_WAY,
          appId: APP_ID,
          privateKey,
          alipayPublicKey: notifyAlipayPublicKeyV1,
          camelcase: true,
        });
      });

      it('with sign_type arguments verify success', () => {
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
          fund_bill_list: [{ amount: '0.10', fundChannel: 'ALIPAYACCOUNT' }],
          notify_type: 'trade_status_sync',
          trade_status: 'TRADE_SUCCESS',
          receipt_amount: '0.10',
          buyer_pay_amount: '0.10',
          sign_type: 'RSA2',
          app_id: '2019073166072302',
          seller_id: '2088531891668739',
          gmt_payment: '2019-08-15 15:56:24',
          notify_time: '2019-08-15 15:56:25',
          version: '1.0',
          out_trade_no: '20190815155618536-564-57',
          total_amount: '0.10',
          trade_no: '2019081522001468450512505578',
          auth_app_id: '2019073166072302',
          buyer_logon_id: 'xud***@126.com',
          point_amount: '0.00',
        };

        assert.equal(sdk.checkNotifySign(postData), true);
      });

      it('without sign_type arguments verify success', () => {
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
          fund_bill_list: [{ amount: '0.10', fundChannel: 'ALIPAYACCOUNT' }],
          notify_type: 'trade_status_sync',
          trade_status: 'TRADE_SUCCESS',
          receipt_amount: '0.10',
          buyer_pay_amount: '0.10',
          app_id: '2019073166072302',
          seller_id: '2088531891668739',
          gmt_payment: '2019-08-15 15:56:24',
          notify_time: '2019-08-15 15:56:25',
          version: '1.0',
          out_trade_no: '20190815155618536-564-57',
          total_amount: '0.10',
          trade_no: '2019081522001468450512505578',
          auth_app_id: '2019073166072302',
          buyer_logon_id: 'xud***@126.com',
          point_amount: '0.00',
        };
        assert.equal(sdk.checkNotifySign(postData), true);
      });

      it('verify fail', () => {
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
          version: '1.0',
        };

        assert.equal(sdk.checkNotifySign(postData), false);
      });

      it('verify with decode', () => {
        assert.throws(() => {
          sdk.checkNotifySign({
            bizContent: '{"key":"value % has special charactar"}',
            sign: 'test',
          });
        }, (err: any) => {
          assert.equal(err.message, 'URI malformed');
          return true;
        });
      });

      it('verify without decode', () => {
        const result = sdk.checkNotifySign({
          bizContent: '{"key":"value % has special charactar"}',
          sign: 'test',
        }, true);
        assert.equal(result, false);
      });
    });

    describe('verify sign should not delete sign_type', () => {
      it('with sign_type arguments verify success', () => {
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

        assert.equal(sdk.checkNotifySign(postData), true);
      });

      it('without sign_type arguments verify success', () => {
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

        assert.equal(sdk.checkNotifySign(postData), true);
      });

      it('verify fail', () => {
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

        assert.equal(sdk.checkNotifySign(postData), false);
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
