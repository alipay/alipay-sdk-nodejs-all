/* eslint-disable prefer-promise-reject-errors */
/**
 * @author tudou527
 * @email [tudou527@gmail.com]
*/

import * as fs from 'fs';
import * as is from 'is';
import * as crypto from 'crypto';
import * as urllib from 'urllib';
import * as request from 'request';
import * as isuri from 'isuri';
import * as decamelize from 'decamelize';
import * as camelcaseKeys from 'camelcase-keys';
import * as snakeCaseKeys from 'snakecase-keys';

import AliPayForm from './form';
import { sign, ALIPAY_ALGORITHM_MAPPING, aesDecrypt } from './util';
import { getSNFromPath, getSN, loadPublicKey, loadPublicKeyFromPath } from './antcertutil';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

/**
 * @interface AlipaySdkConfig SDK 配置
 */
export interface AlipaySdkConfig {
  /** 应用ID */
  appId: string;
  /** 应用私钥字符串。RSA签名验签工具：https://docs.open.alipay.com/291/106097）*/
  privateKey: string;
  /** 签名种类 */
  signType?: 'RSA2' | 'RSA';
  /** 支付宝公钥（需要对返回值做验签时候必填） */
  alipayPublicKey?: string;
  /** 网关 */
  gateway?: string;
  /** 网关超时时间（单位毫秒，默认 5s） */
  timeout?: number;
  /** 是否把网关返回的下划线 key 转换为驼峰写法 */
  camelcase?: boolean;
  /** 编码（只支持 utf-8） */
  charset?: 'utf-8';
  /** api版本 */
  version?: '1.0';
  /** 指定 urllib 库 */
  urllib?: any;
  /** 指定private key类型, 默认： PKCS1, PKCS8: PRIVATE KEY, PKCS1: RSA PRIVATE KEY */
  keyType?: 'PKCS1' | 'PKCS8';
  /** 应用公钥证书文件路径 */
  appCertPath?: string;
  /** 应用公钥证书文件内容 */
  appCertContent?: string | Buffer;
  /** 应用公钥证书sn */
  appCertSn?: string;
  /** 支付宝根证书文件路径 */
  alipayRootCertPath?: string;
  /** 支付宝根证书文件内容 */
  alipayRootCertContent?: string | Buffer;
  /** 支付宝根证书sn */
  alipayRootCertSn?: string;
  /** 支付宝公钥证书文件路径 */
  alipayPublicCertPath?: string;
  /** 支付宝公钥证书文件内容 */
  alipayPublicCertContent?: string | Buffer;
  /** 支付宝公钥证书sn */
  alipayCertSn?: string;
  /** AES密钥，调用AES加解密相关接口时需要 */
  encryptKey?: string;
  /** 服务器地址 */
  wsServiceUrl?: string;
}

export interface AlipaySdkCommonResult {
  /** 响应码。10000 表示成功，其余详见 https://opendocs.alipay.com/common/02km9f */
  code: string;
  /** 响应讯息。Success 表示成功。 */
  msg: string;
  /** 错误代号 */
  sub_code?: string;
  /** 错误辅助信息 */
  sub_msg?: string;
  /** 请求返回内容，详见各业务接口 */
  [key: string]: any;
}

export interface IRequestParams {
  [key: string]: any;
  /** 业务请求参数 */
  bizContent?: Record<string, any>;
  /** 自动AES加解密 */
  needEncrypt?: boolean;
}

export interface IRequestOption {
  validateSign?: boolean;
  log?: {
    info(...args): any;
    error(...args): any;
  };
  formData?: AliPayForm;
}
/**
 * Alipay SDK for Node.JS
 */
class AlipaySdk {
  private sdkVersion: string;
  public config: AlipaySdkConfig;

