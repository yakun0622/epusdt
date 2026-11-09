# Epusdt 编译前端逆向分析索引

> 文档基线：`yakun0622/epusdt@122caa9b`，2026-11-03。分析对象是原版 `src/www`，**不是**已恢复的源码。后续编码以这里的核实项和未决项为依据。

## W14/W15/W16 开发交付（2026-11-10）

- [W14-W16-IMPLEMENTATION.md](./W14-W16-IMPLEMENTATION.md)：主题 token、Cookie 和系统主题、六语言词条、通用 UI 组件、样例预览及 Actions 成功结果。
- 自动编译 [#42659421942](https://github.com/yakun0622/epusdt/actions/runs/42659421942)：8 文件/25 单测，TypeScript、Vite 构建通过。浏览器视觉对照、完整原版消息抽取未完成。

## 实际编码进度（更新于 2026-11-09）

- [W10-ROUTING-IMPLEMENTATION.md](./W10-ROUTING-IMPLEMENTATION.md)：已编码的基础浏览器路由、公共支付隔离和登录回跳，尚未构建/测试验收。

- [W00-W13-IMPLEMENTATION-REPORT.md](./W00-W13-IMPLEMENTATION-REPORT.md)：首次实现 admin/payment Client、Go DTO、时间单位校验和 Vitest tests。代码已提交但尚未安装依赖/运行 npm 命令；不是已通过验收。
- [DEVELOPMENT-BACKLOG.md](./DEVELOPMENT-BACKLOG.md)：W00/W11/W12/W13 状态标注为部分或已编码未验收，其他仍待做。

## 开发入口（第六轮收敛，2026-11-04）

- **[DEVELOPMENT-ROADMAP.md](./DEVELOPMENT-ROADMAP.md)**：以当前 web/ 骨架为基线的 M0–M7 依赖、架构、验收及正式发布门槛。
- **[DEVELOPMENT-BACKLOG.md](./DEVELOPMENT-BACKLOG.md)**：W00–W63 任务拆分、依赖、改动范围和对应 T01–T29 测试。
- **[ACCEPTANCE-TEST-MATRIX.md](./ACCEPTANCE-TEST-MATRIX.md)**：目前 29 项均**待执行**，不可据此声称通过。

下一轮建议从 W00/W11/W12/W13 开始；正式编码前必须保持旧 src/www 不变。此处是计划文档，不是已执行状态。

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
- 本轮只写文档，不改动 `web/`、`src/www/`、Go 业务或 CI。

## 原版技术结构（JS 确认）

React + Vite ES Modules 分包、TanStack Router 风格文件路由、TanStack Query/表格、Zod 与 Hook Form、Tailwind 样式及 Lucide、Monaco 编辑器模块、语言消息包、PWA/Service Worker。不能据此精确反推出上游的 package.json 版本。

## 特别注意

- `web/` 是先前建立的**最小脚手架**，不是原版还原版；它的临时导航、JSON 预览、sessionStorage 等不得作为原版行为基准。
- 原始生产构建仍在 `src/www`；Go `src/main.go` 嵌入并解压 www。正式构建路径迁移须另行审查。
- 涉及支付、认证和密钥页面时，优先按 Go 后端真实语义实现，不能直接继承旧端错误或安全隐患。
