# 公共支付接口契约（Go 源码核对）
> 2026-11-03，依据 `src/model/request/order_request.go`、`src/model/response/{pay_response,order_response,support_response}.go`、`src/controller/comm/{pay_controller,order_controller,supported_asset_controller}.go`、`src/route/router.go`。**这里是已核对 JSON 字段的设计契约，不是线上抓包结果**。

## 1. 基础响应格式
公共支付 JSON 成功响应同后台：`{status_code:200,message:"success",data,request_id}`，发生业务错误时 HTTP/业务码可能不同。**EPay 兼容的创建/返回路径存在 302 重定向，不属于 JSON 响应。**

## 2. GET /pay/checkout-counter-resp/{trade_id}
后端明确返回 `response.CheckoutCounterResponse`，与 `mdb.Orders` **完全不同，不要向公开收银台复用管理员订单模型**。
```ts
type OrderStatus = 1 | 2 | 3 | 4; // 等待支付、成功、过期、等待选择
interface CheckoutCounterResponse {
  trade_id: string;
  amount: number;
  actual_amount: number;       // status=4 时为 0
  token: string;               // status=4 时为空
  currency: string;
  receive_address: string;     // status=4 时为空
  network: string;             // status=4 时为空
  status: OrderStatus;
  payment_type: string;        // 后端输出小写 gmpay/epay
  expiration_time: number;     // Unix seconds
  redirect_url: string;        // EPay 可能是内部 /pay/return/:trade_id
  payment_url: string;         // 链上为空，OkPay 为 hosted payLink
  created_at: number;          // Unix seconds
  server_time: number;         // Unix seconds
  is_selected: boolean;
}
```
当前收银台 JS `checkout-model-CU56hvYm.js` 会格式化 network/token/currency、将数值或字符串时间解析为 Date，保留服务端时钟并使用 `performance.now()` 估算倒计时；不要把 Unix seconds 当 JS milliseconds。

## 3. GET /pay/check-status/{trade_id}
`response.CheckStatusResponse`：`{trade_id:string,status:1|2|3|4}`。旧前端在 status=2 时 success、status=3 时 expired，每 5000ms 轮询。并发切换后必须防止旧 trade_id 响应影响新订单。

## 4. POST /pay/switch-network
```ts
interface SwitchNetworkRequest {
  trade_id: string;
  token: string;
  network: string; // tron/solana/ethereum/ton/aptos 等，或 okpay
}
type SwitchNetworkResponse = CheckoutCounterResponse;
```
- 三个字段均 `validate:"required"`，JS 调用中会对 network/token 转小写。
- 由 Go 注释与 controller/service 调用约定：status=4 的占位单会原地补全，普通 status=1 的实体父单切换目标时会创建或返回**唯一子订单**；子订单不得继续切换。不能假定每次切链都返回原交易号。
- OkPay 特殊网络会返回第三方支付 URL；原 JS 可能使用单独弹窗。EPay 订单商户返回地址经 `/pay/return/:trade_id` 中转，不直接信任用户填入的跳转链接。
- 关键错误码：10008 无订单、10011 子订单上限、10012 子订单禁止切换、10013 非待支付、10016 资产不支持，10017/18/19/42 支付商错误（以源码 enum 为准）。

## 5. POST /pay/submit-tx-hash/{trade_id}
```ts
interface ManualPaymentRequest { block_transaction_id: string }
interface ManualPaymentResponse {
  trade_id: string;
  status: 1|2|3;
  block_transaction_id: string;
}
```
- `block_transaction_id` 必填并 trim 后传给 `service.SubmitCashierManualPayment`；**不支持对过期或 OkPay/provider 订单直接补单**。
- TON 允许特定 `ton:<receive_raw>:<lt>:<hash>` / `lt:hash` / 可唯一定位的 hash 格式；Aptos 接受交易哈希；验证语义归 Go service，不在浏览器自行判定资金到账。
- 错误包括 10008、10009、10013、10038、10039、10007。前端只根据**验证成功的后端结果**显示成功。

## 6. GET /payments/gmpay/v1/config
```ts
interface PublicConfig {
  supported_assets: { network:string; display_name:string; tokens:string[] }[];
  site: {
    cashier_name:string; logo_url:string; website_title:string;
    support_link:string; background_color:string; background_image_url:string;
  };
  epay: { default_token:string; default_currency:string; default_network:string };
  okpay: { enabled:boolean; allow_tokens:string[] };
  version:string;
}
```
- `supported_assets` 来源于当前可支付的链 Token。前端不能再根据硬编码的网络表推断支持列表。
- **公开 config 只设置 okpay.enabled 和 allow_tokens**；Go `GetPublicConfig` 仅在 `middleware.AdminUserIDKey` 存在时添加 `shop_id/shop_token/api_url/callback_url/return_url/timeout_seconds`。公开路径不应输出后者。
- `GET /admin/api/v1/config` 是另一入口，需要登录后端上下文；其数据契约允许额外管理员字段。禁止将管理版响应写入公开缓存或日志。

## 7. 下单入口（非收银台前端内创建）
```ts
interface CreateTransactionRequest {
  order_id:string; // required|maxLen:32
  currency:string; // required
  token?:string; network?:string;  // 需同时给或同时省略
  amount:number;  // required|isFloat|gt:0.01
  notify_url:string; // required
  signature:string;  // required
  redirect_url?:string; name?:string; payment_type?:string;
}
interface CreateTransactionResponse {
  trade_id:string; order_id:string; amount:number; currency:string;
  actual_amount:number; receive_address:string; token:string;
  status:OrderStatus; expiration_time:number; payment_url:string;
}
```
- GMPay `POST /payments/gmpay/v1/order/create-transaction` 使用签名 middleware；缺省 token/network 时可生成 status=4 占位单；只传其中一项不合法（route/service 约定）。
- EPay `GET/POST /payments/epay/v1/order/create-transaction/submit.php` 使用 URL/query/form + 签名，成功时 302；不能把此 API 写成 JSON fetch 创建方法。
- `GET /pay/return/:trade_id` 也可能返回 302，只有支付成功的 EPay 订单才走商户返回签名跳转，其他通常转回收银台，部分异常返回业务错误。
- `OrderNotifyResponse` 和 `OrderNotifyResponseEpay` 用于服务端回调，不作为浏览器支付状态来源。

## 8. 兼容测试
1. status=4 初始占位单，选择 on-chain / OkPay 后原地补全；status=1 切链形成子订单，验证 trade_id 改变与返回地址。
2. 过期、重复 switch、支付回调并发与子订单二次切换。
3. 公网 config 无 ShopToken，带管理员身份的 config 允许管理详情，敏感结果不可被缓存/日志泄露。
4. Unix seconds 的倒计时、5 秒轮询、连续异常、支付成功后 3 秒跳转。
5. EPay 302 响应、/pay/return 回跳签名与来源校验；不能把返回路径当成收银台原始 redirect_url。
