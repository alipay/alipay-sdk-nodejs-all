# Alipay OpenAPI SDK

[![NPM version][npm-image]][npm-url]
[![CI](https://github.com/alipay/alipay-sdk-nodejs-all/actions/workflows/node.yml/badge.svg)](https://github.com/alipay/alipay-sdk-nodejs-all/actions/workflows/node.yml)
[![Test coverage][codecov-image]][codecov-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/alipay-sdk.svg?style=flat-square
[npm-url]: https://npmjs.org/package/alipay-sdk
[codecov-image]: https://codecov.io/github/alipay/alipay-sdk-nodejs-all/coverage.svg?branch=master
[codecov-url]: https://codecov.io/github/alipay/alipay-sdk-nodejs-all?branch=master
[download-image]: https://img.shields.io/npm/dm/alipay-sdk.svg?style=flat-square
[download-url]: https://npmjs.org/package/alipay-sdk

## 简介

Alipay OpenAPI SDK for Node.js / 用于给 Node.js 服务器提供调用支付宝开放平台的能力。
包括向支付宝服务器发起 OpenAPI 请求、订单信息生成，以及配套的证书、加签和验签能力。

基于[支付宝 API v3 接口规范](https://opendocs.alipay.com/open-v3/054oog)实现。

同时支持 Commonjs 和 ESM 两种模块依赖方式引入，通过 TypeScript 实现，HTTP Client 使用 [urllib](https://github.com/node-modules/urllib)。

## 环境要求

- 需要 Node.js >= 18.20.0

安装依赖

```bash
npm install alipay-sdk --save
```

## 平台配置

- 先前往[支付宝开发平台-开发者中心](https://openhome.alipay.com/platform/developerIndex.htm)完成开发者接入的一些准备工作，包括创建应用、为应用添加功能包、设置[应用的接口加签方式](https://opendocs.alipay.com/common/02kf5p)等。
  - 可以使用 [支付宝开放平台秘钥工具](https://opendocs.alipay.com/common/02kipk) 获取所需的公私钥，并在平台上上传公钥。
  - 本 SDK 默认采用 `PKCS1` 的格式解析密钥，与密钥工具的默认生成格式不一致。
  请使用密钥工具【格式转换】功能转为 `PKCS1`，或在本 SDK 初始化时显式指定 `keyType: 'PKCS8'`。
- 在设置加签方式结束之后，记录必要信息用于初始化 SDK。
  - 公钥证书模式（推荐）： `appId`、`应用私钥`、`应用公钥证书文件`、`支付宝公钥证书文件`、`支付宝根证书文件`
  - 公钥模式：`appId`、`应用私钥`、`应用公钥`、`支付宝公钥`

## 初始化 SDK

- 代码示例中的路径和文件名仅做示范，请根据项目实际读取文件所在的位置
- 请保存好私钥文件，避免信息泄露

### 普通公钥模式

```typescript
import { AlipaySdk } from 'alipay-sdk';

// 实例化客户端
const alipaySdk = new AlipaySdk({
  // 设置应用 ID
  appId: 'your-APPID',
  // 设置应用私钥
  privateKey: fs.readFileSync('/path/to/private-key.pem', 'ascii'),
  // 设置支付宝公钥
  alipayPublicKey: fs.readFileSync('/path/to/alipay-public-key.pem', 'ascii'),
  // 密钥类型，请与生成的密钥格式保持一致，参考平台配置一节
  // keyType: 'PKCS1',
  // 设置网关地址，默认是 https://openapi.alipay.com
  // endpoint: 'https://openapi.alipay.com',
});
```

### 证书模式

```ts
import { AlipaySdk } from 'alipay-sdk';

const alipaySdk = new AlipaySdk({
  appId: '2016123456789012',
  privateKey: fs.readFileSync('/path/to/private-key.pem', 'ascii'),
  // 传入支付宝根证书、支付宝公钥证书和应用公钥证书。
  alipayRootCertPath: '/path/to/alipayRootCert.crt',
  alipayPublicCertPath: '/path/to/alipayCertPublicKey_RSA2.crt',
  appCertPath: '/path/to/appCertPublicKey.crt',
});
```

### 验证配置

可以使用如下基础接口请求服务端，以验证配置正确。

```ts
// https://opendocs.alipay.com/open-v3/668cd27c_alipay.user.deloauth.detail.query?pathHash=3ab93168
const result = await alipaySdk.curl('POST', '/v3/alipay/user/deloauth/detail/query', {
  body: {
    date: '20230102',
    offset: 20,
    limit: 1,
  },
});

console.log(result);
```

只要接口调用返回 responseHttpStatus 200，即代表验证配置成功

```ts
{
  data: {},
  responseHttpStatus: 200,
  traceId: '06033316171731016275628924348'
}
```

其余情况，如代码报错，则说明未配置成功。

## 快速使用

### curl 示例代码

用于向支付宝服务器发起请求，与具体接口相关的业务参数。
下面以 [统一收单交易支付接口](https://opendocs.alipay.com/open-v3/08c7f9f8_alipay.trade.pay?scene=32&pathHash=8bf49b74) 为示例

```ts
const result = await alipaySdk.curl('POST', '/v3/alipay/trade/pay', {
  body: {
    notify_url: 'http://www.your-notify.com/notify', // 通知回调地址
    out_trade_no: '商家的交易码，需保持唯一性',
    total_amount: '0.1',
    subject: '测试订单',
    // 更多参数请查看文档 https://opendocs.alipay.com/open-v3/08c7f9f8_alipay.trade.pay?scene=32&pathHash=8bf49b74
  }
});

console.log(result);
// {
//  "trade_no":"2013112011001004330000121536",
//  "out_trade_no":"6823789339978248",
//  "buyer_logon_id":"159****5620",
//  "total_amount":"120.88",
//  ...
```

### 使用 `AlipayFormData` 表单上传文件

部分接口需要上传文件。
SDK 内部封装了一个 `Form` 对象，用以在发起 `multipart/form-data` 请求时使用。
以 [支付宝文件上传接口](https://opendocs.alipay.com/open-v3/5aa91070_alipay.open.file.upload?scene=common&pathHash=c8e11ccc) 为例：

```ts
import { AlipayFormData } from 'alipay-sdk';

const form = new AlipayFormData();
form.addFile('file_content', '图片.jpg', path.join(__dirname, './test.jpg'));

const uploadResult = await alipaySdk.curl<{
  file_id: string;
}>('POST', '/v3/alipay/open/file/upload', {
  form,
  body: {
    biz_code: 'openpt_appstore',
  },
});

console.log(uploadResult);
// {
//   data: { file_id: 'A*7Cr9T6IAAC4AAAAAAAAAAAAAATcnAA' },
//   responseHttpStatus: 200,
//   traceId: '06033316171731110716358764348'
// }
```

#### 上传文件流

```ts
import fs from 'node:fs';
import { AlipayFormData } from 'alipay-sdk';

const form = new AlipayFormData();
form.addFile('file_content', '图片.jpg', fs.createReadStream('/path/to/test-file'));

const uploadResult = await alipaySdk.curl<{
  file_id: string;
}>('POST', '/v3/alipay/open/file/upload', {
  form,
  body: {
    biz_code: 'openpt_appstore',
  },
});

console.log(uploadResult);
// {
//   data: { file_id: 'A*7Cr9T6IAAC4AAAAAAAAAAAAAATcnAA' },
//   responseHttpStatus: 200,
//   traceId: '06033316171731110716358764348'
// }
```

#### 上传文件内容

```ts
import fs from 'node:fs';
import { AlipayFormData } from 'alipay-sdk';

const form = new AlipayFormData();
form.addFile('file_content', '图片.jpg', fs.readFileSync('/path/to/test-file'));

const uploadResult = await alipaySdk.curl<{
  file_id: string;
}>('POST', '/v3/alipay/open/file/upload', {
  form,
  body: {
    biz_code: 'openpt_appstore',
  },
});

console.log(uploadResult);
// {
//   data: { file_id: 'A*7Cr9T6IAAC4AAAAAAAAAAAAAATcnAA' },
//   responseHttpStatus: 200,
//   traceId: '06033316171731110716358764348'
// }
```

### pageExecute 示例代码

`pageExecute` 方法主要是用于网站支付接口请求链接生成，传入前台访问输入密码完成支付，
如电脑网站支付 [alipay.trade.page.pay](https://opendocs.alipay.com/open/028r8t?scene=22) 等接口。

表单示例：

```ts
const bizContent = {
  out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
  product_code: "FAST_INSTANT_TRADE_PAY",
  subject: "abc",
  body: "234",
  total_amount: "0.01"
};

// 支付页面接口，返回 HTML 代码片段，内容为 Form 表单
const html = alipaySdk.pageExecute('alipay.trade.page.pay', 'POST', {
  bizContent,
  returnUrl: 'https://www.taobao.com'
});
```

```html
<form action="https://openapi.alipay.com/gateway.do?method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-28%2011%3A48%3A28&app_auth_token=202302BBbcfad868001a4df3bbfa99e8a6913F10&sign=j9DjDGgxLt3jbOQZy7q7Qu8baKWTl4hZlxOHa%2B46hC1djmFx%2FIyBqzQntPMurzz3f8efXJsalZz3nqZ9ClowCCxBfBvqE0cdzCDAeQ1GMgjd7dbWgjfNNcqKgmJPsIkLaHnP5vTvj%2BA27SqkeZCMbeVfv%2B4nYurXaFB9dNBtA%3D%3D" method="post" name="alipaySDKSubmit1677556108819" id="alipaySDKSubmit1677556108819">
    <input type="hidden" name="alipay_sdk" value="alipay-sdk-nodejs-3.3.0" />
    <input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;:&quot;ziheng-test-eeee&quot;,&quot;product_code&quot;:&quot;QUICK_MSECURITY_PAY&quot;,&quot;subject&quot;:&quot;订单标题&quot;,&quot;total_amount&quot;:&quot;0.01&quot;,&quot;body&quot;:&quot;订单描述&quot;}" />
</form>
<script>document.forms["alipaySDKSubmit1677556108819"].submit();</script>
```

支付链接示例：

```ts
// 支付页面接口，返回支付链接，交由用户打开，会跳转至支付宝网站
const url = sdk.pageExecute('alipay.trade.page.pay', 'GET', {
  bizContent,
  returnUrl: 'https://www.taobao.com'
});

// 返回示例：https://openapi.alipay.com/gateway.do?method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-28%2011%3A46%3A35&app_auth_token=202302BBbcfaf3bbfa99e8a6913F10&sign=TPi33NcaKLRBLJDofon84D8itMoBkVAdJsfmIiQDScEw4NHAklXvcvn148A2t47YxDSK0urBnhS0%2BEV%2BVR6h6aKgp931%2FfFbG1I3SAguMjMbr23gnbS68d4spcQ%3D%3D&alipay_sdk=alipay-sdk-nodejs-3.3.0&biz_content=blabla
```

### sdkExecute 示例代码

`sdkExecute` 方法主要是服务端生成请求字符串使用的，不会直接支付扣款，需传值到客户端进行调用收银台输入密码完成支付，
如 App 支付接口 [alipay.trade.app.pay](https://opendocs.alipay.com/apis/api_1/alipay.trade.app.pay)。

```ts
// App 支付接口，生成请求字符串，
const orderStr = sdk.sdkExecute('alipay.trade.app.pay', {
  bizContent: {
    out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
    product_code: "FAST_INSTANT_TRADE_PAY",
    subject: "abc",
    body: "234",
    total_amount: "0.01"
},
  returnUrl: 'https://www.taobao.com'
});

console.log(orderStr);
// method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-24%2016%3A20%3A28&app_auth_token=202302BBbcfad868001a4df3bbfa99e8a6913F10&sign=M%2B2sTNATtUk3i8cOhHGtqjVDHIHSpPReZgjfLfIgbQD4AvI%2Fh%2B%2FS2lkqfJVnI%2Bu0IQ2z7auE1AYQ0wd7yPC4%2B2m5WnN21Q6uQhCCHOsg30mXdnkdB3rgXIiFOSuURRwnaiBmKNKdhaXel51fxYZOTOApV47K6ZUsOlPxc%2FVJWUnC7Hrl64%2BAKqtbv%2BcaefzapYsJwGDzMAGccHGfxevSoZ2Ev7S0FsrDe4LBx4m%2BCWSIFASWFyWYxJq%2BJg7LH1HJqBdBk1jjh5JJ3bNlEqJk8MEFU7sNRae2ErdEPOwCchWkQOaVGOGpFlEHuTSvxnAKnjRkFerE14v%2BVm6weC1Tbw%3D%3D&alipay_sdk=alipay-sdk-nodejs-3.2.0&biz_content=%7B%22out_trade_no%22%3A%22ziheng-test-eeee%22%2C%22product_code%22%3A%22QUICK_MSECURITY_PAY%22%2C%22subject%22%3A%22%E8%AE%A2%E5%8D%95%E6%A0%87%E9%A2%98%22%2C%22total_amount%22%3A%220.01%22%2C%22body%22%3A%22%E8%AE%A2%E5%8D%95%E6%8F%8F%E8%BF%B0%22%7D

// 返回支付宝客户端之后，在【小程序中】通过 my.tradePay 进行调用。
// 详见：https://opendocs.alipay.com/mini/api/openapi-pay
my.tradePay({
  // 服务端生成的字符串，即上面返回的 orderStr
  orderStr,
  success: (res) => {
    my.alert({
      content: JSON.stringify(res),
    });
  },
  fail: (res) => {
    my.alert({
      content: JSON.stringify(res),
    });
  }
});
```

### exec 示例代码（已废弃，请使用 curl 代替）

用于向支付宝服务器发起请求。与具体接口相关的业务参数，需要放在 `bizContent` 中。

```ts
const result = await alipay.exec('alipay.trade.pay', {
  notify_url: 'http://www.your-notify.com/notify', // 通知回调地址
  bizContent: {
    out_trade_no: '商家的交易码，需保持唯一性',
    total_amount: '0.1',
    subject: '测试订单',
  }
});
```

**⚠️⚠️⚠️ 注意**：部分接口的请求参数不在 `bizContent` 中，
如 [`alipay.system.oauth.token`](https://opendocs.alipay.com/open/05nai1)，
具体可参考官网各接口定义。

### 通知验签

部分接口会设置回调地址，用于支付宝服务器向业务服务器通知业务情况（如交易成功）等。
此时业务服务应该验证该回调的来源安全性，确保其确实由支付宝官方发起。
SDK 提供了对应的通知验签能力。

```ts
// 获取 queryObj，如 ctx.query, router.query
// 如服务器未将 queryString 转化为 object，需要手动转化
const queryObj = {
  sign_type: 'RSA2',
  sign: 'QfTb8tqE1BMhS5qAn.....',
  gmt_create: '2019-08-15 15:56:22',
  other_biz_field: '....',
}

// true | false
const success = sdk.checkNotifySign(queryObj);
```

如果遇到验签失败，请尝试使用 `checkNotifySignV2()` 方法代替，它默认不会对 value 进行 decode
如 https://github.com/alipay/alipay-sdk-nodejs-all/issues/45 提到的常见问题。

```ts
const postData = {
  sign_type: 'RSA2',
  sign: 'QfTb8tqE1BMhS5qAn.....',
  gmt_create: '2019-08-15 15:56:22',
  other_biz_field: '....',
};

// true | false
const success = sdk.checkNotifySignV2(postData);
```

### 对加密内容进行解密

例如需要对小程序拿到的[加密手机号码](https://opendocs.alipay.com/mini/api/getphonenumber)进行解密

```ts
const plainText = alipaySdk.aesDecrypt(getPhoneNumberResponse);
```

### 对前端返回的报文进行验签

参考 https://opendocs.alipay.com/common/02mse3#AES%20%E8%A7%A3%E5%AF%86%E5%87%BD%E6%95%B0 的算法

前端返回的内容

```json
{
 "response": "hvDOnibG0DPcOFPNubK3DEfLQGL4=",
 "sign": "OIwk7zfZMp5GX78Ow==",
 "sign_type": "RSA2",
 "encrypt_type": "AES",
 "charset": "UTF-8"
}
```

通过 alipay-sdk 验签

```ts
// 注意，加密内容必须前后加上双引号
const signContent = '"hvDOnibG0DPcOFPNubK3DEfLQGL4="';
const sign = 'OIwk7zfZMp5GX78Ow==';
const signType = 'RSA2';
const signCheckPass = alipaySdk.rsaCheck(signContent, sign, signType);

console.log(signCheckPass);
```

### 通过 HTTP 代理服务器调用

在需要固定 IP 白名单调用的场景下，可以通过配置 `config.proxyAgent` 来指定 HTTP 代理服务器调用。

```ts
import { AlipaySdk, ProxyAgent } from 'alipay-sdk';

// 实例化客户端
const alipaySdk = new AlipaySdk({
  // 其他配置不展示
  // ...
  proxyAgent: new ProxyAgent('http(s)://your-http-proxy-address'),
});

// 后续的所有 http 调用都会走此 HTTP 代理服务器
const result = await alipaySdk.curl('POST', '/v3/alipay/user/deloauth/detail/query', {
  body: {
    date: '20230102',
    offset: 20,
    limit: 1,
  },
});

console.log(result);
```

## alipay-sdk v3 到 v4 的升级说明

从 v3 到 v4 有以下不兼容变更，请参考示例代码进行更新

- Node.js 需要升级到 >= 18.20.0 及以上版本，可以到 [Node.js 官方网站下载](https://nodejs.org/en/download/package-manager)更新
- Commonjs 通过 `require('alipay-sdk')` 引入细微变化

  v3 是会直接导出到 `module.exports` 下

  ```js
  const AlipaySdk = require('alipay-sdk');
  ```

  v4 是导出到 `exports.AlipaySdk` 下

  ```js
  const { AlipaySdk } = require('alipay-sdk');
  ```

- `exec()` 方法如果传递 `options.formData` 不包含文件，会抛出 `TypeError` 异常 `提示使用 pageExec()` 方法代替

## 打印调试日志的方式

通过 NODE_DEBUG 环境变量打印 alipay-sdk 相关的调试日志

```bash
NODE_DEBUG=alipay-sdk* node your-script.js
```

## 问题反馈

如您在使用 Alipay SDK for Node.js 过程中遇到问题，
欢迎前往 [支付宝开放社区](https://forum.alipay.com/mini-app/channel/1100001) 发帖与支付宝工作人员和其他开发者一起交流，
或联系 [支付宝开放平台客服](https://linksprod.alipay.com/app/room/5fec1e8f69565405716ba28a/) 协助解决。

## API

### new AlipaySdk(config)

| Param | Type | Description |
| ---   | ---  | ---         |
| config | `AlipaySdkConfig` | 初始化 SDK 配置 |

### AlipaySdkConfig

| 参数 | 说明 | 类型 | 必填 |
| --- | ---  | --- | --- |
| appId | 应用ID | `string` | 是 |
| privateKey | 应用私钥字符串。[RSA 签名验签工具](https://opendocs.alipay.com/common/02khjo) | `string` | 是 |
| signType | 签名种类，默认值是 `"RSA2"` | `"RSA2"` &#124; `"RSA"` | 否 |
| alipayPublicKey | 支付宝公钥（需要对返回值做验签时候必填，不填则会忽略验签） | `string` | 否 |
| gateway | 网关 | `string` | 否 |
| timeout | 网关超时时间（单位毫秒），默认值是 `5000` | `number` | 否 |
| camelcase | 是否把网关返回的下划线 `foo_bar` 转换为驼峰写法 `fooBar`，默认值是 `true` | `boolean` | 否 |
| keyType | 指定 `privateKey` 类型, 默认值是 `"PKCS1"` | `"PKCS1"` &#124; `"PKCS8"` | 否 |
| appCertPath | 应用公钥证书文件路径 | `string` | 否 |
| appCertContent | 应用公钥证书文件内容 | `string` &#124; `Buffer` | 否 |
| appCertSn | 应用公钥证书sn | `string` | 否 |
| alipayRootCertPath | 支付宝根证书文件路径 | `string` | 否 |
| alipayRootCertContent | 支付宝根证书文件内容 | `string` &#124; `Buffer` | 否 |
| alipayRootCertSn | 支付宝根证书sn | `string` | 否 |
| alipayPublicCertPath | 支付宝公钥证书文件路径 | `string` | 否 |
| alipayPublicCertContent | 支付宝公钥证书文件内容 | `string` &#124; `Buffer` | 否 |
| alipayCertSn | 支付宝公钥证书sn | `string` | 否 |
| encryptKey | AES 密钥，调用 AES加 解密相关接口时需要 | `string` | 否 |
| wsServiceUrl | 服务器地址 | `string` | 否 |

### alipaySdk.curl<T = any>(httpMethod, path, options?) ⇒ `Promise<AlipayCommonResult<T>>`

curl 方式调用支付宝 [API v3 协议](https://opendocs.alipay.com/open-v3/053sd1)接口

**Returns**: `Promise<AlipayCommonResult<T>>` - 请求执行结果

| Param | Type | Description | Required |
| ---   | ---  | ---         | ---      |
| httpMethod | `string` | HTTP 请求方式，支持 `GET, POST, PUT, DELETE` 等 | 是 |
| path | `string` | HTTP 请求 URL | 是 |
| options | `AlipayCURLOptions` | 可选参数 | 否 |
| options.query | `Record<string, string \| number>` | 指该参数需在请求 URL 传参 | 否 |
| options.body | `Record<string, any>` | 指该参数需在请求 JSON 传参 | 否 |
| options.form | `AlipayFormData \| AlipayFormStream` | 表单方式提交数据 | 否 |
| options.requestId | `string` | 调用方的 requestId，不填会默认生成 uuid v4 | 否 |
| options.needEncrypt | `boolean` | 自动 AES 加解密，默认值是 `false` | 否 |
| options.appAuthToken | `string` | [应用授权令牌](https://opendocs.alipay.com/isv/10467/xldcyq?pathHash=abce531a)，代商家调用支付宝开放接口必填 | 否 |
| options.requestTimeout | `number` | 请求超时时间，默认使用 `config.timeout` | 否 |

#### `AlipayCommonResult<T>`

响应结果

| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| data | HTTP 接口响应返回的 JSON 数据 | `T` | 是 |
| responseHttpStatus | HTTP 接口响应状态码 | `number` | 是 |
| traceId | HTTP 接口响应 trace id | `string` | 是 |

### alipaySdk.sdkExecute(method, bizParams, options?) ⇒ `string`

生成请求字符串，用于客户端进行调用

**Returns**: `string` - 请求字符串

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 方法名 |
| bizParams | `IRequestParams` | 请求参数 |
| bizParams.bizContent | `object` | 业务请求参数 |
| options | `ISdkExecuteOptions` | 可选参数 |
| options.bizContentAutoSnakeCase | `boolean` | 对 `bizContent` 做驼峰参数转为小写 + 下划线参数，如 outOrderNo => out_order_no，默认 `true`，如果不需要自动转换，请设置为 `false` |

### alipaySdk.pageExecute(method, httpMethod, bizParams) ⇒ `string`

生成网站接口请求链接 URL 或 POST 表单 HTML

**Returns**: `string` - 请求链接 URL 或 POST 表单 HTML

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 方法名 |
| httpMethod | `string` | 后续进行请求的方法。如为 GET，即返回 http 链接；如为 POST，则生成表单 HTML |
| bizParams | `IRequestParams` | 请求参数 |
| bizParams.bizContent | `object` | 业务请求参数 |

### `deprecated` alipaySdk.exec(method, bizParams, options) ⇒ `Promise<AlipaySdkCommonResult>`

执行请求，调用支付宝 [API v2 协议](https://opendocs.alipay.com/open-v3/054fcx)接口

注意：此方法是为了让 `alipay-sdk@3` 尽量平滑升级到 `alipay-sdk@4` 保留，
请尽快使用 `alipaySdk.curl()` 代替，走 API v3 协议。

**Returns**: `Promise<AlipaySdkCommonResult>` - 请求执行结果

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 调用接口方法名，比如 `alipay.ebpp.bill.add` |
| bizParams | `IRequestParams` | 请求参数 |
| bizParams.bizContent | `object` | 业务请求参数 |
| options | `IRequestOption` | 选项 |
| options.validateSign | `Boolean` | 是否验签 |
| options.log | `object` | 可选日志记录对象 |

#### AlipaySdkCommonResult

响应结果

| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| code | 响应码。10000 表示成功，其余详见 [https://opendocs.alipay.com/common/02km9f](https://opendocs.alipay.com/common/02km9f) | `string` | 是 |
| msg | 响应讯息。Success 表示成功。 | `string` | 是 |
| sub_code | 错误代号 | `string` | 否 |
| sub_msg | 错误辅助信息 | `string` | 否 |

#### IRequestParams

请求参数

| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| bizContent | 业务请求参数 | `object` | 否 |
| needEncrypt | 自动 AES 加解密 | `boolean` | 否 |

### alipaySdk.checkNotifySignV2(postData)

通知验签，默认不会对 value 进行 decode

**Returns**: `Boolean` - 是否验签成功

| Param | Type | Description |
| --- | --- | --- |
| postData | `JSON` | 服务端的消息内容 |

### alipaySdk.checkNotifySign(postData, raw)

通知验签

**Returns**: `Boolean` - 是否验签成功

| Param | Type | Description |
| --- | --- | --- |
| postData | `JSON` | 服务端的消息内容 |
| raw | `Boolean` | 是否使用 raw 内容而非 decode 内容验签 |

### alipaySdk.aesDecrypt(encryptedText)

对加密内容进行 AES 解密

**Returns**: `String` - 解密后的明文字符串

| Param | Type | Description |
| ---   | ---  | --- |
| encryptedText | `String` | 加密内容字符串 |

## License

[MIT](LICENSE.txt)

## Contributors

<a href="https://github.com/alipay/alipay-sdk-nodejs-all/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=alipay/alipay-sdk-nodejs-all" />
</a>

Made with [contrib.rocks](https://contrib.rocks).
