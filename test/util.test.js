'use strict';
require('should');

const fs = require('fs');
const { sign } = require('../lib/util');

const privateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key.pem', 'ascii');

describe('util', function() {
  it('sign - bizContent and biz_content should be the same', function() {
    const data = sign('alipay.security.risk.content.analyze', { publicArgs: 1, bizContent: { a_b: 1, aBc: 'Ab' } }, {
      appId: 'app111',
      charset: 'utf-8',
      version: '1.0.0',
      signType: 'RSA2',
      privateKey,
    });

    data.method.should.eql('alipay.security.risk.content.analyze');
    data.app_id.should.eql('app111');
    data.charset.should.eql('utf-8');
    data.version.should.eql('1.0.0');
    data.sign_type.should.eql('RSA2');
    data.public_args.should.eql(1);
    data.biz_content.should.eql('{"a_b":1,"a_bc":"Ab"}');
    (data.sign !== '').should.eql(true);

    const data2 = sign('alipay.security.risk.content.analyze', { publicArgs: 1, biz_content: { a_b: 1, aBc: 'Ab' } }, {
      appId: 'app111',
      charset: 'utf-8',
      version: '1.0.0',
      signType: 'RSA2',
      privateKey,
    });

    data2.biz_content.should.eql('{"a_b":1,"a_bc":"Ab"}');
    data.sign.should.eql(data2.sign);
  });

});
