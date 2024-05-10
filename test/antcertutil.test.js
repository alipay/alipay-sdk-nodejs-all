'use strict';
require('should');

const https = require('https');
const path = require('path');
const { getSNFromPath, getSN, loadPublicKey, loadPublicKeyFromPath } = require('../lib/antcertutil');

const appCertPath = path.join(__dirname, '/fixtures/appCertPublicKey_2021001161683774.crt');
const alipayPublicCertPath = path.join(__dirname, '/fixtures/alipayCertPublicKey_RSA2.crt');
const rootCertPath = path.join(__dirname, '/fixtures/alipayRootCert.crt');

// const appCertUrl = 'https://openhome-crt.oss-cn-beijing.aliyuncs.com/appCertPublicKey_2021001161683774.crt';
const alipayPublicCertUrl = 'https://openhome-crt.oss-cn-beijing.aliyuncs.com/alipayCertPublicKey_RSA2.crt';
// const alipayRootCertUrl = 'https://openhome-crt.oss-cn-beijing.aliyuncs.com/alipayRootCert.crt';

const publicKeyVal = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhoVesfcGvUv1XvUndmX0rmSZ/2posJBCooySbSVFpV79RtHMzrVz2aKkC3WvOXeT5iNeQK4mK8gp3vNkWrHTkQGx5BcmkeO1WS384CQde7dAS0gmxeFs5bs+cCQqV2A2c2R9/5rJMtFtp1Ot/rIiMBUn6Ei0UoztM7AneavqQEzSwYlCKNhPFFtHCiz7u4O5R9CIyvUmYr+zpem2HXBN9ygPAZ0aXBQipGbc45+G07ZCNsmY4hV/Igya1aBf+Ye8p10Ew8uBBri0sIknhSC2LqKKy2IH1fO6q1d1jhN240QRHvbpRNv60kAfZsEulBASBrCMBi49NiJyr5nre7SNywIDAQAB';
const appCertSnVal = '866efef280dec9137a87d047ac446315';
const alipayPublicCertSnVal = '7513daaaa48aa3ba2e4018d84402479c';
const rootCertSnVal = '687b59193f3f462dd5336e5abf83c5d8_02941eef3187dddf3d3b83462e1dfcf6';

describe('antcertutil', function() {
  it('loadPublicKeyFromPath', function() {
    const publicKey = loadPublicKeyFromPath(alipayPublicCertPath);
    (publicKey !== '').should.eql(true);
    (publicKey == publicKeyVal).should.eql(true);
  });
});

describe('antcertutil', function() {
  it('loadPublicKey', async function() {
    function getRequest(url) {
      return new Promise(resolved => {
        https.get(url, res => {
          const { statusCode } = res;
          let rawData = '';
          res.on('data', chunk => { rawData += chunk; });
          res.on('end', () => {
            try {
              resolved(rawData);
            } catch (e) {
              console.error(e.message);
            }
          });
        });
      });
    }
    const alipayPublicCertContent = await getRequest(alipayPublicCertUrl);
    const publicKey = loadPublicKey(alipayPublicCertContent);
    (publicKey !== '').should.eql(true);
    (publicKey == publicKeyVal).should.eql(true);
  });
});

describe('antcertutil', function() {
  it('getSNFromPath', function() {
    const appCertSn = getSNFromPath(appCertPath, false);
    (appCertSn !== '').should.eql(true);
    (appCertSn == appCertSnVal).should.eql(true);
    const alipayPublicCertSn = getSNFromPath(alipayPublicCertPath, false);
    (alipayPublicCertSn !== '').should.eql(true);
    (alipayPublicCertSn == alipayPublicCertSnVal).should.eql(true);
    const rootCertSn = getSNFromPath(rootCertPath, true);
    (rootCertSn !== '').should.eql(true);
    (rootCertSn == rootCertSnVal).should.eql(true);
  });
});

describe('antcertutil', function() {
  it('getSN', async function() {
    function getRequest(url) {
      return new Promise(resolved => {
        https.get(url, res => {
          const { statusCode } = res;
          let rawData = '';
          res.on('data', chunk => { rawData += chunk; });
          res.on('end', () => {
            try {
              resolved(rawData);
            } catch (e) {
              console.error(e.message);
            }
          });
        });
      });
    }

    // AccessDenied
    // const appCertContent = await getRequest(appCertUrl);
    // const appCertSn = getSN(appCertContent, false);
    // (appCertSn !== '').should.eql(true);
    // (appCertSn == appCertSnVal).should.eql(true);

    const alipayPublicCertContent = await getRequest(alipayPublicCertUrl);
    const alipayPublicCertSn = getSN(alipayPublicCertContent, false);
    (alipayPublicCertSn !== '').should.eql(true);
    (alipayPublicCertSn == alipayPublicCertSnVal).should.eql(true);

    // AccessDenied
    // const rootCertContent = await getRequest(alipayRootCertUrl);
    // const rootCertSn = getSN(rootCertContent, true);
    // (rootCertSn !== '').should.eql(true);
    // (rootCertSn == rootCertSnVal).should.eql(true);
  });
});
