# 前端恢复实施规格与验收顺序

## 不变约束

- 源码始终放在 `web/`；`src/www/` 是仍在使用的原版发布构建，除切换验收外不改动。
- 本阶段只交付分析文档，不新建页面、不调整 Go 后端、不改 Docker/CI。
- 页面与行为优先对齐原版；业务错误与安全性以当前 Go 后端为准。禁止把原版演示表单误当成真实持久化功能。

## 工作包（每包至少包含源码、接口契约、状态与失败路径验证）

| 顺序 | 工作包 | 参考文件 | 验收门槛 |
|---|---|---|---|
| 0 | 建立完整静态取证矩阵 | router、所有业务 JS、Go controllers | 每个路由有组件/API/行为证据或明确待核查 |
| 1 | 后台布局、认证和路由 | route-TItYb9Ps、sign-in、auth-store、password | redirect、过期 JWT、默认密码提醒、退出、刷新完整 |
| 2 | 订单 | orders、Go order_controller | 列表分页、详情、关闭、标记支付、重发回调及危险操作确认 |
| 3 | 钱包、API Key | addresses、keys | CRUD、批量导入、密钥遮挡/轮换、状态操作与后端错误反馈 |
| 4 | Chains、RPC | chains、chains-store、rpc | 依赖链 Token、健康检查、启停及输入验证 |
| 5 | 设置与支付配置 | route-BkjShyH8、system、telegram、pay、epay、okpay | 批量 settings payload、重置、禁止修改的字段、汇率 JSON 校验 |
| 6 | 仪表盘及辅助页 | dashboard、payment-setup、integrations、display、appearance、help | 指标与过滤正确；占位/演示页明确处理，主题和语言对齐 |
| 7 | 收银台 | _trade_id、checkout-model、Go comm controllers | 选择、支付、状态轮询、失败/过期、hash 提交、支付后跳转全分支 |
| 8 | 打包交付 | main.go、Dockerfile、SPA handler | web → dist → src/www → Go embed，保留旧版回滚点 |

## 每个业务模块的完成定义（DoD）

- 用文档中**已证实的**路由/API/字段作为范围，补齐浏览器操作核验记录。
- 记录 HTTP 方法、真实请求 JSON、响应 data 结构和错误处理；API 差异先修契约后写 UI。
- 含 loading、empty、error、失效/禁用、权限保护及重复请求场景。
- 不把已写组件等同于已验收：需 `npm run typecheck`、构建和相关交互测试通过。
- 涉及敏感值（API Key、OkPay token、Telegram bot token）时确保不泄露到日志/公开页面。

## 应增加的取证工件

- `docs/frontend-recovery/evidence/<module>.md`：每页原图/组件结构、操作截图、请求样本（脱敏）、原 JS 证据片段。
- `docs/frontend-recovery/contracts/*.ts` 或 `web/src/api/types`：经 Go 和实测确认的请求/响应类型。
- 支付状态机表，明确服务端 status、时间戳、重试次数、跳转规则及测试用例。
- 完整资源清单与生成式 API 客户端核验；不要简单追求复制原始压缩模块。

## 阶段门槛

- **逆向文档门槛**：无“已全部分析”的虚假声明；每个未拆完的模块保留 TODO。
- **替换门槛**：新 UI 全部主要路由功能对照通过；收银台真实模拟支付通过，且能回滚到旧 `src/www`。
- **上线门槛**：检查域名/HTTPS、缓存、PWA 更新、资源相对路径、支付接口排除 SPA fallback、Go embed 和 Docker 镜像。
