# W52：公共收银台支付轮询、父子订单状态与 OkPay 本地对账

日期：2026-11-11。研发分支 `feat/w52-payment-reconciliation`；遵循一个 Wxx 大任务、一个临时分支、分支验证、一次 Squash Merge 到 `master`、合并后清理的流程。

## 真实 Go 状态和安全约束

| 状态/错误码 | Go 真实含义 | W52 页面行为 |
|---|---|---|
| `status=1` | 等待付款 | 三次 GET 校验通过才显示有效转账信息；每 5 秒轮询 |
| `status=2` | 数据库记录已支付 | 还须确认本订单和对应父单的支付归属一致；供应商账本不独立决定 |
| `status=3` | 数据库记录已过期 | 显示过期，停止常规轮询 |
| `status=4` | 等待选择支付网络和币种 | 不展示占位钱包；可按 W51 安全策略主动选择 |
| `10010` | **订单状态冲突** | 只读重新核验，绝不当成状态 3 |
| `10008` | 订单不存在 | 不展示地址或已支付，显示安全错误 |
| `10013` | 不再是等待付款状态 | 不当成数据库状态 3，须另查真实状态 |

W52 不修改 `OrderProcessing`、支付回调或管理员资金操作，也不向链/OkPay 发送支付、对账写请求。

## 只读关联对账接口

新增 `GET /pay/reconcile-status/:trade_id`，返回：

- `trade_id,status,root_trade_id,root_status`：真实请求订单和父订单状态；
- `related_trade_id,related_status`：父单对应的活动子单或实际付款子单，子单读取时为父单；
- `paid_confirmed,requires_review`：根据 SQL 订单状态及关联关系判定；**任何需要人工对账的组合不能显示为确认付款**；
- `provider,provider_status`：仅来自本地 `provider_orders` 的分类状态，可能为 pending、creating、paid、failed、expired、missing、unknown；
- `server_time,expiration_time`：服务端 Unix 毫秒。

所有字段采用专门的安全响应 DTO。**没有**供应商原始通知 `notify_raw`、供应商订单号、token、`pay_url`、支付链接、商户签名、钱包地址或 API 密钥。接口仅使用已有数据库记录，既不更新状态，也不触发供应商外部 HTTP API。

对 OkPay 的“对账”是**本地已验签回调账本与订单状态的交叉核对**，不是供应商实时余额/付款查询。目前 Go OkPay 集成只有 payLink 创建与通知处理，尚无已核实的供应商只读查单 API。对于未知或冲突的第三方订单，W52 只提示人工对账，绝不标记已付款或再次创建订单。

Go 的既有回调 `HandleOkPayNotify` 负责校验签名、商户、订单标识、币种、金额后调用原有结算。W52 不跳过这些校验；`provider_orders.status=paid` 单独出现不能令浏览器认定订单状态 2。

## W52 页面轮询和父子单恢复

- W50 原有两次读取增强为 **3 个公共 GET**：`checkout-counter-resp`、`check-status`、`reconcile-status`。只有 trade_id、订单状态和过期时间吻合才使用结果。任一读失败、返回不完整或前后状态竞争时立即隐藏旧收款地址。
- 付款待决时使用服务端毫秒时间戳与客户端单调时钟；轮询**每 5 秒**，网络失败按 10/20/40/60 秒逐级退避（最大 60 秒），联网恢复、浏览器可见时立即只读重查。完成或服务端确认过期后停止常规轮询。
- 倒计时结束而数据库仍是 status=1/4 时显示“时限已到、等待服务端确认”，不把浏览器时间推断写成“订单已过期”；同时隐藏付款目标。
- 父单 status=1 存在正在等待付款的子单时，**不再展示父单原收款地址**，而是给出显式打开活动子单的入口；打开子单重新执行三次 GET 校验。
- 子单标记成功但父单未结算、父单支付成功却仍有活动子单、`pay_by_sub_id` 不一致、供应商与订单 SQL 记录冲突 → `requires_review`，不显示假成功/旧收款信息，也不自动补单。
- OkPay 本地 `provider_status` 仅以文本展示；待确认时不把 `network=tron` / `receive_address=OKPAY` 当成链上地址。供应商本地 paid 但主订单未支付不算已付款。
- W51 网络选择/供应商 payLink 是用户明确确认后的单次操作，W52 **不会自动重发任何 POST**；并保留 W51 对未知结果的继续切换锁定。

## 验证

- Go `src/model/service/checkout_reconcile_test.go`：缺失订单关闭失败、父子单结算一致性、已付款子单与待付款父单冲突、供应商 paid/pending/failed/missing 与订单记录矛盾、敏感 DTO 不泄露供应商 URL/标识。
- Web `web/src/api/endpoints/reconciliation.test.ts`：三 GET 的实际路径、匿名客户端无管理员 Token、10010 不代表过期、过期时间与 DB 状态区分、支付成功须两处一致、活动子单覆盖旧地址、OkPay 不误展示、失败退避与终止条件。
- `.github/workflows/w52-cashier-reconciliation.yml`：Go 定向数据库测试与 controller/route 编译。
- 自动 Web Actions：`npm ci`、TypeScript typecheck、Vitest、Vite build 和 build output 检查，仍只生成 `web/dist`，无生产部署。

## 尚未完成和 W53 门槛

- **未做真实主网转账、供应商状态查询、OkPay 沙箱实付、浏览器 E2E、跨进程竞态、支付回调与数据库完整验收**。仅能确认本地模拟订单/回调账本状态一致，不能宣称与 OkPay 外部账单已一致。
- 新公共接口接受持有 trade_id 的客户端查询关联订单 ID；正式上线前需进行交易 ID 不可猜测性、最小数据披露、频率限制与异常访问审计。
- 建议下一阶段 **W53**：交易哈希输入及链上验证结果展示。需先审计现有 `/pay/submit-tx-hash` 的唯一性、验证、防重放和链/Token 规则，任何主动补单能力都不得绕开 W31 的高风险验收。
- **W31 资金订单关闭、人工标记支付、回调重发继续不实施；生产 `src/www` 未替换**。发布需要 W55/W60+ 及真实浏览器/支付链路验收。
