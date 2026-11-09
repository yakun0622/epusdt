# W10 浏览器路由第一批实现（2026-11-09）

## 代码

- web/src/app/routes.ts：原编译版路由、公共/受保护边界、path 参数、登录 redirect 的安全校验。
- web/src/app/use-browser-route.ts：History API pushState/replaceState 与 popstate。
- web/src/app/routes.test.ts：路径、404、收银台 ID、根路由、安全回跳测试（尚未执行）。
- web/src/main.tsx：按 URL 显示 Dashboard/Orders 的旧 JSON 预览，登录守卫和安全回跳；未知业务页面仅做明确占位。

## 范围与限制

1. cashier 仅显示无支付能力的公共占位页面，不提供收款地址或标记已付款。
2. 后台鉴权成功之前不请求管理业务；访问受保护 URL 未登录时保留目标路径。
3. 登录回跳仅允许同源相对路径，阻止绝对 URL 与双斜杠协议相对 URL。
4. 原 JWT Cookie 尚未迁移；当前沿用 sessionStorage。原版 TanStack Router 的 loader、Zod search params、嵌套布局也未实现。
5. 源码已经推送，不代表可运行。尚无 npm install/typecheck/test/build 和浏览器验证结果。下一步先执行并修复四个命令，再做 W20/W21。

本轮未修改 src/www、Go、Docker 或 CI。
