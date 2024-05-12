import { strict as assert } from 'node:assert';
import urllib from 'urllib';
import { getSNFromPath, getSN, loadPublicKey, loadPublicKeyFromPath } from '../src/antcertutil.js';
import { getFixturesFile } from './helper.js';

const appCertPath = getFixturesFile('appCertPublicKey_2021001161683774.crt');
const alipayPublicCertPath = getFixturesFile('alipayCertPublicKey_RSA2.crt');
const rootCertPath = getFixturesFile('alipayRootCert.crt');
const alipayPublicCertUrl = 'https://openhome-crt.oss-cn-beijing.aliyuncs.com/alipayCertPublicKey_RSA2.crt';
const publicKeyVal = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhoVesfcGvUv1XvUndmX0rmSZ/2posJBCooySbSVFpV79RtHMzrVz2aKkC3WvOXeT5iNeQK4mK8gp3vNkWrHTkQGx5BcmkeO1WS384CQde7dAS0gmxeFs5bs+cCQqV2A2c2R9/5rJMtFtp1Ot/rIiMBUn6Ei0UoztM7AneavqQEzSwYlCKNhPFFtHCiz7u4O5R9CIyvUmYr+zpem2HXBN9ygPAZ0aXBQipGbc45+G07ZCNsmY4hV/Igya1aBf+Ye8p10Ew8uBBri0sIknhSC2LqKKy2IH1fO6q1d1jhN240QRHvbpRNv60kAfZsEulBASBrCMBi49NiJyr5nre7SNywIDAQAB';
const appCertSnVal = '866efef280dec9137a87d047ac446315';
const alipayPublicCertSnVal = '7513daaaa48aa3ba2e4018d84402479c';
const rootCertSnVal = '687b59193f3f462dd5336e5abf83c5d8_02941eef3187dddf3d3b83462e1dfcf6';

describe('test/antcertutil.test.ts', () => {
  it('loadPublicKeyFromPath', () => {
    const publicKey = loadPublicKeyFromPath(alipayPublicCertPath);
    assert.equal(publicKey, publicKeyVal);
  });

  it('loadPublicKey', async () => {
    const { data: contentBuffer } = await urllib.request<Buffer>(alipayPublicCertUrl);
    let publicKey = loadPublicKey(contentBuffer);
    assert.equal(publicKey, publicKeyVal);
    publicKey = loadPublicKey(contentBuffer.toString());
    assert.equal(publicKey, publicKeyVal);
  });

  it('getSNFromPath', () => {
    const appCertSn = getSNFromPath(appCertPath, false);
    assert.equal(appCertSn, appCertSnVal);
    const alipayPublicCertSn = getSNFromPath(alipayPublicCertPath, false);
    assert.equal(alipayPublicCertSn, alipayPublicCertSnVal);
    const rootCertSn = getSNFromPath(rootCertPath, true);
    assert.equal(rootCertSn, rootCertSnVal);
  });

  it('getSN', async () => {
    const { data: alipayPublicCertContent } = await urllib.request<Buffer>(alipayPublicCertUrl);
    let alipayPublicCertSn = getSN(alipayPublicCertContent, false);
    assert.equal(alipayPublicCertSn, alipayPublicCertSnVal);
    alipayPublicCertSn = getSN(alipayPublicCertContent.toString(), false);
    assert.equal(alipayPublicCertSn, alipayPublicCertSnVal);
  });
});
