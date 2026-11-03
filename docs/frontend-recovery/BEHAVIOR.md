# 交互、表单及支付状态行为取证

本文件记录从压缩 JS 直接观察到的行为，避免在重写过程中丢掉重要细节；并不是完整的用户操作手册。

## 认证

- `router-aZWjwYfd.js` 检查 `accessToken` 并向 `/sign-in` 传递 `redirect`。
- `sign-in-DJ_9-JGk.js` 登录后读取 `/auth/me` 与 `/auth/init-password-hash`；`password_is_default` 或特定初始密码指纹匹配时出现密码修改引导，对应 `/account/password`。
- `auth-store-uaDKRR4l.js` 已确认：JWT 保存在 Cookie `access_token`，用户缓存保存到 localStorage `auth_user`；401 清理并携带 `redirect` 跳转登录页。当前 `web/src/api.ts` 使用 **sessionStorage**，与原版不同；具体见 [AUTH-AND-API-CLIENT.md](./AUTH-AND-API-CLIENT.md)。
- Go `auth_controller.go` 的 logout 是无服务端撤销的空操作，前端必须清理 token。不得把 logout API 返回成功理解成旧 JWT 已失效。

## 订单 `orders-BnOHTHOA.js`

- 列表 GET /orders，查询 `page`、`page_size`（默认 1/10）；订单详情 GET /orders/{trade_id}。
- 操作：关闭订单、手动标记支付、重新发送回调；操作后会 invalidate/refetch 数据；危险操作包含确认流程。
- 重发回调入口在 `status===2 && !!notify_url` 条件下出现（JS 确认）。其他操作可用条件需要继续核验。
- 详情字段：`trade_id`、`order_id`、`name`、`amount`、`currency`、`actual_amount`、`token`、`network`、`receive_address`、`notify_url`、`redirect_url`、`block_transaction_id`、`parent_trade_id`、`created_at`、`updated_at`。
- 列表还含 `callback_num` 等字段、过滤和表格状态；完整列顺序及过滤值待提取。

## 钱包与地址 `addresses-JEZCoidP.js`

- 新增字段 `address`、`network`、`remark`；编辑时仅提交 `remark`（与 Go 一致）。
- 批量导入通过多行文本按换行切分、trim、去空行，以 `{network,addresses}` 提交。
- 修改状态时启用/禁用映射 `status=1/2`；支持删除，关联数据应进行后端检查。

## API Key `keys-DoklatfJ.js`

- 新增/修改表单：`name`、`notify_url`、`ip_whitelist`。
- 能查看密钥（GET /secret）、轮换密钥（POST /rotate-secret）、查看统计（GET /stats）、启用/禁用（POST /status）、删除；状态数值 1/2。
- 密钥只在用户明确操作时展示；重建时不应缓存/输出日志或自动将密钥暴露在页面上。

## RPC 与 Chain `rpc-BkV2cf1-.js`、`chains-tUDg5ohy.js`

- RPC 表单：`network`、`type`（默认 http）、`purpose`（默认 general）、`url`、`api_key`、`weight`（默认 1）、`enabled`；支持健康检查与延迟信息。
- Chain 页面有网络启用开关和代币添加/修改/启停；修改网络 body 包括 `display_name`、`enabled`、`min_confirmations`、`scan_interval_sec`。代币具体表单字段待继续提取。

## 系统设置

- `system-CkRcAjXh.js`：`system.log_level` 只允许 debug/info/warn/error。
- `telegram-Cecf2wsy.js`：`system.telegram_bot_token`、`system.telegram_chat_id`、`system.telegram_payment_notice_enabled`、`system.telegram_abnormal_notice_enabled`。
- `pay-fSH4oF9b.js`：`rate.mode` fixed/auto、`rate.api_url`、`rate.cache_ttl_seconds`、`rate.forced_rate_list`（JSON 编辑器）、`system.amount_precision`（2–6）。存在原版 Monaco 懒加载模块。
- `okpay-DzwNhqlx.js`：`okpay.enabled`、`shop_id`、`shop_token`、`timeout_seconds`、`callback_url`；页面部分输入（api_url、return_url、allow_tokens）有 disabled 处理，不要误实现成均可编辑。重置操作涉及更多键。
- `notifications-CuHKJSeV.js`：通知表单用 `show-submitted-data` 展示填写值，未见持久化 API；后续保留原样或接入真实后端需作为**产品变更**单独决策。
- `integrations-DDlt0riN.js`：静态说明数组展示 GMPay/EPay/OKPay 接口，不是服务端的集成实例列表。

## 收银台 `_trade_id-B2s-YYlo.js`（高风险）

- 入口 `/cashier/$trade_id`，按交易号请求 checkout response；再读取公网 config，展示链/Token 或 OkPay 选项。
- 页面切换逻辑出现 `method`、`select`、`payment`、`success`、`expired`、`timeout`、`not-found` 等状态；根据是否已选链、是否有 `payment_url` 或 `receive_address` 选择面板。
- POST /pay/switch-network 选择网络；POST /pay/submit-tx-hash/{trade_id}，提交体包含 `block_transaction_id`。
- GET /pay/check-status/{trade_id} 启用 `refetchInterval`，请求连续失败计数到 5 时停轮询/进入超时分支（已经确认轮询为 5000ms）。
- 状态 `2` 导向成功、`3` 导向过期（**收银台语义，不应盲目复用给所有列表枚举**）。
- 成功且有 `redirect_url` 时会启动重定向查询并跳转；跳转延时已确认 3000ms；回跳取消和白名单策略待验证，详见 [CHECKOUT-STATE-MACHINE.md](./CHECKOUT-STATE-MACHINE.md)。
- 显示金额与代币、地址复制/二维码等行为的细节须通过浏览器验证；涉及真实资金的流程必须使用测试订单。

## 工程差异和高风险决策

1. 不要根据 `web/` 现有 JSON 预览重写原版 UI；需要先还原路由及完整管理导航。
2. 任何前端倒计时/交易状态都以**服务端真实状态**为准；网络延迟、切链竞态、重复提交与跳转竞态必须测试。
3. `/pay`、`/payments`、`/admin/api` 不允许 SPA fallback 吞掉 API 请求（见 Go `src/util/http/spa.go`）。
4. 对未证实的原版功能明确标记“待复核”，不能填充假数据作为已完成。
