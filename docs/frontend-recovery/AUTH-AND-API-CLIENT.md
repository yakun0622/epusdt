# 认证存储与公共 API Client 规格

证据：`auth-store-uaDKRR4l.js`、`cookies-BzZOQYPw.js`、`sign-in-DJ_9-JGk.js`、`src/controller/admin/auth_controller.go`、`src/util/http/response.go`。

## 精确存储方式（修正之前的笼统描述）

| 数据 | 原构建实际存储 | 名称 |
|---|---|---|
| JWT token | **Cookie**（非 localStorage） | `access_token` |
| 用户数据缓存 | localStorage | `auth_user` |
| 侧栏开关状态 | Cookie | `sidebar_state` |
| 主题 | Cookie | `theme` |
| 国际化语言 | Cookie | `PARAGLIDE_LOCALE` |

- 通用 cookie 工具写入 `path=/; SameSite=Lax`，默认 7 天 max-age；token 的写入路径 `setToken` 通过这一工具。
- 令牌 Cookie 由 JS 写入，因而不是 HttpOnly。**这是观察到的原版行为，不是安全推荐**。迁移时必须权衡 XSS、跨标签保留和服务端 API 的兼容性。
- `setToken` 会 JSON 序列化 token；`getToken` 从 Cookie 解码并 JSON 解析。Bearer Header 中也会反序列化。
- 当 token 发生变化，前端清空旧的用户缓存与待查询 promise；已登录且没有缓存时通过 `GET /admin/api/v1/auth/me` 获取用户资料，并避免并发重复查询。

## 公共请求/错误处理（JS 确认）

- Client `baseUrl:'/'`，请求时如果 Cookie 有 token，设置 `Authorization: Bearer <token>`。
- HTTP 401：清空认证状态，并跳转 `/sign-in?redirect=<当前路径和查询参数>`。
- HTTP 400：从返回 `status_code` 取翻译错误消息，不能取到时使用 `message` / 通用错误提示。
- HTTP >=500：显示通用服务器错误提示。
- 请求 API 方法包含 GET/POST/PUT/PATCH/DELETE，调用包装中管理 React Query 缓存。
- 后端统一 JSON `{status_code, message, data, request_id}`（Go 确认），注意 HTTP 状态和业务 `status_code` 并非总相同。

## 登录/退出语义

- 原登录 POST `/admin/api/v1/auth/login`；登录后还取 `auth/me` 与 `auth/init-password-hash` 做初始密码判定。
- Go logout 是 stateless JWT 的空操作：仅返回成功，不能服务端撤销签发的 token。前端退出后必须清理 Cookie/user 缓存。
- 过期 token 的自动跳转和页面路由守卫需同时实现；防止 401 导致重定向循环。
- 新建 `web/src/api.ts` 当前临时使用 `sessionStorage`，**与原版存在明确差异**。正式恢复阶段可选保留旧 Cookie 行为或采用更安全的服务端登录设计，但不可未经评审直接宣称兼容。

## 后续必须核实的安全事项

- Cookie 与跨域 API 代理、SameSite/CORS 的实际行为。
- 是否需要调整 backend JWT 生命周期或增加撤销机制；这属于安全需求，不应在静态逆向阶段修改。
- 绝不在日志、埋点、截图、前端错误报告中输出 token/密钥。
- React Query 失效与 logout 清理要覆盖多标签会话及失效响应。
