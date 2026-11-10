# web/ 前端恢复任务清单（第六轮）

> **当前状态（2026-11-10）**：W10～W16 的首轮代码、W20/W21 基础布局已落地，相关 Actions 编译及单元测试通过；浏览器对照/真实支付仍未完成，不能等同业务端到端验收。W14/W15/W16 详见本次交付记录。任务 ID 用于按切片推进和追踪；从 W44 起每个大任务一个临时分支，先在分支通过自动验证，再 squash 一次合并 master 并清理分支。开发顺序以 [DEVELOPMENT-ROADMAP.md](./DEVELOPMENT-ROADMAP.md) 为准。

## 2026-11-11：W53 链上交易 Hash 只读验证（不结算）

- 新公共只读语义 `POST /pay/verify-tx-hash/:trade_id` 只验证链上证据，不改变 SQL 支付状态。原 `submit-tx-hash` 是真实结算路径，W53 前端绝不调用。
- 三 GET 新鲜快照、支付目标一致性和一次显式确认后仅执行一次验证；10010 为冲突非过期，10007 为已使用，未知请求结果只能 GET 刷新。
- Go 补齐状态、父子订单、重复交易和竞态拒绝测试；Web 补齐输入、单次请求和反虚假成功测试。
- 原结算流程仍有父子单非原子与跨进程 Hash 去重缺口，需要 W54/W55 安全加固才能上线；W31 与生产 src/www 不动。

## 2026-11-11：W52 真实状态轮询与安全关联对账

- 只读 Go `GET /pay/reconcile-status/:trade_id` 返回 root/related order 的实际状态、支付确认标志、对账冲突标志、供应商本地 ledger 分类和毫秒时间戳，绝不向外部供应商查询/购买/结算，也不把 provider paid 单独当已到账。
- 公共收银台由双 GET 升级为三 GET：详情、最新状态、关联对账信息一致才展示付款目标；状态 2 必须服务端结算并与父子关联相符；10010 是状态冲突并非到期。
- 付款轮询每 5 秒；读失败退避 10/20/40/60 秒；恢复网络/页面可见时重新读；过期时间到但 Go status 尚未变 3 时显示待核实，不假定数据库已过期。
- 父单已有活跃子单时不展示旧父单收款地址，而是打开该子单重查；父/子/OkPay 状态矛盾或供应商创建结果未知时阻断转账指引，人工对账。
- 已增加 Go 数据库安全测试和 Web 显示/竞态/错误码/轮询测试，原支付链下单、回调和补单路径不更改。
- 尚未实测 OkPay 外部查单/付款及支付链路 E2E；生产 `src/www` 未触碰，W31 保持不实施。下一阶段 W53 审计交易 Hash 校验和防重放。

## 2026-11-10：W51 支付方式/币种/网络选择已实施

- Go `GET /payments/gmpay/v1/config` 实际支持矩阵：chain+token 必须可支付且有钱包，OkPay 仅在 enabled 且 allow_tokens 明确列出的情况下可选择。API 白名单去掉 shop_token、商户 URL 等内部字段。
- `POST /pay/switch-network` 仅由用户显式确认后执行一次。发送前双 GET 重新核验订单、状态、有效期与目标；失败/未知不自动重发。Go 返回子单则跳转该 trade_id 并重新核验，不能沿用旧父单地址。
- 严格父子订单和 MaxSubOrders=1；Go 为收银台附加 `can_switch`，已支付/过期、子单和 OkPay 父单禁选。
- OkPay `receive_address=OKPAY` 不是真实 tron 地址；服务端和前端均保护，第三方付款 URL 不写入前端状态、不回显、不自动跳转。
- 对状态 4 的 OkPay 创建采用唯一插入；已有供应商创建记录，即使本地状态 failed 也阻断再次外部采购，先人工对账；日志不记录完整切换响应。
- 已添加 Go 专项测试与 Web TS/Vitest/构建自动验证。未做真实主网付款、多实例并发/供应商全链路 E2E；生产 `src/www` 不动，W31 暂缓。
- 下一阶段 **W52**：服务端支付状态与多单/供应商对账，过期、并发冲突及错误码处理。

