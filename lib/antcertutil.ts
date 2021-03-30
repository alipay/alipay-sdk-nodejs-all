/**
 * @author yisheng.cl
 * @email [yisheng.cl@alibaba-inc.com]
*/

import * as fs from 'fs';
import bignumber_js_1 from 'bignumber.js';
import * as crypto from 'crypto';
const x509_1 = require('@fidm/x509');
/** 从公钥证书文件里读取支付宝公钥 */
function loadPublicKeyFromPath(filePath: string): string {
  const fileData = fs.readFileSync(filePath);
  const certificate = x509_1.Certificate.fromPEM(fileData);
  return certificate.publicKeyRaw.toString('base64');
}
/** 从公钥证书内容或buffer读取支付宝公钥 */
function loadPublicKey(content: string|Buffer): string {
  if (typeof content == 'string') {
    content = Buffer.from(content);
  }
  const certificate = x509_1.Certificate.fromPEM(content);
  return certificate.publicKeyRaw.toString('base64');
}
/** 从证书文件里读取序列号 */
function getSNFromPath(filePath: string, isRoot: boolean= false): string {
  const fileData = fs.readFileSync(filePath);
  return getSN(fileData, isRoot);
}
/** 从上传的证书内容或Buffer读取序列号 */
function getSN(fileData: string|Buffer, isRoot: boolean= false): string {
  if (typeof fileData == 'string') {
    fileData = Buffer.from(fileData);
  }
  if (isRoot) {
    return getRootCertSN(fileData);
  }
  const certificate = x509_1.Certificate.fromPEM(fileData);
  return getCertSN(certificate);
}
/** 读取序列号 */
function getCertSN(certificate: any): string {
  const { issuer, serialNumber } = certificate;
  const principalName = issuer.attributes
    .reduceRight((prev, curr) => {
        const { shortName, value } = curr;
        const result = `${prev}${shortName}=${value},`;
        return result;
    }, '')
    .slice(0, -1);
  const decimalNumber = new bignumber_js_1(serialNumber, 16).toString(10);
  const SN = crypto
        .createHash('md5')
        .update(principalName + decimalNumber, 'utf8')
        .digest('hex');
  return SN;
}
/** 读取根证书序列号 */
function getRootCertSN(rootContent: Buffer): string {
  const certificates = x509_1.Certificate.fromPEMs(rootContent);
  let rootCertSN = '';
  certificates.forEach((item) => {
    if (item.signatureOID.startsWith('1.2.840.113549.1.1')) {
        const SN = getCertSN(item);
        if (rootCertSN.length === 0) {
            rootCertSN += SN;
          }
        else {
            rootCertSN += `_${SN}`;
          }
      }
  });
  return rootCertSN;
}

export {
    getSN,
    getSNFromPath,
    loadPublicKeyFromPath,
    loadPublicKey,
  };
