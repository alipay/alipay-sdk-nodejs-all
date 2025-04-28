import { debuglog } from 'node:util';
import { createVerify, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import urllib, { Agent, IncomingHttpHeaders } from 'urllib';
import type {
  HttpClientResponse, HttpMethod, RequestOptions, RawResponseWithMeta,
  ProxyAgent,
} from 'urllib';
import camelcaseKeys from 'camelcase-keys';
import snakeCaseKeys from 'snakecase-keys';
import { Stream as SSEStream } from 'sse-decoder';
import { AlipayFormStream } from './AlipayFormStream.js';
import type { AlipaySdkConfig, AlipaySdkSignType } from './types.js';
import { AlipayFormData } from './form.js';
import {
  sign, ALIPAY_ALGORITHM_MAPPING, decamelize, createRequestId, readableToBytes,
  aesDecrypt, aesEncryptText,
  aesDecryptText,
  signatureV3, verifySignatureV3,
} from './util.js';
import { getSNFromPath, getSN, loadPublicKey, loadPublicKeyFromPath } from './antcertutil.js';

const debug = debuglog('alipay-sdk');
const http2Agent = new Agent({
  allowH2: true,
});

// {
//   link: 'https://open.alipay.com/api/errCheck?traceId=0603331617156962044358274991886',
//   desc: '解决方案'
// }
export interface AlipayRequestErrorSupportLink {
  link: string;
  desc: string;
}

export interface AlipayRequestErrorOptions extends ErrorOptions {
  /** 错误码 https://opendocs.alipay.com/open-v3/054fcv?pathHash=7bdeefa1 */
  code?: string;
  traceId?: string;
  responseHttpStatus?: number;
  responseDataRaw?: string;
  responseHttpHeaders?: IncomingHttpHeaders;
  links?: AlipayRequestErrorSupportLink[];
}

export class AlipayRequestError extends Error {
  code?: string;
  traceId?: string;
  responseHttpStatus?: number;
  responseDataRaw?: string;
  responseHttpHeaders?: IncomingHttpHeaders;
  links?: AlipayRequestErrorSupportLink[];

  constructor(message: string, options?: AlipayRequestErrorOptions) {
    if (options?.traceId) {
      message = `${message} (traceId: ${options.traceId})`;
    }
    super(message, options);
    this.code = options?.code;
    this.traceId = options?.traceId;
    this.responseHttpStatus = options?.responseHttpStatus;
    this.responseHttpHeaders = options?.responseHttpHeaders;
    this.responseDataRaw = options?.responseDataRaw;
    this.links = options?.links;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface AlipayCommonResult<T = any> {
  data: T;
  responseHttpStatus: number;
  traceId: string;
}

export interface AlipayCommonResultStream {
  stream: RawResponseWithMeta;
  responseHttpStatus: number;
  traceId: string;
}

export enum SSEField {
  EVENT = 'event',
  DATA = 'data',
  ID = 'id',
  RETRY = 'retry',
}

export interface AlipaySSEItem {
  event: string;
  data: string;
}

export interface AlipaySdkCommonResult {
  /**
   * 响应码。10000 表示成功，其余详见 https://opendocs.alipay.com/common/02km9f
   */
  code: string;
  /** 响应讯息。Success 表示成功。 */
  msg: string;
  /**
   * 明细错误码
   * @see https://opendocs.alipay.com/common/02km9f
   */
  sub_code?: string;
  /** 错误辅助信息 */
  sub_msg?: string;
  /** trace id */
  traceId?: string;
  /** 请求返回内容，详见各业务接口 */
  [key: string]: any;
}

export interface IRequestParams {
  [key: string]: any;
  /** 业务请求参数 */
  bizContent?: Record<string, any>;
  /** 自动 AES 加解密 */
  needEncrypt?: boolean;
}

export type IPageExecuteMethod = 'GET' | 'POST';

export interface IPageExecuteParams extends IRequestParams {
  method?: IPageExecuteMethod;
}

export interface ISdkExecuteOptions {
  /**
   * 对 bizContent 做驼峰参数转为小写 + 下划线参数，如 outOrderNo => out_order_no，默认 true，如果不需要自动转换，请设置为 false
   */
  bizContentAutoSnakeCase?: boolean;
}

export interface IRequestOption {
  validateSign?: boolean;
  log?: {
    info(...args: any[]): any;
    error(...args: any[]): any;
  };
  formData?: AlipayFormData;
  /**
   * 请求的唯一标识
   * @see https://opendocs.alipay.com/open-v3/054oog?pathHash=7834d743#%E8%AF%B7%E6%B1%82%E7%9A%84%E5%94%AF%E4%B8%80%E6%A0%87%E8%AF%86
   */
  traceId?: string;
}

export interface AlipayCURLOptions {
  /** 参数需在请求 URL 传参 */
  query?: Record<string, string | number>;
  /** 参数需在请求 JSON 传参 */
  body?: Record<string, any>;
  /** 表单方式提交数据 */
  form?: AlipayFormData | AlipayFormStream;
  /** 调用方的 requestId，用于定位一次请求，需要每次请求保持唯一 */
  requestId?: string;
  /**
   * 请求内容加密，目前只支持 AES
   * 注意：只支持 body 参数加密，如果同时设置 form 和 needEncrypt，会抛 TypeError 异常
   */
  needEncrypt?: boolean;
  /**
   * 应用授权令牌，代商家调用支付宝开放接口必填
   */
  appAuthToken?: string;
  /** 请求超时时间，默认使用 config.timeout */
  requestTimeout?: number;
  /** 支持覆盖默认的 agent  */
  agent?: ProxyAgent;
}

/**
 * Alipay OpenAPI SDK for Node.js
 */
export class AlipaySdk {
  public readonly version = 'alipay-sdk-nodejs-4.0.0';
  public config: Required<AlipaySdkConfig>;
  #proxyAgent?: ProxyAgent;

  /**
   * @class
   * @param {AlipaySdkConfig} config 初始化 SDK 配置
   */
  constructor(config: AlipaySdkConfig) {
    if (!config.appId) { throw Error('config.appId is required'); }
    if (!config.privateKey) { throw Error('config.privateKey is required'); }

    // FIXME: 都使用 PRIVATE KEY 其实就够了
    const privateKeyType = config.keyType === 'PKCS8' ? 'PRIVATE KEY' : 'RSA PRIVATE KEY';
    config.privateKey = this.formatKey(config.privateKey, privateKeyType);
    // 普通公钥模式和证书模式二选其一，传入了证书路径或内容认为是证书模式
    if (config.appCertPath || config.appCertContent) {
      // 证书模式，优先处理传入了证书内容的情况，其次处理传入证书文件路径的情况
      // 应用公钥证书序列号提取
      config.appCertSn = config.appCertContent ? getSN(config.appCertContent, false)
        : getSNFromPath(config.appCertPath!, false);
      // 支付宝公钥证书序列号提取
      config.alipayCertSn = config.alipayPublicCertContent ? getSN(config.alipayPublicCertContent, false)
        : getSNFromPath(config.alipayPublicCertPath!, false);
      // 支付宝根证书序列号提取
      config.alipayRootCertSn = config.alipayRootCertContent ? getSN(config.alipayRootCertContent, true)
        : getSNFromPath(config.alipayRootCertPath!, true);
      config.alipayPublicKey = config.alipayPublicCertContent ? loadPublicKey(config.alipayPublicCertContent)
        : loadPublicKeyFromPath(config.alipayPublicCertPath!);
      config.alipayPublicKey = this.formatKey(config.alipayPublicKey, 'PUBLIC KEY');
    } else if (config.alipayPublicKey) {
      // 普通公钥模式，传入了支付宝公钥
      config.alipayPublicKey = this.formatKey(config.alipayPublicKey, 'PUBLIC KEY');
    }
    this.#proxyAgent = config.proxyAgent;
    this.config = Object.assign({
      urllib,
      gateway: 'https://openapi.alipay.com/gateway.do',
      endpoint: 'https://openapi.alipay.com',
      timeout: 5000,
      camelcase: true,
      signType: 'RSA2',
      charset: 'utf-8',
      version: '1.0',
    }, camelcaseKeys(config, { deep: true })) as any;
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
  private formatUrl(url: string, params: Record<string, string>):
  { execParams: Record<string, string>, url: string } {
    const requestUrl = new URL(url);
    // 需要放在 url 中的参数列表
    const urlArgs = [
      'app_id', 'method', 'format', 'charset',
      'sign_type', 'sign', 'timestamp', 'version',
      'notify_url', 'return_url', 'auth_token', 'app_auth_token',
      'app_cert_sn', 'alipay_root_cert_sn',
      'ws_service_url',
    ];

    const execParams: Record<string, string> = {};
    for (const key in params) {
      const value = params[key];
      if (urlArgs.includes(key)) {
        // 放 URL 的参数
        requestUrl.searchParams.set(key, value);
      } else {
        // 放 Body 的参数
        execParams[key] = value;
      }
    }
    return { execParams, url: requestUrl.toString() };
  }

  /**
   * Alipay OpenAPI V3 with JSON Response
   * @see https://opendocs.alipay.com/open-v3/054kaq?pathHash=b3eb94e6
   */
  public async curl<T = any>(httpMethod: HttpMethod, path: string, options?: AlipayCURLOptions):
  Promise<AlipayCommonResult<T>> {
    return await this.#curl<T>(httpMethod, path, options, 'json') as AlipayCommonResult<T>;
  }

  /**
   * Alipay OpenAPI V3 with Stream Response
   * @see https://opendocs.alipay.com/open-v3/054kaq?pathHash=b3eb94e6
   */
  public async curlStream<T = any>(httpMethod: HttpMethod, path: string, options?: AlipayCURLOptions): Promise<AlipayCommonResultStream> {
    return await this.#curl<T>(httpMethod, path, options, 'stream') as AlipayCommonResultStream;
  }

  /**
   * Alipay OpenAPI V3 with SSE Response
   * @see https://opendocs.alipay.com/open-v3/054kaq?pathHash=b3eb94e6
   */
  public async* sse(httpMethod: HttpMethod, path: string, options?: AlipayCURLOptions) {
    const { stream } = await this.curlStream(httpMethod, path, options);
    const parsedStream = SSEStream.fromReadableStream<string>(stream as any, undefined, {
      disableJSONParse: true,
    });
    let lastEventName = '';
    for await (const line of parsedStream) {
      debug('[%s][sse] line: %o', Date.now(), line.substring(0, 100));
      // SSE 格式 https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events/Using_server-sent_events#%E4%BA%8B%E4%BB%B6%E6%B5%81%E6%A0%BC%E5%BC%8F
      // event: start
      // data: { ... }
      //
      // event: error
      // data: {"payload":"{\\"errorCode\\":\\"Resource-Not-Found\\",\\"errorMsg\\":\\"应用不存在\\"}","type":"error"}'
      //
      // event: end
      // data: {"type":"end"}
      if (line.startsWith(':')) {
        // ignore comment
        continue;
      }
      const index = line.indexOf(': ');
      if (index === -1) continue;
      const field = line.substring(0, index) as SSEField;
      const value = line.substring(index + 2);

      if (field === SSEField.RETRY) {
        // ignore
        continue;
      }

      if (field === SSEField.EVENT) {
        if (lastEventName) {
          // 将上一次 event 触发
          yield { event: lastEventName, data: '' } satisfies AlipaySSEItem;
        }
        lastEventName = value;
        continue;
      }
      if (field === SSEField.DATA) {
        yield { event: lastEventName, data: value } satisfies AlipaySSEItem;
        // 清空 event
        lastEventName = '';
      }
    }
  }

  async #curl<T = any>(httpMethod: HttpMethod | Lowercase<HttpMethod>, path: string, options?: AlipayCURLOptions,
      dataType: 'json' | 'stream' = 'json'): Promise<AlipayCommonResult<T> | AlipayCommonResultStream> {
    httpMethod = httpMethod.toUpperCase() as HttpMethod;
    let url = `${this.config.endpoint}${path}`;
    let httpRequestUrl = path;
    let httpRequestBody = '';
    const requestOptions: RequestOptions = {
      method: httpMethod,
      dataType: dataType === 'stream' ? 'stream' : 'text',
      timeout: options?.requestTimeout ?? this.config.timeout,
      dispatcher: this.#proxyAgent,
    };
    // 默认需要对响应做验签，确保响应是由支付宝返回的
    let validateResponseSignature = true;
    if (dataType === 'stream') {
      // 使用 HTTP/2 请求才支持流式响应
      requestOptions.dispatcher = http2Agent;
      // 流式响应不需要对响应做验签
      validateResponseSignature = false;
    }
    if (validateResponseSignature && !this.config.alipayPublicKey) {
      throw new TypeError('请确保支付宝公钥 config.alipayPublicKey 已经配置，需要使用它对响应进行验签');
    }

    // 覆盖默认配置
    if (options?.agent) {
      requestOptions.dispatcher = options.agent;
    }

    const requestId = options?.requestId ?? createRequestId();
    requestOptions.headers = {
      'user-agent': this.version,
      'alipay-request-id': requestId,
      accept: 'application/json',
    };
    if (options?.query) {
      const urlObject = new URL(url);
      for (const key in options.query) {
        urlObject.searchParams.set(key, String(options.query[key]));
      }
      url = urlObject.toString();
      httpRequestUrl = `${urlObject.pathname}${urlObject.search}`;
    }
    if (httpMethod === 'GET' || httpMethod === 'HEAD') {
      if (options?.body || options?.form) {
        throw new TypeError('GET / HEAD 请求不允许提交 body 或 form 数据');
      }
    } else {
      if (options?.form) {
        if (options.needEncrypt) {
          throw new TypeError('提交 form 数据不支持内容加密');
        }
        // 文件上传，走 multipart/form-data
        let form: AlipayFormStream;
        if (options.form instanceof AlipayFormData) {
          form = new AlipayFormStream();
          const dataFieldValue = {} as Record<string, string | object>;
          for (const item of options.form.fields) {
            dataFieldValue[item.name] = item.value;
          }
          if (options.body) {
            // body 有数据也合并到 dataFieldValue 中
            Object.assign(dataFieldValue, options.body);
          }
          httpRequestBody = JSON.stringify(dataFieldValue);
          form.field('data', httpRequestBody, 'application/json');
          // 文件上传 https://opendocs.alipay.com/open-v3/054oog#%E6%96%87%E4%BB%B6%E4%B8%8A%E4%BC%A0
          for (const item of options.form.files) {
            if (item.path) {
              form.file(item.fieldName, item.path, item.name);
            } else if (item.content) {
              form.buffer(item.fieldName, item.content, item.name);
            } else if (item.stream) {
              form.stream(item.fieldName, item.stream, item.name);
            }
          }
        } else if (options.form instanceof AlipayFormStream) {
          form = options.form;
          if (options.body) {
            // body 有数据设置到 dataFieldValue 中
            httpRequestBody = JSON.stringify(options.body);
            form.field('data', httpRequestBody, 'application/json');
          }
        } else {
          throw new TypeError('options.form 必须是 AlipayFormData 或者 AlipayFormStream 类型');
        }
        requestOptions.content = new Readable().wrap(form as any);
        Object.assign(requestOptions.headers, form.headers());
      } else {
        // 普通请求
        let contentType = 'application/json';
        httpRequestBody = options?.body ? JSON.stringify(options.body) : '';
        if (options?.needEncrypt) {
          if (!this.config.encryptKey) {
            throw new TypeError('请配置 config.encryptKey 才能通过 needEncrypt = true 进行请求内容加密调用');
          }
          // 加密请求
          contentType = 'text/plain';
          // 目前只支持 AES
          requestOptions.headers['alipay-encryption-algm'] = 'AES';
          requestOptions.headers['alipay-encrypt-type'] = 'AES';
          httpRequestBody = aesEncryptText(httpRequestBody, this.config.encryptKey);
        }
        requestOptions.headers['content-type'] = contentType;
        requestOptions.content = httpRequestBody;
      }
    }
    if (this.config.alipayRootCertSn) {
      requestOptions.headers['alipay-root-cert-sn'] = this.config.alipayRootCertSn;
    }
    // 签名规则 https://opendocs.alipay.com/open-v3/054q58?pathHash=474929ac#%E6%99%AE%E9%80%9A%E8%AF%B7%E6%B1%82
    // authString 拼接格式：
    //
    // ```txt
    // app_id=${app_id},app_cert_sn=${app_cert_sn},nonce=${nonce},timestamp=${timestamp}
    // ```
    let authString = `app_id=${this.config.appId}`;
    if (this.config.appCertSn) {
      authString += `,app_cert_sn=${this.config.appCertSn}`;
    }
    authString += `,nonce=${randomUUID()},timestamp=${Date.now()}`;
    if (this.config.additionalAuthInfo) {
      authString += `,${this.config.additionalAuthInfo}`;
    }

    // 签名字符串拼接格式：
    //
    // ```txt
    // ${authString}\n
    // ${httpMethod}\n
    // ${httpRequestUrl}\n
    // ${httpRequestBody}\n
    // ${appAuthToken}\n
    // ```
    let signString = `${authString}\n${httpMethod}\n${httpRequestUrl}\n${httpRequestBody}\n`;
    if (options?.appAuthToken) {
      requestOptions.headers['alipay-app-auth-token'] = options.appAuthToken;
      signString += `${options.appAuthToken}\n`;
    }
    const signature = signatureV3(signString, this.config.privateKey);
    const authorization = `ALIPAY-SHA256withRSA ${authString},sign=${signature}`;
    debug('signString: \n--------\n%s\n--------\nauthorization: %o', signString, authorization);
    requestOptions.headers.authorization = authorization;
    debug('curl %s %s, with body: %s, headers: %j, dataType: %s',
      httpMethod, url, httpRequestBody, requestOptions.headers, dataType);
    let httpResponse: HttpClientResponse<any>;
    try {
      httpResponse = await urllib.request(url, requestOptions);
    } catch (err: any) {
      debug('HttpClient Request error: %s', err.message);
      debug(err);
      throw new AlipayRequestError(`HttpClient Request error, ${err.message}`, {
        cause: err,
        traceId: requestId,
      });
    }
    const traceId = httpResponse.headers['alipay-trace-id'] as string ?? requestId;
    debug('curl response status: %s, headers: %j, raw text body: %s, traceId: %s',
      httpResponse.status, httpResponse.headers, httpResponse.data, traceId);
    // 错误码封装 https://opendocs.alipay.com/open-v3/054fcv?pathHash=7bdeefa1
    if (httpResponse.status >= 400) {
      let errorData: {
        code: string;
        message: string;
        links: AlipayRequestErrorSupportLink[];
      };
      if (dataType === 'stream') {
        // 需要手动反序列化 JSON 数据
        const bytes = await readableToBytes(httpResponse.res);
        errorData = JSON.parse(bytes.toString());
        debug('stream to errorData: %j', errorData);
      } else {
        errorData = JSON.parse(httpResponse.data);
      }
      throw new AlipayRequestError(errorData.message, {
        code: errorData.code,
        links: errorData.links,
        responseHttpStatus: httpResponse.status,
        responseHttpHeaders: httpResponse.headers,
        traceId,
      });
    }
    if (dataType === 'stream') {
      // 流式响应 OpenAI 不会加密，不需要处理
      return {
        stream: httpResponse.res,
        responseHttpStatus: httpResponse.status,
        traceId,
      } satisfies AlipayCommonResultStream;
    }
    let httpResponseBody = httpResponse.data as string;

    // 对支付宝响应进行验签 https://opendocs.alipay.com/open-v3/054d0z?pathHash=dcad8d5c
    if (validateResponseSignature) {
      const headers = httpResponse.headers;
      const responseSignString = `${headers['alipay-timestamp']}\n${headers['alipay-nonce']}\n${httpResponseBody}\n`;
      const expectedSignature = headers['alipay-signature'] as string;
      const expectedAlipaySN = headers['alipay-sn'] as string;
      if (expectedAlipaySN && this.config.alipayCertSn && expectedAlipaySN !== this.config.alipayCertSn) {
        throw new AlipayRequestError(`支付宝公钥证书号不匹配，服务端返回的是：${expectedAlipaySN}，SDK 配置的是：${this.config.alipayCertSn}`, {
          code: 'response-alipay-sn-verify-error',
          responseDataRaw: httpResponse.data,
          responseHttpStatus: httpResponse.status,
          responseHttpHeaders: httpResponse.headers,
          traceId,
        });
      }
      debug('responseSignString: \n--------\n%s\n--------\nexpectedSignature: %o', responseSignString, expectedSignature);
      if (!verifySignatureV3(responseSignString, expectedSignature, this.config.alipayPublicKey)) {
        throw new AlipayRequestError(`支付宝响应验签失败，请确保支付宝公钥 config.alipayPublicKey 是最新有效版本，签名字符串为：${expectedSignature}，验证字符串为：${JSON.stringify(responseSignString)}`, {
          code: 'response-signature-verify-error',
          responseDataRaw: httpResponse.data,
          responseHttpStatus: httpResponse.status,
          responseHttpHeaders: httpResponse.headers,
          traceId,
        });
      }
    }

    if (options?.needEncrypt) {
      httpResponseBody = this.aesDecrypt(httpResponseBody);
      if (!httpResponseBody) {
        throw new AlipayRequestError('解密失败，请确认 config.encryptKey 设置正确', {
          code: 'decrypt-error',
          responseDataRaw: httpResponse.data,
          responseHttpStatus: httpResponse.status,
          responseHttpHeaders: httpResponse.headers,
          traceId,
        });
      }
    }
    return {
      data: JSON.parse(httpResponseBody),
      responseHttpStatus: httpResponse.status,
      traceId,
    } satisfies AlipayCommonResult<T>;
  }

  // 文件上传
  async #multipartExec(method: string, options: IRequestOption): Promise<AlipaySdkCommonResult> {
    const config = this.config;
    let signParams = {} as Record<string, string>;
    let formData = {} as Record<string, string>;
    options.formData!.getFields().forEach(field => {
      // formData 的字段类型应为 string。（兼容 null）
      const parsedFieldValue = typeof field.value === 'object' && field.value ?
        JSON.stringify(field.value) : field.value;
      // 字段加入签名参数（文件不需要签名）
      signParams[field.name] = parsedFieldValue;
      formData[field.name] = parsedFieldValue;
    });

    // 签名方法中使用的 key 是驼峰
    signParams = camelcaseKeys(signParams, { deep: true });
    formData = snakeCaseKeys(formData);

    const formStream = new AlipayFormStream();
    for (const k in formData) {
      formStream.field(k, formData[k]);
    }
    options.formData!.getFiles().forEach(file => {
      // 文件名需要转换驼峰为下划线
      const fileKey = decamelize(file.fieldName);
      // 单独处理文件类型
      if (file.path) {
        formStream.file(fileKey, file.path, file.name);
      } else if (file.stream) {
        formStream.stream(fileKey, file.stream, file.name);
      } else if (file.content) {
        formStream.buffer(fileKey, file.content, file.name);
      }
    });
    const requestOptions: RequestOptions = {
      method: 'POST',
      dataType: 'text',
      timeout: config.timeout,
      headers: {
        'user-agent': this.version,
        accept: 'application/json',
        ...formStream.headers(),
      },
      content: new Readable().wrap(formStream as any),
      dispatcher: this.#proxyAgent,
    };
    // 计算签名
    const signData = sign(method, signParams, config);
    // 格式化 url
    const { url } = this.formatUrl(config.gateway!, signData);

    options.log?.info('[AlipaySdk] start exec url: %s, method: %s, params: %j',
      url, method, signParams);
    let httpResponse: HttpClientResponse<string>;
    try {
      httpResponse = await urllib.request(url, requestOptions);
    } catch (err: any) {
      debug('HttpClient Request error: %s', err);
      throw new AlipayRequestError(`HttpClient Request error: ${err.message}`, {
        cause: err,
      });
    }
    return this.#formatExecHttpResponse(method, httpResponse, {
      validateSign: options.validateSign,
    });
  }

  /**
   * 生成请求字符串，用于客户端进行调用
   * @param {string} method 方法名
   * @param {IRequestParams} bizParams 请求参数
   * @param {object} bizParams.bizContent 业务请求参数
   * @return {string} 请求字符串
   */
  public sdkExecute(method: string, bizParams: IRequestParams, options?: ISdkExecuteOptions): string {
    if (options?.bizContentAutoSnakeCase !== false) {
      bizParams = camelcaseKeys(bizParams, { deep: true });
    }
    const data = sign(method, bizParams, this.config, {
      bizContentAutoSnakeCase: options?.bizContentAutoSnakeCase,
    });
    const sdkStr = Object.keys(data).map(key => {
      return `${key}=${encodeURIComponent(data[key])}`;
    }).join('&');
    return sdkStr;
  }

  /**
   * @alias sdkExecute
   */
  public sdkExec(method: string, bizParams: IRequestParams): string {
    return this.sdkExecute(method, bizParams);
  }

  /**
   * 生成网站接口请求链接或 POST 表单 Form HTML
   * @param {string} method 方法名
   * @param {IPageExecuteMethod} httpMethod 后续进行请求的方法。如为 GET，即返回 http 链接；如为 POST，则生成表单 Form HTML
   * @param {IPageExecuteParams} bizParams 请求参数
   * @param {object} bizParams.bizContent 业务请求参数
   * @return {string} GET 请求链接或 POST 表单 Form HTML
   */
  public pageExecute(method: string, bizParams: IPageExecuteParams): string;
  public pageExecute(method: string, httpMethod: IPageExecuteMethod, bizParams: IPageExecuteParams): string;
  public pageExecute(method: string, httpMethodOrParams: IPageExecuteMethod | IPageExecuteParams,
    bizParams?: IPageExecuteParams): string {
    const formData = new AlipayFormData();
    let httpMethod = '';
    if (typeof httpMethodOrParams === 'string') {
      httpMethod = httpMethodOrParams;
    } else if (typeof httpMethodOrParams === 'object') {
      bizParams = httpMethodOrParams;
    }
    if (!httpMethod && bizParams?.method) {
      httpMethod = bizParams.method;
    }
    for (const k in bizParams) {
      if (k === 'method') continue;
      formData.addField(k, bizParams[k]);
    }
    if (httpMethod) {
      formData.setMethod(httpMethod);
    }
    return this.#pageExec(method, { formData });
  }

  /**
   * @alias pageExecute
   */
  public pageExec(method: string, bizParams: IPageExecuteParams): string;
  public pageExec(method: string, httpMethod: IPageExecuteMethod, bizParams: IPageExecuteParams): string;
  public pageExec(method: string, httpMethodOrParams: IPageExecuteMethod | IPageExecuteParams,
    bizParams?: IPageExecuteParams): string {
    if (bizParams) {
      return this.pageExecute(method, httpMethodOrParams as IPageExecuteMethod, bizParams);
    }
    return this.pageExecute(method, httpMethodOrParams as IPageExecuteParams);
  }

  // page 类接口，兼容原来的 formData 格式
  #pageExec(method: string, option: IRequestOption = {}): string {
    let signParams = { alipaySdk: this.version } as Record<string, string>;
    const config = this.config;
    option.formData!.getFields().forEach(field => {
      signParams[field.name] = field.value as string;
    });

    // 签名方法中使用的 key 是驼峰
    signParams = camelcaseKeys(signParams, { deep: true });

    // 计算签名，并返回标准化的请求字段（含 bizContent stringify）
    const signData = sign(method, signParams, config);
    // 格式化 url
    const { url, execParams } = this.formatUrl(config.gateway, signData);

    option.log?.info('[AlipaySdk]start exec url: %s, method: %s, params: %s',
      url, method, JSON.stringify(signParams));

    if (option.formData!.getMethod() === 'get') {
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
  private notifyRSACheck(signArgs: { [key: string]: any }, signStr: string, signType: AlipaySdkSignType, raw?: boolean) {
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
    return this.rsaCheck(signContent, signStr, signType);
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
    validateStr = validateStr.substring(startIndex + responseKey.length + 1);

    /**
     * 删除最后一个 "sign" 及之后的字符串
     * 删除后变为
     *  :{"code":"10000"},
     * {} 之间就是待验签的字符串
     */
    validateStr = validateStr.substring(0, lastIndex);

    // 删除第一个 { 之前的任何字符
    validateStr = validateStr.replace(/^[^{]*{/g, '{');

    // 删除最后一个 } 之后的任何字符
    validateStr = validateStr.replace(/\}([^}]*)$/g, '}');
    return validateStr;
  }

  /**
   * 执行请求，调用支付宝服务端
   * @param {string} method 调用接口方法名，比如 alipay.ebpp.bill.add
   * @param {IRequestParams} params 请求参数
   * @param {object} params.bizContent 业务请求参数
   * @param {IRequestOption} options 选项
   * @param {Boolean} options.validateSign 是否验签
   * @param {Console} options.log 可选日志记录对象
   * @return {Promise<AlipaySdkCommonResult | string>} 请求执行结果
   */
  public async exec(
    method: string,
    params: IRequestParams = {},
    options: IRequestOption = {},
  ): Promise<AlipaySdkCommonResult> {
    if (options.formData) {
      if (options.formData.getFiles().length > 0) {
        return await this.#multipartExec(method, options);
      }

      /**
       * fromData 中不包含文件时，认为是 page 类接口（返回 form 表单）
       * 比如 PC 端支付接口 alipay.trade.page.pay
       */
      throw new TypeError('formData 参数不包含文件，你可能是希望获取 POST 表单 HTML，请调用 pageExec() 方法代替');
    }

    const config = this.config;
    // 计算签名
    const signParams = sign(method, params, config);
    const { url, execParams } = this.formatUrl(config.gateway, signParams);
    debug('start exec, url: %s, method: %s, params: %o',
      url, method, execParams);

    let httpResponse: HttpClientResponse<string>;
    try {
      httpResponse = await urllib.request(url, {
        method: 'POST',
        data: execParams,
        // 按 text 返回（为了验签）
        dataType: 'text',
        timeout: config.timeout,
        headers: {
          'user-agent': this.version,
          'alipay-request-id': options.traceId ?? createRequestId(),
          // 请求须设置 HTTP 头部： Content-Type: application/json, Accept: application/json
          // 加密请求和文件上传 API 除外。
          // 'content-type': 'application/json',
          accept: 'application/json',
        },
        dispatcher: this.#proxyAgent,
      });
    } catch (err: any) {
      debug('HttpClient Request error: %s', err);
      throw new AlipayRequestError(`HttpClient Request error: ${err.message}`, {
        cause: err,
      });
    }

    return this.#formatExecHttpResponse(method, httpResponse, {
      needEncrypt: params.needEncrypt,
      validateSign: options.validateSign,
    });
  }

  #formatExecHttpResponse(method: string, httpResponse: HttpClientResponse<string>, options: {
    needEncrypt?: boolean;
    validateSign?: boolean;
  }) {
    debug('http response status: %s, headers: %j, raw text: %o',
      httpResponse.status, httpResponse.headers, httpResponse.data);
    const traceId = httpResponse.headers.trace_id as string;

    if (httpResponse.status !== 200) {
      throw new AlipayRequestError(`HTTP 请求错误, status: ${httpResponse.status}`, {
        traceId,
        responseDataRaw: httpResponse.data,
      });
    }

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
     * {
     *   "alipay_security_risk_content_analyze_response": {
     *     "code":"40002",
     *     "msg":"Invalid Arguments",
     *     "sub_code":"isv.invalid-signature",
     *     "sub_msg":"验签出错，建议检查签名字符串或签名私钥与应用公钥是否匹配，网关生成的验签字符串为：app_id=2021000122671080&amp;charset=utf-8&amp;method=alipay.security.risk.content.analyze&amp;sign_type=RSA2&amp;timestamp=2024-05-13 17:49:20&amp;version=1.0"
     *   },
     *   "sign":"GJpcj4/ylSq1tK1G2AWOKJwC/RudLpjANiT2LMYRRY7Aveb0xj2N4Hi1hoIctB+8vusl9qdfFGZZUpReMsnbz19twzvPEYXE6EPZmd00hymmVTch5SFceEU/sb6WY0Fae/EDr51lR5XurUWsxeOHMz/MiiiJsQT0c8lZlpxOEZ9gA6urN4mSfxMKksryCVb9seZhqmBMAGoLg+MMlrUQqstichteg2qdwFMq5pPFzoTmgDcmMsBspjsLR8Wy/b65Z/wNrsXc0OiWSVfP4d0O/J0lD4RrzdJ2zuV6PVWvGrPx/76DajnFYvzWNDeogfFWNA2b4LWByIFCQ0E3yEdOZQ=="
     * }
     */
    let alipayResponse: Record<string, any>;
    try {
      alipayResponse = JSON.parse(httpResponse.data);
    } catch (err) {
      throw new AlipayRequestError('Response 格式错误', {
        traceId,
        responseDataRaw: httpResponse.data,
        cause: err,
      });
    }

    const responseKey = `${method.replaceAll('.', '_')}_response`;
    let data = alipayResponse[responseKey] ?? alipayResponse.error_response;
    if (data) {
      if (options?.needEncrypt) {
        if (typeof data === 'string') {
          data = aesDecrypt(data, this.config.encryptKey);
        } else {
          // 服务端解密错误，"sub_msg":"解密出错, 未知错误"
          // ignore
        }
      }

      // 按字符串验签
      if (options?.validateSign) {
        const serverSign = alipayResponse.sign;
        this.checkResponseSign(httpResponse.data, responseKey, serverSign, traceId);
      }
      const result: AlipaySdkCommonResult = this.config.camelcase ? camelcaseKeys(data, { deep: true }) : data;
      if (result && traceId) {
        result.traceId = traceId;
      }
      return result;
    }

    throw new AlipayRequestError(`Response 格式错误，返回值 ${responseKey} 找不到`, {
      traceId,
      responseDataRaw: httpResponse.data,
    });
  }

  // 结果验签
  checkResponseSign(responseDataRaw: string, responseKey: string, serverSign: string, traceId: string) {
    if (!this.config.alipayPublicKey) {
      console.warn('[alipay-sdk] config.alipayPublicKey is empty, skip validateSign');
      // 支付宝公钥不存在时不做验签
      return;
    }

    // 带验签的参数不存在时返回失败
    if (!responseDataRaw) {
      throw new AlipayRequestError('验签失败，服务端返回值为空无法进行验签', {
        traceId,
        responseDataRaw,
      });
    }

    // 根据服务端返回的结果截取需要验签的目标字符串
    const validateStr = this.getSignStr(responseDataRaw, responseKey);
    // 参数存在，并且是正常的结果（不包含 sub_code）时才验签
    const verifier = createVerify(ALIPAY_ALGORITHM_MAPPING[this.config.signType]);
    verifier.update(validateStr, 'utf8');
    const success = verifier.verify(this.config.alipayPublicKey, serverSign, 'base64');
    if (!success) {
      throw new AlipayRequestError(`验签失败，服务端返回的 sign: '${serverSign}' 无效, validateStr: '${validateStr}'`, {
        traceId,
        responseDataRaw,
      });
    }
  }

  /**
   * 通知验签，不对 value 进行 decode
   * @param {JSON} postData 服务端的消息内容
   * @return { Boolean } 验签是否成功
   */
  public checkNotifySignV2(postData: any) {
    // 修复常见问题 https://github.com/alipay/alipay-sdk-nodejs-all/issues/45
    // 由于要保持 checkNotifySign 方法兼容性，所以新增一个 checkNotifySignV2 代替
    return this.checkNotifySign(postData, true);
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

  /**
   * 对加密内容进行 AES 解密
   * @see https://opendocs.alipay.com/common/02mse3#AES%20%E8%A7%A3%E5%AF%86%E5%87%BD%E6%95%B0
   * @param encryptedText 加密内容字符串
   */
  aesDecrypt(encryptedText: string) {
    return aesDecryptText(encryptedText, this.config.encryptKey);
  }

  /**
   * 对指定内容进行验签
   *
   * 如对前端返回的报文进行验签 https://opendocs.alipay.com/common/02mse3#AES%20%E8%A7%A3%E5%AF%86%E5%87%BD%E6%95%B0
   */
  rsaCheck(signContent: string, sign: string, signType: AlipaySdkSignType = 'RSA2') {
    const verifier = createVerify(ALIPAY_ALGORITHM_MAPPING[signType]);
    return verifier.update(signContent, 'utf-8').verify(this.config.alipayPublicKey, sign, 'base64');
  }
}
