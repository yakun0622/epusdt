# W40/W41 网络、代币与 RPC 管理交付记录

日期：2026-11-10；仓库：yakun0622/epusdt；分支：master。

## 已按 Go 控制器验证的 API

### W40 Chains
- `GET /admin/api/v1/chains` 返回数组。链由 Go 初始化，**没有** `POST /chains` 或 `DELETE /chains`；前端只展示预置链的编辑和启停。
- `PATCH /admin/api/v1/chains/{network}` 支持 `enabled?:boolean`、`display_name?:string`、`min_confirmations?:number`、`scan_interval_sec?:number`。关闭链会停止扫描任务，界面有确认警告。

### W40 ChainTokens
- `GET /admin/api/v1/chain-tokens?network=...` 返回数组，筛选可选。
- `POST /chain-tokens` 创建（network、symbol、contract_address、decimals、enabled:boolean、min_amount）。
- `PATCH /chain-tokens/{id}` 只修改 contract_address、decimals、enabled、min_amount；network/symbol 不可通过此接口编辑。
- `POST /chain-tokens/{id}/status` 请求体 **`{enabled:boolean}`**，绝不可沿用钱包的 `{status:1|2}`。
- `DELETE /chain-tokens/{id}` 软删除，前端要求输入符号确认。
- Go 额外限制启用的 Aptos 资产必须指定 Move asset ID，前端创建和更新按此阻断非法输入。

### W41 RPC
- `GET /admin/api/v1/rpc-nodes?network=...` Go 原接口；新前端使用 **`?redact=1`** 扩展列表响应，只得到 scheme+host(:port) 的端点标识，避免响应携带 token 化的 path/query/userinfo。
- `POST /rpc-nodes` 创建：network/url/type=http|ws|lite/weight/api_key/enabled:boolean/purpose=general|manual_verify|both。
- `PATCH /rpc-nodes/{id}` 更新 url/weight/api_key/enabled/purpose；**network、type 不可修改**。启停同样是 `PATCH` 的 `{enabled:boolean}`，没有独立 /status POST。
- `DELETE /rpc-nodes/{id}` 软删除，前端需要输入节点 ID 确认。
- `POST /rpc-nodes/{id}/health-check` 返回 `{status:'unknown'|'ok'|'down',last_latency_ms:number}`，并由服务端保存。当前探测是 TCP 连通性，并非链同步高度、RPC JSON 行为或支付可用性的完整健康保证。
- 允许旧数据 `purpose/status` 为空时显示为 general/unknown，避免旧记录导致整个页面解析失败。

## 实现路径
- `web/src/api/endpoints/networks.ts`：强类型 Chain/Token 请求、bool/status/数值校验、Aptos asset ID 检查。
- `web/src/api/endpoints/rpc.ts`：RPC URL scheme/type 验证、大小限制、列表显式 DTO 白名单投影、端点 host-only 显示、密码字段仅显式提交与清除。
- `web/src/features/networks/chains-page.tsx`：两张表、按网络 Token 筛选、编辑、启停、Token 增加/删除及失败重试。
- `web/src/features/networks/rpc-page.tsx`：RPC 列表、网络查询、创建、编辑、启停、删除、按需 TCP 健康检查。编辑框不从服务端读取/回填 API Key 或 URL 明文。
- `web/src/features/networks/i18n.ts`：六语言核心词条；继续复用既有 CSS token 和通用 UI 组件。
- `web/src/main.tsx` 路由直接接入 `/chains` 和 `/rpc`；`web/src/style.css` 增加移动端表格横向滚动等基础样式。

## RPC 凭证保护与原前端兼容
- Go `src/model/mdb/rpc_node.go` 将 `ApiKey` JSON tag 改为 `json:"-"`，避免任何直接返回模型的响应暴露密钥。数据库字段本身不改，仍可用于 RPC 请求。
- Go `src/controller/admin/rpc_controller.go` 加入 `redact=1` 列表投影：省略 api_key，将 URL 仅渲染到 origin，服务端传输也不会把 URL 路径/查询参数送给新界面。遗留前端未使用该参数，原 URL 结构仍会返回，迁移完成后应继续收紧。
- 审查 `src/www/assets/rpc-BkV2cf1-.js` 确认旧版编辑会提交 api_key 空串。后端新 `clear_api_key:true` 仅在明确选择“清除”时删除旧凭证，收到旧表单空字符串时保留原值，防止升级后的意外清空。非空替换仍可使用原 `api_key` 字段。
- 新前端 API 对列表字段白名单投影，**不保存原始 URL、api_key、Query 或 path**。编辑表单中的敏感新凭证只存在当前 React 状态及发送的 HTTPS 请求体；关闭表单即清空，不使用 localStorage/sessionStorage/URL/console.log。
- 不能因此声称底层数据库不存凭据，也不能保证浏览器 DevTools、第三方反向代理、旧编译前端或运维层日志绝不接触敏感信息；正式替换后需完成这些链路的独立安全审计。

## 自动验证
- 前端 [Web Actions #42781772440](https://github.com/yakun0622/epusdt/actions/runs/42781772440) success：npm ci、TypeScript、Vitest **22 文件/63 测试**、Vite Build。
- Go 安全专项 `.github/workflows/rpc-secret-security.yml` 包括模型 JSON 不吐密钥、旧空密钥编辑默认保留、URL 路径/query 脱敏、历史 RPC 健康状态归一化测试。对应实际运行结果以 GitHub Actions 为准。
- 测试均为单测/构建：尚未进行真实浏览器全路由/新旧 UI 视觉对照、MySQL 真实数据库联调、链断线/恢复模拟、RPC 健康竞态及真实支付验证。

## 安全边界与下一步
- 禁用 Chain、ChainToken 或 RPC 节点会影响支付扫描/资产监控，确认弹窗不是生产环境的自动回滚能力；操作前需要有可用节点冗余。
- 本轮未修改生产 `src/www`、未部署 `web/dist`，W31 的关闭订单/人工补单/重发回调完全未触碰。
- 下一步 **W42/W43**：恢复 System、Telegram、Pay、EPay、OkPay 配置及 Dashboard 真实概览/统计，严格保护系统 Token 和支付参数，不伪造空数据。
