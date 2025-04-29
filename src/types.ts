import { ProxyAgent } from 'urllib';

export type AlipaySdkSignType = 'RSA2' | 'RSA';

/**
 * @interface AlipaySdkConfig SDK 配置
 */
export interface AlipaySdkConfig {
  /** 应用ID */
  appId: string;
  /** 应用私钥字符串。RSA签名验签工具：https://docs.open.alipay.com/291/106097）*/
  privateKey: string;
  /** 签名种类，默认是 RSA2 */
  signType?: AlipaySdkSignType;
  /** 支付宝公钥（需要对返回值做验签时候必填） */
  alipayPublicKey?: string;
  /** 网关 */
  gateway?: string;
  /** V3 endpoint, default is https://openapi.alipay.com */
  endpoint?: string;
  /** 网关超时时间（单位毫秒，默认 5000） */
  timeout?: number;
  /** 是否把网关返回的下划线 key 转换为驼峰写法，默认 true */
  camelcase?: boolean;
  /** 编码（只支持 utf-8） */
  charset?: 'utf-8';
  /** api 版本 */
  version?: '1.0';
  /**
   * @deprecated 此参数无废弃，会被忽略
   */
  urllib?: unknown;
  /**
   * 指定 private key 类型, 默认：PKCS1
   * - PKCS8: PRIVATE KEY
   * - PKCS1: RSA PRIVATE KEY
   */
  keyType?: 'PKCS1' | 'PKCS8';
  /** 应用公钥证书文件路径 */
  appCertPath?: string;
  /** 应用公钥证书文件内容 */
  appCertContent?: string | Buffer;
  /** 应用公钥证书sn，不需要手动设置，会根据 appCertPath 自动计算出来 */
  appCertSn?: string;
  /** 支付宝根证书文件路径 */
  alipayRootCertPath?: string;
  /** 支付宝根证书文件内容 */
  alipayRootCertContent?: string | Buffer;
  /** 支付宝根证书sn，不需要手动设置，会根据 alipayRootCertPath 自动计算出来 */
  alipayRootCertSn?: string;
  /** 支付宝公钥证书文件路径 */
  alipayPublicCertPath?: string;
  /** 支付宝公钥证书文件内容 */
  alipayPublicCertContent?: string | Buffer;
  /** 支付宝公钥证书sn，不需要手动设置，会根据 alipayPublicCertPath 自动计算出来 */
  alipayCertSn?: string;
  /** AES 密钥，调用 AES 加解密相关接口时需要 */
  encryptKey?: string;
  /** 服务器地址 */
  wsServiceUrl?: string;
  /** httpClient 请求代理 */
  proxyAgent?: ProxyAgent;
  /** Authorization 扩展信息 */
  additionalAuthInfo?: string;
}
