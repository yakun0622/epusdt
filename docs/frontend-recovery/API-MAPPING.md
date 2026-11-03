# 前端 API 调用与 Go 后端交叉映射

JS 调用依据：`src/www/assets/<对应模块>` 中 `useQuery(method,path)`、`useMutation(method,path)`、`GET()`；Go 依据：`src/route/router.go`。下表区分 **JS 实际引用** 和 **Go 额外提供**；不能简单地将后端全部接口当作原版页面功能。

## 管理后台（共同前缀 /admin/api/v1）

| 功能 / JS 源文件 | JS 已确认引用 | Go 提供但本模块是否使用仍待验证 |
|---|---|---|
| 登录 `sign-in` | POST /auth/login；GET /auth/me；GET /auth/init-password-hash | POST /auth/logout、POST /auth/password（密码模块单独使用） |
| 密码 `password` | POST /auth/password | — |
| 仪表盘 `dashboard` | GET /dashboard/overview、/asset-trend、/revenue-trend、/order-stats、/rpc-stats、/recent-orders | — |
| 订单 `orders` | GET /orders；GET /orders/{trade_id}；POST /orders/{trade_id}/close、/mark-paid、/resend-callback | GET /orders/export、/orders/list-with-sub、/orders/{trade_id}/with-sub（JS 是否调用未确证） |
| 钱包 `addresses` | GET /wallets；POST /wallets；PATCH /wallets/{id}；DELETE /wallets/{id}；POST /wallets/{id}/status、/wallets/batch-import | GET /wallets/{id}（JS 未确证） |
| API Key `keys` | GET /api-keys；POST /api-keys；PATCH /api-keys/{id}；DELETE /api-keys/{id}；POST /api-keys/{id}/status、/rotate-secret；GET /api-keys/{id}/secret、/stats | — |
| 链 `chains` + `chains-store` | GET /chains；PATCH /chains/{network}；GET /chain-tokens；POST /chain-tokens；PATCH /chain-tokens/{id}；POST /chain-tokens/{id}/status | DELETE /chain-tokens/{id}（后端存在，JS 是否接入未确证） |
| RPC `rpc` | GET /rpc-nodes；POST /rpc-nodes；PATCH /rpc-nodes/{id}；DELETE /rpc-nodes/{id}；POST /rpc-nodes/{id}/health-check | — |
| 设置 `system`、`telegram`、`pay`、`okpay`、`epay` | 通过 `lib-DyUkl8FG.js` 共享封装读写设置：需要对应到 GET /settings、PUT /settings；`pay` 还直接调用 GET /settings/rate/status | DELETE /settings/{key}、POST /settings/rate/refresh（需针对具体 JS 调用确认） |
| 支付配置 `payment-setup` | GET /config | — |

**特别区分**：`notifications-CuHKJSeV.js` 的表单提交到 `show-submitted-data`，并未观察到 /notification-channels 的实际调用。Go 虽有 `GET/POST/PATCH/DELETE /notification-channels` 等接口，也不能据此声称原版前端具有该管理功能。

## 收银台和网关（均为真实 JS 引用）

| 入口 | JS 实际引用 | 用途 |
|---|---|---|
| `/cashier/$trade_id` | GET /pay/checkout-counter-resp/{trade_id} | 获取订单显示数据 |
| 同上 | GET /payments/gmpay/v1/config | 获取链/代币、OkPay 可用参数 |
| 同上 | POST /pay/switch-network | 选择/切换支付网络 |
| 同上 | POST /pay/submit-tx-hash/{trade_id} | 提交区块链交易哈希 |
| 同上 | GET /pay/check-status/{trade_id} | 轮询交易状态 |
| `/payment-setup/integrations` | 仅静态展示 POST /payments/gmpay/v1/order/create-transaction；GET/POST /payments/epay/v1/order/create-transaction/submit.php；POST /payments/okpay/v1/notify | **不是该页面实际执行这些请求** |

## 请求和响应约定（Go 确认）

- `src/util/http/response.go` 定义 `{status_code, message, data, request_id}`；成功 `status_code=200`，业务错误可能映射 HTTP 400 并在 body 保留业务码。
- 登录入参 `{username,password}`，返回 `data:{token,username,user_id}`。管理员后续 JWT 在 Authorization Bearer 头。
- `GET /orders` 在 Go 中返回 `data:{list,total,page,page_size}`（**不是** `data.pagination`；详见 `order_controller.go`）。JS 查询明确使用 `page`、`page_size`。
- `PUT /settings` 的 Go 入参是 `{items:[{group,key,value,type}]}`；不要直接把 settings 表单 state 原样传给接口。
- 钱包新增 `{network,address,remark}`、编辑 `{remark}`、批量导入 `{network,addresses:[...]}`；由 `wallet_controller.go` 确认。

## 必须继续补完的取证

- 拆开 `lib-DyUkl8FG.js` 对 settings 操作的封装与批量失败显示行为。
- 逐项解出接口的请求/响应字段（特别是 EPay/OKPay、RPC health、交易支付、分页和动态状态）。
- 标出旧前端请求但当前 Go 无对应端点的潜在失配，使用浏览器联调确认；暂时不猜测。
