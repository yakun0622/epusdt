# Epusdt 编译前端逆向分析索引

> 文档基线：`yakun0622/epusdt@122caa9b`，2026-11-03。分析对象是原版 `src/www`，**不是**已恢复的源码。后续编码以这里的核实项和未决项为依据。

## 当前最新交付：W55 支付回调与 MySQL 5.7 安全测试（2026-11-11）

- [W55-IMPLEMENTATION.md](./W55-IMPLEMENTATION.md)：数据库回调租约、稳定幂等 ID、OkPay 交易绑定及真实 MySQL 5.7 双连接验证。
- 回调协议为**至少一次投递**：商户应以稳定 Delivery ID 去重；W53 只读 Hash 语义保持、W31 未实施、生产 src/www 不变。

## 历史交付：W54 原子结算与交易唯一性（2026-11-11）

- [W54-IMPLEMENTATION.md](./W54-IMPLEMENTATION.md)：旧结算入口统一使用数据库事务和唯一支付归属，拒绝重复 Hash 和错误父子单状态。
- W53 Hash 验证仍为只读，不触发入账或回调；W31 不实施，生产 `src/www` 保持原状。
- 尚需生产数据库多实例、真实链上与浏览器 E2E 验收，不能直接替换生产收银台。

## 历史交付：W53 交易 Hash 只读验证（2026-11-11）

- [W53-IMPLEMENTATION.md](./W53-IMPLEMENTATION.md)：新增经过 Go 链上验证的“核验证据”接口，前端单次显式确认和二次读取；不触发原 `submit-tx-hash` 结算，不伪造已付款。
- 后续需修复现有结算接口的跨进程 Hash 防重和父子单原子性；真实支付和部署验收未完成，W31 与 `src/www` 不变。

## 历史交付：W52 状态轮询与本地订单对账（2026-11-11）

- [W52-IMPLEMENTATION.md](./W52-IMPLEMENTATION.md)：公共 `GET /pay/reconcile-status/:trade_id` 只读读取父子订单状态与 OkPay **本地回调账本**，不进行供应商远程查单、创建或结算。
- 收银台三次 GET 交叉验证；正常每 5 秒轮询、网络失败逐级退避、联网恢复及页面重新可见后立即查询。数据库未确认过期或付款时不由前端推断成功。
- 已选活动子单时隐藏父单地址；供应商本地 paid 与订单状态矛盾时提示人工对账。10010 状态冲突不是过期，绝不自动补单。
- 下一阶段 **W53 交易哈希输入与安全验证审查**，生产 `src/www` 不部署、W31 不实施。

## 历史交付：W51 支付方式与网络选择（2026-11-10）

- [W51-IMPLEMENTATION.md](./W51-IMPLEMENTATION.md)：真实公开付款配置白名单、链上/OkPay 选择、父/子订单与 MaxSubOrders=1、安全单次确认、状态竞态和未知结果阻断。
- Go 新 `can_switch` 安全布尔字段与 OkPay 防重复采购保护；修复 OkPay `network=tron` 的假地址误判，不记录敏感付款 URL。
- 自动 Web 与 Go 定向 Actions 验证；生产 `src/www` 不替换，W31 高风险订单操作不实施。
- 下一阶段 **W52 付款状态和父子单/供应商对账**，真实资金测试需独立验收。

## 历史交付：W50 公共收银台只读恢复（2026-11-10）

