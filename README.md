# Alipay SDK

[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]

[npm-image]: https://img.shields.io/npm/v/alipay-sdk.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/alipay-sdk
[travis-image]: https://img.shields.io/travis/ali-sdk/alipay-sdk/master.svg?style=flat-square
[travis-url]: https://travis-ci.org/ali-sdk/alipay-sdk.svg?branch=master
[cov-image]: http://codecov.io/github/ali-sdk/alipay-sdk/coverage.svg?branch=master
[cov-url]: http://codecov.io/github/ali-sdk/alipay-sdk?branch=master



蚂蚁金服开放平台 SDK

> 第一次使用，请参考[支付宝开放平台配置](#支付宝开放平台配置)设置公钥

# SDK 使用文档


## 1. 实例化 SDK

```
// TypeScript
import AlipaySdk from 'alipay-sdk';

const alipaySdk = new AlipaySdk(AlipaySdkConfig);
```


`AlipaySdkConfig` 配置项

* 必选
  * `appId`: `String` 开放平台上创建应用时生成的 appId
  * `privateKey`: `String` 应用私钥
* 可选
  * `alipayPublicKey`: `String` 支付宝公钥，用于开放平台返回值的验签
  * `timeout`: `Number` 网关超时时间，单位毫秒，默认 `5000`
  * `camelcase`: `Boolean` 是否把服务端返回的数据中的字段名从下划线转为驼峰，默认 `true`

### 完整的例子：

```
// TypeScript
import AlipaySdk from 'alipay-sdk';

const alipaySdk = new AlipaySdk({
    appId: '2016123456789012',
    privateKey: fs.readFileSync('./private-key.pem', 'ascii'),
    alipayPublicKey: fs.readFileSync('./public-key.pem', 'ascii'),
});

// JS
const AlipaySdk = require('alipay-sdk').default;

const alipaySdk = new AlipaySdk({
    appId: '2016123456789012',
    privateKey: fs.readFileSync('./private-key.pem', 'ascii'),
    alipayPublicKey: fs.readFileSync('./public-key.pem', 'ascii'),
});
```

## 2. 通过 `exec` 调用 API

```
// TypeScript
try {
  const result = await alipaySdk.exec(method, params, options);

  // console.log(result);
} catch (err) {
  // ...
}

// JS
alipaySdk.exec(method, params, options)
  .then(result => {
    // console.log(result);
  })
  .catch(err) {
    // ...
  }
```

* exec 参数列表

  * 必选
    * `method`: `String` 调用的 Api，比如 `alipay.system.oauth.token`
  * 可选
    * `params`: `Object` Api 的请求参数（包含部分“公共请求参数”和“请求参数”）
        * `bizContent`: `Object` 可选项
          * **注意：** 仅当 Api 文档的“公共请求参数”列表中存在 `biz_content`时，才需要通过 `bizContent` 设置请求参数，否则应该通过 `params` 传递请求参数
    * `options`: `Object` 可选项
      * `validateSign`: `Boolean` 是否对返回值验签（依赖实例化时配置的”支付宝公钥“），默认 `false`
      * `formData`: `Object` 文件上传类接口的请求参数，，默认 `null`
      * `log`: Log 对象，存在时会调用 `info`、`error` 方法写日志，默认 `null` 即不写日志
* exec 返回值类型： `Promise`


### 完整的例子

#### 不包含 biz_content 参数

```
// TypeScript
try {
  const result = await alipaySdk.exec('alipay.system.oauth.token', {
    grantType: 'authorization_code',
    code: 'code',
    refreshToken: 'token'
  }, {
    // 验签
    validateSign: true,
    // 打印执行日志
    log: this.logger,
  });

  // result 为 API 介绍内容中 “响应参数” 对应的结果
  console.log(result);
} catch (err) {
  //...
}
```


#### 包含 biz_content 参数

```
// TypeScript
try {
  const result = await alipaySdk.exec('alipay.trade.close', {
    notifyUrl: 'http://notify_url',
    appAuthToken: '',
    // sdk 会自动把 bizContent 参数转换为字符串，不需要自己调用 JSON.stringify
    bizContent: {
      tradeNo: '',
      outTradeNo: '',
      operatorId: '',
    },
  }, {
    // 验签
    validateSign: true,
    // 打印执行日志
    log: this.logger,
  });

  // result 为 API 介绍内容中 “响应参数” 对应的结果
  console.log(result);
} catch (err) {
  //...
}
```


## 其他

### 文件上传类接口调用

```
// 引入 AlipayFormData 并实例化
import AlipayFormData from 'alipay-sdk/lib/form';

const formData = new AlipayFormData();
```

AlipayFormData 提供了下面 2 个方法，用于增加字段文件：

* `addField(fieldName, fieldValue)` 增加字段，包含 2 个参数
  * `fieldName`: `String` 字段名
  * `fieldValue`: `String` 字段值

* `addFile(fieldName, fileName, filePath)` 增加文件，包含 3 个参数
  * `fieldName`: `String` 字段名
  * `fileName`: `String` 文件名
  * `filePath`: `String` 文件绝对路径


#### 完整的例子

```
// TypeScript
import AlipayFormData from 'alipay-sdk/lib/form';

const formData = new AlipayFormData();

// 增加字段
formData.addField('imageType', 'jpg');
formData.addField('imageName', '图片.jpg');
// 增加上传的文件
formData.addFile('imageContent', '图片.jpg', path.join(__dirname, './test.jpg'));


try {
  const result = await alipaySdk.exec(
    'alipay.offline.material.image.upload',
    // 文件上传类接口 params 需要设置为 {}
    {},
    {
      // 通过 formData 设置请求参数
      formData: formData,
      validateSign: true,
    },
  );

  /**
   * result 为 API 介绍内容中 “响应参数” 对应的结果
   * 调用成功的情况下，返回值内容如下：
   * {
   *   "code":"10000",
   *   "msg":"Success",
   *   "imageId":"4vjkXpGkRhKRH78ylDPJ4QAAACMAAQED",
   *   "imageUrl":"http://oalipay-dl-django.alicdn.com/rest/1.0/image?fileIds=4vjkXpGkRhKRH78ylDPJ4QAAACMAAQED&zoom=original"
   * }
   */
  console.log(result);
} catch (err) {
  //...
}
```


### 页面类接口调用

页面类接口默认返回的数据为 html 代码片段，比如 PC 支付接口 `alipay.trade.page.pay` 返回的内容为 Form 表单。
同文件上传，此类接口也需要通过 `AlipayFormData.addField` 来增加参数。此外，AlipayFormData 还提供了 `setMethod` 方法，用于直接返回 url：

* `setMethod(method)` 设置请求方法
  * `method`: `'post' | 'get'` 默认为 post


#### 完整的例子

##### 返回 form 表单

```
// TypeScript
import AlipayFormData from 'alipay-sdk/lib/form';

const formData = new AlipayFormData();

formData.addField('notifyUrl', 'http://www.com/notify');
formData.addField('bizContent', {
  outTradeNo: 'out_trade_no',
  productCode: 'FAST_INSTANT_TRADE_PAY',
  totalAmount: '0.01',
  subject: '商品',
  body: '商品详情',
});

try {
  const result = await alipaySdk.exec(
    'alipay.trade.page.pay',
    {},
    { formData: formData },
  );

  // result 为 form 表单
  console.log(result);
} catch (err) {}
```

##### 返回支付链接

```
// TypeScript
import AlipayFormData from 'alipay-sdk/lib/form';

const formData = new AlipayFormData();
// 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
formData.setMethod('get');

formData.addField('notifyUrl', 'http://www.com/notify');
formData.addField('bizContent', {
  outTradeNo: 'out_trade_no',
  productCode: 'FAST_INSTANT_TRADE_PAY',
  totalAmount: '0.01',
  subject: '商品',
  body: '商品详情',
});

try {
  const result = await alipaySdk.exec(
    'alipay.trade.page.pay',
    {},
    { formData: formData },
  );

  // result 为可以跳转到支付链接的 url
  console.log(result);
} catch (err) {}
```


# 支付宝开放平台配置

## 1. 注册支付宝开放平台账号
  
  支付宝开放平台： https://open.alipay.com/

## 2. 生成密钥

1. 下载 RSA密钥工具：https://docs.open.alipay.com/291/106097/
2. 切换到生成秘钥 tab，秘钥格式选择“PKCS1（非JAVA适用）” 

    > 不需要手动修改秘钥格式，SDK 会自动处理

    ![img](https://gw.alipayobjects.com/zos/rmsportal/WYvBOnJBmBzBovsqYePF.png)

3. 新建 private-key.pem 保存私钥，文件格式如下：
    ```
    // 粘贴上一步生成的私钥到这里（不需要换行）
    ```

    完整的 private-key.pem 文件例子：

    ```
    MIIEpQIBAAKCAQEA7EqgH28GDbCgaonIDWIhMSPYAGMLNjCzmk7jtxNSLFjI+bbTZe43N5Bbo8cmk/LpULIGrtiyhfre1WMWIG6voK/GNL+9pY3PxkOdr+VveWp3ZDuaWQToN7Tq/f+MUMkvEBhcCP+b7UheQXX80zAEWe7HGh5mpj9bmbtb57d34e1b72GX/dTVVeJDU5/Eg6L/UcKeOmd4xtdGP4xqAPbgNhe2JuTOtRR/xl0ZT9mUtEpBLabrTR1EO256Zk1lzgXuMepAlyCIN0Rm0DxqnosRZjRg41ahkXs3RzInRbWXIIVdrjJsjC7rnlt6zZHdqRSDKy/9sZbAv0e8ZjaHjIEnvQIDAQABAoIBAHF2zDkL6Q492GoQS14R1vpvydM1vDaDYFsisrpArt7Yq3ktz4lMwHsP+NFGWkIFDQBQ3GCtcdxgQQyajg941yEEBtthj0GmPTVpVpkWRVc6RqZ88Hr6nj/Rwl3BjrFkShMif19azpc8fvZUH9mRXyWIQVdLbeM63VOO4mz8bravhYxX3Mea8sTzo4mzfM2J+E9eLsywrFNQ44HueQZrK6d1fFdEe1bC9BrDd9xWVPuOgKBZiAnpcSla9CHbmD4YFBOmGV1/+gnoDBJuaHNij4K9AuJSz90dnRUuByVfR9vMxENkBOIoOpIjs8+WvF+L2e1qKe4WhX89p9i+rpIb28kCgYEA+q0bo7s0YugkXPCMGyK0hH/CoUqkx/sPjM1lJoXc24NtorX1MZcqH0Pa55A+6rfYAiRYcW7fv+nqmc8Bz32dTWROdL27wloHBkO+p7ZuSnc6b6L1rk5da77gC4DmI01LSFXT36dRFWJOBj7rWCp0pUlxmexp+VLrEEhzJs4Ob48CgYEA8U9PVR3gUV60mymSel4o0sMcALANt5SZvX2GoJ3FMFPWLyAq7WFZnttPjwXaqEda5efB9Brp0Wm092kTcMAcus3Rkytt/DSGVGAWhkF9FcPG06mpL2UK3z6glvdOq2zjCo6oglVtCOUKj0sxXYjXAhqF/SPw3Kgov2Ru9hMtDfMCgYEA0UlN1jkp15nxIhdDIjSreiQgnwDu6nfV17x0QuFoL21fT4WTHMAUTt4cGVD49oZfNgqaPLpQ3K2zTI7j+BPsDP0984GlDPKVAsn0l5lcI5e/lgz8CXcr0BUggPoxKjASNmZR6lyK+cuFUPmfC5EGqijTS6tyHtL3pjSWz0MiEkkCgYEAhSR9YTlay4q1m+cUKvBJFgERMk/xQZl8OlFINtbWNhQL2XSmOtO73yqiewd/3dmBDdkR6t3upNzuPJR9ZXiaYXeuasVLqhxRAb0CsJDxs1CSI7c44i2eEg88DA/oGC28F9ceosr/nijB6s5SLomSGFcKFuH9w8IEuZVwo9VwxoECgYEA4BM+BBRhtOQd8ae/Y8vAH828X9euupkhIrpQvk3iptNowAniiCoDXmQtwQOyDj8O9NkvCKRZcH5eApLrDo7dIQg5bvcT894MotSDbcEBvLkLvcKfb/Vw0GFVUhUAGRebyATkA7mDCeJ1VMyj/d6Ubg5FOy7L/U4X+Qwrwb/B/VA=
    ```
## 3. 设置应用公钥

1. 复制 2.2 中生成的应用公钥

    ![img](https://gw.alipayobjects.com/zos/rmsportal/EUxpNrlWOhTYWbfljYUe.png)

2. 登录开放平台设置应用公钥

    ![img](https://gw.alipayobjects.com/zos/rmsportal/CyUzmlKmpCNPAPdNevTd.png)

## 4. 保存支付宝公钥

> “支付宝公钥”用于开放平台返回值的进行验签

1. 开放平台“应用概览”页面中复制“支付宝公钥”

    ![img](https://gw.alipayobjects.com/zos/rmsportal/kdRFpjYmQdBNonEMXSBO.png)

2. 新建 public-key.pem 保存私钥，文件格式如下：

    ```
    // 粘贴上一步复制的“支付宝公钥”到这里（不需要换行）
    ```

    完整的 public-key.pem 文件例子：

    ```
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7EqgH28GDbCgaonIDWIhMSPYAGMLNjCzmk7jtxNSLFjI+bbTZe43N5Bbo8cmk/LpULIGrtiyhfre1WMWIG6voK/GNL+9pY3PxkOdr+VveWp3ZDuaWQToN7Tq/f+MUMkvEBhcCP+b7UheQXX80zAEWe7HGh5mpj9bmbtb57d34e1b72GX/dTVVeJDU5/Eg6L/UcKeOmd4xtdGP4xqAPbgNhe2JuTOtRR/xl0ZT9mUtEpBLabrTR1EO256Zk1lzgXuMepAlyCIN0Rm0DxqnosRZjRg41ahkXs3RzInRbWXIIVdrjJsjC7rnlt6zZHdqRSDKy/9sZbAv0e8ZjaHjIEnvQIDAQAB
    ```

