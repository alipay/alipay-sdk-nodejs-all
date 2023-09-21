# Alipay SDK
<a name="gK9UJ"></a>
## 简介
Alipay SDK for Node.js 用于给 Node 服务器提供调用支付宝开放平台的能力。包括向支付宝服务器发起 OpenAPI 请求、订单信息生成，以及配套的证书、加签和验签能力。
<a name="qpkzt"></a>
## 环境要求

- 需要 Node.js 8 以上版本
- 安装依赖
> npm install alipay-sdk --save

<a name="cBULc"></a>
## 平台配置

- 先前往[支付宝开发平台-开发者中心](https://openhome.alipay.com/platform/developerIndex.htm)完成开发者接入的一些准备工作，包括创建应用、为应用添加功能包、设置[应用的接口加签方式](https://opendocs.alipay.com/common/02kf5p)等。
   - 可以使用 [支付宝开放平台秘钥工具](https://opendocs.alipay.com/common/02kipk) 获取所需的公私钥，并在平台上上传公钥。
   - 本 SDK 默认采用 `PKCS1` 的格式解析密钥，与密钥工具的默认生成格式不一致。请使用密钥工具【格式转换】功能转为 `PKCS1`，或在本 SDK 初始化时显式指定 `keyType: 'PKCS8'`。
- 在设置加签方式结束之后，记录必要信息用于初始化 SDK。
   - 公钥证书模式（推荐）： `appId`、`应用私钥`、`应用公钥证书文件`、`支付宝公钥证书文件`、`支付宝根证书文件`
   - 公钥模式：`appId`、`应用私钥`、`应用公钥`、`支付宝公钥`
<a name="AgPWA"></a>
## 初始化 SDK
> 代码示例中的路径和文件名仅做示范，请根据项目实际读取文件所在的位置
> 请保存好私钥文件，避免信息泄露

<a name="bKaOK"></a>
### 普通公钥模式
```typescript
const AlipaySdk = require('alipay-sdk');
// esmodule / typescript，可以使用 import AlipaySdk from 'alipay-sdk';
// 普通公钥模式
const alipaySdk = new AlipaySdk({
  appId: '2016123456789012',
  // keyType: 'PKCS1', // 默认值。请与生成的密钥格式保持一致，参考平台配置一节
  privateKey: fs.readFileSync('private-key.pem', 'ascii'),
  alipayPublicKey: fs.readFileSync('alipay-public-key.pem', 'ascii'),
});
```
<a name="bPWCK"></a>
### 证书模式
```typescript
const AlipaySdk = require('alipay-sdk');

const alipaySdk = new AlipaySdk({
  appId: '2016123456789012',
  privateKey: fs.readFileSync('private-key.pem', 'ascii'),
  // 传入支付宝根证书、支付宝公钥证书和应用公钥证书。
  alipayRootCertPath: path.join(__dirname, 'alipayRootCert.crt'),
  alipayPublicCertPath: path.join(__dirname, 'alipayCertPublicKey_RSA2.crt'),
  appCertPath: path.join(__dirname, 'appCertPublicKey.crt'),
});
```
<a name="mHx2N"></a>
### 验证配置
可以使用如下基础接口请求服务端，以验证配置正确。具体的接口定义可以在[开放平台文档站](https://opendocs.alipay.com/open/54/103419)获取。
```typescript
// 小程序：生成二维码
const result = await alipaySdk.exec('alipay.open.public.qrcode.create');

// 生活号：基础信息查询
const result = await alipaySdk.exec('alipay.open.public.info.query');

// 第三方应用：查询应用授权信息。需要先给第三方应用授权：https://opendocs.alipay.com/isv/04h3ue
const result = await alipaySdk.exec('alipay.open.auth.token.app.query', {
  bizContent: { app_auth_token: 'token 请在开放平台上查询' }
});
```
如返回 JSON 格式内容，即说明配置成功。
```javascript
{
  code: '10000',
  msg: 'Success',
  // 其他字段省略
}
// 如果未挂载对应功能包，可能会报以下错误，也说明服务通了：
{
  code: '20002',
  msg: '授权权限不足',
}
```

其余情况，如代码报错或者返回 html 代码，则说明未配置成功。
<a name="hfIbW"></a>
## 快速使用
<a name="Y6rw4"></a>
### exec 示例接口
用于向支付宝服务器发起请求。与具体接口相关的业务参数，需要放在 bizContent 中。

```typescript
const result = await alipay.exec('alipay.trade.pay', {
  notify_url: 'http://www.notify.com/notify', // 通知回调地址
  bizContent: {
    out_trade_no: '商家的交易码，需保持唯一性',
    total_amount: '0.1',
    subject: '测试订单',
  }
});
```

> 部分接口，如 [`alipay.system.oauth.token`](https://opendocs.alipay.com/open/05nai1)，其请求参数不在 bizContent 中。具体可参考官网各接口定义。

<a name="tPtNK"></a>
### 使用 AlipayFormData 配置表单
部分接口需要上传文件。SDK 内部封装了一个 Form 对象，用以在发起 multipart/form-data 请求时使用。以 [上传门店照片和视频接口](https://opendocs.alipay.com/apis/api_3/alipay.offline.material.image.upload) 为例：
```typescript
const AlipayFormData = require('alipay-sdk/lib/form');

const formData = new AlipayFormData();

formData.addField('imageType', 'jpg');
formData.addField('imageName', '图片.jpg');
formData.addFile('imageContent', '图片.jpg', path.join(__dirname, './test.jpg'));


const result = await alipaySdk.exec(
  'alipay.offline.material.image.upload',
  // 文件上传类接口 params 需要设置为 {}
  {},
  {
    // 通过 formData 设置请求参数
    formData: formData,
  },
);
```
<a name="axe5B"></a>
### pageExec 示例接口
pageExec 方法主要是用于网站支付接口请求链接生成，传入前台访问输入密码完成支付，如电脑网站支付（[alipay.trade.page.pay
](https://opendocs.alipay.com/open/028r8t?scene=22)）等接口。

表单示例：
```typescript
const bizContent = {
  out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
  product_code: "FAST_INSTANT_TRADE_PAY",
  subject: "abc",
  body: "234",
  total_amount: "0.01"
},

// 支付页面接口，返回 html 代码片段，内容为 Form 表单
const result = sdk.pageExec('alipay.trade.page.pay', {
  method: 'POST',
  bizContent,
  returnUrl: 'https://www.taobao.com'
});
```

```html
<form action="https://openapi.alipay.com/gateway.do?method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-28%2011%3A48%3A28&app_auth_token=202302BBbcfad868001a4df3bbfa99e8a6913F10&sign=j9DjDGgxLt3jbOQZy7q7Qu8baKWTl4hZlxOHa%2B46hC1djmFx%2FIyBqzQntPMurzz3f8efXJsalZz3nqZ9ClowCCxBfBvqE0cdzCDAeQ1GMgjd7dbWgjfNNcqKgmJPsIkLaHnP5vTvj%2BA27SqkeZCMbeVfv%2B4nYurXaFB9dNBtA%3D%3D" method="post" name="alipaySDKSubmit1677556108819" id="alipaySDKSubmit1677556108819">
    <input type="hidden" name="alipay_sdk" value="alipay-sdk-nodejs-3.3.0" /><input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;:&quot;ziheng-test-eeee&quot;,&quot;product_code&quot;:&quot;QUICK_MSECURITY_PAY&quot;,&quot;subject&quot;:&quot;订单标题&quot;,&quot;total_amount&quot;:&quot;0.01&quot;,&quot;body&quot;:&quot;订单描述&quot;}" />
  </form>
<script>document.forms["alipaySDKSubmit1677556108819"].submit();</script>

```

支付链接示例：
```ts
// 支付页面接口，返回支付链接，交由用户打开，会跳转至支付宝网站
const result = sdk.pageExec('alipay.trade.page.pay', {
  method: 'GET',
  bizContent,
  returnUrl: 'https://www.taobao.com'
});

// 返回示例：https://openapi.alipay.com/gateway.do?method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-28%2011%3A46%3A35&app_auth_token=202302BBbcfaf3bbfa99e8a6913F10&sign=TPi33NcaKLRBLJDofon84D8itMoBkVAdJsfmIiQDScEw4NHAklXvcvn148A2t47YxDSK0urBnhS0%2BEV%2BVR6h6aKgp931%2FfFbG1I3SAguMjMbr23gnbS68d4spcQ%3D%3D&alipay_sdk=alipay-sdk-nodejs-3.3.0&biz_content=blabla


```


<a name="Rw8WE"></a>
### sdkExec 示例接口
sdkExec 方法主要是服务端生成请求字符串使用的，不会直接支付扣款，需传值到客户端进行调用收银台输入密码完成支付，如 App 支付接口 [alipay.trade.app.pay](https://opendocs.alipay.com/apis/api_1/alipay.trade.app.pay)。
```typescript
// App 支付接口，生成请求字符串，
const orderStr = sdk.sdkExec('alipay.trade.app.pay', {
  bizContent: {
    out_trade_no: "ALIPfdf1211sdfsd12gfddsgs3",
    product_code: "FAST_INSTANT_TRADE_PAY",
    subject: "abc",
    body: "234",
    total_amount: "0.01"
},
  returnUrl: 'https://www.taobao.com'
})

// 返回支付宝客户端之后，在【小程序中】通过 my.tradePay 进行调用。
// 详见：https://opendocs.alipay.com/mini/api/openapi-pay
my.tradePay({
  // 服务端生成的字符串，即上面的 result
  orderStr: 'method=alipay.trade.app.pay&app_id=2021002182632749&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2023-02-24%2016%3A20%3A28&app_auth_token=202302BBbcfad868001a4df3bbfa99e8a6913F10&sign=M%2B2sTNATtUk3i8cOhHGtqjVDHIHSpPReZgjfLfIgbQD4AvI%2Fh%2B%2FS2lkqfJVnI%2Bu0IQ2z7auE1AYQ0wd7yPC4%2B2m5WnN21Q6uQhCCHOsg30mXdnkdB3rgXIiFOSuURRwnaiBmKNKdhaXel51fxYZOTOApV47K6ZUsOlPxc%2FVJWUnC7Hrl64%2BAKqtbv%2BcaefzapYsJwGDzMAGccHGfxevSoZ2Ev7S0FsrDe4LBx4m%2BCWSIFASWFyWYxJq%2BJg7LH1HJqBdBk1jjh5JJ3bNlEqJk8MEFU7sNRae2ErdEPOwCchWkQOaVGOGpFlEHuTSvxnAKnjRkFerE14v%2BVm6weC1Tbw%3D%3D&alipay_sdk=alipay-sdk-nodejs-3.2.0&biz_content=%7B%22out_trade_no%22%3A%22ziheng-test-eeee%22%2C%22product_code%22%3A%22QUICK_MSECURITY_PAY%22%2C%22subject%22%3A%22%E8%AE%A2%E5%8D%95%E6%A0%87%E9%A2%98%22%2C%22total_amount%22%3A%220.01%22%2C%22body%22%3A%22%E8%AE%A2%E5%8D%95%E6%8F%8F%E8%BF%B0%22%7D',
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
<a name="jFMMS"></a>
### 通知验签
部分接口会设置回调地址，用于支付宝服务器向业务服务器通知业务情况（如交易成功）等。此时业务服务应该验证该回调的来源安全性，确保其确实由支付宝官方发起。SDK 提供了对应的通知验签能力。

```typescript
// 获取 queryObj，如 ctx.query, router.query
// 如服务器未将 queryString 转化为 object，需要手动转化
const queryObj = { sign_type: 'RSA2', sign: 'QfTb8tqE1BMhS5qAn.....', gmt_create: '2019-08-15 15:56:22', other_biz_field: '....' }

// true | false
const signRes = sdk.checkNotifySign(queryObj);
```
<a name="rgUZQ"></a>
## 问题反馈
如您在使用 Alipay SDK for Node.js 过程中遇到问题，欢迎前往 [支付宝开放社区](https://forum.alipay.com/mini-app/channel/1100001) 发帖与支付宝工作人员和其他开发者一起交流，或联系 [支付宝开放平台客服](https://linksprod.alipay.com/app/room/5fec1e8f69565405716ba28a/) 协助解决。
<a name="TDdWH"></a>
## API
<a name="DS92L"></a>
### new AlipaySdk(config)
| Param | Type | Description |
| --- | --- | --- |
| config | `AlipaySdkConfig` | 初始化 SDK 配置 |


<a name="rHN3I"></a>
### AlipaySdkConfig
| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| appId | 应用ID | `string` | 是 |
| privateKey | 应用私钥字符串。RSA签名验签工具：<br />[https://docs.open.alipay.com/291/106097](https://docs.open.alipay.com/291/106097) | `string` | 是 |
| signType | 签名种类 | `"RSA2"` &#124; `"RSA"` | 否 |
| alipayPublicKey | 支付宝公钥（需要对返回值做验签时候必填） | `string` | 否 |
| gateway | 网关 | `string` | 否 |
| timeout | 网关超时时间（单位毫秒，默认 5s） | `number` | 否 |
| camelcase | 是否把网关返回的下划线 key 转换为驼峰写法 | `boolean` | 否 |
| keyType | 指定private key类型, 默认： PKCS1, PKCS8: PRIVATE KEY, PKCS1: RSA PRIVATE KEY | `"PKCS1"` &#124; `"PKCS8"` | 否 |
| appCertPath | 应用公钥证书文件路径 | `string` | 否 |
| appCertContent | 应用公钥证书文件内容 | `string Buffer` | 否 |
| appCertSn | 应用公钥证书sn | `string` | 否 |
| alipayRootCertPath | 支付宝根证书文件路径 | `string` | 否 |
| alipayRootCertContent | 支付宝根证书文件内容 | `string` &#124; `Buffer` | 否 |
| alipayRootCertSn | 支付宝根证书sn | `string` | 否 |
| alipayPublicCertPath | 支付宝公钥证书文件路径 | `string` | 否 |
| alipayPublicCertContent | 支付宝公钥证书文件内容 | `string` &#124; `Buffer` | 否 |
| alipayCertSn | 支付宝公钥证书sn | `string` | 否 |
| encryptKey | AES密钥，调用AES加解密相关接口时需要 | `string` | 否 |
| wsServiceUrl | 服务器地址 | `string` | 否 |


<a name="TxCzx"></a>
### alipaySdk.sdkExec(method, params) ⇒ `string`

生成请求字符串，用于客户端进行调用

**Returns**: `string` - 请求字符串

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 方法名 |
| params | `IRequestParams` | 请求参数 |
| params.bizContent | `object` | 业务请求参数 |

<a name="wbKs5"></a>
### alipaySdk.pageExec(method, params) ⇒ `string`

生成网站接口请求链接或表单

**Returns**: `string` - 请求链接或表单 HTML

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 方法名 |
| params | `IRequestParams` | 请求参数 |
| params.bizContent | `object` | 业务请求参数 |
| params.method | `string` | 后续进行请求的方法。如为 GET，即返回 http 链接；如为 POST，则生成表单 html |


<a name="igAmX"></a>
### alipaySdk.exec(method, params, option) ⇒ `Promise.<(AlipaySdkCommonResult|string)>`

执行请求，调用支付宝服务端

**Returns**: `Promise.<(AlipaySdkCommonResult|string)>` - 请求执行结果

| Param | Type | Description |
| --- | --- | --- |
| method | `string` | 调用接口方法名，比如 alipay.ebpp.bill.add |
| params | `IRequestParams` | 请求参数 |
| params.bizContent | `object` | 业务请求参数 |
| option | `IRequestOption` | 选项 |
| option.validateSign | `Boolean` | 是否验签 |
| args.log | `object` | 可选日志记录对象 |


<a name="W4dEr"></a>
#### AlipaySdkCommonResult
响应结果

| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| code | 响应码。10000 表示成功，其余详见 [https://opendocs.alipay.com/common/02km9f](https://opendocs.alipay.com/common/02km9f) | `string` | 是 |
| msg | 响应讯息。Success 表示成功。 | `string` | 是 |
| sub_code | 错误代号 | `string` | 否 |
| sub_msg | 错误辅助信息 | `string` | 否 |

<a name="Hm0Qr"></a>
#### IRequestParams
请求参数

| 参数 | 说明 | 类型 | 必须 |
| --- | --- | --- | --- |
| bizContent | 业务请求参数 | `object` | 否 |
| needEncrypt | 自动AES加解密 | `boolean` | 否 |

<a name="ekWqZ"></a>
### alipaySdk.checkNotifySign(postData, raw)

通知验签<br />**Returns**: `Boolean` - 是否验签成功

| Param | Type | Description |
| --- | --- | --- |
| postData | `JSON` | 服务端的消息内容 |
| raw | `Boolean` | 是否使用 raw 内容而非 decode 内容验签 |