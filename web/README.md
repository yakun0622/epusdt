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

当前 Dashboard 仍是 **只读 JSON API 预览**，`/orders` 已变为只读表格/筛选/详情/CSV，`/addresses` 已恢复钱包管理。Chains、RPC 等其他后台业务页、完整支付流程、PWA 与旧 UI 像素级对照尚未完成。外观预览演示数据不是真实商户数据。

## Actions 编译

`master` 的 `web/**` 变更（仅 lockfile 除外）自动触发 `Web build verification`；也支持手动触发。流程执行 `npm ci`、`typecheck`、Vitest、Vite build；全部通过后才可能更新 `web/package-lock.json`。**不会部署或覆盖 `src/www`**。

最新验证：[Actions #42771312689](https://github.com/yakun0622/epusdt/actions/runs/42771312689)，TypeScript 成功、17 测试文件/52 用例通过、Vite 构建成功；[Go 安全测试 #42771397026](https://github.com/yakun0622/epusdt/actions/runs/42771397026) 通过。浏览器端 E2E 尚未执行。

## 文档和后续

- 逆向文档总入口：`docs/frontend-recovery/README.md`
- 开发顺序：`docs/frontend-recovery/DEVELOPMENT-ROADMAP.md`
- 当前任务：`docs/frontend-recovery/DEVELOPMENT-BACKLOG.md`
- W14/W15/W16 交付报告：`docs/frontend-recovery/W14-W16-IMPLEMENTATION.md`

**下一步建议 W40/W41**：恢复 Chain/ChainToken 和 RPC 管理，保护 RPC 凭证；W31 订单关闭、标记支付和回调重发等危险操作仍留在独立安全阶段。

## 安全边界

JWT 存储为浏览器可读 Cookie，是原版行为，不提供 HttpOnly 保护。正式部署前需完成浏览器安全验证、密钥审计、支付状态模拟与回滚演练。

## W30/W32 交付记录

详见 `docs/frontend-recovery/W30-W32-IMPLEMENTATION.md`。前端自动编译与 Go 205 条 CSV 回归测试已通过；浏览器真实联调、日期/时区及 10,000 条边界尚待验证。`web/dist` 不会替换 `src/www`。

## W33/W34 钱包管理交付记录

详见 `docs/frontend-recovery/W33-W34-IMPLEMENTATION.md`。支持同一 Go 契约的新增/修改/启停/删除及逐项批量结果；当前后端软删除未检查有无进行中的支付或锁，UI 已要求键入地址确认。真实联调与影响评估仍是正式部署前的验收门槛，生产 `src/www` 未变。

## W35 密钥管理交付

详见 `docs/frontend-recovery/W35-IMPLEMENTATION.md`。前端只把密钥短暂保留在内存与临时弹窗，不写浏览器存储、日志、URL 或剪贴板；服务端数据库仍需保存真实密钥以完成签名验证。轮换和删除前务必评估商户与历史订单回调影响，当前尚无真实后端联调或生产发布。
