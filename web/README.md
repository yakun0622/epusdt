# GMPay / Epusdt Web 源码恢复工程

> 新源码位于 `web/`，仍在逐步替代原编译 UI。当前 Go 正式嵌入的 `src/www/` 保持原样，**不要直接把 web/dist 部署为真实收银台**。

## 本地启动

需要 Node.js 22（Actions 使用此版本）。

```bash
cd web
npm ci
npm run typecheck
npm run test
npm run build
EPUSDT_BACKEND=http://127.0.0.1:8000 npm run dev
```

`EPUSDT_BACKEND` 指向 Go 后端，Vite 已代理 `/admin/api`、`/pay`、`/payments`。构建输出只在 `web/dist`。

## 当前进度

- W10–W13：原版浏览器路径映射、JWT/公共支付请求分离、Go DTO/支付时间类型、基础 Vitest。
- W20/W21（第一批）：原版 `access_token` JSON Cookie、登录、修改密码、退出和基本后台/设置布局。
- W14：Light / Dark / System，原 CSS 语义色与 Cookie/系统主题持久化，首屏防闪烁。
- W15：六语言（en-US、zh-CN、zh-TW、ja-JP、ko-KR、ru-RU）和 77 个新编写核心翻译键、语言 Cookie。
- W16：通用 Button、Input/Select、Card、DataTable、Dialog、Toast、空态/加载态，`/settings/appearance` 可预览。
- W30/W32：真实只读订单表格、分页/筛选、详情弹窗与 CSV Blob 导出；配套 Go 独立最多 10,000 条导出查询修复。W31 订单资金/回调操作**未实施**。
- W33/W34：`/addresses` 已接入真实钱包列表、网络/status/关键词筛选、新增、备注更新、状态启停、需键入地址确认的软删除、批量导入及 **HTTP 200 内逐项失败**展示/失败项重试。无私钥导入。
- W35：`/keys` API Key 列表、创建/编辑/启停/使用统计/显式密钥查看/轮换/删除；敏感值临时遮蔽展示，后台 secret 响应禁缓存头，包含风险确认。
- W40/W41：`/chains` 网络与 ChainToken 的列表/编辑/启停、Token 新增/删除；`/rpc` 节点列表/新增/编辑/启停/删除/健康检查，RPC 新列表服务端 URL 脱敏，凭证不显示/不存浏览器存储。
- W42：五种配置页面及 `rate/status` 缓存状态与确认式手动刷新；批量 PUT 逐项结果、凭证隐藏、URL 脱敏、错误重试。
- W43：`/dashboard` 实际概览、订单统计/日小时趋势、RPC 进程快照，禁用虚假 KPI 和跨币种收入汇总展示。
- W44：Display 品牌只读预览、Notifications 实际 Telegram 渠道与脱敏、Integrations 真实接入状态只读页、Help 文档、Install 只读说明。Webhook/Email 暂无发送器。
- W50：公共 `/cashier/:trade_id` 只读订单信息、最新状态二次校验、到期时间与链上收款信息安全展示；仅调用 `/pay/checkout-counter-resp/:trade_id` 和 `/pay/check-status/:trade_id` 两个 GET，不发起支付或创建订单。
- W51：公开 `/payments/gmpay/v1/config` 支付方式矩阵，链上 Token/网络和 OkPay 选择；`/pay/switch-network` 显式确认+单次提交、竞态前后复核，父单最多一子单，未知供应商响应阻断重试。新增 Go `can_switch` 与 OkPay 防重复创建；不自动打开供应商链接。
- W52：真实只读 `/pay/reconcile-status/:trade_id` 本地订单/OkPay 账本关联状态；收银台三 GET 验证、5 秒轮询及网络失败退避、活动子单跳转、服务器未确认到期或付款时保持待核实。

当前 Dashboard 已使用真实 Go 接口展示订单/RPC 指标；`/orders` 是只读订单表格/CSV，`/addresses` 已恢复钱包管理，System/Telegram/Pay/EPAY/OkPay 配置页已接入。支付方式切换/链上回调完整流程、PWA 与旧 UI 像素级对照尚未完成。外观预览演示数据不是真实商户数据。

## Actions 编译

`master` 的 `web/**` 变更（仅 lockfile 除外）自动触发 `Web build verification`；也支持手动触发。流程执行 `npm ci`、`typecheck`、Vitest、Vite build；全部通过后才可能更新 `web/package-lock.json`。**不会部署或覆盖 `src/www`**。

