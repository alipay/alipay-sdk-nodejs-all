/**
 * @author tudou527
 * @email [tudou527@gmail.com]
*/

import * as crypto from 'crypto';
import * as moment from 'moment';
import * as iconv from 'iconv-lite';
import * as snakeCaseKeys from 'snakecase-keys';
import * as CryptoJS from 'crypto-js';
import { omit, padEnd } from 'lodash';

import { AlipaySdkConfig } from './alipay';

const ALIPAY_ALGORITHM_MAPPING = {
  RSA: 'RSA-SHA1',
  RSA2: 'RSA-SHA256',
};

function parseKey(aesKey) {
  return {
    iv: CryptoJS.enc.Hex.parse(padEnd('', 32, '0')),
    key: CryptoJS.enc.Base64.parse(aesKey),
  };
}

// 先加密后加签
function aesEncrypt(data, aesKey) {
  const {
    iv,
    key,
  } = parseKey(aesKey);
  const cipherText = CryptoJS.AES.encrypt(JSON.stringify(data), key, {
    iv,
  }).toString();

  return cipherText;
}

// 解密
function aesDecrypt(data, aesKey) {
  const {
    iv,
    key,
  } = parseKey(aesKey);
  const bytes = CryptoJS.AES.decrypt(data, key, {
    iv,
  });
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

  return decryptedData;
}

/**
 * 签名
 * @description https://opendocs.alipay.com/common/02kf5q
 * @param {string} method 调用接口方法名，比如 alipay.ebpp.bill.add
 * @param {object} bizContent 业务请求参数
 * @param {object} publicArgs 公共请求参数
 * @param {object} config sdk 配置
 */
function sign(method: string, params: any = {}, config: AlipaySdkConfig): any {

  let signParams = Object.assign({
    method,
    appId: config.appId,
    charset: config.charset,
    version: config.version,
    signType: config.signType,
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
  }, omit(params, ['bizContent', 'needEncrypt']));
  if (config.appCertSn && config.alipayRootCertSn) {
    signParams = Object.assign({
      appCertSn: config.appCertSn,
      alipayRootCertSn: config.alipayRootCertSn,
    }, signParams);
  }

  if (config.wsServiceUrl) {
    signParams.wsServiceUrl = config.wsServiceUrl;
  }

  const bizContent = params.bizContent;

  if (bizContent) {
    // AES加密
    if (params.needEncrypt) {
      if (!config.encryptKey) {
        throw new Error('请设置encryptKey参数');
      }

      signParams.encryptType = 'AES';
      signParams.bizContent = aesEncrypt(
        snakeCaseKeys(bizContent),
        config.encryptKey,
      );
    } else {
      signParams.bizContent = JSON.stringify(snakeCaseKeys(bizContent));
    }
  }

  // params key 驼峰转下划线
  const decamelizeParams = snakeCaseKeys(signParams);

  // 排序
  const signStr = Object.keys(decamelizeParams).sort().map((key) => {
    let data = decamelizeParams[key];
    if (Array.prototype.toString.call(data) !== '[object String]') {
      data = JSON.stringify(data);
    }
    return `${key}=${iconv.encode(data, config.charset)}`;
  }).join('&');

  // 计算签名
  const sign = crypto.createSign(ALIPAY_ALGORITHM_MAPPING[config.signType])
                    .update(signStr, 'utf8').sign(config.privateKey, 'base64');

  return Object.assign(decamelizeParams, { sign });
}

export {
  sign,
  ALIPAY_ALGORITHM_MAPPING,
  aesDecrypt,
};
