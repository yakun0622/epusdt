# 订单、钱包、公共支付与业务功能差异检查
> 2026-11-03，以 Go request/controller 及原 `src/www/assets` 的关键 chunk 为证据。此处区分**后端可用**、**原编译前端可见**与**尚未实测**。不是已交付功能。

## 1. 验证约束矩阵
| 操作 | Go 请求字段与校验 | 前端恢复注意 |
|---|---|---|
| 管理员创建 API Key | `name:required|maxLen:128`；`ip_whitelist`/ `notify_url` 可选 | 创建返回 secret 一次性展示，普通列表不展示 |
| API Key 更新 | `*string` 指针，字段可单独修改/清空 | `undefined` 表示不改；`""` 表示清空 |
| API Key 状态 | `status:int required|in:1,2` | 不要发送 boolean |
| 添加钱包 | `network:required`、`address:required`、remark 可选 | 地址格式和去重还在 data/service，前端只做基本必填 |
| 钱包修改 | `remark:*string` | 不能在编辑请求中传 network/address；空字符串可清空 |
| 钱包状态 | `status:int required|in:1,2` | 启停正确与列表刷新 |
| 批量钱包导入 | `network:required`、`addresses:[]string required` | 整体 HTTP 200 但内部逐项失败 |
| 后台手工标记已付 | `block_transaction_id:required`，trim | **必须真实验证链上交易**；不能为了“恢复功能”改为直接切 status |
| 公共提交 tx hash | 同上 | 过期单/OkPay 禁止，必须依赖服务端回包 |
| 关闭订单 | path trade_id；服务端仅 status=1/4 | 状态冲突要显示错误 |
| 重发回调 | path trade_id，status=2 且 notify_url 不空 | 接口执行表示重新排队，非回调已送达 |
| 公共创建交易 | `order_id:required|maxLen:32`、`currency:required`、`amount:required|isFloat|gt:0.01`、`notify_url:required`、`signature:required` | token/network 要成对；空表示占位订单 status=4 |
| 公共切链 | `trade_id/token/network` 全部 required | 处理 status=4 原地补全和 status=1 生成子单两个场景 |
| RPC 创建 | `network/url:required`、`type:required|in:http,ws,lite`，weight 小于 1 后端归一成 1；enabled 缺省 true | URL 类型、purpose 在 controller 二次验证 |
| ChainToken 创建 | `network:required`、`symbol:required|maxLen:32`，decimals=0 时默认 6 | Aptos enabled 需要合格资产 ID / contract_address |
| ChainToken 更新 | `*string/*int/*bool/*float64` 指针字段 | false/0 要与字段缺失区分 |
| 设置批量更新 | `items:required`，单个 `{group,key,value,type}` | 逐键成功/失败需展示，不能只看 HTTP 200 |

## 2. 后端已提供而原版前端尚未确证接入
| 后端能力 | 状态 | 后续策略 |
|---|---|---|
| /admin/api/v1/notification-channels 完整 CRUD | Go 确认；原 /settings/notifications 编译页仅 show-submitted-data | 是“恢复原版演示”还是“新增真正通知管理”需分开任务 |
| /admin/api/v1/orders/list-with-sub、/{trade_id}/with-sub | Go 确认；原 orders chunk 只证实普通详情/列表 | 若开发父子单列表，是增强功能，不冒充原版 1:1 |
| /admin/api/v1/orders/export | Go 确认，text/csv；原 orders chunk 未确证直接调用该 endpoint | 先确认原 UI 的导出按钮是否有真实 handler/是否占位 |
| /admin/api/v1/wallets/{id} | Go 确认；原地址管理使用列表和编辑，未确证独立详情请求 | 不能凭接口存在补出原 UI 路由 |
| /admin/api/v1/settings/rate/refresh | Go 确认；前端 pay/settings 存在相关可能操作 | 需追踪封装后确认点击行为和错误结果 |
| /admin/api/v1/config | Go 确认是管理员配置详情 | 不得和公开 config 互换、泄露商户凭证 |

## 3. 原版确认为演示/本地设置而非远端业务
- `/settings/notifications`：表单最终调用 show-submitted-data；不是 notification-channels CRUD。
- `/settings/display`：只展示提交数据；没有远端用户显示配置接口证据。
- `/settings/appearance`：通过 theme/font providers 本地生效，部分行为另调用 show-submitted-data；不是后台 settings API。
- `/payment-setup/integrations`：只读静态接口说明数组 GMPay/EPay/OKPay，不是商户接入实例列表。

## 4. 关键风险和纠偏
1. **API 类型冲突**：以前草案 `CheckoutOrder` 的 timestamp 可选/字符串只是 JS 兼容性写法；Go `CheckoutCounterResponse` 实际返回 int64 Unix 秒。正式 TS 类型须以 Go 强类型为主、容错转换留边界层。
2. **后端列表不统一**：只有订单分页对象，钱包/API Key/RPC/链/通知/设置返回数组。
3. **明文凭证面**：管理员 config 可返回 OkPay ShopToken、RPC 列表 Model 带 api_key、NotificationChannel 的 config 可能含 token；前端不应日志化这些结果，生产安全审计需要单独检查后端返回是否脱敏。
4. **无法证明完全还原**：缺少全部 205 文件的业务依赖图、真实浏览器截图、请求抓包、测试 fixture；这些仍是静态逆向之后的验收依赖。
5. **服务端输出优先**：支付状态不能被用户手动改前端数据冒充成功；回调与签名依赖服务端校验。

## 5. 下一步建议（仅计划，尚未开发）
1. 完成 Go/service 的具体状态码错误契约和浏览器实际 JSON 样本（脱敏）。
2. 补收银台父子单状态/回跳实测矩阵，确认全部面板。
3. 再把稳定接口契约转成 `web/src/api/types` 的可编译 TS 文件；之后按模块恢复前端。
