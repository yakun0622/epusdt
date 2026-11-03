# Epusdt Web 源码恢复工程

> 当前是 **M1/M2 初始脚手架**，不是已经还原完成的管理后台或收银台。原版编译产物 `src/www` 保持不变。

## 启动

需 Node.js 20+。在仓库根目录执行：

```bash
cd web
npm install
EPUSDT_BACKEND=http://127.0.0.1:8000 npm run dev
```

`EPUSDT_BACKEND` 指向实际 Go 后端地址，Vite 仅代理 `/admin/api`。默认端口 8000 只是开发示例，按实际配置调整。

```bash
npm run typecheck
npm run build
```

构建产物目前只写入 `web/dist`，不会覆盖 `src/www`。未取得完整回归结果前，不要将 `web/dist` 部署为生产默认收银台。

## 已实现

- 最小 React + TypeScript + Vite 构建工程
- 按 Go `ApiResponse` 定义封装 API；Bearer JWT 登录、校验会话、退出清理
- Dashboard / Orders 的只读 API 连通性预览（JSON，不是最终 UI）
- 初始密码提示

## 未实现

原版后台布局、完整订单表、设置、钱包、密钥、通知、链与代币、RPC、完整收银台、PWA、国际化与自动化端到端测试。见 `docs/frontend-recovery/PLAN.md`。

## 安全注意

JWT 暂存 sessionStorage（关闭标签页后清理），这是恢复过程中的临时设计，最终需要结合原版行为和实际安全需求复核。不要在生产环境输入真实资金操作参数进行未验证测试。