最新验证：[Actions #42792271770](https://github.com/yakun0622/epusdt/actions/runs/42792271770)：TypeScript、28 个测试文件/80 项用例、Vite 构建通过；另有 Go Dashboard/Settings 安全专项工作流。浏览器端 E2E 尚未执行。

## 文档和后续

- 逆向文档总入口：`docs/frontend-recovery/README.md`
- 开发顺序：`docs/frontend-recovery/DEVELOPMENT-ROADMAP.md`
- 当前任务：`docs/frontend-recovery/DEVELOPMENT-BACKLOG.md`
- W14/W15/W16 交付报告：`docs/frontend-recovery/W14-W16-IMPLEMENTATION.md`

**下一步建议 W44**：Display、Notifications、Integrations、Help、Install 辅助页面，以真实 API 能力为准且默认只读；W31 订单关闭、人工补单和回调重发仍须独立安全验收。

## 安全边界

JWT 存储为浏览器可读 Cookie，是原版行为，不提供 HttpOnly 保护。正式部署前需完成浏览器安全验证、密钥审计、支付状态模拟与回滚演练。

## W30/W32 交付记录

详见 `docs/frontend-recovery/W30-W32-IMPLEMENTATION.md`。前端自动编译与 Go 205 条 CSV 回归测试已通过；浏览器真实联调、日期/时区及 10,000 条边界尚待验证。`web/dist` 不会替换 `src/www`。

## W33/W34 钱包管理交付记录

详见 `docs/frontend-recovery/W33-W34-IMPLEMENTATION.md`。支持同一 Go 契约的新增/修改/启停/删除及逐项批量结果；当前后端软删除未检查有无进行中的支付或锁，UI 已要求键入地址确认。真实联调与影响评估仍是正式部署前的验收门槛，生产 `src/www` 未变。

## W35 密钥管理交付

详见 `docs/frontend-recovery/W35-IMPLEMENTATION.md`。前端只把密钥短暂保留在内存与临时弹窗，不写浏览器存储、日志、URL 或剪贴板；服务端数据库仍需保存真实密钥以完成签名验证。轮换和删除前务必评估商户与历史订单回调影响，当前尚无真实后端联调或生产发布。

## W40/W41 网络与 RPC 交付

实现记录：`docs/frontend-recovery/W40-W41-IMPLEMENTATION.md`。RPC 服务器列表 `?redact=1` 隐藏凭证和 URL 的路径/查询参数；Go 的 `api_key` JSON 字段不再输出，旧编译页面编辑空密钥默认保留原值。原版浏览器及测试后端联调尚待完成。

## W42/W43 设置与 Dashboard 交付

详见 `docs/frontend-recovery/W42-W43-IMPLEMENTATION.md`。五类配置、按键部分失败反馈、敏感字段和 URL 脱敏、真实订单/RPC 指标以及 MySQL 5.7 聚合兼容。W31 与生产 `src/www` 未修改，实际浏览器/数据库/支付联调仍是发布门槛。

## W44 辅助页面与新合并流程

详见 `docs/frontend-recovery/W44-IMPLEMENTATION.md`。从 W44 起每个任务只建一个临时分支，分支 Actions 全绿后 squash 合并 master 一次，最后清理临时分支。Webhook/Email 无发送器、Install 无安装 API，页面不会承诺可用；生产 `src/www` 不变。

## W50 公共收银台只读交付

实现报告：`docs/frontend-recovery/W50-IMPLEMENTATION.md`。订单状态 1/2/3/4 来自真实 Go API，当前状态和初始化必须分别读取并匹配；秒/毫秒严格区分，无效状态及到期订单不再显示付款目标。第三方支付链接不打开，收银台只显示已核实的代币、网络、地址与数量。最新分支验证：[Actions #42798556680](https://github.com/yakun0622/epusdt/actions/runs/42798556680)：32 个测试文件/93 项测试、TS 和 Vite Build 成功。实际支付、网络切换及订单写入保留给后续 W51–W55；W31 和生产 `src/www` 不改。

## W51 支付方式和网络切换

见 `docs/frontend-recovery/W51-IMPLEMENTATION.md`。W51 起收银台有用户明确确认的 `/pay/switch-network` 写接口，可能预留地址或创建真实 OkPay 订单；与 W50 的只读限制不同。注意 `MaxSubOrders=1`、父/子单 `trade_id` 变化、第三方链接不自动跳转以及业务错误码 10010 仅表示状态冲突。需要生产级联调和运维对账能力才可上线。W31 不实施，`src/www` 保持不变。

## W52 支付状态对账与轮询

详见 `docs/frontend-recovery/W52-IMPLEMENTATION.md`。OkPay 对账仅与本地已经记录的通知/订单状态对照，不是外部供应商实时查单，也不会重试创建供应商订单或自动补单。支付状态必须由 Go 的 SQL 订单结算及父子归属决定；错误码 10010 是状态冲突，不能冒充超时。开发测试和构建通过后仍不能直接发布收银台，需真实浏览器、回调、网络和资金安全验收。W31 不实施，生产 `src/www` 不变。