  /**
   * @class
   * @param {AlipaySdkConfig} config 初始化 SDK 配置
   */
  constructor(config: AlipaySdkConfig) {
    if (!config.appId) { throw Error('config.appId is required'); }
    if (!config.privateKey) { throw Error('config.privateKey is required'); }

    const privateKeyType = config.keyType === 'PKCS8' ? 'PRIVATE KEY' : 'RSA PRIVATE KEY';
    config.privateKey = this.formatKey(config.privateKey, privateKeyType);
    // 普通公钥模式和证书模式二选其一，传入了证书路径或内容认为是证书模式
    if (config.appCertPath || config.appCertContent) {
      // 证书模式，优先处理传入了证书内容的情况，其次处理传入证书文件路径的情况
      // 应用公钥证书序列号提取
      config.appCertSn = is.empty(config.appCertContent) ? getSNFromPath(config.appCertPath, false)
        : getSN(config.appCertContent, false);
      // 支付宝公钥证书序列号提取
      config.alipayCertSn = is.empty(config.alipayPublicCertContent) ? getSNFromPath(config.alipayPublicCertPath, false)
        : getSN(config.alipayPublicCertContent, false);
      // 支付宝根证书序列号提取
      config.alipayRootCertSn = is.empty(config.alipayRootCertContent) ? getSNFromPath(config.alipayRootCertPath, true)
        : getSN(config.alipayRootCertContent, true);
      config.alipayPublicKey = is.empty(config.alipayPublicCertContent) ?
        loadPublicKeyFromPath(config.alipayPublicCertPath) : loadPublicKey(config.alipayPublicCertContent);
      config.alipayPublicKey = this.formatKey(config.alipayPublicKey, 'PUBLIC KEY');
    } else if (config.alipayPublicKey) {
      // 普通公钥模式，传入了支付宝公钥
      config.alipayPublicKey = this.formatKey(config.alipayPublicKey, 'PUBLIC KEY');
    }
    this.config = Object.assign({
      urllib,
      gateway: 'https://openapi.alipay.com/gateway.do',
      timeout: 5000,
      camelcase: true,
      signType: 'RSA2',
      charset: 'utf-8',
      version: '1.0',
    }, camelcaseKeys(config, { deep: true }));

    this.sdkVersion = `alipay-sdk-nodejs-${pkg.version}`;
  }

  // 格式化 key
  private formatKey(key: string, type: string): string {
    const item = key.split('\n').map(val => val.trim());

    // 删除包含 `RSA PRIVATE KEY / PUBLIC KEY` 等字样的第一行
    if (item[0].includes(type)) { item.shift(); }

    // 删除包含 `RSA PRIVATE KEY / PUBLIC KEY` 等字样的最后一行
    if (item[item.length - 1].includes(type)) {
      item.pop();
    }

    return `-----BEGIN ${type}-----\n${item.join('')}\n-----END ${type}-----`;
  }

  // 格式化请求 url（按规范把某些固定的参数放入 url）
  private formatUrl(url: string, params: { [key: string]: string }): { execParams: any, url: string } {
    let requestUrl = url;
    // 需要放在 url 中的参数列表
    const urlArgs = [
      'app_id', 'method', 'format', 'charset',
      'sign_type', 'sign', 'timestamp', 'version',
      'notify_url', 'return_url', 'auth_token', 'app_auth_token',
      'app_cert_sn', 'alipay_root_cert_sn',
      'ws_service_url',
    ];

    for (const key in params) {
      if (urlArgs.indexOf(key) > -1) {
        const val = encodeURIComponent(params[key]);
        requestUrl = `${requestUrl}${requestUrl.includes('?') ? '&' : '?'}${key}=${val}`;
        // 删除 postData 中对应的数据
        delete params[key];
      }
    }

    return { execParams: params, url: requestUrl };
  }

