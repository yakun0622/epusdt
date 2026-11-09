# W14/W15/W16 开发交付记录（2026-11-10）

## 已实现的源码

### W14 主题

- `web/src/theme/tokens.css`：参考原编译 CSS 的 light/dark OKLCH 语义变量（background/foreground/card/primary/sidebar/border/ring 等）、圆角、Inter/system 字体回退。
- `web/src/theme/theme.ts`、`theme-provider.tsx`：`theme` Cookie（Path=/、SameSite=Lax、365 天）、Light/Dark/System、操作系统主题变更监听，`data-mode` 与 CSS `colorScheme`。
- `web/index.html`：React 之前执行主题 Cookie 读取和 `data-mode` 同步，降低首屏亮暗闪烁；无效 Cookie 安全回退到 System。
- `web/src/style.css`：为后台/公共登录/表单、Dialog、Toast、表格与响应式导航使用语义变量。
- 原始完整 font-provider 的用户字体选择及字体分包授权仍待调查，不宣称已实现像素级还原。

### W15 国际化

- `web/src/i18n/locale.ts`、`i18n-provider.tsx`：原版六语言、`PARAGLIDE_LOCALE` Cookie（40 天）、Cookie 优先于浏览器偏好、无匹配时使用 en-US。
- `web/src/i18n/messages.ts`：77 个基础界面 key × 6 语言；这些翻译为**本项目重新编写的核心词条**，不是从原版压缩 Paraglide 消息库还原的全量原始 key。
- 选择语言后在 React 内即时更新，并持久保存 Cookie；原版编译版本改变语言可能刷新页面，这一差异保留待浏览器体验验收。
- 覆盖主要导航、登录、密码页、未完成提示、公共收银台占位文案与外观预览示例。Go API 业务错误码的多语映射和所有后台业务页尚未接入。

### W16 通用组件与接入

- `web/src/components/ui/` 包含 Button、TextField、SelectField、Card、DataTable、EmptyState、LoadingState、Dialog（native dialog）、Toast 和偏好设置控件。
- `web/src/layouts/admin-layout.tsx`：中英文等六语导航、主题/语言选择、设置导航（窄屏下拉）。
- `web/src/features/auth/password-page.tsx`：通用表单控件、翻译、Toast，修改密码成功后清理本地登录会话。
- `web/src/features/settings/appearance-page.tsx`：主题/语言设置与 UI 组件预览（Dialog、Toast、Demo 表格），不向业务 API 提交示例数据。
- `web/src/main.tsx`：Provider 组合、登录/公共错误/收银台占位国际化。公共支付/安装/错误路由不再仅因浏览器存在管理员 Cookie 而请求管理员会话。

## GitHub Actions 自动验证

- 运行：[Web build verification #42659421942](https://github.com/yakun0622/epusdt/actions/runs/42659421942)，`master` push 自动触发，最终 `success`。
- `npm ci`、`npm run typecheck`、`npm run test`、`npm run build` 均成功；Vitest **8 个文件、25 个测试**；Vite **49 个模块**转换，构建成功。
- 单测覆盖：主题选择及 OS 优先级、主题 Cookie 与语言 Cookie 有效期、浏览器语言匹配与六语言 key 完整性、表单/表格/Dialog 的 SSR 语义等。

## 未完成 / 验收边界

1. 尚无 360/768/1280/1536 像素的原版 vs 新版浏览器截图对照；无真实浏览器 `matchMedia`/Cookie 刷新/同标签和跨标签交互验证。
2. UI 组件用于后续功能恢复的基础积木，并非原版 Shadcn/Tailwind 组件精确重构；Dialog/Toast 浏览器端交互和键盘焦点应补 E2E 测试。
3. 部分原 CSS 语义 token 未全量搬入、字体资源未复制；需做许可证与字体选择核实。
4. 管理端仍只有 Dashboard/Orders 的 JSON 预览，其他业务模块待 W30 等工作包；公共收银台仍是安全占位，不得用于实际支付。
5. 本轮未修改 `src/www/`、Go 后端、Docker 发布行为；自动 CI 仅构建 `web/dist`，不部署。

## 推荐下阶段

**W30/W32**：根据已核实 Go DTO 实现 Orders 列表与筛选、分页、详情、CSV 导出，完善错误态和接口 mock 测试。**W31**（订单关闭、手工标记已付、重发回调）需独立安全验收后实施。
