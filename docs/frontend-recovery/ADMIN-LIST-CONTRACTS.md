# 后台列表接口：返回结构与查询参数矩阵
> 核对 `src/controller/admin/*_controller.go` 中的实际 return，而不只看 Swagger 注释。所有下列响应均在 `ApiEnvelope.data` 内。

| GET 路径（前缀 /admin/api/v1） | data 结构 | 已核实筛选项 | 备注 |
|---|---|---|---|
| /orders | **对象** `{list:Order[],total:number,page:number,page_size:number}` | network, token, address, keyword, status, start_at, end_at, page, page_size | 后端兜底 page=1, page_size=20；原 JS 主动传 1/10 |
| /orders/list-with-sub | **对象**，list 行扩展 sub_orders | 同 /orders | 仅父订单作为顶层，子订单内嵌数组 |
| /orders/{trade_id}/with-sub | **对象**，Order 加 sub_orders | path trade_id | 传子单会先找到父单 |
| /wallets | **数组** `WalletListItem[]` | network, status, keyword | `WalletListItem = WalletAddress + order_count`，无分页对象 |
| /api-keys | **数组** `ApiKey[]` | 无内建筛选 | `secret_key` 不在普通 JSON 模型中 |
| /chains | **数组** `Chain[]` | 无 | network 唯一 |
| /chain-tokens | **数组** `ChainToken[]` | network | 可用 network 过滤 |
| /rpc-nodes | **数组** `RpcNode[]` | network | RPC 过滤在服务端 |
| /notification-channels | **数组** `NotificationChannel[]` | type | 原版 /settings/notifications 是展示型假表单，非此列表 |
| /settings | **数组** `Setting[]` | group | value 为字符串，批量变更另走 PUT |
| /config | **对象** `PublicConfigResponse` 管理扩展版 | 无 | 包含凭证字段，不能当公开配置使用 |

## Order List 精确语义
`parseOrderFilter`：
- network 转小写、token 转大写；address/keyword trim。
- start_at/end_at 是 **Unix seconds**，Go 用 `time.Unix(n,0)` 解析，不是毫秒。
- page < 1 置为 1；page_size < 1 置为 20；无法解析的整数筛选会忽略。
- `/orders/export` **返回 CSV 响应（text/csv，最多 10,000 行）**，不是 JSON；必须作为下载请求处理，不能套 JSON 解包。
- 后端 `/orders/{trade_id}/close` 仅接受 status 1/4 订单。成功需控制重复触发，后端可能返回状态冲突。
- 后台手工补单 `/mark-paid` 使用 `{block_transaction_id}`，通过服务端校验区块链交易（不是简单直接改状态）。
- `/resend-callback` 必须 status=2 且 notify_url 非空；后端入队，不等于通知已经投递成功。

## Wallet List 精确语义
- `GET /wallets` 从 Gorm 查询 network/status/keyword，按 id DESC 返回，附加 `order_count`。没有服务端 page/page_size。
- `PATCH /wallets/{id}` 只能更新 `remark`（Go `*string`）；没有 remark 时相当于无修改，空字符串允许明确清空。
- `POST /wallets/{id}/status` 以数值 1/2 启停；`DELETE` 为软删除。
- 批量导入入参 `{network,addresses:string[]}`；**即使部分失败，整体仍然 200**，逐项 `{address,ok,error_code?,error?}`。前端必须展示失败行，不能仅依据 HTTP 200 说“全部成功”。

## 其他需保持的区别
- API Key 创建/轮换/查看 secret 是独立敏感响应；普通列表的 `secret_key` 使用 `json:"-"`。
- Chain/RPC 的 enabled 是 **布尔值**，钱包/API Key status 使用数值 **1/2**。
- `GET /settings` 是数组而 `PUT /settings` 请求 `{items:[{group,key,value,type}]}`，返回逐键结果（可能部分失败）。
- RPC Model 的 `api_key` 字段 JSON tag 不是 `-`；**需要确认列表是否经过另外的脱敏层**，若没有应视为潜在凭证暴露面，恢复 UI 时不能默认直接渲染或公开缓存。

## 对后续 web 实现的约束
```ts
type ListResult<T> = T[];           // 钱包、RPC、Chain、API Key 等
type PaginatedResult<T> = { list:T[];total:number;page:number;page_size:number }; // 订单
type CSVDownload = Blob;           // 订单导出
```
**不要设计一个假设所有 GET list 都 `data.pagination` 的通用解包器。** 布局组件可共享，但 API 的 data 契约必须按 endpoint 分开处理。
