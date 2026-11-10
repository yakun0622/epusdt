# W51：公共收银台支付方式、币种和网络选择

日期：2026-11-10。研发在单一临时分支 `feat/w51-payment-method-selection` 完成，验证后只向 `master` squash 合并一次。

## 一、核对 Go 真实契约

| 真实接口 | 方法 | 用途与安全边界 |
|---|---|---|
| `/payments/gmpay/v1/config` | GET | 公开 `supported_assets:[{network,display_name,tokens}]`、`okpay:{enabled,allow_tokens}`；**不要使用管理员 `/admin/api/v1/config`**，后者可能含 OkPay shop_token |
| `/pay/checkout-counter-resp/:trade_id` | GET | 收银台订单当前付款字段、`can_switch` (W51 新增)、`created_at/server_time/expiration_time` **毫秒** |
| `/pay/check-status/:trade_id` | GET | 最新状态 1 等待支付、2 已支付、3 已过期、4 等待选择；状态查询不可直接证明已到账，显示依据服务端 |
| `/pay/switch-network` | POST | JSON `{trade_id,token,network}`，币种统一大写、网络统一小写；OkPay 传 `network:"okpay"`，不是原生链名 |
| `/pay/submit-tx-hash/:trade_id` 等 | POST | W51 **不调用**；W31 关闭/补单/回调重发也不实施 |

- `supported_assets` 在 Go 端仅列出启用的链、可支付 Token 和**有可用钱包**的网络。前端只取公开安全字段，过滤错误配置与重复目标；`okpay.enabled` 为 false 时绝不出现 OkPay 选择项。
- `/pay/switch-network` 允许**父订单**状态 1 或 4；子单、已付/已过期订单返回安全业务错误。状态 4 占位直接补全本交易，状态 1 选不同目标可能创建子单并返回**不同 `trade_id`**；相同父单+同 Token/网络或已有活动子单会复用。
- `MaxSubOrders = 1` 是**累计创建数**限制，非同时活动数。超过限制 Go 返回 10011；前端不可绕过。错误 10010 是**订单状态冲突**而非“已过期”；10012 子单不可切换、10013 已不待付、10014/10016 支付资产不可用、10017–10019/10042 第三方配置/创建失败。
- `payment_url` 是 OkPay 第三方托管付款链接，`redirect_url` 可含商户重定向参数或签名；这两项**不写 React 状态、浏览器持久化、console 或 UI**，仅保留 `hasHostedPaymentLink` 布尔值。W51 不执行第三方链接跳转、也不宣称已支付。

## 二、安全交互和状态竞态

1. 加载真实公开网络/币种/OkPay 支持矩阵；用户选目标后弹出明确确认，告知可能预留钱包、创建唯一子单或真实的 OkPay 供应商订单。
2. 提交前重新执行订单详情 + 最新状态双 GET，`trade_id`、创建时间、状态、币种/网络、金额和已选择标记必须与旧快照一致；失配/过期/不可切换时**不发送 POST**。
3. 相同已选中的链上目标直接刷新，不重复 POST；不同目标由用户确认后**只 POST 一次**。前端 in-flight guard 防止双击并发，任何网络/供应商未知结果**绝不自动重试 POST**。
4. POST 返回须经严格类型验证：状态必须为 1，交易号必须合法；状态 4 占位只能返回原 ID，已付的父单可能返回子 ID。链上须符合目标网络、币种、有效收款地址与实际数量，OkPay 必须有第三方托管链接。
5. POST 成功后再次对返回 `trade_id` 执行双 GET；**未核验成功前隐藏原收款地址**，即使 POST 返回完整付款字段也不能直接当作可支付状态。若返回子单，前端切换到 `/cashier/:child_trade_id` 并清空旧页面状态。
6. 网络/超时/无效结果处理为结果未知，锁定当前页面的再次提交；用户应通过订单管理/运维对账处理，页面不伪造成功或自动重放。业务失败给出逐类安全提示而非可能包含凭证的错误正文。

## 三、Go 修正

- 公共 `CheckoutCounterResponse` 新增**非敏感**布尔字段 `can_switch`：只对可切换的父单（状态 1/4 且非 OkPay 提供商）为 true。子订单或旧版未带该字段时新前端默认**不允许切换**；服务端仍进行权威状态检查。
- Go OkPay 行的 `network=tron`、`receive_address=OKPAY` **不是链上收款钱包**，W51 禁止错误展示或同 token/network 回落到普通链上订单。后端 provider 父单切换到链上返回 10019，避免复用虚假地址。
- 以前切换接口 Debug 日志会序列化响应，其中 `payment_url` 可能包含供应商令牌；已去除完整响应日志。
- 对状态 4 OkPay：若数据库存在 `(trade_id,provider)` 供应商记录（即使 status=failed），返回 10010 待对账；不再 upsert 覆盖并对外调用第二次 payLink。创建采用唯一键插入，降低并发重复采购风险。
- Go 进程内 `gCreateTransactionLock` 只在单进程内串行；跨多个实例并不等价于全局分布式锁。新唯一插入保护覆盖该供应商占位创建场景，但**多实例所有支付切换与分布式幂等仍需进一步验证**，不得据此宣称完整生产幂等。

## 四、代码与验证

- `web/src/api/endpoints/payment-options.ts`：公开支持矩阵强类型白名单与 token/network 归一化。
- `web/src/api/endpoints/payment-switch.ts`：提交前条件校验、单次 POST、返回核验、业务错误码分类、未知结果保护。
- `web/src/features/checkout/payment-selector.tsx`：选择 UI、确认弹窗、双 GET 预校验和提交后复核。
- `web/src/features/checkout/checkout-page.tsx`：关联选择状态、新子单路由、安全隐藏与禁止重复提交。
- `web/src/features/checkout/i18n.ts`：六语言 W51 文案；`web/src/style.css`：响应式布局；`web/src/main.tsx`：子单路由 key 绑定。
- `src/model/service/order_service.go`、`src/model/response/pay_response.go`、`src/controller/comm/order_controller.go`：服务端限制、安全字段和日志调整。
- `web/src/api/endpoints/payment-options.test.ts`、`payment-switch.test.ts`、`web/src/features/checkout/payment-selector.test.tsx`、`src/model/service/w51_switch_guard_test.go`：配置脱敏、父子单、MaxSubOrders、状态竞态、重复和未知供应商调用专项回归。
- `.github/workflows/w51-switch-safety.yml`：Go 定向测试；原 Web workflow 在 `feat/**` 分支进行 TS、Vitest、Vite 生产构建验证。

## 五、发布限制和下一步

- W51 没有进行真实钱包转账、供应商付款、主网回调、跨多 Go 实例并发和浏览器 E2E。**构建/单元测试成功不等于可以替换生产收银台**。
- W31 关闭、人工补单及回调重发继续不实施；生产编译资源 `src/www` 未修改，`web/dist` 没有部署。
- 下一阶段建议 **W52**：真实支付状态轮询、跨父/子单与 OkPay 状态对账、超时过期处理以及错误码 10010 的竞态回归。涉及真实资金行为需单独验收。
- 分支策略：一个 Wxx 大任务、一个 `feat/` 临时分支；分支 Actions 全绿后创建唯一 PR 并一次 Squash Merge，合并完成再清理分支。若当前 GitHub 工具不提供删除 ref 能力，应明确标示残留分支并给出 PR 的 Delete branch 入口。