  // 文件上传
  private multipartExec(method: string, option: IRequestOption = {}): Promise<AlipaySdkCommonResult> {
    const config = this.config;
    let signParams = {} as { [key: string]: string | object };
    let formData = {} as { [key: string]: string | object | fs.ReadStream };
    const infoLog = (option.log && is.fn(option.log.info)) ? option.log.info : null;
    const errorLog = (option.log && is.fn(option.log.error)) ? option.log.error : null;

    option.formData.getFields().forEach(field => {
      // 字段加入签名参数（文件不需要签名）
      if (field.value) {
        // （兼容 pageExec）formData 的字段类型应为 string。
        const parsedFieldValue = typeof field.value === 'object' ? JSON.stringify(field.value) : field.value;
        signParams[field.name] = parsedFieldValue;
        formData[field.name] = parsedFieldValue;
      }
    });

    // 签名方法中使用的 key 是驼峰
    signParams = camelcaseKeys(signParams, { deep: true });

    formData = snakeCaseKeys(formData);

    option.formData.getFiles().forEach(file => {
      // 文件名需要转换驼峰为下划线
      const fileKey = decamelize(file.fieldName);
      // 单独处理文件类型
      formData[fileKey] = !isuri.isValid(file.path) ? fs.createReadStream(file.path) : request(file.path);
    });

    // 计算签名
    const signData = sign(method, signParams, config);
    // 格式化 url
    const { url } = this.formatUrl(config.gateway, signData);

    infoLog && infoLog('[AlipaySdk]start exec url: %s, method: %s, params: %s',
      url, method, JSON.stringify(signParams));

    return new Promise((resolve, reject) => {
      request.post({
        url,
        formData,
        json: false,
        timeout: config.timeout,
        headers: { 'user-agent': this.sdkVersion },
      }, (err, _response, body) => {
        if (err) {
          err.message = '[AlipaySdk]exec error';
          errorLog && errorLog(err);
          return reject(err);
        }

        infoLog && infoLog('[AlipaySdk]exec response: %s', body);

        try {
          const result = JSON.parse(body);
          const responseKey = `${method.replace(/\./g, '_')}_response`;
          const data = result[responseKey];

          // 开放平台返回错误时，`${responseKey}` 对应的值不存在
          if (data) {
            // 验签
            const validateSuccess = option.validateSign ? this.checkResponseSign(body, responseKey) : true;
            if (validateSuccess) {
              return resolve(config.camelcase ? camelcaseKeys(data, { deep: true }) : data);
            }
            return reject({ serverResult: body, errorMessage: '[AlipaySdk]验签失败' });
          }
        } catch (e) {
          return reject({ serverResult: body, errorMessage: '[AlipaySdk]Response 格式错误' });
        }

        return reject({ serverResult: body, errorMessage: '[AlipaySdk]HTTP 请求错误' });
      });
    });
  }

  /**
   * 生成请求字符串，用于客户端进行调用
   * @param {string} method 方法名
   * @param {IRequestParams} params 请求参数
   * @param {object} params.bizContent 业务请求参数
   * @return {string} 请求字符串
   */
  public sdkExec(method: string, params: IRequestParams) {
    const data = sign(method, camelcaseKeys(params, { deep: true }), this.config);
    const sdkStr = Object.keys(data).map(key => {
      return `${key}=${encodeURIComponent(data[key])}`;
    }).join('&');
    return sdkStr;
  }

  /**
   * 生成网站接口请求链接或表单
   * @param {string} method 方法名
   * @param {IRequestParams} params 请求参数
   * @param {object} params.bizContent 业务请求参数
   * @param {string} params.method 后续进行请求的方法。如为 GET，即返回 http 链接；如为 POST，则生成表单 html
   * @return {string} 请求链接或表单 HTML
   */
  public pageExec(method: string, params: IRequestParams & { method?: 'GET' | 'POST' }) {
    const formData = new AliPayForm();
    Object.entries(params).forEach(([ k, v ]) => {
      if (k === 'method') formData.setMethod(v?.toLowerCase());
      else formData.addField(k, v);
    });
    return this._pageExec(method, { formData });
  }

  // page 类接口，兼容原来的 formData 格式
  private _pageExec(method: string, option: IRequestOption = {}): string {
    let signParams = { alipaySdk: this.sdkVersion } as { [key: string]: string | object };
    const config = this.config;
    const infoLog = (option.log && is.fn(option.log.info)) ? option.log.info : null;

    option.formData.getFields().forEach(field => {
      signParams[field.name] = field.value;
    });

    // 签名方法中使用的 key 是驼峰
    signParams = camelcaseKeys(signParams, { deep: true });

    // 计算签名，并返回标准化的请求字段（含 bizContent stringify）
    const signData = sign(method, signParams, config);
    // 格式化 url
    const { url, execParams } = this.formatUrl(config.gateway, signData);

    infoLog && infoLog('[AlipaySdk]start exec url: %s, method: %s, params: %s',
      url, method, JSON.stringify(signParams));

    if (option.formData.getMethod() === 'get') {
      const query = Object.keys(execParams).map(key => {
        return `${key}=${encodeURIComponent(execParams[key])}`;
      });

      return `${url}&${query.join('&')}`;
    }

    const formName = `alipaySDKSubmit${Date.now()}`;
    return (`
      <form action="${url}" method="post" name="${formName}" id="${formName}">
        ${Object.keys(execParams).map(key => {
        const value = String(execParams[key]).replace(/\"/g, '&quot;');
        return `<input type="hidden" name="${key}" value="${value}" />`;
      }).join('')}
      </form>
      <script>document.forms["${formName}"].submit();</script>
    `);
  }

