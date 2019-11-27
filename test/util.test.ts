'use strict';
import 'should';
import * as fs from 'fs';
import { sign } from '../lib/util';

const privateKey = fs.readFileSync(__dirname + '/fixtures/app-private-key.pem', 'ascii');

describe('util', function() {
  it('sign', function() {
    const data = sign(
      'alipay.security.risk.content.analyze',
      { publicArgs: 1, bizContent: { a_b: 1, aBc: 'Ab' } },
      {
        appId: 'app111',
        charset: 'utf-8',
        version: '1.0',
        signType: 'RSA2',
        privateKey
      }
    );

    data.method.should.eql('alipay.security.risk.content.analyze');
    data.app_id.should.eql('app111');
    data.charset.should.eql('utf-8');
    data.version.should.eql('1.0');
    data.sign_type.should.eql('RSA2');
    data.public_args.should.eql(1);
    data.biz_content.should.eql('{"a_b":1,"a_bc":"Ab"}');
    data.sign.should.not.eql('');
  });
});
