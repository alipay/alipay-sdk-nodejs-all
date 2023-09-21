const assert = require('assert');
const fs = require('fs');

const APP_ID = '2021000122671080';
const GATE_WAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';
const privateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key.pem', 'ascii');
const alipayPublicKey = fs.readFileSync(__dirname + '/fixtures/alipay-public-key.pem', 'ascii');

describe('require', () => {
  it('should require work on normal cjs', () => {
    const AlipaySdk = require('..');
    const AlipaySdk2 = require('..').default;
    assert.strictEqual(AlipaySdk, AlipaySdk2);
    const sdk = new AlipaySdk({
      gateway: GATE_WAY,
      appId: APP_ID,
      privateKey,
      signType: 'RSA2',
      alipayPublicKey,
      camelcase: true,
      timeout: 10000,
      encryptKey: 'aYA0GP8JEW+D7/UFaskCWA=='
    });
    assert.equal(typeof sdk.exec, 'function');
  });

  it('should require work on normal cjs for AlipayFormData', () => {
    const AlipayForm = require('../lib/form');
    const AlipayForm2 = require('../lib/form').default;
    assert.strictEqual(AlipayForm, AlipayForm2);

    const form = new AlipayForm();

    assert.equal(typeof form.addFile, 'function');
  })
});
