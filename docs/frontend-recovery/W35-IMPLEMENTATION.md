# W35 API Key 管理与敏感值保护（2026-11-10）

仓库：`yakun0622/epusdt`，直接提交 `master`。未创建 PR/分支。生产 `src/www` 未改、未部署前端，订单 W31 相关接口/界面未改。

## Go 控制器核对（实际契约）

- `GET /admin/api/v1/api-keys` → `data: ApiKey[]`（不是分页对象），模型的 `SecretKey` 使用 `json:"-"`。
- `POST /api-keys`：`{name,ip_whitelist,notify_url}`，服务端自行分配 PID，单个 key 可用于 EPAY/GMPAY；成功 `{id,name,pid,secret_key}`。
- `PATCH /api-keys/:id`：仅编辑 `name`、`ip_whitelist`、`notify_url`。
- `POST /api-keys/:id/status`：body `{status:1|2}`。
- `GET /api-keys/:id/stats`：仅 `call_count`,`last_used_at`，不代表逐条调用日志。
- `GET /api-keys/:id/secret` 与 `POST /api-keys/:id/rotate-secret`：仅明确请求时获取 secret；轮换即刻替换服务端旧 secret。
- `DELETE /api-keys/:id` 是软删除；Go 注释明确警告：关联已创建订单的回调可能无法签名/投递，因此建议先禁用再迁移。

## 实现内容

- `web/src/api/endpoints/api-keys.ts`：全部 8 个 API 操作，严格 ID/status 校验、创建/编辑表单规范化、URL 基础校验、列表 DTO 仅保留白名单字段（即使后端错误地返回 secret_key 也不会挂入 React 列表 state）。
- `web/src/features/keys/api-keys-page.tsx`：真实 `/keys` 管理页、名称/PID 过滤、字段展示、创建/编辑、启停确认、usage 统计、查看/轮换/删除确认。数据写入后重新获取服务端列表。
- `web/src/features/keys/secret-dialog.tsx`：仅在创建/查看/轮换的显式操作后挂载。默认 `type=password`，需再点击才显示明文；60 秒自动关闭，失焦进入后台/导航离开时销毁；关闭即清除短暂引用。没有 Copy 按钮，避免自动写系统剪贴板。
- 删除、轮换需要用户输入精确的目标 PID 才能启用确认按钮；界面分别告警历史订单回调可能失败、旧密钥立即失效。
- `web/src/features/keys/i18n.ts`：6 语言核心管理文案，React 现有 Light/Dark/System 主题与响应式布局。
- Go `src/controller/admin/api_key_controller.go`：为创建、查看、轮换三类秘密值响应添加 `Cache-Control: no-store, private, max-age=0`、`Pragma: no-cache`、`Expires: 0`、`X-Content-Type-Options: nosniff`。
- 新增 `.github/workflows/api-key-security-test.yml`：仅 Go 密钥安全相关代码/工作流推送自动触发，也可手动触发；无发布步骤。

## 验证

- 前端 [GitHub Actions #42771312689](https://github.com/yakun0622/epusdt/actions/runs/42771312689) **success**：`npm ci`、`typecheck`、Vitest **17 文件/52 项**、Vite Build 成功。
- Go [GitHub Actions #42771397026](https://github.com/yakun0622/epusdt/actions/runs/42771397026) **success**：`TestSensitiveApiKeyResponsesNoStore` 通过。
- 新增测试覆盖：列表意外 secret 字段不渲染、Go 各 endpoint HTTP 方法/body、secret GET/轮换请求 no-store、创建参数校验、六语言 key 完整性、对话框遮蔽展示。

## 安全边界与未验证项

1. **不进入浏览器持久存储**不等于秘密无需存储：后端数据库仍必须保存 `secret_key` 以校验商户支付请求。客户端接收后会在短时间内存在内存和 DOM；网络开发者工具、代理/服务端基础设施及浏览器扩展需要在正式上线安全审查时另行评估。
2. `cache:'no-store'` 与后端响应头降低 HTTP 缓存风险，但不能对所有外部中间件、反向代理日志做绝对保证；本轮新代码不记录密钥到日志、不写 localStorage/sessionStorage/URL/Clipboard。
3. 当前 Go 删除可影响仍需签名/回调的订单，轮换会立即让商户旧凭证失效。前端确认是防误操作措施，不是后端事务级安全保护。上线前必须使用隔离商户/测试订单验证切换与回调兼容。
4. 尚未执行真实浏览器 E2E/键盘访问测试、T29 密钥操作集成验收、真实多语言布局截图；此次 CI success 仅证明编译和单测。
5. 当前的 JWT 仍使用原编译版可读 Cookie 而非 HttpOnly；授权安全审计仍为发布前门槛。

## 后续建议

实施 **W40/W41** Chain/ChainToken 和 RPC 节点页：区分 `enabled: boolean` 与钱包/密钥 `status:1|2`；RPC `api_key` 可能从 Go JSON 直接返回，需避免列表展示或任何客户端持久化。W31 继续暂停。
