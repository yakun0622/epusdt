# W20/W21 第一批实现与验证记录

时间：2026-11-10；仓库：yakun0622/epusdt；分支 master。

## 已编码

- `web/src/auth/session.ts`：原版 access_token JSON Cookie，7 天、Path=/、SameSite=Lax；清理前期 sessionStorage 临时 token 和 auth_user 缓存；不再从 sessionStorage 读取 token。
- `web/src/api.ts`：管理员请求继续附带 Bearer，公共 paymentClient 不附带认证信息；auth/password 修改密码接口。
- `web/src/layouts/admin-layout.tsx`：独立后台框架、主导航、设置子导航、账户安全、退出按钮、初始密码提示。
- `web/src/features/auth/password-page.tsx`：原密码、新密码及确认、长度与一致性校验、后端反馈。
- `web/src/main.tsx`：接入布局、Cookie 状态订阅、密码页、导航；其他未开发业务仍是明确占位。
- `web/src/style.css`：响应式后台框架和设置导航基础样式。
- `web/src/auth/session.test.ts`：Cookie 格式、读取、清理和异常数据测试。

## 通过的自动验证

GitHub Actions [Web build verification #42655567335](https://github.com/yakun0622/epusdt/actions/runs/42655567335) 完成，结论 success。

- npm ci 成功；
- TypeScript typecheck 成功；
- Vitest 4 文件 / 13 个用例通过；
- Vite 构建 35 个模块，成功生成 web/dist。

## 未完成/不应误称已恢复

1. 尚未用浏览器对照原版登录视觉、Cookie 跨标签和 JWT 自然过期、真实服务端改密接口、移动端布局。
2. 原版使用 auth_user localStorage 作为用户缓存，新代码只清除此缓存而未恢复持久化读取；尚未接入 React Query。
3. 原版主题、语言 Cookie、搜索菜单、完整设置页与业务管理表格尚未恢复；W21 仅第一版壳组件。
4. 当前 Go JWT stateless，退出仅清理客户端 Cookie；旧令牌在过期前可能仍有效，不能将此实现称为服务端撤销。
5. 生产 `src/www`、Go 后端和发布配置未修改。

## 后续任务

建议 **W14 主题 + W15 六语言基础 + W16 可复用组件**；然后再推进 W30 订单管理与 W50 收银台。所有开发继续直接提交 master，保持自动 CI 和源发布目录隔离。
