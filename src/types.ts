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
  /** api 版本 */
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
