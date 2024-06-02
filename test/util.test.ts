import { strict as assert } from 'node:assert';
import { sign } from '../src/util.js';
import { readFixturesFile } from './helper.js';

const privateKey = readFixturesFile('app-private-key.pem');

describe('test/util.test.ts', () => {
  describe('sign()', () => {
    it('sign - bizContent and biz_content should be the same', () => {
      const data = sign('alipay.security.risk.content.analyze', {
        publicArgs: 1,
        bizContent: { a_b: 1, aBc: 'Ab' },
      }, {
        appId: 'app111',
        charset: 'utf-8',
        version: '1.0.0',
        signType: 'RSA2',
        privateKey,
      } as any);

      assert.equal(data.method, 'alipay.security.risk.content.analyze');
      assert.equal(data.app_id, 'app111');
      assert.equal(data.charset, 'utf-8');
      assert.equal(data.version, '1.0.0');
      assert.equal(data.sign_type, 'RSA2');
      assert.equal(data.public_args, 1);
      assert.equal(data.biz_content, '{"a_b":1,"a_bc":"Ab"}');
      assert(data.sign.length > 0);

      const data2 = sign('alipay.security.risk.content.analyze', {
        publicArgs: 1,
        biz_content: { a_b: 1, aBc: 'Ab' },
      }, {
        appId: 'app111',
        charset: 'utf-8',
        version: '1.0.0',
        signType: 'RSA2',
        privateKey: privateKey.toString(),
      } as any);
      assert.equal(data2.biz_content, '{"a_b":1,"a_bc":"Ab"}');
      assert.equal(data.sign, data2.sign);
    });
  });
});
