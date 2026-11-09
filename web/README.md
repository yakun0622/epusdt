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

当前 Dashboard/Orders 仍是 **只读 JSON API 预览**，其他后台业务页、完整支付流程、PWA 与旧 UI 像素级对照尚未完成。演示数据不是真实商户数据。

## Actions 编译

`master` 的 `web/**` 变更（仅 lockfile 除外）自动触发 `Web build verification`；也支持手动触发。流程执行 `npm ci`、`typecheck`、Vitest、Vite build；全部通过后才可能更新 `web/package-lock.json`。**不会部署或覆盖 `src/www`**。

最新验证：[Actions #42659421942](https://github.com/yakun0622/epusdt/actions/runs/42659421942)，TypeScript 成功、8 测试文件/25 用例通过、Vite 构建成功。浏览器端 E2E 尚未执行。

## 文档和后续

- 逆向文档总入口：`docs/frontend-recovery/README.md`
- 开发顺序：`docs/frontend-recovery/DEVELOPMENT-ROADMAP.md`
- 当前任务：`docs/frontend-recovery/DEVELOPMENT-BACKLOG.md`
- W14/W15/W16 交付报告：`docs/frontend-recovery/W14-W16-IMPLEMENTATION.md`

**下一步 W30/W32**：订单列表、分页筛选、订单详情、CSV 下载；订单关闭、标记支付和回调重发等危险操作留到 W31。

## 安全边界

JWT 存储为浏览器可读 Cookie，是原版行为，不提供 HttpOnly 保护。正式部署前需完成浏览器安全验证、密钥审计、支付状态模拟与回滚演练。