  // 消息验签
  private notifyRSACheck(signArgs: { [key: string]: any }, signStr: string, signType: 'RSA' | 'RSA2', raw?: boolean) {
    const signContent = Object.keys(signArgs).sort().filter(val => val)
      .map(key => {
        let value = signArgs[key];

        if (Array.prototype.toString.call(value) !== '[object String]') {
          value = JSON.stringify(value);
        }
        // 如果 value 中包含了诸如 % 字符，decodeURIComponent 会报错
        // 而且 notify 消息大部分都是 post 请求，无需进行 decodeURIComponent 操作
        if (raw) {
          return `${key}=${value}`;
        }
        return `${key}=${decodeURIComponent(value)}`;
      })
      .join('&');

    const verifier = crypto.createVerify(ALIPAY_ALGORITHM_MAPPING[signType]);

    return verifier.update(signContent, 'utf8').verify(this.config.alipayPublicKey, signStr, 'base64');
  }

  /**
   * @ignore
   * @param originStr 开放平台返回的原始字符串
   * @param responseKey xx_response 方法名 key
   */
  getSignStr(originStr: string, responseKey: string): string {
    // 待签名的字符串
    let validateStr = originStr.trim();
    // 找到 xxx_response 开始的位置
    const startIndex = originStr.indexOf(`${responseKey}"`);
    // 找到最后一个 “"sign"” 字符串的位置（避免）
    const lastIndex = originStr.lastIndexOf('"sign"');

    /**
     * 删除 xxx_response 及之前的字符串
     * 假设原始字符串为
     *  {"xxx_response":{"code":"10000"},"sign":"jumSvxTKwn24G5sAIN"}
     * 删除后变为
     *  :{"code":"10000"},"sign":"jumSvxTKwn24G5sAIN"}
     */
    validateStr = validateStr.substr(startIndex + responseKey.length + 1);

    /**
     * 删除最后一个 "sign" 及之后的字符串
     * 删除后变为
     *  :{"code":"10000"},
     * {} 之间就是待验签的字符串
     */
    validateStr = validateStr.substr(0, lastIndex);

    // 删除第一个 { 之前的任何字符
    validateStr = validateStr.replace(/^[^{]*{/g, '{');

    // 删除最后一个 } 之后的任何字符
    validateStr = validateStr.replace(/\}([^}]*)$/g, '}');

    return validateStr;
  }

  public exec<T = {}>(
    method: string,
    params?: IRequestParams,
    option?: Omit<IRequestOption, 'formData'>,
  ): Promise<AlipaySdkCommonResult & T>;
  public exec(
    method: string,
    params?: IRequestParams,
    option?: IRequestOption,
  ): Promise<AlipaySdkCommonResult | string>;
  /**
   * 执行请求，调用支付宝服务端
   * @param {string} method 调用接口方法名，比如 alipay.ebpp.bill.add
   * @param {IRequestParams} params 请求参数
   * @param {object} params.bizContent 业务请求参数
   * @param {IRequestOption} option 选项
   * @param {Boolean} option.validateSign 是否验签
   * @param {object} args.log 可选日志记录对象
   * @return {Promise<AlipaySdkCommonResult | string>} 请求执行结果
   */
  public async exec(
    method: string,
    params: IRequestParams = {},
    option: IRequestOption = {},
  ): Promise<AlipaySdkCommonResult | string> {
    if (option.formData) {
      if (option.formData.getFiles().length > 0) {
        return this.multipartExec(method, option);
      }

      /**
       * fromData 中不包含文件时，认为是 page 类接口（返回 form 表单）
       * 比如 PC 端支付接口 alipay.trade.page.pay
       */
      console.warn('[Warning] page interface through formdata is deprecated. Use sdk.pageExec instead');
      return this._pageExec(method, option);
    }

    const config = this.config;
    // 计算签名
    const signData = sign(method, params, config);
    const { url, execParams } = this.formatUrl(config.gateway, signData);
    const infoLog = (option.log && is.fn(option.log.info)) ? option.log.info : null;
    const errorLog = (option.log && is.fn(option.log.error)) ? option.log.error : null;

    infoLog && infoLog('[AlipaySdk]start exec, url: %s, method: %s, params: %s',
      url, method, JSON.stringify(execParams));

    return new Promise((resolve, reject) => {
      config.urllib.request(url, {
        method: 'POST',
        data: execParams,
        // 按 text 返回（为了验签）
        dataType: 'text',
        timeout: config.timeout,
        headers: { 'user-agent': this.sdkVersion },
      })
        .then((ret: { status: number, data: string }) => {
          infoLog && infoLog('[AlipaySdk]exec response: %s', ret);

          if (ret.status === 200) {
            /**
             * 示例响应格式
             * {"alipay_trade_precreate_response":
             *  {"code": "10000","msg": "Success","out_trade_no": "111111","qr_code": "https:\/\/"},
             *  "sign": "abcde="
             * }
             * 或者
             * {"error_response":
             *  {"code":"40002","msg":"Invalid Arguments","sub_code":"isv.code-invalid","sub_msg":"授权码code无效"},
             * }
             */
            let data;
            let responseKey;
            try {
              const result = JSON.parse(ret.data);
              responseKey = `${method.replace(/\./g, '_')}_response`;
              data = result[responseKey];
            } catch (e) {
              return reject({ serverResult: ret, errorMessage: '[AlipaySdk]Response 格式错误' });
            }

            if (data) {
              if (params.needEncrypt) {
                data = aesDecrypt(data, config.encryptKey);
              }

              // 按字符串验签
              const validateSuccess = option.validateSign ? this.checkResponseSign(ret.data, responseKey) : true;

              if (validateSuccess) {
                return resolve(config.camelcase ? camelcaseKeys(data, { deep: true }) : data);
              }
              return reject({ serverResult: ret, errorMessage: '[AlipaySdk]验签失败' });
            }

            return reject({ serverResult: ret, errorMessage: '[AlipaySdk]HTTP 请求错误' });
          }

          reject({ serverResult: ret, errorMessage: '[AlipaySdk]HTTP 请求错误' });
        })
        .catch(err => {
          err.message = '[AlipaySdk]exec error';
          errorLog && errorLog(err);
          reject(err);
        });
    });
  }

