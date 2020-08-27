# Alipay SDK

蚂蚁金服开放平台 SDK

[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][codecov-image]][codecov-url]

[npm-image]: https://img.shields.io/npm/v/alipay-sdk.svg?style=flat-square
[npm-url]: https://npmjs.org/package/alipay-sdk
[travis-image]: https://img.shields.io/travis/alipay/alipay-sdk-nodejs.svg?style=flat-square
[travis-url]: https://travis-ci.org/alipay/alipay-sdk-nodejs
[codecov-image]: https://img.shields.io/codecov/c/github/alipay/alipay-sdk-nodejs.svg?style=flat-square
[codecov-url]: https://codecov.io/gh/alipay/alipay-sdk-nodejs



## 安装
> npm install alipay-sdk


## 使用
```
// TypeScript
import AlipaySdk from 'alipay-sdk';
// 普通公钥模式
const alipaySdk = new AlipaySdk({
  // 参考下方 SDK 配置
  appId: '2016123456789012',
  privateKey: fs.readFileSync('./private-key.pem', 'ascii'),
  //可设置AES密钥，调用AES加解密相关接口时需要（可选）
  encryptKey: '请填写您的AES密钥，例如：aa4BtZ4tspm2wnXLb1ThQA'
});

// 证书模式
const alipaySdk = new AlipaySdk({
  // 参考下方 SDK 配置
  appId: '2016123456789012',
  privateKey: fs.readFileSync('./private-key.pem', 'ascii'),
  alipayRootCertPath: path.join(__dirname,'../fixtures/alipayRootCert.crt'),
  appCertPath: path.join(__dirname,'../fixtures/appCertPublicKey.crt'),
  alipayPublicCertPath: path.join(__dirname,'../fixtures/alipayCertPublicKey_RSA2.crt'),
});

// 无需加密的接口
const result = await alipaySdk.exec('alipay.system.oauth.token', {
	grantType: 'authorization_code',
	code: 'code',
	refreshToken: 'token'
});

// 需要AES加解密的接口
await alipaySdk.exec('alipay.open.auth.app.aes.set', {
  bizContent: {
    merchantAppId: '2021001170662064'
  },
  // 自动AES加解密
  needEncrypt: true
});
```

## Demo：
- [SDK 配置](https://www.yuque.com/chenqiu/alipay-node-sdk/config-sdk)
- [包含业务参数](https://www.yuque.com/chenqiu/alipay-node-sdk/with_biz_content)
- [不包含业务参数](https://www.yuque.com/chenqiu/alipay-node-sdk/without_biz_content)
- [上传文件](https://www.yuque.com/chenqiu/alipay-node-sdk/file_upload)
- [页面类接口调用](https://www.yuque.com/chenqiu/alipay-node-sdk/page_api)
- [通知验签](https://www.yuque.com/chenqiu/alipay-node-sdk/msg_verify)
