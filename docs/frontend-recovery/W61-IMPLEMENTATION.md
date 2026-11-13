# W61 预发布隔离集成验收：实施与证据

日期：2026-11-13 · 基线 W60 `8f7a39d3` · **不部署生产环境**

## 验收边界

**本轮提供可自动执行的隔离 Go/SQLite/MySQL5.7 和真实 Chromium 验收，不能等价于生产收单测试。** 所有 API 路由来自 W60 浏览器沙箱 `web/e2e/sandbox.mjs`；其 Vite Go 代理退回不可达地址 `127.0.0.1:1`。原版编译资产由 W61 只读 localhost 静态服务器（4174）提供，新版在 4173。无真实主网或商户 API 调用、无测试钱包私钥、无官方沙箱写入、无自动支付成功、无自动补单。

## 新增自动化（PASS 必须依据 Actions 实际 success）

| 类别 | 新增可执行证据 | 真实/模拟限制 |
|---|---|---|
| 链/代币/地址/金额 | `TestW61IsolatedMoveTransferContractNetworkTokenAddressAmountAndBlockTime`；拒绝网络、Token、地址、最小单位整数/精度、块时间不一致 | **本地合成交易事件**；不是测试网转账 |
| 区块确认数 | `TestW61ScannerConfirmationFence`；验证 latest 与 min_confirmations 的可用区块范围 | 不连接真实 RPC |
| W54 原子结算/Hash 重放 | `TestW61MySQL57KilledUncommittedWorkerRollsBackAndReadAllowsSafeNewAttempt`、`TestW61MySQL57CommittedButResponseLostNeverReplaysSettlement`，使用独立 Go 操作系统进程和真正 MySQL 5.7 | 第一次在 SQL 事务提交前强杀进程，必须回滚行和 claim；第二次事务提交后、观察到返回前杀进程，主库 claim 只能有一个 |
| W55 商户接收器 | `TestW61MerchantReceiverOneBusinessEffectAcrossRetryAndUnknownACK` 实际走现有 `dispatchPendingCallbacks` → localhost HTTP；`TestW61MerchantReceiverTimeoutAndDistinctOrderIsolation` 测真实 `http.Client.Timeout` | 同一 Delivery ID 到达两次，业务唯一生效一次；两个订单不能串台 |
| 原版/新版视觉 | `web/e2e/w61-original-server.mjs` 只读服务原版 `src/www`；`w61-visual-pwa.spec.mjs` 1280×800 与 375×812 双模式截图，附 `comparison.json` 记录像素变化比例 | 不是“像素相同即通过”；需人工审阅差异与路由/布局 |
| 六语言与错误状态 | 复跑 W60 真实 Chromium 六语言、父子状态、只读 Hash、10010、不自动重发 | W60 只用被拦截的模拟 API |
| PWA | 读取原版 `manifest.webmanifest`、`registerSW.js`、`sw.js`；确认新 `web/` 开发页缺少对应 PWA 升级机制 | **同源生产 SW 升级 BLOCKED**，不在不同 localhost origin 下虚假验收 |
| 资产回滚 | `scripts/w61/rehearse-rollback.sh` 在随机临时目录复制旧站点与新版 `web/dist`，执行切换与回退并校验旧 SHA256 | 仅临时目录；真实 staging/prod 入口、DB 备份与 SW 清理仍 BLOCKED |

## 本轮验证原理

### MySQL 5.7 实际独立进程崩溃

`src/model/service/w61_mysql_process_test.go` 启动编译好的 Go 测试二进制作为另一个进程（相同严格隔离 `epusdt_w55_ci` MySQL 数据库）。父进程等待子进程完成以下 checkpoint，再发送 SIGKILL：

1. **未提交**：子进程在显式事务中写支付 claim 和订单状态，但没有 COMMIT；杀死连接后原始订单仍待支付、claim 为 0。只有显式重新核对 DB，才允许后续安全测试结算。此实验是 SQL 崩溃注入，不能声称生产结算内部一定在此行中断。
2. **已经 COMMIT、返回丢失**：子进程调用真正的 `settleOrderAtomicallyOnDB` 成功提交，然后模拟进程丢失响应；独立连接读取出支付与唯一 claim，再尝试同一 Hash，必须返回重复交易冲突，回调次数保持 0。绝不因“客户端没收到 OK”自动结算第二次。

连接 DSN 必须带 `/epusdt_w55_ci?`；测试启动前还会确认 `SELECT VERSION()` 为 MySQL 5.7。禁止生产 DSN。

### 商户回调

HTTP receiver 为 `httptest.NewServer` 本机地址，使用 `X-Epusdt-Delivery-ID` 去重；收到请求即记录一次业务效果，再模拟首次响应 503、重试 ACK 200。回调投递次数可能为 2，但商户业务效果只能为 1，不能变更已支付订单或重写 Hash。独立测试覆盖真实客户端超时与两个订单不同 Delivery ID；所有网络在测试机 localhost 内完成。

## 可执行命令

```bash
cd web
npm ci --no-audit --no-fund
npm run typecheck && npm run test && npm run build
npm install --prefix e2e --ignore-scripts --no-package-lock --no-audit --no-fund
./e2e/node_modules/.bin/playwright install chromium
./e2e/node_modules/.bin/playwright test --config e2e/playwright.config.mjs
node e2e/write-report.mjs

cd ../src
go test ./model/service ./model/data ./mq ./task ./model/dao ./controller/comm ./route -count=1
go test -race ./model/service ./model/data ./mq ./task -run '^Test(W54|W55|W60|W61)' -count=1
# MySQL 5.7 测试只能使用 W55_MYSQL_DSN=/epusdt_w55_ci；由 CI service 注入
go test ./model/service -run '^Test(W55MySQL57|W61MySQL57)' -count=1 -v

cd ..
bash scripts/w61/rehearse-rollback.sh
# 自动汇总只能取 Actions 内真实 job result，不可把 BLOCKED 写成 PASS
node scripts/w61/release-gate.mjs
```

## Actions 和文件证据

- Workflow: `.github/workflows/w61-preprod-acceptance.yml`，自动触发、没有写仓库和部署权限。
- `w61-chromium-visual-and-pwa`：Playwright JSON、HTML、原版/新版配对 PNG、比较 JSON、失败 trace。
- `w61-disposable-rollback-drill`：临时目录 SHA256 回滚演练结果。
- `w61-preproduction-pass-blocked-report`：自动记录各 Job 真正状态并固定标记未完成的真实外部验收为 BLOCKED 的 `W61-ACCEPTANCE.md` / `W61-ACCEPTANCE.json`。

## 发布判定

W61 代码与自动测试 Actions 全绿，只说明**隔离仿真与测试执行器完成**。真实链收据、OkPay 官方沙箱、独立商户接入、同源旧 PWA 升级、人工视觉签字、真实预发布回滚练习均为 **BLOCKED → NO-GO**。详见 [W61-RELEASE-RUNBOOK.md](./W61-RELEASE-RUNBOOK.md)。W31 不做，生产 `src/www` 不动，绝不自动部署。
