# W00/W11/W12/W13 首轮开发交付记录

> 2026-11-04。**代码已经提交；构建和测试尚未在真实 Node 环境执行**。不等同于 W00–W13 已完整验收。没有修改生产 src/www、Go 后端或 CI。

## 变更摘要

- W00：复核 web/package.json、tsconfig.json、vite.config.ts、已有 api.ts/main.tsx；原项目只有手工 View 切换、JSON 预览，没有路由和测试依赖。
- W11：引入通用 HTTP ApiEnvelope client（保留 status / businessCode / requestId），将 adminClient（Bearer）与 paymentClient（绝不附带 admin JWT）分离；CSV 使用 blob。保留旧 web/src/api.ts 接口以继续兼容脚手架。开发代理新增 /pay、/payments，生产产物仍仅写 web/dist。
- W12：在 web/src/api/types 添加 admin、payment、common 类型。Go 订单列表为分页对象，钱包等为数组。checkout 三个时间字段为 Unix **毫秒**，CreateTransactionResponse.expiration_time 为 Unix **秒**。显式命名的解析函数只接受可信数量级，防止混淆。
- W13：引入 Vitest 单元测试（无浏览器/后台依赖），覆盖 Bearer 隔离、HTTP/业务码区分、401 清理、CSV Blob、时间单位和错误输入。尚未执行。

## 偏离与后续

- 现有管理员 JWT 仍使用 sessionStorage；原压缩 UI 使用 Cookie。此版本保留原脚手架行为，未来 W20 再确定认证存储策略并迁移。
- 此阶段的 types 以 Go 结构体为静态契约；`data` 的具体序列化时区/空数组/数字精度，及所有支付请求的真实执行结果，仍需与实际运行的后端核对。
- 当前 client 在 HTTP 401 时清理本地会话，但**尚未恢复旧版路由的 redirect 跳转**；W10/W20 补齐。
- TS 的 branded time type 在 JSON 边界只做静态约束：decode 函数强制根据当前 Go 的单位校验。业务组件不得直接从原始 JSON 绕过 decode 使用毫秒字段。
- `paymentClient` 用空前缀 + 完整 /pay 和 /payments endpoint，避免公共与管理员路径冲突。
- W13 使用伪造 Response/fetchImpl，未进行联调，不能标记 T01/T03/T04/T20/T22/T28 已通过端到端测试。

## 执行验证（待进行）

```bash
cd web
npm install
npm run typecheck
npm run test
npm run build
EPUSDT_BACKEND=http://127.0.0.1:8000 npm run dev
```

必须保存 Node/npm 实际版本、命令输出和测试结果，修复失败后再标记 W00/W11/W12/W13 完成。
