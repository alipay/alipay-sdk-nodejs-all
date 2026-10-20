import { strict as assert } from 'node:assert';
import { createCipheriv, generateKeyPairSync, sign } from 'node:crypto';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'urllib';
import { AlipayRequestError, AlipaySdk } from '../src/index.js';

describe('test/alipay.response-sign.test.ts', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encryptKey = Buffer.alloc(16, 7);
  const responseKey = 'alipay_trade_query_response';
  const sdk = new AlipaySdk({
    appId: 'test-app',
    gateway: 'https://alipay.test/gateway.do',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    alipayPublicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyType: 'PKCS8',
    signType: 'RSA2',
    encryptKey: encryptKey.toString('base64'),
  });
  const mockAgent = new MockAgent();
  const globalAgent = getGlobalDispatcher();

  before(() => {
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  after(async () => {
    setGlobalDispatcher(globalAgent);
    await mockAgent.close();
  });

  function encrypt(content: string) {
    const cipher = createCipheriv('aes-128-cbc', encryptKey, Buffer.alloc(16));
    return JSON.stringify(Buffer.concat([ cipher.update(content), cipher.final() ]).toString('base64'));
  }

  function signedBody(content: string, key = responseKey, signFirst = false, extraField = '') {
    const signature = sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64');
    const fields = [ `"${key}" : ${content}`, `"sign" : "${signature}"` ];
    if (signFirst) fields.reverse();
    if (extraField) fields.push(extraField);
    return ` \n{ ${fields.join(',\n')} } \n`;
  }

  function mockResponse(body: string) {
    mockAgent.get('https://alipay.test').intercept({
      path: /\/gateway\.do/,
      method: 'POST',
    }).reply(200, body, { headers: { trace_id: 'test-response-trace' } });
  }

  async function query() {
    return await sdk.exec('alipay.trade.query', {
      bizContent: { out_trade_no: 'test-order' },
      needEncrypt: true,
    }, { validateSign: true });
  }

  const missingTrade = '{"code":"40004","sub_code":"ACQ.TRADE_NOT_EXIST"}';
  const cases = [
    { name: 'AES success response', content: encrypt('{"code":"10000"}'), code: '10000' },
    { name: 'AES business error', content: encrypt(missingTrade), code: '40004' },
    { name: 'short JSON response', content: '{"code":"10000"}', code: '10000' },
    {
      name: 'original JSON whitespace, numbers, escapes and nested fields',
      content: String.raw`{ "code": "10000", "amount": 5e1, "items": [{"sign":"nested", "text":"} \" \\ \/"}] }`,
      code: '10000',
    },
    { name: 'error_response fallback', key: 'error_response', content: missingTrade, code: '40004' },
    {
      name: 'null method response fallback',
      key: 'error_response', content: missingTrade, code: '40004',
      extraField: `"${responseKey}": null`,
    },
    {
      name: 'method response preferred over error_response',
      content: '{"code":"10000"}', code: '10000',
      extraField: `"error_response": ${missingTrade}`,
    },
    {
      name: 'metadata containing nested response and sign fields',
      content: encrypt('{"code":"10000"}'), code: '10000',
      extraField: `"metadata": {"${responseKey}": {}, "sign": "nested"}`,
    },
  ];

  for (const fixture of cases) {
    for (const signFirst of [ false, true ]) {
      it(`should verify ${fixture.name} (sign first: ${signFirst})`, async () => {
        const body = signedBody(fixture.content, fixture.key, signFirst, fixture.extraField);
        assert.equal(sdk.getSignStr(body, responseKey), fixture.content);
        mockResponse(body);
        const result = await query();
        assert.equal(result.code, fixture.code);
        assert.equal(result.traceId, 'test-response-trace');
      });
    }
  }

  for (const encrypted of [ false, true ]) {
    it(`should reject a tampered response (encrypted: ${encrypted})`, async () => {
      const original = encrypted ? encrypt('{"code":"10000"}') : '{"code":"10000"}';
      const tampered = encrypted ? encrypt(missingTrade) : missingTrade;
      const body = signedBody(original).replace(original, tampered);
      mockResponse(body);
      await assert.rejects(query, (error: AlipayRequestError) => {
        assert.equal(error.name, 'AlipayRequestError');
        assert.equal(error.traceId, 'test-response-trace');
        assert.equal(error.responseDataRaw, body);
        return true;
      });
    });
  }

  it('should reject duplicate response fields and retain diagnostic context', async () => {
    const content = encrypt('{"code":"10000"}');
    const body = signedBody(content, responseKey, false, `"${responseKey}": ${content}`);
    mockResponse(body);
    await assert.rejects(query, (error: AlipayRequestError) => {
      assert.equal(error.code, 'response-sign-content-invalid');
      assert.equal(error.traceId, 'test-response-trace');
      assert.equal(error.responseDataRaw, body);
      assert.match((error.cause as Error).message, /Duplicate/);
      return true;
    });
  });
});
