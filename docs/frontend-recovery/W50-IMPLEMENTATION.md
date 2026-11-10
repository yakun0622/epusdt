# W50：公共收银台订单与状态只读恢复

日期：2026-11-10；仓库：`yakun0622/epusdt`；开发分支：`feat/w50-public-checkout`。

## 实际 Go 路由与数据契约

| 用途 | 方法/路由 | 是否在 W50 调用 |
| --- | --- | --- |
| 订单初始化/付款目标 | `GET /pay/checkout-counter-resp/:trade_id` | **是** |
| 最新订单状态 | `GET /pay/check-status/:trade_id` | **是** |
| 原收银台入口跳转 | `GET /pay/checkout-counter/:trade_id` → `/cashier/:trade_id` | 兼容现有 Go 路由 |
| 订单创建 | `POST /payments/gmpay/v1/order/create-transaction` | **否** |
| EPAY 签名订单创建 | `GET/POST /payments/epay/v1/order/create-transaction/submit.php` | **否** |
| 选择支付网络/第三方支付 | `POST /pay/switch-network` | **否** |
| 手动提交链交易哈希 | `POST /pay/submit-tx-hash/:trade_id` | **否** |
| EPay 商户跳转 | `GET /pay/return/:trade_id` | **否** |

`CheckoutCounter` 只证明交易存在并返回基础订单数据；**不能证明最新状态**。W50 同时完成上述两个 GET 并验证 `trade_id` 一致，才会呈现付款目标。一旦任一 GET 失败、状态不合法或交易号错位，立即清空原付款目标并显示不能核验，避免沿用缓存中的过期收款地址。

## 订单状态 / 时间单位

- `status=1`：待支付，且 `actual_amount>0`、`token`、`network`、`receive_address` 完整、初始化状态也为 1、服务器时间未过期时，显示真实代币数量、网络与收款地址；否则不能展示付款目标。
- `status=2`：最新查询报告已支付，显示支付完成，不展示待转账地址。
- `status=3`：订单过期，不展示待转账地址。
- `status=4`：待选币种/网络，原始占位记录 `actual_amount=0`，并无有效收款地址；W50 只说明状态，**不提供选择网络的写操作**。即便状态尚未及时变更，时间已到期也不再展示选择提示。
- Go `buildCheckoutResponse` 返回的 `created_at`、`server_time`、`expiration_time` 均是 **Unix 毫秒**；而 `buildCreateTransactionResponse` 中的 `expiration_time` 是 **Unix 秒**。接口类型和单测严格隔离，毫秒解析器拒绝秒值。
- 为避免用户设备时钟偏差，倒计时以服务端 `server_time` 加上接收之后的单调钟时间差为依据；显示的日期使用浏览器当前语言与时区。页面只读，每 15 秒重新请求公共状态/详情，主动刷新也重新核验。
- `amount` 是法币订单金额，`actual_amount` 是链上代币数量，**不能当同一币种金额**；页面明确标识币种、网络和单位。

## 敏感 URL 与副作用边界

- 响应中 `payment_url` 可能包含第三方支付令牌，`redirect_url` 可能包含商户回跳参数。W50 在 API 边界将它们仅用于判断“有无第三方链接”，不把其字符串写入 React 状态、不显示 URL、不自动打开支付提供商或商户重定向。
- 对 OkPay 等外部托管付款，页面只显示“第三方支付待后续接入”，即使真实服务端已创建付款链接，也不执行打开、跳转、确认付款或签名。
- 读取接口明确 `cache:'no-store'`；公共 `paymentClient` 不附带管理员 JWT。没有 POST/PUT/PATCH/DELETE；不写 localStorage/sessionStorage、不保存收款地址。
- 严格校验交易号仅由安全字符组成，拒绝路径分隔符/非法编码；JSON 类型、有限数值、状态、支付接入类型与时间戳单位不合法时禁止展示付款信息。

## 代码与验证

- `web/src/api/endpoints/checkout.ts` + `checkout.test.ts`：严格的收银台与最新状态解析、白名单字段投影、状态转换和接口只读验证。
- `web/src/features/checkout/checkout-page.tsx` + `checkout-page.test.tsx`：公共收银台，加载/错误/刷新、交易信息、状态和链上收款目标的条件展示。
- `web/src/features/checkout/i18n.ts`：六语言付款安全词条。
- `web/src/main.tsx`：公共 `/cashier/:trade_id` 接入，**不触发管理员 JWT 校验**；`web/src/style.css`：响应式布局。

自动验证包括 `npm ci`、`npm run typecheck`、`npm run test`、`npm run build` 和 `dist/index.html` 检查；构建只针对 `web/dist`，没有部署动作。最新分支和合并后的运行结果以 GitHub Actions 为准。

## 尚未完成、回滚与下一阶段

- 尚未使用真实数据库和真实支付订单做浏览器 E2E、跨网络/状态竞态、区块链回调及真实第三方托管支付测试。构建与模拟接口单测不是生产上线批准。
- W51 建议恢复**可选择网络/代币的展示及明确提交过程**，必须单独验证 `POST /pay/switch-network` 的父子订单限制、状态竞态、幂等/去重和第三方重定向风险，不能直接沿用原编译页面的危险行为。
- W31 订单关闭/人工补单/回调重发继续未实施；生产 `src/www` 保持不变，不发布 `web/dist`。
- 从 W44 开始保持**每个 Wxx 大任务一个临时分支、分支 Actions 全绿、一次 Squash Merge 到 master、再清理临时分支**。在工具不能删除 ref 时，必须明确说明未清理并提供 PR 删除入口。
