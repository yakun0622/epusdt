# Epusdt 编译前端逆向分析索引

> 文档基线：`yakun0622/epusdt@122caa9b`，2026-11-03。分析对象是原版 `src/www`，**不是**已恢复的源码。后续编码以这里的核实项和未决项为依据。

## 阅读顺序

1. [CHECKOUT-STATE-MACHINE.md](./CHECKOUT-STATE-MACHINE.md)：收银台状态图、5 秒轮询、3 秒跳转与异常码。
2. [AUTH-AND-API-CLIENT.md](./AUTH-AND-API-CLIENT.md)：JWT Cookie、用户缓存、401/400/500 响应处理。
3. [LAYOUT-AND-LOCALES.md](./LAYOUT-AND-LOCALES.md)：后台/登录布局、主题及六种语言。
4. [ROUTES.md](./ROUTES.md)：前端真实路由/打包模块、受保护边界和占位页面。
5. [API-MAPPING.md](./API-MAPPING.md)：JS 实际调用与 Go 路由对照，避免根据 Go API 擅自推断前端功能。
6. [BEHAVIOR.md](./BEHAVIOR.md)：表单字段、状态机、存储、交互和高风险边界。
7. [IMPLEMENTATION.md](./IMPLEMENTATION.md)：按恢复优先级拆分工作包及验收条件。
8. [PLAN.md](./PLAN.md)：初期计划，若与新文档冲突，以本索引下的已核实证据为准。

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
