# W62：官方沙箱核验门禁、独立商户接收器、同源 PWA 与多语言视觉审批

日期：2026-11-13 · 基线 `master@55579b6b` · 本阶段只有**隔离自动验收**，**生产 NO-GO**

## 1. 本阶段解决了什么

- 新增独立商户接收器 `scripts/w62/merchant-sandbox.mjs`：不是 Go `httptest`，而是另一个 **Node 操作系统进程**，绑定系统随机分配的 `127.0.0.1` 端口。仅接受合成 `w62_` 订单，校验 GMPay JSON 的 HMAC-SHA256（Go `util/sign` 相同规范、`pid=test-token`）与 `X-Epusdt-Delivery-ID`，用原子 rename+fsync 将业务副作用去重账本写入测试临时目录。故意第一次在落盘后返回 503；Go 实际 `dispatchPendingCallbacks` 发送后返回待重试，**终止 Node 进程重启**，再次回调必须只产生一次商户业务效果。相同 Delivery ID 却变化的 transaction ID 即使签名合法也返回 409，伪造签名返回 403。
- 新增 `web/e2e/w62-same-origin-server.mjs`：单一临时随机 `localhost` origin 提供原版 `src/www` 与构建完成的新版 `web/dist`，仅以带测试控制 header 的接口切换模式；生产 Go API 路由始终 403。**不改动原版任何文件**。
- 新增 `web/e2e/w62-upgrade-sw.js`：**测试专用**的升级模拟脚本，在相同 origin 读取旧 Workbox Worker、执行显式迁移并测试回退旧静态资产。测试脚本没有加入 `web/dist`，不会写入 `src/www`，不能视为生产正式升级方案。
- 新增 `web/e2e/w62-same-origin.w62.mjs` 与独立配置 `w62-playwright.config.mjs`。原 W60/W61 Playwright 测试匹配 `*.spec.mjs`，W62 匹配 `*.w62.mjs`，**不混跑或破坏原测试数量**。每个浏览器测试持有单独 origin 和缓存，六语言 `en-US/zh-CN/zh-TW/ja-JP/ko-KR/ru-RU` 的新旧页面双视口截图、像素变化比率、脱敏文本摘要、每项默认 `approval=BLOCKED` 的 JSON 都保存到 Actions Artifact。
- 新增离线 `scripts/w62/offline-provider-preflight.mjs`：严格审计 Go 的 `/payLink` 和 MD5 签名，拒绝通过仅修改文档模板提前将六个外部 BLOCKED 设为 PASS。**完全不访问远程支付域名**。
- 新增 `scripts/w62/release-gate.mjs`：将 GitHub Job 实际状态转换为 `W62-ACCEPTANCE.{md,json}`，隔离自动化可为 PASS，生产永远是 NO-GO，直到独立批准的后续阶段有真实材料；W61 真实 MySQL 5.7 独立进程 SIGKILL/持久 Claim 及临时 SHA256 回滚仍作为 CI 保护门禁。

## 2. OkPay / 官方身份结论

实际 Go `src/model/service/okpay_service.go` 的创建订单协议：

- 基础地址只从配置 `GetOkPayAPIURL()` 读取，然后附加 `/payLink`，HTTP 表单 POST。
- `id=shopID`、`unique_id`、`amount`、`coin`、`callback_url`、`return_url`；按排序/URL 编码串和 `&token=` 拼接 MD5，大写十六进制签名。
- 异步通知核验签名后，必须与本地 `provider_order_id`、coin、金额完全一致，才允许 Go 的受保护结算事务修改账本。
- 公开出现的 OkePay `/v1.0/Invoice/`/HMAC、okePay `/api/create_transaction` 和 PayLink.kz HTTP Basic 方案均不满足以上契约。**不存在经过核验的本项目官方 OkPay 沙箱地址与无真实资金凭据**，该 gate 仍 BLOCKED。来源及审批要求见 [W62-RELEASE-APPROVAL.md](./W62-RELEASE-APPROVAL.md)。

## 3. 六项外部阻断（不能通过 CI 变绿）

| Gate | 自动化实现范围 | 外部真实状态 |
|---|---|---|
| EXT-TESTNET | W61 模拟链上 Token/地址/精度/时间/确认数验证、MySQL 结算 | **BLOCKED**：未提供经官方确认的测试网 chain ID、测试 Token 合约、测试专用钱包、RPC、真实测试交易收据 |
| EXT-OKPAY | Go MD5 /payLink 协议离线核验、原有 W55 不匹配签名拒绝 | **BLOCKED**：无可验证对应协议的 OkPay 官方测试 URL/授权 |
| EXT-MERCHANT-SANDBOX | W62 独立 Node 进程 + Go 真实签名 HTTP、持久去重、ACK 丢失与重启 | **BLOCKED**：不是独立商户管理的预发布服务器 |
| EXT-PWA-UPGRADE | 同源旧 SW → 测试专用迁移 SW → 旧资产回滚 | **BLOCKED**：`web/` 正式升级脚本未经独立安全审查，真实 staging 运行未完成 |
| EXT-VISUAL-APPROVAL | 六语言新旧界面配对截图与像素差异、多设备实际 Chromium | **BLOCKED**：没有人工逐页视觉签名，对应收银台支付状态仍需独立对照 |
| EXT-ROLLBACK | W61 临时目录静态资产回滚及 MySQL 故障回归 | **BLOCKED**：未经批准的真实预发布灰度/缓存与数据库恢复演练 |

## 4. 自动运行 / 证据

`W62` Actions 工作流：`.github/workflows/w62-sandbox-acceptance.yml`，仅响应 W62 分支/文件与 `master`，无生产部署权限。禁止修改 `src/www/`、W31、支付生产 Go 代码、发布部署工作流。包含独立 7 个前置任务及最终报告。

```bash
# 测试专用，不能指向真实商户
node scripts/w62/offline-provider-preflight.mjs
cd src
go test ./mq -run '^TestW62IndependentProcess' -count=1 -v
go test -race ./mq ./model/service -run '^Test(W62|W61|W55|W54)' -count=1
cd ../web
npm ci && npm run typecheck && npm run test && npm run build
npm install --prefix e2e --no-package-lock --ignore-scripts
./e2e/node_modules/.bin/playwright install chromium
./e2e/node_modules/.bin/playwright test --config e2e/w62-playwright.config.mjs
cd ..
bash scripts/w61/rehearse-rollback.sh
# 只在对应 GitHub Actions 的环境变量中读取真实 job verdict：
node scripts/w62/release-gate.mjs
```

- `w62-same-origin-visual-evidence`：2 个隔离原生 Chromium 浏览器场景，12 组双语言/设备图片、缓存审计、截图差异/Trace。
- `w62-pass-blocked-release-decision`：源自本次实际 Actions 状态的 Markdown/JSON，六项外部 BLOCKED 原因。
- `w62-temp-only-rollback-evidence`：临时目录 hash 恢复记录。
- `W62-APPROVAL-TEMPLATE.json`：**全部 BLOCKED 且没有签字/密钥**，未来批准只能通过独立审批流程。

**W31 继续未实施，生产 `src/www` 完全保留，不进行主网转账、伪造支付成功、真实商户重复通知或自动部署。**
