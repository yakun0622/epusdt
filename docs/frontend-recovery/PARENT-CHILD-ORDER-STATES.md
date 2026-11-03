# 父子订单与切链状态机（第五轮）

证据：src/model/service/order_service.go、src/model/data/order_data.go、src/model/data/order_admin_data.go、src/model/mdb/orders_mdb.go；静态审查，尚未测试数据库与浏览器。

## 状态

| 码 | 含义 |
|---|---|
| 1 | StatusWaitPay：等待支付 |
| 2 | StatusPaySuccess：支付成功 |
| 3 | StatusExpired：过期 |
| 4 | StatusWaitSelect：等待选择链/Token |

## /pay/switch-network 服务端决策表

| 前置情况 | 结果 |
|---|---|
| 不存在 trade_id | 10008 |
| 当前 trade_id 是子单 | 10012，不可再次切 |
| 父单非状态 1/4 | 10013 |
| 状态 4 → 选择有效链/Token | 原地补全父单，变成状态 1，trade_id 不变，更新 created_at，is_selected=false |
| 状态 4 → 选择 OkPay | 原地创建 provider 订单，trade_id 不变 |
| 状态 1 → 选择同网络/Token | 标记父单 selected，返回父单 |
| 状态 1 → 选择已有、仍待支付的同网络/Token 子单 | 复用该子单，刷新父单 created_at，返回子单 trade_id |
| 状态 1 → 不同网络/Token 且从未有子单 | 创建唯一子单，返回新 trade_id |
| 状态 1 → 有过历史子单，再选另一个目标 | 10011 |

代码常量 MaxSubOrders = 1；CountSubOrders 统计**历史所有子单**而不是仅活跃子单。因此限制是每个父单最多创建一个子单，不能误理解为可不断切网络但同时最多一个活跃。

## 支付、回调与补单

- 创建子单时 parent_trade_id 关联父单，商户 API Key 与回跳信息继承父单；子单 notify_url 为空、callback_confirm 为已确认，避免双重商户回调。
- 子单支付成功后父单标记成功，pay_by_sub_id 指向子单，父单自身的 block_transaction_id / actual_amount / receive_address **不被子单覆写**。管理 UI 展示已付金额、hash 时要查正确的子单，而不是直接以父单旧字段替代。
- 公开收银台 SubmitCashierManualPayment 只允许状态 1 的链上单，并检查 hash 是否用过；管理员 SubmitManualPayment 允许状态 1 或 3 的链上单，但仍需验证交易。
- 后台 CloseOrderManually 仅允许状态 1 或 4 → 3；ReopenOrderCallback 对状态 2 重置 callback_confirm 和 callback_num，供异步任务再次发送。
- 对于父单与子单并发支付、OkPay 回调及父单超时的竞态，必须通过真实服务端集成测试确认。

## 时间

切链创建或复用子单、占位单完成时可能刷新父单 created_at，进而影响到期时间。网页倒计时以**当前 trade_id** 的服务端响应为准；公共 CheckoutCounterResponse 三个时间字段为 Unix 毫秒，创建交易接口 expiration_time 是秒。

## 测试重点

父单状态 4 补全、状态 1 切链生成子单、再次同资产复用、第三次选择被拒、子单二次切链被拒；子单支付成功后父单状态和 callback 归属；公开/管理员过期单补单权限差异；父子单倒计时刷新。