  // 结果验签
  checkResponseSign(signStr: string, responseKey: string): boolean {
    if (!this.config.alipayPublicKey || this.config.alipayPublicKey === '') {
      console.warn('config.alipayPublicKey is empty');
      // 支付宝公钥不存在时不做验签
      return true;
    }

    // 带验签的参数不存在时返回失败
    if (!signStr) { return false; }

    // 根据服务端返回的结果截取需要验签的目标字符串
    const validateStr = this.getSignStr(signStr, responseKey);
    // 服务端返回的签名
    const serverSign = JSON.parse(signStr).sign;

    // 参数存在，并且是正常的结果（不包含 sub_code）时才验签
    const verifier = crypto.createVerify(ALIPAY_ALGORITHM_MAPPING[this.config.signType]);
    verifier.update(validateStr, 'utf8');
    return verifier.verify(this.config.alipayPublicKey, serverSign, 'base64');
  }

  /**
   * 通知验签
   * @param {JSON} postData 服务端的消息内容
   * @param {Boolean} raw 是否使用 raw 内容而非 decode 内容验签
   * @return { Boolean } 验签是否成功
   */
  public checkNotifySign(postData: any, raw?: boolean): boolean {
    const signStr = postData.sign;

    // 未设置“支付宝公钥”或签名字符串不存，验签不通过
    if (!this.config.alipayPublicKey || !signStr) {
      return false;
    }

    // 先从签名字符串中取 sign_type，再取配置项、都不存在时默认为 RSA2（RSA 已不再推荐使用）
    const signType = postData.sign_type || this.config.signType || 'RSA2';
    const signArgs = { ...postData };
    // 除去 sign
    delete signArgs.sign;

    /**
     * 某些用户可能自己删除了 sign_type 后再验签
     * 为了保持兼容性临时把 sign_type 加回来
     * 因为下面的逻辑会验签 2 次所以不会存在验签不同过的情况
     */
    signArgs.sign_type = signType;

    // 保留 sign_type 验证一次签名
    const verifyResult = this.notifyRSACheck(signArgs, signStr, signType, raw);

    if (!verifyResult) {
      /**
       * 删除 sign_type 验一次
       * 因为“历史原因”需要用户自己判断是否需要保留 sign_type 验证签名
       * 这里是把其他 sdk 中的 rsaCheckV1、rsaCheckV2 做了合并
       */
      delete signArgs.sign_type;
      return this.notifyRSACheck(signArgs, signStr, signType, raw);
    }

    return true;
  }
}

export default AlipaySdk;
