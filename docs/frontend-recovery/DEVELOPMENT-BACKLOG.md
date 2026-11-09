# web/ 前端恢复任务清单（第六轮）

> **当前状态（2026-11-10）**：W10～W16 的首轮代码、W20/W21 基础布局已落地，相关 Actions 编译及单元测试通过；浏览器对照/真实支付仍未完成，不能等同业务端到端验收。W14/W15/W16 详见本次交付记录。任务 ID 用于后续在 master 上按切片推进和追踪；建议一次提交一个完整切片，避免大范围一次性重构。开发顺序以 [DEVELOPMENT-ROADMAP.md](./DEVELOPMENT-ROADMAP.md) 为准。

## 2026-11-10：W14/W15/W16 第一批已实现并通过自动构建

- W14：原 CSS 的浅/深 OKLCH 语义 token、`theme` Cookie 365 天、首屏预设、跟随 `prefers-color-scheme`、主题控制。字体仍以 Inter/system fallback 为主；原版 font-provider 选择及实际字体切片尚待核实。
- W15：`en-US`、`zh-CN`、`zh-TW`、`ja-JP`、`ko-KR`、`ru-RU` 六语言，`PARAGLIDE_LOCALE` 40 天 Cookie、浏览器偏好回退、77 个**新编写**核心 UI 文案。尚非原版 Paraglide 全量消息源码还原。
- W16：Button、TextField、SelectField、Card、DataTable、Dialog、Toast、EmptyState、LoadingState；`/settings/appearance` 提供真实主题/语言切换与本地组件预览，示例数据非真实订单。
- [GitHub Actions #42659421942](https://github.com/yakun0622/epusdt/actions/runs/42659421942) 通过：TypeScript、Vitest **8 文件 / 25 项测试**、Vite 构建 **49 个模块**。
- 核心场景尚需 T25 360/768/1280px 浏览器截图对照，及主题/语言刷新、系统主题变化的真实浏览器回归。
- **下一阶段**：W30/W32 订单只读列表、分页筛选、详情与 CSV 文件下载；验收稳定后再实施 W31 高风险订单操作。

## 2026-11-10：W20/W21 第一批已实现

- W20（部分完成）：原版 JSON 序列化 `access_token` Cookie（SameSite=Lax/7d）、401 清理和登录回跳，真实 `/account/password` 修改密码表单；多标签同时失效、原版缓存行为及浏览器视觉尚未验收。
- W21（部分完成）：可复用 `AdminLayout`、桌面与移动导航、设置子导航、管理员退出、初始密码提醒；主题、六语言、原版组件级视觉仍待实现。
- Actions 运行 [#42655567335](https://github.com/yakun0622/epusdt/actions/runs/42655567335)：TypeScript、4 测试文件/13 用例、Vite Build **全部成功**。这不是浏览器 E2E 或支付验收。
- 下一批建议 W14 + W15：主题持久化、语言持久化与基础组件 token，再继续 W16 通用 UI 组件；收银台仍未开放。

## 首批开发状态

| 任务 | 当前状态 | 证明 |
|---|---|---|
| W10 | 已编码，未验收：浏览器 History 路由、受保护路由、登录回跳和测试原型；非完整 TanStack Router | web/src/app/routes.ts、use-browser-route.ts、routes.test.ts、main.tsx |
| W00 | 部分完成（静态基线检查；缺实测） | web/package.json、tsconfig、vite.config.ts 与 W00-W13-IMPLEMENTATION-REPORT |
| W11 | 已编码，未验收 | web/src/api/client.ts、api.ts、vite.config.ts |
| W12 | 已编码，未验收 | web/src/api/types/*、api/endpoints/checkout.ts |
| W13 | 已编码，未验收 | web/src/api/client.test.ts、api/types/payment.test.ts；尚未运行 Vitest |

**验收边界**：W10～W16 及 W20/W21 已有自动 typecheck/test/build 通过记录；真实浏览器视觉、网络 API 契约、支付链路和旧原版对照仍未验收。旧 W00-W13 的静态阶段记录为历史快照。

## M0｜基线和取证

| ID | 任务 | 依赖 | 源码/文档证据 | 完成判定 |
|---|---|---|---|---|
| W00 | 校验 Go / Vite 构建、Node 版本、当前 README 命令，记录基线 | 无 | `web/package.json`, `web/vite.config.ts` | `npm run typecheck/build` 实测记录；错误不隐瞒 |
| W01 | 固定旧 `src/www` 资源清单、Git SHA、SW 当前版本、回滚方案 | 无 | PWA-AND-RELEASE | 保留可追溯原始产物与发布方案 |
| W02 | 将接口证据中的未核实处建 fixtures/风险单 | W00 | API-CONTRACTS、VALIDATION-AND-GAPS | P0 契约空缺可跟踪 |

## M1｜基础工程，必须先完成

| ID | 任务 | 依赖 | 预期变更范围 | 验收 |
|---|---|---|---|---|
| W10 | 建立 file/path 路由、公共/后台边界和 Router Provider | W00 | `web/src/app/router*`, `layouts/*` | 路由与刷新/redirect，T01 |
| W11 | 分离 admin/public/download 三类请求客户端 | W00 | `web/src/api/client.ts` + 兼容出口 | HTTP/业务码处理、Blob CSV，T20/T28 |
| W12 | 完成 Go 核实 DTO、时间单位、状态枚举和类型守卫 | W11 | `web/src/api/types/*` | T03/T04/T22/T27 |
| W13 | 增加单元、接口契约测试底座和脱敏 fixtures | W11,W12 | `web/src/test/*`, npm scripts | 成功/失败可复现，不调用真实支付 |
| W14 | 恢复主题 token、字体选择与首屏初始化 | W00 | `web/src/theme/*`, `styles/*` | Light/Dark/System，T25 |
| W15 | 接入最小 i18n，建立六语 coverage 表与缺词 fallback | W10 | `web/src/i18n/*` | 登录、错误与收银台关键文案可切换 |
| W16 | 公共 Button/Form/Dialog/DataTable/Toast/Empty/Loading | W10,W14 | `web/src/components/*` | 组件各状态可复用、视觉可截图 |

**W11 注意**：现有 `web/src/api.ts` 只支持 `/admin/api/v1`；Vite 当前仅代理 `/admin/api`，公共页面尚不能直接连调 `/pay`、`/payments`。W11 需要更新开发代理，但不能改变 `src/www`。Token 旧版位于 Cookie，现有脚手架是 sessionStorage，需明确兼容/安全方案后迁移。

## M2｜认证 + 后台壳

| ID | 任务 | 依赖 | 主要验收 |
|---|---|---|---|
| W20 | 登录、用户缓存、401、初始密码提示、退出、改密 | W10,W11,W12,W15 | T01,T02,T28 |
| W21 | 后台侧栏、导航分组、顶部搜索/主题/语言、设置子导航 | W10,W14,W16 | T25；移动端下拉 |
| W22 | 公共错误页 401/403/404/500/503、loading/空态 | W10,W16 | 原路由刷新仍可访问 |

## M3｜可独立验收的后台核心

| ID | 任务 | 依赖 | 主要验收 |
|---|---|---|---|
| W30 | 订单分页列表、筛选、详情和列表缓存 | W11,W12,W16,W20,W21 | T22；16 列与可见性核对 |
| W31 | 订单关闭、链上手工验证补单、重发回调及确认弹窗 | W30 | T17,T18,T19 |
| W32 | 订单 CSV 原生文件下载、异常反馈 | W30 | T20；正确 Blob，不作 JSON 解包 |
| W33 | 钱包列表/添加/备注/启停/删除 | W11,W12,W16,W20,W21 | T22；网络/状态校验 |
| W34 | 钱包批量导入 + 逐行失败结果 | W33 | T21；HTTP 200 非全成功 |
| W35 | API Key 新建/修改/查看/轮换/禁用/统计/删除 | W11,W12,W16,W20,W21 | T29；敏感操作确认及不落日志 |

## M4｜配置、仪表盘及辅助页面

| ID | 任务 | 依赖 | 主要验收 |
|---|---|---|---|
| W40 | Chains/ChainTokens 表格、编辑、启停 | W11,W12,W16,W20,W21 | boolean 与数值 status 区分、Aptos 资产 ID |
| W41 | RPC 节点、URL/type/purpose 校验、健康检查 | W40 | 10020~10024；敏感 ApiKey 不打印 |
| W42 | System/Telegram/Pay/EPay/OkPay 设置 | W11,W12,W16,W20,W21 | settings batch partial failure、rate/status、JSON |
| W43 | Dashboard 概览、趋势、订单/RPC 统计及数据解释 | W11,W12,W16,W20,W21 | 不用假的 KPI；时间范围/空态测试 |
| W44 | appearance/display/notifications/integrations/help/install 页面 | W14,W15,W16,W20 | 演示型页面不擅自变真实 CRUD |

## M5｜公共收银台（最高安全门槛）

| ID | 任务 | 依赖 | 主要验收 |
|---|---|---|---|
| W50 | 收银台公共布局、公开配置、支付方式/网络/Token 列表 | W10,W11,W12,W14,W15,W16 | T03,T23 |
| W51 | 父单状态 4 原地补全和 1 创建子单、trade_id 路由更新 | W50,W13 | T05~T10 |
| W52 | 服务端时钟毫秒倒计时、5 秒轮询、失败次数和 10010 重取 | W50,W51 | T03,T14,T15,T27 |
| W53 | 交易哈希输入/验证结果、重复提交锁 | W51,W52 | T11~T13 |
| W54 | EPay 成功跳转中转、OkPay hosted URL、成功后 3 秒跳转 | W50,W51,W52 | T16,T24 |
| W55 | 全状态支付集成/竞态测试 + 公开响应脱敏 | W51~W54 | T04~T16、T23/T24/T27；不能真付测试 |

**明确的兼容差异**：旧 JS 将业务 10010 直接判定 `expired`，但 Go 表示状态冲突，W52 应主动刷新 status 再判断；这是刻意修正，不要求一比一保留缺陷。MaxSubOrders=1 是历史累计数量约束。

## M6 / M7｜完整回归与生产切换

| ID | 任务 | 依赖 | 主要验收 |
|---|---|---|---|
| W60 | 全路由/多语言/响应式原版对照与修复 | W20~W55 | T25；原 UI 截图差异逐项记录 |
| W61 | PWA/SW 缓存迁移与回滚演练 | W60 | T26；旧用户升级、缓存、离线 |
| W62 | 可重现发布构建、Go embed、Docker 与 SPA fallback | W60,W61 | 构建链、无 API HTML fallback |
| W63 | 29 项测试复核、发布签字、旧版可回滚 | W55,W62 | 所有 P0 通过并对剩余 P1 明确处置 |

## 每次实现提交模板

提交说明包含：

- 完成 Wxx ID，改动的 `web/` 路径；
- API 路径与 DTO 证据（链接到文档）；
- 通过的 `npm run typecheck`、`npm run build`、测试命令及实际结果；
- 新增/完成的 Txx 用例，证据链接；
- 未通过项与回滚方式；
- 明确声明是否动过 `src/www`、Go 和 CI。

**当前最新顺序**：W30 订单只读列表/分页/筛选/详情 → W32 CSV 下载 → W31 关闭/标记支付/重发回调（须先做安全测试），然后推进其余后台模块；未通过完整浏览器和支付回归前禁止替换 src/www。
