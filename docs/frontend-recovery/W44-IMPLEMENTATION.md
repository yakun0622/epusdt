# W44：后台辅助页面、通知凭证脱敏与单任务合并规范

日期：2026-11-10；仓库：`yakun0622/epusdt`；开发分支：`feat/w44-auxiliary-pages`。

## Go 路由与恢复范围

| 浏览器页面 | 恢复形态 | 真实 API / 边界 |
| --- | --- | --- |
| `/settings/display` | 本地主题、语言设置 + 品牌配置只读预览 | `GET /admin/api/v1/settings?redact=1`；品牌修改仍由 W42 `/settings/pay` 负责 |
| `/settings/notifications` | Telegram 渠道列表、新增、名称/事件编辑、状态、凭证整体替换、二次确认软删除 | `GET/POST /notification-channels`、`PATCH/DELETE /notification-channels/{id}`、`POST /notification-channels/{id}/status` |
| `/payment-setup`、`/payment-setup/integrations` | 只读真实接入配置概况、内页管理入口 | `GET /api-keys`、`GET /chains`、`GET /settings?redact=1`；不执行签名、不发起真实付款 |
| `/help` | 文档导航及系统入口 | 没有专用帮助 API，使用仓库 README |
| `/install` | 无副作用的公共安装说明 | 后端没有可核实的安装向导 API；**没有建表、生成凭证、重置账户或自动部署功能** |

通知发送器现状：`src/notify/dispatcher.go` 通过注册的 Sender 分发，现有实际发送器为 Telegram。Webhook/Email 虽为 Go 枚举允许的类型，但当前没有可确认的发送器，因此 W44 把这两类渠道展示为只读，禁止虚构其投递成功。

## 敏感凭证安全

- Go `src/controller/admin/notification_controller.go` 新增 `?redact=1` 响应投影。安全 DTO 仅输出 `id,type,name,enabled,configured,events`，**不输出 `Config` JSON、Bot Token、Chat ID、Webhook URL/Header/Secret**。新增 Telegram 返回值在 `?redact=1` 下同样脱敏，并设置 HTTP `Cache-Control: no-store`。
- 旧版调用未带该参数时仍使用原数据结构，避免生产原编译前端即时失效。正式新版切换后应再检查并收紧这一兼容出口。
- 新版 `web/src/api/endpoints/notifications.ts` 读取时使用 `?redact=1` 且对返回项二次字段白名单投影；未知字段永远不进入前端行数据。
- 仅 Telegram 提供实际管理写操作：创建需全量输入 Bot Token + Chat ID，替换也须输入两项且确认渠道 ID；更新普通信息仅提交名称与订阅事件，不接触 `config`，保证无意编辑不会清空旧凭证。
- 敏感输入只存在操作弹窗的 React 状态；弹窗关闭、成功或失败后清空；不会写入 localStorage、sessionStorage、URL、Cookie、console 日志或剪贴板；涉及敏感请求的服务端错误不原文展示，避免 token 回显。
- 状态修改及删除有风险说明；删除必须输入精确 ID；不要求用户输入任何助记词或钱包私钥。
- Display/Integrations 对真实设置的只读请求复用 W42 的 URL 与敏感 key 脱敏层；页面不把“已有配置”误认为实际成功支付回调验证。

## 代码位置与测试

- `web/src/features/auxiliary/notifications-page.tsx`：Telegram 渠道管理与弹窗。
- `web/src/features/auxiliary/info-pages.tsx`：Display / Integrations / Help / Install 辅助页面。
- `web/src/features/auxiliary/i18n.ts`：六语言核心文案；`web/src/main.tsx` 集成既有路由，`web/src/style.css` 添加响应式布局。
- `web/src/api/endpoints/notifications.ts`：真实 Go 契约、强类型响应和敏感写入错误收敛；配套测试。
- `src/controller/admin/notification_safe_test.go`：Go JSON 安全回归，确保字段白名单不返回密钥。
- `.github/workflows/notification-safety.yml`：仅此模块 Go 安全测试。
- `.github/workflows/web-build-manual.yml`：原 `master` 推送触发不变，新增 `feat/**` 分支验证。分支 Actions 仅检查编译，不推送锁文件、不修改生产静态资源。

## 合并规范（本次开始）

1. 每个 Wxx 大任务只建立 **一个临时分支**，所有中间代码和测试提交到该分支。
2. 分支自动 Actions：Node 22、npm ci、TypeScript、Vitest、Vite Build；涉及 Go 时运行对应的 Go 专项测试。
3. 仅在分支 Actions 全绿并完成安全审查后创建 PR，以 **squash** 方式向 master 合并 **一次**。
4. 合并后检查 master 的自动 Actions 和更新后的生产隔离状态；**删除临时分支**，避免分支堆积。若当前授权工具没有删除 ref 的动作，必须明确标出残留分支并提供 GitHub 删除入口，不得谎报已删除。

## 上线前未完成

- 真正登录浏览器中的所有交互、多语言、移动端截图、真实 Telegram 发送与重连、敏感值出入站和后台权限验证尚未进行；Actions 单元测试不等于业务上线验收。
- 公共 `/install` 只是说明，不是安装向导；收银台完整支付链路仍留到 W50–W55。
- 本次绝不更动 W31 订单关闭、人工补单或回调重发；不修改生产 `src/www`。
