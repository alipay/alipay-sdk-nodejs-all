import { debuglog } from 'node:util';
import { createSign, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { YYYYMMDDHHmmss } from 'utility';
import snakeCaseKeys from 'snakecase-keys';
import CryptoJS from 'crypto-js';
import type { AlipaySdkConfig } from './types.js';

const debug = debuglog('alipay-sdk:util');

export const ALIPAY_ALGORITHM_MAPPING = {
  RSA: 'RSA-SHA1',
  RSA2: 'RSA-SHA256',
};

function parseKey(aesKey: string) {
  return {
    // padEnd('', 32, '0'): 00000000000000000000000000000000
    iv: CryptoJS.enc.Hex.parse('00000000000000000000000000000000'),
    key: CryptoJS.enc.Base64.parse(aesKey),
  };
}

// 先加密后加签
function aesEncrypt(data: any, aesKey: string) {
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
export function aesDecrypt(data: string, aesKey: string) {
  const { iv, key } = parseKey(aesKey);
  const bytes = CryptoJS.AES.decrypt(data, key, { iv });
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  return decryptedData;
}

/**
 * OpenAPI 2.0 签名
 * @description https://opendocs.alipay.com/common/02kf5q
 * @param {string} method 调用接口方法名，比如 alipay.ebpp.bill.add
 * @param {object} params 请求参数
 * @param {object} config sdk 配置
 */
export function sign(method: string, params: Record<string, any>, config: Required<AlipaySdkConfig>) {
  const signParams: Record<string, any> = {
    method,
    appId: config.appId,
    charset: config.charset,
    version: config.version,
    signType: config.signType,
    timestamp: YYYYMMDDHHmmss(),
  };
  for (const key in params) {
    if (key === 'bizContent' || key === 'biz_content' || key === 'needEncrypt') continue;
    signParams[key] = params[key];
  }
  if (config.appCertSn && config.alipayRootCertSn) {
    signParams.appCertSn = config.appCertSn;
    signParams.alipayRootCertSn = config.alipayRootCertSn;
  }
  if (config.wsServiceUrl) {
    signParams.wsServiceUrl = config.wsServiceUrl;
  }

  // 兼容官网的 biz_content;
  if (params.bizContent && params.biz_content) {
    throw new TypeError('不能同时设置 bizContent 和 biz_content');
  }
  const bizContent = params.bizContent ?? params.biz_content;

  if (bizContent) {
    // AES加密
    if (params.needEncrypt) {
      if (!config.encryptKey) {
        throw new TypeError('请设置 encryptKey 参数');
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
  const decamelizeParams: Record<string, any> = snakeCaseKeys(signParams);
  // 排序
  // ignore biz_content
  const signString = Object.keys(decamelizeParams).sort()
    .map(key => {
      let data = decamelizeParams[key];
      if (Array.prototype.toString.call(data) !== '[object String]') {
        data = JSON.stringify(data);
      }
      // return `${key}=${iconv.encode(data, config.charset!)}`;
      return `${key}=${data}`;
    })
    .join('&');

  // 计算签名
  const algorithm = ALIPAY_ALGORITHM_MAPPING[config.signType];
  decamelizeParams.sign = createSign(algorithm)
    .update(signString, 'utf8').sign(config.privateKey, 'base64');
  debug('algorithm: %s, signString: %o, sign: %o', algorithm, signString, sign);
  return decamelizeParams;
}

export function createRequestId() {
  return randomUUID().replaceAll('-', '');
}

export async function readableToBytes(stream: Readable | ReadableStream) {
  const chunks: Buffer[] = [];
  let chunk: Buffer;
  let totalLength = 0;
  for await (chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  return Buffer.concat(chunks, totalLength);
}

/* c8 ignore start */
// forked from https://github.com/sindresorhus/decamelize/blob/main/index.js
export function decamelize(text: string) {
  const separator = '_';
  const preserveConsecutiveUppercase = false;
  if (typeof text !== 'string') {
    throw new TypeError(
      'The `text` arguments should be of type `string`',
    );
  }

  // Checking the second character is done later on. Therefore process shorter strings here.
  if (text.length < 2) {
    return preserveConsecutiveUppercase ? text : text.toLowerCase();
  }

  const replacement = `$1${separator}$2`;
  // Split lowercase sequences followed by uppercase character.
  // `dataForUSACounties` → `data_For_USACounties`
  // `myURLstring → `my_URLstring`
  const decamelized = text.replace(
    /([\p{Lowercase_Letter}\d])(\p{Uppercase_Letter})/gu,
    replacement,
  );

  if (preserveConsecutiveUppercase) {
    return handlePreserveConsecutiveUppercase(decamelized, separator);
  }

  // Split multiple uppercase characters followed by one or more lowercase characters.
  // `my_URLstring` → `my_ur_lstring`
  return decamelized
    .replace(
      /(\p{Uppercase_Letter})(\p{Uppercase_Letter}\p{Lowercase_Letter}+)/gu,
      replacement,
    )
    .toLowerCase();
}

function handlePreserveConsecutiveUppercase(decamelized: string, separator: string) {
  // Lowercase all single uppercase characters. As we
  // want to preserve uppercase sequences, we cannot
  // simply lowercase the separated string at the end.
  // `data_For_USACounties` → `data_for_USACounties`
  decamelized = decamelized.replace(
    /((?<![\p{Uppercase_Letter}\d])[\p{Uppercase_Letter}\d](?![\p{Uppercase_Letter}\d]))/gu,
    $0 => $0.toLowerCase(),
  );

  // Remaining uppercase sequences will be separated from lowercase sequences.
  // `data_For_USACounties` → `data_for_USA_counties`
  return decamelized.replace(
    /(\p{Uppercase_Letter}+)(\p{Uppercase_Letter}\p{Lowercase_Letter}+)/gu,
    (_, $1, $2) => $1 + separator + $2.toLowerCase(),
  );
}
/* c8 ignore stop */
