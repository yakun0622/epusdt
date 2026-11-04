# web/ 前端源码恢复：最终实施路线图（第六轮）

> 状态：**待实施计划**，并非完成报告。更新于 2026-11-04。原版编译目录 `src/www/` 必须保留，直到生产替换门槛全部通过。本路线图汇总前五轮在 `docs/frontend-recovery/` 的静态分析结果。

## 1. 目标和不可变约束

- 源码目录必须为 `web/`，Go 代码仍在 `src/`。在独立的 `web/dist` 构建和回归，不直接覆盖 `src/www`。
- 按 `master` 单线实施；不创建额外分支、PR 或无必要 CI 工作流。每个可验收切片在 master 上独立提交；如失败可按提交点回退，不应覆盖历史。
- React + TypeScript + Vite；依赖版本须与现有 `web/package.json` 检查兼容。路由、Query、表单、UI、国际化、测试工具仍需在实现时确定版本，不能把编译资源当作原始 lockfile。
- 后台登录和公共收银台必须分离：管理 API `/admin/api/v1/*` 需要 JWT（登录与初始密码哈希除外）；公共支付 API `/pay/*`、`/payments/*` 不携带管理 JWT。
- 所有支付状态由服务端确认，不能仅因前端按钮成功或视觉计时到零便标记已付款。
- 原版有意不持久化的演示页（`/settings/notifications`、`/settings/display`、`/payment-setup/integrations`）不准擅自升级为服务端 CRUD；如要增加真实功能，单独列产品变更。
- 安全修正（10010 错映射、公共/管理员配置隔离、密钥不记录日志）优先于无条件复制原版错误。

## 2. 真实工程基线

当前 `web/` 仅有单入口 `src/main.tsx`、`src/api.ts`、`src/style.css`、Vite 基本配置。现阶段页面通过 `View='dashboard'|'orders'` 手动切换，而非实际路径路由；两个页面为 JSON 联通性预览。现有 `api.ts` 只请求 `/admin/api/v1` 并把 JWT 放入 sessionStorage。Vite `server.proxy` 只有 `/admin/api`，**直接开发公共收银台前需要补齐 `/pay` 与 `/payments` 的本地代理**。当前 `package.json` 的命令为 `npm run typecheck`（`tsc --noEmit`）和 `npm run build`（`tsc -b && vite build`），尚无 test/lint 脚本。

本轮只审核静态文件，不代表已运行 npm、Go、浏览器或端到端测试。

## 3. 里程碑与依赖

| 顺序 | Milestone | 交付边界 | 必须通过的门槛 |
|---|---|---|---|
| M0 | 基线锁定 | 原版静态资产引用、接口契约、验收用例、发布前状态盘点 | 所有未验证项标记待核，不能误称已完成 |
| M1 | 公共基础设施 | 路由、Provider、API Client、错误处理、类型、主题、i18n 最小能力 | 路由保护、401/400/500、类型/单位契约测试 |
| M2 | 登录和后台壳 | /sign-in、/dashboard 布局、侧栏、账号密码、设置子导航、错误页 | T01/T02/T25/T28 与登录刷新/重定向 |
| M3 | 后台核心操作 | Orders、Wallets、API Keys | T17~T22、T29；表单/操作/导出闭环 |
| M4 | 后台配置和可观测性 | Chains/Token、RPC、Settings、Dashboard 图表 | 真实 Go DTO/查询、批量结果反馈及视觉回归 |
| M5 | 收银台支付 | 公开配置、选择网络、父子单、5s 状态轮询、哈希、EPay 回跳/OkPay | T03~T16、T23/T24/T27；支付模拟集成 |
| M6 | 完整页面和资源对齐 | 辅助页、完整多语言、字体、移动端和 PWA | 页面路由清单逐项通过，T25/T26 |
| M7 | 发布迁移 | 可重现编译、Go embed、SPA fallback、旧 SW 迁移、回滚 | 完整回归与版本回滚演练通过才切换 |

**允许并行准备**：M1 就建立 Checkout API 类型及纯函数单元测试，但 M5 状态机/收银台部署验收必须依赖 M1 和 M2 的基础设施。不要为了早点展示页面而跳过 M3 的类型和操作错误处理。

## 4. 建议源码结构（不是已经创建的文件）

