# Epusdt Web 源码恢复工程

> 当前是 **M1/M2 初始脚手架**，不是已经还原完成的管理后台或收银台。原版编译产物 `src/www` 保持不变。

## 启动

需 Node.js 20+。在仓库根目录执行：

```bash
cd web
npm install
EPUSDT_BACKEND=http://127.0.0.1:8000 npm run dev
```

`EPUSDT_BACKEND` 指向实际 Go 后端地址，Vite 已代理 `/admin/api`、`/pay`、`/payments`。默认端口 8000 只是开发示例，按实际配置调整。

```bash
npm run typecheck
npm run test
npm run build
```

构建产物目前只写入 `web/dist`，不会覆盖 `src/www`。未取得完整回归结果前，不要将 `web/dist` 部署为生产默认收银台。

## 已实现

- 最小 React + TypeScript + Vite 构建工程
- 按 Go `ApiResponse` 定义封装 API；Bearer JWT 登录、校验会话、退出清理
- 首轮已编码：admin/public 请求客户端隔离、CSV Blob 下载、支付数据 DTO、时间戳单位验证与 Vitest 测试；**未经 npm 运行验收**
- Dashboard / Orders 的只读 API 连通性预览（JSON，不是最终 UI）
- 初始密码提示

## 未实现

原版后台布局、完整订单表、设置、钱包、密钥、通知、链与代币、RPC、完整收银台、PWA、国际化与自动化端到端测试。见 `docs/frontend-recovery/DEVELOPMENT-ROADMAP.md` 和 `docs/frontend-recovery/DEVELOPMENT-BACKLOG.md`，初期背景见 `docs/frontend-recovery/PLAN.md`。

## 安全注意

JWT 暂存 sessionStorage（关闭标签页后清理），这是恢复过程中的临时设计，最终需要结合原版行为和实际安全需求复核。不要在生产环境输入真实资金操作参数进行未验证测试。

## 实施任务索引（2026-11-04）

当前只是脚手架、未经构建/浏览器验收；请从 `docs/frontend-recovery/DEVELOPMENT-ROADMAP.md` 阅读 M0–M7 开发顺序，并按 `DEVELOPMENT-BACKLOG.md` 的 W00–W63 小切片在 master 实现。W00/W11/W12/W13 已完成首轮源码提交，尚待依赖安装、类型检查和测试实际运行；随后进入 W10 的路由建设。不是覆盖生产 `src/www`。

## 当前验证限制

此轮在 GitHub 上直接提交代码，运行环境无法访问 GitHub/npm 依赖源，**尚未执行 npm install、npm run typecheck、npm run test、npm run build**。这四项属于继续实现前的必做验证，不能把已有测试文件当作已经测试通过。

## W10 路由原型（2026-11-09）

已支持原版路由路径识别、History API 前进/后退、受保护页登录跳转及安全回跳、公共 cashier 路由占位。Dashboard/Orders 仍是 JSON 预览，其他页面并未恢复。此原型并非完整版 TanStack Router。运行 npm install、npm run typecheck、npm run test、npm run build 后需记录真实结果，目前尚未运行成功；不涉及 src/www 和 Go 后端。

## GitHub Actions 编译（自动 + 手动）

`master` 分支涉及 `web/**`（仅 lockfile 修改除外）或工作流文件修改的 push 自动触发 **Web build verification**；也可在 Actions 手动触发。执行 `npm ci`、类型检查、单测和 Vite 构建。缺少 lockfile 时先生成，**全部检查成功才把 `web/package-lock.json` 自动提交回 master**。仅构建 `web/dist`，不部署或覆盖 `src/www`。详见 `docs/frontend-recovery/MANUAL-WEB-BUILD.md`。
