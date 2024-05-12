import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { BigNumber } from 'bignumber.js';
import { Certificate } from '@fidm/x509';

/** 从公钥证书文件里读取支付宝公钥 */
export function loadPublicKeyFromPath(filePath: string): string {
  const fileData = fs.readFileSync(filePath);
  const certificate = Certificate.fromPEM(fileData);
  return certificate.publicKeyRaw.toString('base64');
}

/** 从公钥证书内容或 Buffer 读取支付宝公钥 */
export function loadPublicKey(content: string | Buffer): string {
  const pemContent = typeof content === 'string' ? Buffer.from(content) : content;
  const certificate = Certificate.fromPEM(pemContent);
  return certificate.publicKeyRaw.toString('base64');
}

/** 从证书文件里读取序列号 */
export function getSNFromPath(filePath: string, isRoot = false): string {
  const fileData = fs.readFileSync(filePath);
  return getSN(fileData, isRoot);
}

/** 从上传的证书内容或 Buffer 读取序列号 */
export function getSN(fileData: string | Buffer, isRoot = false): string {
  const pemData = typeof fileData === 'string' ? Buffer.from(fileData) : fileData;
  if (isRoot) {
    return getRootCertSN(pemData);
  }
  const certificate = Certificate.fromPEM(pemData);
  return getCertSN(certificate);
}

/** 读取序列号 */
function getCertSN(certificate: Certificate): string {
  const { issuer, serialNumber } = certificate;
  const principalName = issuer.attributes
    .reduceRight((prev, curr) => {
      const { shortName, value } = curr;
      const result = `${prev}${shortName}=${value},`;
      return result;
    }, '')
    .slice(0, -1);
  const decimalNumber = new BigNumber(serialNumber, 16).toString(10);
  const SN = createHash('md5')
    .update(principalName + decimalNumber, 'utf8')
    .digest('hex');
  return SN;
}

/** 读取根证书序列号 */
function getRootCertSN(rootContent: Buffer): string {
  const certificates = Certificate.fromPEMs(rootContent);
  let rootCertSN = '';
  certificates.forEach(item => {
    if (item.signatureOID.startsWith('1.2.840.113549.1.1')) {
      const SN = getCertSN(item);
      if (rootCertSN.length === 0) {
        rootCertSN += SN;
      } else {
        rootCertSN += `_${SN}`;
      }
    }
  });
  return rootCertSN;
}