```text
web/
  src/
    app/                # router, providers, route guards
    api/
      client.ts         # ApiEnvelope、admin/public client、ApiError
      types/            # admin/payment DTO 与严格单位类型
      endpoints/        # orders, wallets, keys, chains, rpc, settings, checkout
    components/
      ui/               # Button, Dialog, Form, Toast, Dropdown, Badge
      data-table/       # 通用数据表、空态、分页与筛选
    layouts/            # authenticated, auth, settings, cashier
    features/
      auth/ dashboard/ orders/ wallets/ api-keys/
      chains/ rpc/ settings/ checkout/
    i18n/               # 先落地核心词条，六语言逐步覆盖
    theme/              # theme token、字体、首屏深浅色
    styles/
    test/               # MSW/fixture/contract/unit/route tests
  public/               # 待确认授权与缓存策略的图标资源
  dist/                 # 仅生成物，不是当前生产嵌入目录
```

不要一次性搬运旧 `src/www/assets` 的 205 个文件；优先创建可维护组件，第三方 Monaco/字体仅按实际需求和许可证处理。

## 5. API 客户端架构

- **AdminApiClient**：前缀 `/admin/api/v1`，附加管理员 Bearer，处理 401 会话失效和 redirect；统一解析 `{status_code,message,data,request_id}`，保留 HTTP 状态与业务码两者。
- **PaymentApiClient**：只访问 `/pay` 和 `/payments`，不附带后台管理员 JWT；接受 `ApiEnvelope`，并对 EPay 302 浏览器导航使用单独的跳转能力。
- **DownloadClient**：对 `/admin/api/v1/orders/export` 读取 Blob 而非 JSON；原版 `orders-BnOHTHOA.js` 已确认该原生 fetch 存在。
- **类型特化**：orders 分页对象，wallets/api-keys/chains/chain-tokens/rpc/settings/notification-channels 数组，checkout 单个对象，CSV 是二进制。
- **时间单位**：创建交易的 `expiration_time` 为 Unix 秒；收银台查询的 `created_at/server_time/expiration_time` 是 Unix 毫秒。建议 API 层用命名转换函数/品牌类型显式隔离，测试确保不能混淆。
- **状态冲突**：业务 10010 = OrderStatusConflict，不等同过期；重新读取 checkout status，避免假过期/假成功。
- **敏感数据**：API Key secret、Telegram token、OkPay shop_token、RPC api_key 不进入自动日志、持久 Query cache 或错误报告；不要简单 JSON.stringify 全部响应。

## 6. 每个模块的 DoD

1. 路由/界面/表单/API 数据结构来源明确，未确认的内容标注为 TODO；实际截图与原版比较。
2. loading、empty、error、timeout、disabled、401、重复提交路径均被覆盖；错误提示不泄露数据。
3. 操作完成后准确刷新 Query cache；不存在“按钮返回 HTTP 200 就显示全量成功”的情况（钱包批量导入和 settings 批量保存尤其如此）。
4. 编译与类型检查通过，至少有对应组件/契约/错误处理单测；支付需额外集成与时钟/并发测试。
5. 已执行的用例在 `ACCEPTANCE-TEST-MATRIX.md` 记录结果/证据；仅写测试计划不算通过。

## 7. 生产替换四道门

1. **Build**：版本锁定，`npm run typecheck`、`npm run build`、相关测试全部通过；新产物仍在 `web/dist`。
2. **Behavior**：主要后台路由、控制台操作、登录/注销、收银台所有支付/失败分支及 29 项测试矩阵按风险执行并记录。
3. **Delivery**：Go embed、Docker 构建、SPA fallback 排除 `/api`/`/admin/api`/`/pay`/`/payments`，浏览器新旧静态资源/SW 更新及缓存兼容。
4. **Rollback**：保存旧 `src/www` 可部署产物和 Go 可运行版本；明确回滚时如何恢复旧静态资产与 SW。**四道门未完成，禁止覆盖 `src/www`**。

## 8. 相关资料

- [DEVELOPMENT-BACKLOG.md](./DEVELOPMENT-BACKLOG.md)：带 ID、依赖、改动范围和验收链接的工作包清单。
- [IMPLEMENTATION.md](./IMPLEMENTATION.md)：最初高层阶段路线；冲突以本路线图及第五轮纠偏为准。
- [ACCEPTANCE-TEST-MATRIX.md](./ACCEPTANCE-TEST-MATRIX.md)：目前 29 条均待执行。
- [PUBLIC-PAYMENT-CONTRACTS.md](./PUBLIC-PAYMENT-CONTRACTS.md)、[ADMIN-LIST-CONTRACTS.md](./ADMIN-LIST-CONTRACTS.md)、[ERROR-CODES-AND-UI.md](./ERROR-CODES-AND-UI.md)、[PARENT-CHILD-ORDER-STATES.md](./PARENT-CHILD-ORDER-STATES.md)。
