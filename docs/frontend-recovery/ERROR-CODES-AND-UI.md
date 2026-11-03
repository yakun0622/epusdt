# 第五轮：业务错误码与前端映射

证据：src/util/constant/errno.go、src/model/service/order_service.go、src/www/assets/checkout-model-CU56hvYm.js、_trade_id-B2s-YYlo.js、auth-store-uaDKRR4l.js。2026-11-04，静态核对，未执行浏览器测试。

## HTTP 与业务码

Go 的 RspError.HttpStatus 对 400 和 401 返回对应 HTTP 状态；对于业务码 10001~10046 返回 HTTP 400，真正的业务码在 body.status_code 中。HTTP 401 管理会话失效与业务 10010 完全不同，不能按 HTTP 状态直接推断业务原因。

## 完整服务端 errno

| Code | Go 常量 | 含义 |
|---|---|---|
| 400 | SystemErr | 系统错误 |
| 401 | SignatureErr | 签名验证失败 |
| 10001 | WalletAddressAlreadyExists | 钱包地址已存在 |
| 10002 | OrderAlreadyExists | 订单重复 |
| 10003 | NotAvailableWalletAddress | 没有可用钱包地址 |
| 10004 | PayAmountErr | 金额不合法 |
| 10005 | NotAvailableAmountErr | 没有可用金额通道 |
| 10006 | RateAmountErr | 汇率计算失败 |
| 10007 | OrderBlockAlreadyProcess | 区块交易已处理 |
| 10008 | OrderNotExists | 订单不存在 |
| 10009 | ParamsMarshalErr | 请求参数错误 |
| 10010 | OrderStatusConflict | **订单状态冲突，不一定过期** |
| 10011 | SubOrderLimitExceeded | 子单数量超限 |
| 10012 | CannotSwitchSubOrder | 子单不可再切链 |
| 10013 | OrderNotWaitPay | 订单非待支付 |
| 10014 | ChainNotEnabled | 链未启用 |
| 10016 | SupportedAssetNotFound | 资产不支持 |
| 10017 | PaymentProviderNotEnabled | 第三方支付未启用 |
| 10018 | PaymentProviderConfigErr | 第三方支付配置错误 |
| 10019 | PaymentProviderNotSupport | 服务商不支持资产 |
| 10020 | RpcNodePurposeErr | RPC 用途错误 |
| 10021 | RpcNodeURLErr | RPC URL 不合法 |
| 10022 | RpcNodeHTTPURLErr | RPC HTTP URL 错误 |
| 10023 | RpcNodeWebSocketURLErr | RPC WS URL 错误 |
| 10024 | RpcNodeTypeErr | RPC 类型错误 |
| 10025 | AdminInvalidCredentialErr | 账号或密码错误 |
| 10026 | AdminUserDisabledErr | 管理员禁用 |
| 10027 | AdminUnauthorizedErr | 未授权 |
| 10028 | AdminUserNotFoundErr | 管理员不存在 |
| 10029 | AdminOldPasswordErr | 旧密码错误 |
| 10030 | WalletNotFoundErr | 钱包不存在 |
| 10031 | ApiKeyNotFoundErr | API Key 不存在 |
| 10032 | RpcNodeNotFoundErr | RPC 节点不存在 |
| 10033 | OrderCallbackNotApplicable | 订单不可重发回调 |
| 10034 | OrderNotifyURLEmptyErr | 回调 URL 为空 |
| 10035 | OrderResendCallbackErr | 重发回调失败 |
| 10036 | NotificationConfigErr | 通知配置错误 |
| 10037 | NotificationEventsErr | 通知事件错误 |
| 10038 | ManualPaymentVerifyErr | 链上手工支付核验失败 |
| 10039 | ManualPaymentProviderErr | 仅支持链上补单 |
| 10040 | InitialAdminPasswordErr | 初始密码未获取 |
| 10041 | NotifyURLErr | notify_url 无效 |
| 10042 | PaymentProviderCreateErr | 支付服务商创建订单失败 |
| 10043 | SettingItemErr | 设置条目不合法 |
| 10044 | OrderRedirectURLErr | 回跳地址无效 |
| 10045 | OrderApiKeyUnavailableErr | 订单商户 Key 不可用 |
| 10046 | EPayReturnSignatureErr | EPay 返回签名失败 |

注意：未定义 10015，不能擅自增加错误文案映射。

## 原版 JS 与 Go 的差异

- checkout-model 把 [10008,10013,404] 归类为 not-found，但 Go 10013 是订单不再等待付款，不代表交易不存在。
- _trade_id 的 switch-network 或 tx hash 失败时把 10010 显示成 expired；Go 10010 实际是状态冲突，可能已支付、已过期或被其他请求修改。**后续实现应再 GET /pay/check-status/{trade_id} 取得真实状态，然后决定成功/过期/异常。**
- 不能把 10038/10039 当作已收款；不能把“重发回调入队成功”当作商户已经收到。
- 若恢复旧 UI 行为和纠正状态误判冲突，应标明“有意修正”，验收依后端真实状态。

## 未执行测试

用例：HTTP400 业务码解析；401 登录跳转；10010 并发切链后重新读取；10011/12 子单约束；10038/39 拒绝假支付；10033/34/35 回调错误；支付商配置错误不泄露密钥。
