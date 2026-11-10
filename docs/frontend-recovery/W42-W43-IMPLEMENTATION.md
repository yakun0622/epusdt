# W42/W43 设置管理与真实 Dashboard — 实施报告

日期：2026-11-10；仓库：`yakun0622/epusdt`，直接提交 `master`，不新建分支或 PR。没有替换生产 `src/www`、没有发布新前端、没有实施 W31 订单危险操作。

## W42：按真实 Go 契约恢复五类设置

- 浏览器路径：`/settings/system`、`/settings/telegram`、`/settings/pay`、`/settings/epay`、`/settings/okpay`，根 `/settings` 落地系统设置。
- `GET /admin/api/v1/settings?redact=1` 读取真实数据库配置。服务端和前端分别排除 `system.jwt_secret`、初始化密码凭证、`system.telegram_bot_token`、`okpay.shop_token`。已配置 URL 仅返回并展示 scheme+host(:port)，不把 URL 路径、查询参数、userinfo 作为默认回显；因此需要修改 URL 时应重新填写**完整**地址。
- `PUT /admin/api/v1/settings`：请求 `{items:[{group,key,value,type}]}`，一次仅提交实际修改过的字段。bool 为 JSON 布尔值，int 为数字，json 为对象格式的 JSON 字符串，文本为字符串；`rate.adjust_percent` 保持字符串浮点配置，符合后端 Setting.Type 类型范围。
- 支持主要 `system` 超时（分钟）、精度 2–6、日志级别；Telegram Bot Token/Chat ID 与支付成功、异常通知布尔配置；Pay 中 rate+brand 配置；EPAY 默认 token/currency/network；OkPay 启停、商户标识、签名 token、API 与回调地址、超时和允许币种。
- 敏感凭证输入模式为**保留、替换、显式清除**；清除要求额外复选确认。旧凭证永远不进入新页面表单，写入成功或失败都从 React state 清除输入，不写 console/localStorage/sessionStorage/URL/剪贴板。
- **HTTP 200 不等于全部成功**：逐条核对后端 `[{key,ok,error_code?,error?}]`，错位、缺项、额外结果都按失败处理。成功数和失败数逐项展示；只有失败的非敏感字段会被标记为待重试，敏感字段必须重新填写，避免自动重放凭证。
- `/settings/pay` 增加汇率缓存状态（`GET /settings/rate/status?redact=1`）及确认后手动刷新（`POST /settings/rate/refresh`）。按 base currency 显示缓存汇率与刷新成功/失败；请求失败不假装成功，未提供的错误文本不回显可能含凭证的 API URL。外部汇率请求可能产生费用，不做后台自动刷新。
- Go `RateStatus` 和 `ListSettings` 新增 `redact=1` 兼容模式：原编译 UI 的未带该参数请求保留原路径行为，新 UI 仅接收脱敏源 URL、错误字段。Go Telegram 集成仅在对应设置**实际成功写入**后重载，避免批量中失败项误触发 reload。

## W43：真实指标与 RPC 状态

- `GET /dashboard/overview?range=today|7d|30d|custom`：真实订单数、成功率、时间范围内使用过的地址数、已启用链数量；附带 7 天/总量原始字段但不会冒充统一币种 KPI。
- `GET /dashboard/order-stats`：成功支付订单、超时未支付、平均支付耗时（**秒**）。成功率为后端 0–1 小数，前端显示为百分比；无订单时显示 “—” 而不是构造 0% 成功率。
- `GET /dashboard/revenue-trend`：真实分日/分小时订单数量和已支付数量，按服务端窗口切换；前端不将跨币种的 `total_amount`、`actual_amount` 视为统一币种收入。
- 已修复 Go `statsBucketExprForDialect` 的 MySQL 5.7 聚合：以 `DATE_FORMAT(created_at, '%Y-%m-%d')` 和小时格式实现（日/小时）。
- `GET /dashboard/rpc-stats/snapshot`（新增，受管理员认证保护，`Cache-Control:no-store`）返回真实进程内 RPC 统计快照；原 `/dashboard/rpc-stats` SSE 保留。展示每条链的 status、成功/失败次数、区块高度和上次同步时间。后端进程重启会重置统计；无样本时显示 “暂无采样”，不是假定成功率 0%。
- 将 Dashboard 原来的 JSON 预览占位替换为真实数据面板；三个统计请求和 RPC 状态分别显示加载、异常、无数据或实际数值，不能把请求失败当 0；支持 today/7d/30d/custom 以及手动刷新。

## 修改文件

- 前端 API：`web/src/api/endpoints/settings.ts`、`dashboard.ts` 及对应 Vitest。
- 前端页面：`web/src/features/operations/settings-page.tsx`、`rate-cache-panel.tsx`、`dashboard-page.tsx`、`i18n.ts` 及其测试；`web/src/main.tsx`、`web/src/style.css`。
- Go：`src/model/data/settings_data.go`、`order_data_stats.go`；`src/controller/admin/settings_controller.go`、`dashboard_controller.go`；`src/route/router.go` 和定向 Go 测试。
- CI：`.github/workflows/dashboard-settings-security.yml` 只在相关 Go 文件 push 或手动触发时运行，未配置任何部署动作。

## 验证与已知边界

- [Web Actions #42792271770](https://github.com/yakun0622/epusdt/actions/runs/42792271770)：TypeScript、Vitest **28 文件 / 80 测试**、Vite 生产构建均通过。
- [Go Dashboard/Settings 安全工作流](https://github.com/yakun0622/epusdt/actions/workflows/dashboard-settings-security.yml)：涵盖敏感 Token 过滤、MySQL 5.7 日/小时聚合、汇率 URL 脱敏、原有控制器及新增 RPC JSON 路由可编译；最终运行结论以 GitHub Actions 为准。
- **尚未完成**：真实登录浏览器的多语言与响应式对照、真实 MySQL 5.7 数据集成、外部汇率供应商生产环境测试、Telegram 通知实发、OkPay/EPAY 回调验收、支付端到端回归。已有单元测试和构建不等同于业务发布验收。
- 混合币种金额加总没有共同单位，Go 的 `total_asset/volume/seven_day_volume` 目前不适合直接写成“总资产/营收”；此轮主动不展示这些不可靠金额 KPI。
- 虽然新 UI 不显示凭证明文，旧版原始未脱敏接口仍为兼容保留，服务器数据库、运维日志、第三方代理、浏览器开发工具的安全性仍需单独审核；未来生产切换后应缩减兼容面。

## 下一阶段

**W44**：恢复 `/settings/display`、`/settings/notifications`、`/payment-setup/integrations`、`/help`、`/install` 等辅助页面。展示类功能应只读，除非 Go 有真实且安全的接口；不擅自创建/修改通知凭证，也不实施 W31。后续 W50–W55 再推进公共收银台与支付状态完整链路。
