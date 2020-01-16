/**
 * @author tudou527
 * @email [tudou527@gmail.com]
*/

import * as crypto from 'crypto';
import * as moment from 'moment';
import * as iconv from 'iconv-lite';
import * as snakeCaseKeys from 'snakecase-keys';

import { AlipaySdkConfig } from './alipay';

const ALIPAY_ALGORITHM_MAPPING = {
  RSA: 'RSA-SHA1',
  RSA2: 'RSA-SHA256',
};

/**
 * 签名
 * @param {string} method 调用接口方法名，比如 alipay.ebpp.bill.add
 * @param {object} bizContent 业务请求参数
 * @param {object} publicArgs 公共请求参数
 * @param {object} config sdk 配置
 */
function sign(method: string, params: any = {}, config: AlipaySdkConfig): any {
  const bizContent = params.bizContent || null;
  delete params.bizContent;

  const signParams = Object.assign({
    method,
    appId: config.appId,
    appCertSn: config.appCertSn,
    alipayRootCertSn: config.alipayRootCertSn,
    charset: config.charset,
    version: config.version,
    signType: config.signType,
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
  }, params);

  if (bizContent) {
    signParams.bizContent = JSON.stringify(snakeCaseKeys(bizContent));
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
};