- [W50-IMPLEMENTATION.md](./W50-IMPLEMENTATION.md)：Go 真实收银台初始化与最新支付状态双 GET、毫秒时间戳、订单 1/2/3/4 四态、安全展示收款信息及服务器时间到期判断。
- 只读 `/cashier/:trade_id` 不调用创建交易、切换网络、提交 Hash 或商户回跳。未验证状态、过期或占位订单不展示收款地址；第三方 URL 不自动打开。
- [分支 Web Actions #42798556680](https://github.com/yakun0622/epusdt/actions/runs/42798556680)：32 文件/93 项测试、TypeScript 与 Vite 生产构建全部通过。
- 下一阶段 W51；**W31 保持未实施**，生产 `src/www` 不修改。

## 历史交付：W44 辅助页面（2026-11-10）

- [W44-IMPLEMENTATION.md](./W44-IMPLEMENTATION.md)：通知渠道及服务器脱敏、显示与集成只读页、Help、安装说明和单任务单次合并规范。
- 仅已有 Go 通知渠道接口允许 Telegram 管理；无发送器的 Webhook/Email、无安装后台的 Install 均不伪造可用能力。
- W31 不实施，生产 `src/www` 不替换。下一阶段 **W50–W55 公共收银台及真实支付链路恢复**。

## 历史交付：W42/W43 配置与 Dashboard（2026-11-10）

- [W42-W43-IMPLEMENTATION.md](./W42-W43-IMPLEMENTATION.md)：系统/Telegram/Pay/EPAY/OkPay 配置、部分成功逐项反馈、汇率刷新、真实订单和 RPC 指标、安全脱敏及 MySQL 5.7 修复。
- [Web Actions #42792271770](https://github.com/yakun0622/epusdt/actions/runs/42792271770)：28 文件/80 项测试、TypeScript 与 Vite 构建通过。
- [Go 配置安全专项工作流](https://github.com/yakun0622/epusdt/actions/workflows/dashboard-settings-security.yml)：Token 与 URL 脱敏、趋势分组与路由编译验证。
- 下一阶段 W44 辅助页面；**W31 订单资金操作不实施**，生产 `src/www` 未替换。

## 历史交付：W40/W41 Chains、Token 和 RPC（2026-11-10）

- [W40-W41-IMPLEMENTATION.md](./W40-W41-IMPLEMENTATION.md)：网络与 Token 管理、RPC 健康检查/重试、服务端凭证与 URL 脱敏、原编译页面的空凭证兼容。
- [前端 Actions #42781772440](https://github.com/yakun0622/epusdt/actions/runs/42781772440)：TypeScript、22 文件/63 测试、Vite Build 成功。
- [RPC Go 安全专项工作流](https://github.com/yakun0622/epusdt/actions/workflows/rpc-secret-security.yml)：覆盖密钥 JSON 保护、URL 脱敏、旧表单不误删凭证。
- 下一阶段 W42/W43 配置与仪表盘。**W31 订单危险操作继续未实施**，不更换生产 src/www。

## 历史交付：W35 API Key 管理（2026-11-10）

- [W35-IMPLEMENTATION.md](./W35-IMPLEMENTATION.md)：列表/CRUD/状态/统计、明确查看和轮换 secret、60 秒临时展示、后端禁缓存头、轮换/删除风险及待验证边界。
- [Web Actions #42771312689](https://github.com/yakun0622/epusdt/actions/runs/42771312689)：17 文件/52 项测试、TypeScript、Vite 构建成功。
- [Go Actions #42771397026](https://github.com/yakun0622/epusdt/actions/runs/42771397026)：敏感响应禁缓存回归成功。
- 下一阶段 W40/W41 Chains、ChainTokens、RPC；**W31 订单危险操作依然不实施**。

## 历史交付：W33/W34 钱包管理（2026-11-10）

- [W33-W34-IMPLEMENTATION.md](./W33-W34-IMPLEMENTATION.md)：真实钱包列表、新增/备注/启停/软删除确认、HTTP 200 的批量逐项结果、仅重试失败地址及安全边界。
- [前端 Actions #42767931148](https://github.com/yakun0622/epusdt/actions/runs/42767931148)：TypeScript、14 文件/43 测试、Vite 构建通过。浏览器 E2E、真实 Go 接口联调未完成。
- 下一阶段推荐 **W35 API Key 管理**，敏感凭证展示、轮换和删除必须显式确认且不落日志；**W31 仍未实施**。

## 历史交付：W30/W32 订单只读管理（2026-11-10）

- [W30-W32-IMPLEMENTATION.md](./W30-W32-IMPLEMENTATION.md)：Go 订单分页筛选契约、真实只读订单列表/详情、CSV Blob 下载及修正后端导出最大 10,000 行。
- 前端 [Actions #42664249919](https://github.com/yakun0622/epusdt/actions/runs/42664249919)：TypeScript、11 个测试文件/35 项测试、Vite 构建 **通过**。
- Go [Actions #42664249965](https://github.com/yakun0622/epusdt/actions/runs/42664249965)：205 条订单的 CSV 导出回归测试 **通过**。
- **W31 的关闭、人工补单、回调重发没有实现**；下一轮优先 W33/W34 钱包管理。
- 所有自动验证是单元/构建级别；T20/T22 等真实浏览器 + 后端联调仍需留存证据。

## W14/W15/W16 开发交付（2026-11-10）

- [W14-W16-IMPLEMENTATION.md](./W14-W16-IMPLEMENTATION.md)：主题 token、Cookie 和系统主题、六语言词条、通用 UI 组件、样例预览及 Actions 成功结果。
- 自动编译 [#42659421942](https://github.com/yakun0622/epusdt/actions/runs/42659421942)：8 文件/25 单测，TypeScript、Vite 构建通过。浏览器视觉对照、完整原版消息抽取未完成。

## 早期编码进度（历史记录，最新情况见上方）

- [W10-ROUTING-IMPLEMENTATION.md](./W10-ROUTING-IMPLEMENTATION.md)：已编码的基础浏览器路由、公共支付隔离和登录回跳，尚未构建/测试验收。

- [W00-W13-IMPLEMENTATION-REPORT.md](./W00-W13-IMPLEMENTATION-REPORT.md)：首次实现 admin/payment Client、Go DTO、时间单位校验和 Vitest tests。代码已提交但尚未安装依赖/运行 npm 命令；不是已通过验收。
- [DEVELOPMENT-BACKLOG.md](./DEVELOPMENT-BACKLOG.md)：W00/W11/W12/W13 状态标注为部分或已编码未验收，其他仍待做。

## 开发入口（第六轮收敛，2026-11-04）

- **[DEVELOPMENT-ROADMAP.md](./DEVELOPMENT-ROADMAP.md)**：以当前 web/ 骨架为基线的 M0–M7 依赖、架构、验收及正式发布门槛。
- **[DEVELOPMENT-BACKLOG.md](./DEVELOPMENT-BACKLOG.md)**：W00–W63 任务拆分、依赖、改动范围和对应 T01–T29 测试。
- **[ACCEPTANCE-TEST-MATRIX.md](./ACCEPTANCE-TEST-MATRIX.md)**：目前 29 项均**待执行**，不可据此声称通过。

原始路线图制定时计划从 W00 开始；当前已完成到 W30/W32 第一批。开发过程中及生产替换门槛通过前始终保持旧 src/www 不变。

## 阅读顺序

1. [CHECKOUT-STATE-MACHINE.md](./CHECKOUT-STATE-MACHINE.md)：收银台状态图、5 秒轮询、3 秒跳转与异常码。
2. [AUTH-AND-API-CLIENT.md](./AUTH-AND-API-CLIENT.md)：JWT Cookie、用户缓存、401/400/500 响应处理。
3. [LAYOUT-AND-LOCALES.md](./LAYOUT-AND-LOCALES.md)：后台/登录布局、主题及六种语言。
4. [ROUTES.md](./ROUTES.md)：前端真实路由/打包模块、受保护边界和占位页面。
5. [API-MAPPING.md](./API-MAPPING.md)：JS 实际调用与 Go 路由对照，避免根据 Go API 擅自推断前端功能。
6. [BEHAVIOR.md](./BEHAVIOR.md)：表单字段、状态机、存储、交互和高风险边界。
7. [IMPLEMENTATION.md](./IMPLEMENTATION.md)：按恢复优先级拆分工作包及验收条件。
8. [PLAN.md](./PLAN.md)：初期计划，若与新文档冲突，以本索引下的已核实证据为准。

## 第三轮深入取证（2026-11-03）

- [DESIGN-TOKENS.md](./DESIGN-TOKENS.md)：Tailwind 4.2.2、浅/深 OKLCH 变量、圆角、断点、字体和首屏初始化。
- [UI-COMPONENT-MATRIX.md](./UI-COMPONENT-MATRIX.md)：主要业务页面组件矩阵、共享组件结构、16 个订单表格字段。
- [API-CONTRACTS.md](./API-CONTRACTS.md)：Go 结构体 JSON 字段、请求体、分页、Dashboard DTO 与敏感字段边界。
- [PWA-AND-RELEASE.md](./PWA-AND-RELEASE.md)：Workbox 预缓存清单、Service Worker 与 Go Embed 发布/回滚风险。

仍需浏览器视觉对比、HTTP 实测、收银台公共响应契约、全部 205 资源的完整自动化审计；以上文档都是带证据和待办项的静态逆向规格。

## 第四轮字段级接口核对（2026-11-03）

- [PUBLIC-PAYMENT-CONTRACTS.md](./PUBLIC-PAYMENT-CONTRACTS.md)：Go 公共收银台 DTO、支付配置的敏感/公开字段分离、切链/哈希提交和 302 回跳。
- [ADMIN-LIST-CONTRACTS.md](./ADMIN-LIST-CONTRACTS.md)：后台各 GET 列表 data 是数组还是分页对象，以及 CSV 导出例外。
- [VALIDATION-AND-GAPS.md](./VALIDATION-AND-GAPS.md)：请求体必填/选填、状态、后端能力与旧前端实际接入差异。

前几轮 API 类型文档属于草案；与 Go 源码核对发生冲突时，以上第四轮字段级核对为准。仍未运行浏览器回归或变更任何前端代码。

## 第五轮证据和纠偏（2026-11-04）

- [ERROR-CODES-AND-UI.md](./ERROR-CODES-AND-UI.md)：完整服务端错误码及原前端错误映射差异。
- [PARENT-CHILD-ORDER-STATES.md](./PARENT-CHILD-ORDER-STATES.md)：父子单约束、单个历史子单限制、支付/回调归属。
- [ACCEPTANCE-TEST-MATRIX.md](./ACCEPTANCE-TEST-MATRIX.md)：29 个待执行回归用例。

重要修正：checkout-counter-resp 三个时间戳为 Unix 毫秒，create-transaction expiration_time 为 Unix 秒；原订单页面导出 CSV 实际已使用原生 fetch。以 Go 实际赋值和原 JS 调用为准，不沿用此前错误推断。

## 证据等级

- **JS 确认**：直接在 `src/www/assets/*.js` 发现的路由、字段、调用或条件。
- **Go 确认**：从 `src/route/router.go`、controller 或 `src/util/http` 验证的服务端事实。
- **待复核**：仅基于文件名/静态推断，或需要浏览器操作、真实联调、视觉截图才能验证的行为。

## 范围和限制

- 已通过 GitHub 目录索引确认 `src/www/assets` **205 个条目**，未见 `.map`。**目前详细逐文件语义拆解的是关键业务模块，并非已经逐一完整审计全部 205 项**；其余包含大量字体、Monaco、框架/组件/vendor 文件。
- 已直接检查主要业务文件：`router-aZWjwYfd.js`、`dashboard-Cw_CStip.js`、`orders-BnOHTHOA.js`、`addresses-JEZCoidP.js`、`keys-DoklatfJ.js`、`chains-tUDg5ohy.js`、`rpc-BkV2cf1-.js`、`settings-CHL6qaLI.js`、`route-BkjShyH8.js`、`system-CkRcAjXh.js`、`telegram-Cecf2wsy.js`、`pay-fSH4oF9b.js`、`okpay-DzwNhqlx.js`、`epay-B1eGq7C0.js`、`notifications-CuHKJSeV.js`、`sign-in-DJ_9-JGk.js`、`auth-store-uaDKRR4l.js`、`_trade_id-B2s-YYlo.js`、`integrations-DDlt0riN.js`、`route-TItYb9Ps.js`、`password-DKY5aHg5.js`、`chains-store-BPLu-HM5.js` 等；对超大共享依赖采用关键字/调用点局部分析。
- 未运行原 UI、未抓包、未验证所有请求/响应及视觉像素级一致性。文档不宣称完成全部源码恢复。
- 以上内容特指早期静态逆向阶段；此后已开发 `web/`、修复 CSV 导出的 Go 只读查询并增加专项 CI。生产 `src/www/` 仍保持原样。

## 原版技术结构（JS 确认）

React + Vite ES Modules 分包、TanStack Router 风格文件路由、TanStack Query/表格、Zod 与 Hook Form、Tailwind 样式及 Lucide、Monaco 编辑器模块、语言消息包、PWA/Service Worker。不能据此精确反推出上游的 package.json 版本。

## 特别注意

- `web/` 是先前建立的**最小脚手架**，不是原版还原版；它的临时导航、JSON 预览、sessionStorage 等不得作为原版行为基准。
- 原始生产构建仍在 `src/www`；Go `src/main.go` 嵌入并解压 www。正式构建路径迁移须另行审查。
- 涉及支付、认证和密钥页面时，优先按 Go 后端真实语义实现，不能直接继承旧端错误或安全隐患。
