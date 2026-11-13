# W62 发布安全验收 · 证据审批模板

本阶段只交付隔离自动化证据。真实付款、官方供应商沙箱、第三方商户、生产版 Service Worker 的升级及回退均**尚未批准**。变更审批表需由独立人员在安全的人工流程中填写，不得靠 GitHub CI 模拟值自动置 PASS。

## 六项人工阻断条件

| Gate | 解除阻断需要的材料 | 当前状态 |
|---|---|---|
| EXT-TESTNET | 指定**测试网** Chain ID、受确认的测试 Token 合约（禁止拿主网 USDT 合约当测试币）、自有测试收款地址、官方 RPC、最小确认数、浏览器可核实的真实测试网交易收据、金额最小单位 | **BLOCKED** |
| EXT-OKPAY | **同一家**供应商明确确认当前 Go `POST /payLink`、`unique_id`、`id`、`sign=MD5` 协议适用的官方测试域名和无真实价值沙箱；Shop ID、Shop Token 仅可放凭证管理系统；测试签名回调、订单查询和异常回查 | **BLOCKED** |
| EXT-MERCHANT-SANDBOX | 在**独立部署**且由商户管理的接收器中用 `X-Epusdt-Delivery-ID` + 订单号数据库唯一索引验证 HMAC、重试、重复 POST、超时和崩溃恢复；仅仅 localhost Node 测试不能替代 | **BLOCKED** |
| EXT-PWA-UPGRADE | 生产同源旧 Workbox SW 至 `web/` 的明确升级方案及源代码审批；离线/多标签页/缓存污染/回滚，真实 staging origin 的网络抓包、SW 版本与对账 | **BLOCKED** |
| EXT-VISUAL-APPROVAL | 每一语言 `en-US,zh-CN,zh-TW,ja-JP,ko-KR,ru-RU`，手机 375×812 与桌面 1280×800 旧新版截图逐项签字。收银台目标/URL/支付状态、后台登录和 PWA 状态另行人工核对 | **BLOCKED** |
| EXT-ROLLBACK | 独立预发布环境的变更窗口、只读订单/claim/回调账本快照、MySQL5.7 备份恢复测试、静态资产 HASH、旧 SW 恢复、人工审批及分钟级可证实回滚结果 | **BLOCKED** |

## 官方协议核实结论

仓库的 `src/model/service/okpay_service.go` **不是**泛称 “Paylink API”：它拼接 `payLink`，使用商户 `id/shop token`、`unique_id`、金额、coin、callback URL、return URL，再计算 **MD5**。已检索到的如下**不同产品/协议**均无法证明适配：

- <https://okepay.readme.io/reference/rest-api> 使用 `api.okepay.info/v1.0/Invoice/`（HMAC-SHA256/Base64）；`/payLink` 请求和其字段不一致。
- <https://admin.okepay.tech/developer/api> 使用 `/api/create_transaction` 和 `merchant/amountf`；并非现有 Go 协议。
- <https://docs.paylink.kz/en/integration/apm_api/> 需要 HTTP Basic shop credentials，并非 Go MD5 协议。
- <https://www.opay.tw/> 的 O'Pay 是另一家公司，不得替代。

**不得推测官方沙箱 hostname。** 需要供货商通过既有合同/面板支持渠道确认 exact endpoint、MD5 字段、订单查询和异步签名协议后才可执行任何真实沙箱写请求。本次未获得这些材料，维持 **BLOCKED**。

## 六语言视觉人工审阅流程

1. 下载 W62 Actions 中 `w62-same-origin-visual-evidence` 的 `w62-test-results`，核对 commit SHA 与运行编号；同一视口 `w62-old-{locale}.png` 和 `w62-candidate-{locale}.png` 逐对比对。
2. 打开 `W62-VISUAL-REVIEW.json`，定位像素变化比例、原版/新版标题、文本摘要 hash；差异率只表示改变，不等同于 bug 或等价；支付目标、收银台父子订单、金额、二维码和第三方 URL 必须额外手工核验。
3. 若发现语言回退、布局溢出、支付方法变化或服务端状态不一致，记录 P0 及截图，不签字。所有 12 组语言×设备均签字后，才可在新的独立审核中提交审批证据及哈希。

## 预发布回滚人工审批

1. 提供隔离 staging 的变更单，测试流量隔离、防主网/商户域名访问规则、联系人、预案和回滚条件。
2. 备份 MySQL5.7、Web 资产及 SW 缓存策略，Hash 比对。严禁直接 `DROP payment_tx_claim` 或 `callback_delivery`。
3. 人工在 staging 完成候选上线/旧版恢复，核对已支付订单与 provider ledger、回调租约、未确认响应的只读回查；不可自动补单或重复通知真实商户。
4. 上传脱敏证据、签字、时间、回滚演练结果。W62 的临时目录模拟回滚和测试版 SW 不等于真实环境演练。

仓库内 `W62-APPROVAL-TEMPLATE.json` 只保存 BLOCKED 的空模板，不接受真实密钥、个人凭据或私有 RPC URL。**生产 NO-GO**；W31 不做，`src/www` 不修改，不自动部署。