## 2026-11-10：W50 公共收银台真实只读恢复完成

- 恢复 `/cashier/:trade_id`：公共订单初始化 `GET /pay/checkout-counter-resp/:trade_id` 与最新支付状态 `GET /pay/check-status/:trade_id` 双重校验、15 秒轮询、主动刷新与不可验证错误态。
- 明确状态 1（待付款）、2（已支付）、3（已过期）、4（等待选择币种和网络），占位状态不展示虚假地址或金额；当前订单失效或到期后隐藏转账信息。
- `amount` 是法币，`actual_amount` 是代币；Go 收银台时间戳均毫秒，创建交易到期秒数禁止混用；使用服务器时间和单调钟显示剩余时间。
- 支付提供商 `payment_url` 和商户 `redirect_url` 可能包含令牌，只有布尔“是否存在”进入前端状态，不暴露链接；不自动跳转或执行资金写操作。
- 只调用两个公共 GET，无管理员 JWT。严格拒绝无效交易号、类型、时间、金额或不一致状态。六语言安全提醒。
- [分支 Actions #42798556680](https://github.com/yakun0622/epusdt/actions/runs/42798556680)：32 文件/93 项测试、TS/Vite 全通过。
- 未执行生产真实付款/数据库 E2E。W31 订单危险操作不实施，生产 `src/www` 不更改；下一轮 W51 需单独验证网络选择写入的父子单限制与幂等性。

## 2026-11-10：W44 辅助页面已实施

- Display：本地主题和语言选择，服务端品牌字段只读预览，变更跳转 W42 Pay 设置。
- Notifications：使用 Go 真实通知渠道 API，Telegram 支持新增、名称/事件修改、状态、凭证整体替换及软删除，显示风险确认。Webhook/Email 无实际发送器时只读，不假冒可投递。
- Go 新 `?redact=1` 渠道安全 DTO；新 UI 和 Go 两层字段投影避免 config、Bot Token、Webhook Secret 回显。凭证仅在当前弹窗内暂存，保存后或失败后清除。
- Integrations：从安全 API 读取 EPAY/GMPAY/OkPay/Network 配置概况，非真实交易或回调验收；Help：仓库文档与安全提示；Install：公共只读安装说明（无安装 API），不提供隐式建表或凭证重置。
- 新增 `feat/**` 自动 Web Actions 分支验证，Go 敏感 DTO 专项 CI，按“一个 Wxx 大任务 → 一个临时分支 → 分支验证 → squash 一次合并 → 删临时分支”的流程。
- W31 危险订单操作不触碰，`src/www` 不更换。下一阶段 W50 收银台支付状态与网络切换。

## 2026-11-10：W42/W43 五类设置与真实 Dashboard 已实现

- W42：`/settings/{system,telegram,pay,epay,okpay}` 五类页面，依据真实 Go setting type 构建表单，只保存修改项；Telegram/OkPay 凭证不回显、写后清空；HTTP 200 per-key 失败/错位/缺失明确报告；Pay 汇率缓存状态及需确认的手动刷新，按基准币种展示部分失败。
- 服务端 `?redact=1` 控制设置 URL 和汇率 API URL/错误详情脱敏；Go 列表过滤敏感 token，更新失败的 Telegram 配置不会触发 Bot reload。老编译前端仍保留兼容读取路径。
- W43：`/dashboard` 改为真实概览、订单统计、日/小时订单数趋势以及可认证读取的 RPC 进程快照。成功率 0–1 → 百分比，平均付款耗时单位秒，无样本显示未知。跨币种 `actual_amount` 不能作为“统一收入”，故不展示误导性金额 KPI。
- 修复 Go MySQL 5.7 `DATE_FORMAT` 日/小时聚合和 Dashboard SQL 错误被忽略的问题，防止查询失败被误报为零。
- Web [Actions #42792271770](https://github.com/yakun0622/epusdt/actions/runs/42792271770) 已通过 28 文件/80 测试、TS/Vite。Go 专项测试见 `dashboard-settings-security.yml`。
- 未执行实际浏览器/数据库/支付链路联调。**W31 不实施**，生产 `src/www` 保持原样。
- 下一轮 **W44**：外观以外的 Display/Notifications/Integrations/Help/Install 辅助页面，先确认真实 API 及只读安全边界，再推进 W50 收银台。

## 2026-11-10：W40/W41 Chain、Token、RPC 管理已实现

- **W40**：`/chains` 真实网络列表和更新（仅 `GET /chains`、`PATCH /chains/:network`；Go **没有**链的创建或删除接口），编辑名称/确认数/扫描周期和布尔启停；按网络过滤 ChainTokens，支持新增、编辑、`POST /chain-tokens/:id/status` 布尔开关、需输入币种符号确认的软删除。Aptos 启用代币必须填写 Move 资产 ID。
- **W41**：`/rpc` 节点列表、网络筛选、新增、编辑、布尔启停、需输入节点 ID 确认的软删除和 `POST /rpc-nodes/:id/health-check`。Go `status` 是 `unknown|ok|down` 字符串而非 `enabled`；当前健康检查仅为 TCP 连通性探测，并非链节点同步或支付能力验证。
- RPC 安全：`RpcNode.ApiKey` 使用 `json:"-"`；新列表请求 `GET /rpc-nodes?redact=1`，后端只返回 scheme+host(:port)，不返回 URL 路径、query 或 userinfo；前端再次采用白名单映射，不把原始 `url` 或 `api_key` 留在列表 state/持久存储或日志。编辑表单凭证和 URL 默认留空，需手动覆盖；`clear_api_key:true` 才显式清除，原版页面编辑提交空 `api_key` 不再误清密钥。
- W40/W41 支持独立加载、错误/重试、写入后重新读取数据以及确认弹窗；新编写的六语言核心模块词条已接入现有 Light/Dark/System 主题。
- [前端 Actions #42781772440](https://github.com/yakun0622/epusdt/actions/runs/42781772440) 成功：TypeScript、Vitest **22 文件/63 测试**及 Vite Build。最新 Go 安全专项测试见 `rpc-secret-security.yml` 工作流。
- **W31 始终未实施**；生产 `src/www` 未改、未发布新前端。
- **下一阶段 W42/W43**：System/Telegram/Pay/EPay/OkPay 设置及 Dashboard 真实概览；重点保护 Telegram、EPay、OkPay 等敏感配置，准确区分只读/可编辑配置与统计数字单位。

## 2026-11-10：W35 API Key 管理与密钥保护（首批完成）

- 真实 `/keys` 页面：`GET /api-keys` 数组列表、前端名称/PID 查询、创建、编辑 name/ip_whitelist/notify_url、状态 1/2、使用统计、按需查看 secret、轮换、软删除。
- PID 全由后端自动分配，EPAY/GMPAY 通用。数据契约 `web/src/api/endpoints/api-keys.ts` 对列表做白名单字段投影，绝不把意外返回的 `secret_key` 收进列表对象。
- 敏感操作：查看需确认后才调用 secret GET；轮换/删除要输入目标 PID 才能执行；删除明确警告可能破坏已有订单回调，轮换立即使旧凭据失效。新 secret 在独立弹窗默认遮蔽，60 秒/页面退到后台/关闭时清理内存引用，无 localStorage/sessionStorage/URL/日志/自动剪贴板写入。
- 创建、查看、轮换请求设置 `cache:'no-store'`；Go 创建/查看/轮换三个响应增加 `Cache-Control: no-store, private, max-age=0` 等禁缓存头。**服务端数据库仍需持久保存 secret 用于签名验证**，不能理解为服务器不存密钥。
- [Web Actions #42771312689](https://github.com/yakun0622/epusdt/actions/runs/42771312689)：TypeScript、Vitest **17 文件/52 测试**及 Vite 构建通过。
- [Go Actions #42771397026](https://github.com/yakun0622/epusdt/actions/runs/42771397026)：创建/查看/轮换敏感响应共用禁缓存 helper 的专项测试通过。
- 仍需 T29 浏览器 + 已登录测试后端联调，验证键盘关闭、60 秒自动隐藏、凭证轮换后商户调用和已有订单回调；**W31 未实施**，生产 `src/www` 未改。
- 下一阶段建议 W40 + W41：Chain/ChainToken 目录与 RPC 节点管理、bool 状态和数值状态区分，RPC API Key 等敏感字段必须脱敏；再继续 W42。

## 2026-11-10：W33/W34 钱包管理实现并通过自动构建

- **W33**：`web/src/features/wallets/wallets-page.tsx` 已接入真实 `/addresses` 路由：按网络/status=1,2/关键词服务端筛选；列表是 `Wallet[]`，显示 `order_count`、备注、来源、状态；支持新增、只修改备注（含清空）、1/2 启停与删除。每次成功写入后重新拉取后端数据。
- 状态变更使用确认 Dialog。删除是软删除，界面明确提示历史订单/在途支付风险，并要求键入完整地址后才可执行。**后端尚未额外验证有无待支付订单或锁，不能据此宣称删除绝对安全。**
- **W34**：批量导入按换行分割、trim、跳过空行，不默默去重，保持与服务端逐项响应对齐。结果按每条 `{address,ok,error_code?,error?}` 展示，HTTP 200 且存在任何失败时绝不提示“全部成功”；支持仅重试失败地址，未返回结果/位置不匹配都按失败处理。
- 继续保留六语言词条、原有 Light/Dark/System 语义色、加载/错误/空态；没有新建钱包私钥导入入口。
- 已通过 [Web build Actions #42767931148](https://github.com/yakun0622/epusdt/actions/runs/42767931148)：TypeScript、14 文件/43 测试、Vite 构建。早期中间提交因类型检查及 Mock Response 复用而失败，现已修复，不能将中间失败记录当作最终结果。
- **W31 仍未实施**：订单关闭、人工补单、重发回调前端接口与入口都没有添加。
- 尚待真实浏览器已登录后端联调：T21 部分失败、T22 钱包数组、钱包启停/删除影响、重复地址与链地址的规范化（TRON/EVM/TON/Aptos）；未替换生产 `src/www`。
- **建议下一阶段 W35**：API Key 列表、创建、修改、状态、统计、查看/轮换密钥与删除，重点实施密钥短暂展示、显式确认和敏感信息不进入日志；W31 继续暂缓。

## 2026-11-10：W30/W32 订单只读功能落地

- W30：`web/src/features/orders/orders-page.tsx` 替换旧 JSON 预览；支持分页（页面 pageSize → Go page_size、10–200）、关键字/网络/Token/收款地址/状态/创建时间（Unix 秒）筛选，详情 `GET /orders/:trade_id`，错误重试和加载/空态。
- W32：`GET /orders/export` 使用同一筛选（**不附带分页**）、Blob CSV + 文件名下载，非 CSV/HTML fallback 明确拒绝。已修复 Go CSV 接口复用 ListOrders 的 200 行上限：专用只读 `ListOrdersForExport` 最多返回 10,000 行，业务列表仍封顶 200。
- **W31 未实施**：订单关闭、人工标记支付、重发回调均未在前端接入。
- [前端 Actions #42663028503](https://github.com/yakun0622/epusdt/actions/runs/42663028503)：TypeScript、11 文件/35 测试和 Vite 构建成功（后续 UI 错误态调整需最终运行复核）。
- [Go Actions #42663566969](https://github.com/yakun0622/epusdt/actions/runs/42663566969)：205 行 CSV 回归测试成功（Go 格式整理后需最终运行复核）。
- **未完成的验收**：实际浏览器 + 已登录后端联调、10,000 行边界测试、时区/日期范围截图、真实 CSV 在 Excel 等表格软件中打开测试、W31 安全操作验收；不修改生产 src/www。

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

**当前最新顺序**：W53～W55 交易验证、回调与安全验收 → W60～W63 浏览器、安全和发布回归。W31 资金相关订单操作仍须独立高风险验收；未通过浏览器及支付链路回归前禁止替换 src/www。
