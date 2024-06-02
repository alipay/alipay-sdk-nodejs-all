import { strict as assert } from 'node:assert';
import {
  AlipaySdk, AlipayFormData, AlipayRequestError,
  type AlipaySdkConfig,
  AlipayFormStream,
} from '../src/index.js';

describe('test/index.test.ts', () => {
  it('should export work', () => {
    assert(AlipaySdk);
    assert(AlipayFormData);
    assert(AlipayRequestError);
    assert(AlipayFormStream);
    assert(new AlipayFormStream() instanceof AlipayFormStream);
    const config: AlipaySdkConfig = {
      appId: 'mock-appId',
      privateKey: 'mock-privateKey',
    };
    assert(config);
  });
});
