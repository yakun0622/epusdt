# Epusdt 前端源码恢复：M1/M2 初始基线

## 仓库和边界

- 目标仓库：yakun0622/epusdt，分支 master。
- 新源码目录：`web/`；原 Go 项目：`src/`。
- `src/www` 为旧前端编译产物，必须保持原样直到替换验收。
- Go `src/main.go` 使用 `//go:embed all:www`，启动后解压静态文件；正式切换需验证 SPA fallback 和缓存。
- 目录检查发现 205 个 `src/www/assets` 文件，未发现 .map；这不等于彻底证明没有可用 source map（仍需排查历史提交及线上响应）。

## 逆向初步映射（已确认文件名，行为有待进一步验证）

| 编译模块 | 可能页面 / 模块 | Go API 基线 |
|---|---|---|
| auth-store / sign-in | 登录认证 | /admin/api/v1/auth/login, /auth/me, /auth/logout |
| dashboard | 仪表盘 | /dashboard/overview, /dashboard/asset-trend, /dashboard/revenue-trend, /dashboard/order-stats, /dashboard/rpc-stats, /dashboard/recent-orders |
| orders | 订单管理 | /orders, /orders/export, /orders/:trade_id, /orders/:trade_id/close, /orders/:trade_id/mark-paid, /orders/:trade_id/resend-callback |
| addresses | 钱包管理（推测） | /wallets, /wallets/:id, /wallets/batch-import |
| keys | API Key 管理 | /api-keys, /api-keys/:id/rotate-secret, /api-keys/:id/stats |
| chains | 网络及代币 | /chains, /chain-tokens |
| rpc | RPC 管理 | /rpc-nodes, /rpc-nodes/:id/health-check |
| settings | 系统设置 | /settings, /settings/rate/status, /settings/rate/refresh |
| notifications | 通知渠道 | /notification-channels |
| _trade_id / pay / epay / okpay | 收银台（待核实） | /pay/check-status/:trade_id, /pay/switch-network, /pay/submit-tx-hash/:trade_id |

以上右列是从 Go 路由提取的**后端可用端点**，不能据此断言旧前端每一个端点都已接入。

## 里程碑

1. M1：批量分析打包 JS、CSS，输出全部路由/页面/请求/翻译、功能覆盖表（待完成）。
2. M2：可独立编译的 React+TS+Vite，登录、JWT、基础布局（脚手架已落地，待运行验证与按原版还原）。
3. M3：恢复后台全部 CRUD 与行为测试。
4. M4：恢复收银台，支付状态、网络切换、超时和返回流程测试。
5. M5：改进前端构建和 Go/Docker 多阶段编译；验证静态资源回退。
6. M6：逐页与原产物对照并通过回归后，替换默认 `src/www`。

## 验收要求

- `npm run typecheck && npm run build`。
- 登录成功、错误凭据、过期/失效 JWT、退出、刷新场景。
- 前后端响应结构及 HTTP/业务错误码一致。
- 收银台端到端回归须使用测试地址和测试订单；支付关键操作要验证幂等与状态同步。
- 新前端切换前保留旧产物及可回滚提交；不自动触发额外 CI。

## 风险 / 当前已知缺口

- 现在的 Dashboard/Orders 仅为只读 API JSON 预览，不是最终页面。
- 尚未验证 Vite 开发代理连接真实后端，也尚未运行 Node 工具链。
- 原始 UI 的完整组件树、翻译、交易状态及缓存行为需要进一步取证。
- 需确认前端编译产物及其中第三方资源的许可适用范围。
