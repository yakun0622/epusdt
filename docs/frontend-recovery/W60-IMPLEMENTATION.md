# W60 · 隔离 Chromium 浏览器 E2E 与支付上线门禁

**目标：** 为恢复的 `web/` 页面、W50–W55 收银台与 Go 结算/回调链路提供可重复、可审计且**不会发起真实资金交易**的自动验收。以下“浏览器 E2E”是实际 Chromium 渲染与交互，但支付/管理 HTTP 接口通过浏览器路由全部模拟；这是**浏览器到 API 契约的隔离 E2E**，不是生产支付链端到端成功的证据。

## 运行范围与严格隔离

- 仅开发源码 `web/`、新 Playwright 测试、Go 测试、文档与 CI；**不修改生产 `src/www/`，不实施 W31，不部署**。
- Playwright 同时使用 1280px 桌面 Chromium 和 375px 触控移动 Chromium；视口额外检查 360/768/1280px，六语言 en-US/zh-CN/zh-TW/ja-JP/ko-KR/ru-RU。
- Vite 只监听 `127.0.0.1:4173`，其 Go 代理目标指向不可用本地 `127.0.0.1:1`；`web/e2e/sandbox.mjs` 在浏览器拦截所有 `/pay/**`、`/payments/**`、`/admin/api/v1/**` 请求，离开 localhost 的请求一律拒绝。
- 只有明确交互才允许发送测试隔离的 `/pay/switch-network`，以及**只读语义** `/pay/verify-tx-hash/:trade_id`。任何其他资金/供应商写入（特别是 `/pay/submit-tx-hash`）均被测试隔离层拒绝；后台不执行资产/订单/凭证的真实增删改。
- 每个隔离响应都提供与 Go DTO 相同的必要字段及 Unix 毫秒时间，主动注入错误码、过期/冲突、供应商账本矛盾和恶意 `paid: true` 附加字段，确保只有 Go SQL 的真实确认状态能被应用解释为成功。
- Go 测试使用临时 SQLite 主库与运行时库及不含真实私钥的模拟已验证链凭证；后续同一模拟输入经 **真正的 Go W54 主数据库事务**原子写入 `payment_tx_claim`、父子单和回调归属。MySQL 5.7 两个独立连接的集成用例仍运行在 Actions 的隔离数据库 `epusdt_w55_ci`。

## 浏览器验收覆盖

| 范围 | Playwright 断言 / 页面 |
|---|---|
| 管理认证 | 未登录访问受保护路径、登录/错误口令、JWT 失效/登出后重新鉴权、不可越权读取 |
| 后台核心页 | Dashboard、Orders、Wallets、Chains/Token、RPC、API Keys、Settings、Appearance、Password/Integrations 路由，主要标题和无危险写入 |
| W50 / W52 | 三 GET 新鲜快照、服务端 paid 双重一致确认、离线错误恢复、10010 不等于过期、真实 SQL 状态 3 才过期、客户端倒计时结束不造成功 |
| W51 | 占位单原地选择、已有父单只产生隔离子单、MaxSubOrders 语义和冲突提示、未知供应商结果阻断再次 POST，页面刷新不触发补单 |
| W52 父子 | 父单已有活动子单时隐藏父收款地址并打开子单，待支付/已支付/需对账展示 |
| W53 | 输入格式、双重确认、3 个 GET 预检查，**单次只读 Hash 验证**；反恶意 paid 字段、10007 防重、状态/支付目标竞态时 0 POST |
| W55 | 供应商本地 paid 与 SQL 矛盾为需对账，OkPay 托管付款 URL（可能携带令牌）不显示、不打开；后台敏感配置不得显示 |
| 视觉/语言 | 6 语言真实切换、移动和桌面 Chromium、360/768/1280px 截图、水平溢出阈值 ≤2px、Hash/托管付款/敏感信息不泄露 |

## 自动验证和可追溯产物

W60 自动工作流：`.github/workflows/w60-isolated-e2e.yml`，对 `master` 及唯一 `feat/w60-...` 分支的相关变更自动触发，**无需手动 dispatch**：

| Job | 必须满足的验收 |
|---|---|
| scope | `git diff` 没有修改 `src/www/`、W31 admin 资金处理文件、发布/部署 workflow 或构建产物 |
| web | `npm ci`、`npm run typecheck`、`npm run test`（原 122 Vitest 用例）、`npm run build` 全部通过 |
| browser | 真实 Chromium 的桌面/手机 **至少 50 次执行**，0 unexpected failure、0 flaky、0 skip；失败即阻断 |
| go | `go test ./model/service ./model/data ./mq ./task ./model/dao ./controller/comm ./route -count=1`；W54/55/60 `go test -race` |
| mysql57 | 服务容器 MySQL 5.7 + 两独立数据库连接，`TestW55MySQL57` 模拟跨进程唯一交易归属、商户回调租约并验证重复 schema 迁移 |
| acceptance | 所有上游 job success 才 success；每个门禁状态与浏览器 JSON 原始结果留存 |

GitHub Actions `w60-playwright-acceptance` 包含 `web/e2e/playwright-results.json`、HTML 报告、失败 trace/截图以及自动生成的 `W60-BROWSER-RESULTS.md`；`w60-ci-release-gate` 含各 Job 实际状态汇总。以上不是人工编写的虚构成绩；应查看**对应 run 的 artifact 与 GitHub success**，才能标记运行通过。

### 本地 / CI 执行命令

```bash
cd web
npm ci --no-audit --no-fund
npm run typecheck
npm run test
npm run build
npm install --prefix e2e --no-package-lock --ignore-scripts --no-audit --no-fund
./e2e/node_modules/.bin/playwright install chromium
./e2e/node_modules/.bin/playwright test --config e2e/playwright.config.mjs
node e2e/write-report.mjs

cd ../src
go test ./model/service ./model/data ./mq ./task ./model/dao ./controller/comm ./route -count=1
go test -race ./model/service ./model/data ./mq -run '^Test(W60|W55|W54)' -count=1
```

本地 Playwright 默认会启动 4173 Vite 进程；任何 API 漏截请求都会打到不可达端口 1 并失败，**不可把 `EPUSDT_BACKEND` 改成生产支付网关**。

## P0 发布阻断条件（即使 W60 Actions 全绿）

1. 使用真实测试网络与**自有**测试商户接收端进行支付回调（含超时/重放与稳定 Delivery ID 去重）验收；严禁在本次自动测试调用主网或商户生产 URL。
2. OkPay 官方沙箱/测试账户端到端：签名、金额精度、供应商订单 ID 唯一性、创建结果未知时的回查、成功/重复/迟到通知；无沙箱时保留阻断项，不用“伪造 paid”替代。
3. 用隔离环境验证部署态 MySQL 5.7 在进程崩溃、事务提交未知、RPC 挂起和断网期间的恢复以及前后端状态对账；现有同进程双连接测试不等于多进程断电实验。
4. W31 高风险手工订单动作仍未恢复。需要产品/安全负责人独立审批；不得随 W60 顺便启用。
5. 与原 `src/www` 进行 UI 截图和移动端视觉对照，验证已知 W60 测试覆盖不了的 PWA、回跳 URL 和真实第三方界面。必须正式制定回滚方案并经过人工发布批准。
6. 只有上线闸门全部关闭后才能考虑迁移 `web/` 产物；本阶段**绝不修改 `src/www`，绝不自动部署**。

**定义：** W60 自动绿灯证明“隔离浏览器+数据库+契约回归可重复”，**不构成生产支付收单的最终上线许可**。
