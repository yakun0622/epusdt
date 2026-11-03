# Go API 数据契约草案（源代码字段级审查）
> 来源：`src/model/mdb/*.go`、`src/controller/admin/*.go`、`src/util/http/response.go`。**此文件描述 Go 结构体及已确认的 JSON tag，不等于已在浏览器验证网络样本，也不等于所有字段总会返回。** 特别注意 `json:"-"` 的敏感字段。

## 通用响应与分页
```ts
interface ApiEnvelope<T> {
  status_code: number; message: string; data: T; request_id: string;
}
interface PageResult<T> {
  list: T[]; total: number; page: number; page_size: number;
}
interface BatchResult {
  key?: string; address?: string; ok: boolean; error_code?: number; error?: string;
}
```
Go 端 `SucJson` 成功时 `status_code=200`；错误既有 HTTP 状态也有业务码。**订单查询明确是 `{list,total,page,page_size}` 而不是默认所有 GET 都返回数组。** 其他列表 endpoint 需逐个查 controller 的返回结构。

## 订单
`src/model/mdb/orders_mdb.go` 与 `src/controller/admin/order_controller.go`：
```ts
type OrderStatus = 1 | 2 | 3 | 4; // 1=待支付 2=成功 3=过期 4=待选网络
interface Order {
  trade_id: string; order_id: string; parent_trade_id: string;
  block_transaction_id: string; amount: number; currency: string;
  actual_amount: number; receive_address: string; token: string;
  network: string; status: OrderStatus; notify_url: string;
  redirect_url: string; name: string; callback_num: number;
  callback_confirm: number; is_selected: boolean;
  payment_type: string; pay_provider: string; api_key_id: number;
  pay_by_sub_id: number;
  // BaseModel 的 created_at/updated_at/id 需按实际 JSON tag 补齐。
}
type OrderList = PageResult<Order>;
```
- `EpayType` 源结构体声明 `json:"-"`，不得出现在前端数据契约中。
- 操作端点：`POST /orders/{trade_id}/close`、`/mark-paid`、`/resend-callback`。
- 过滤参数：`network`、`token`、`address`、`keyword`、`status`、`start_at`、`end_at`、`page`、`page_size`（从 controller 确认存在；格式/校验需再查）。
- `/orders/list-with-sub` 和 `/{trade_id}/with-sub` 扩展 `sub_orders: Order[]`；原版订单 JS 未证实使用这些端点。

## 管理对象
| Model | 核实字段（Go JSON） | 需要处理的限制 |
|---|---|---|
| ApiKey | `name,pid,ip_whitelist,notify_url,status,call_count,last_used_at` | `secret_key` 结构体使用 `json:"-"`，仅专用 /secret、创建/轮换响应可见 |
| WalletAddress | `network,address,status,remark,source` | 某些列表附加 `order_count`，编辑接口只允许更新 remark |
| Chain | `network,display_name,enabled,min_confirmations,scan_interval_sec,extra` | PATCH 形参不一定全部必填；以 Go 验证为准 |
| ChainToken | `network,symbol,contract_address,decimals,enabled,min_amount` | 创建 `enabled?:boolean`；更新使用部分字段指针 |
| RpcNode | `network,url,type,weight,api_key,enabled,purpose,status,last_latency_ms,last_checked_at` | 是否在列表脱敏 `api_key` 需读 response/实测，不能直接按模型向 UI 显示 |
| NotificationChannel | `type,name,config,events,enabled` | config 可能含凭证，尽管模型存在也不代表旧前端已管理此项 |
| Setting | `group,key,value,type,description` | value 是字符串，`type` 可能为 string/int/bool/json，前端须显式序列化 |

> 每个 Model 还可能嵌入基础 ID、时间字段；不要简单省略或猜测其日期格式。生产 TS 类型最好通过与真实 Go serializer 的集成用例确认。

## 主要请求体（Go Controller 确认）
```ts
type CreateApiKey = { name: string; ip_whitelist?: string; notify_url?: string };
type UpdateApiKey = { name?: string; ip_whitelist?: string; notify_url?: string };
type WalletCreate = { network: string; address: string; remark?: string };
type WalletEdit = { remark: string };
type WalletImport = { network: string; addresses: string[] };
type StatusRequest = { status: number }; // Wallet/ApiKey 等，注意 RPC/ChainToken 使用 enabled:boolean
type CreateChainToken = {
  network: string; symbol: string; contract_address?: string;
  decimals: number; enabled?: boolean; min_amount?: number;
};
type UpdateChainToken = {
  contract_address?: string; decimals?: number; enabled?: boolean; min_amount?: number;
};
type CreateRpc = {
  network: string; url: string; type: string; weight: number;
  api_key?: string; enabled: boolean; purpose: string;
};
type UpdateRpc = {
  url?: string; weight?: number; api_key?: string; enabled?: boolean; purpose?: string;
};
type SettingUpsert = { items: Array<{ group: string; key: string; value: string; type: string }> };
```
后端 `api_key_controller.go` 创建响应包含 `{id,name,pid,secret_key}`，敏感信息需仅展示一次。

## Dashboard
`dashboard_controller.go` 的 overview：
`total_asset`、`volume`、`order_count`、`success_rate`、`seven_day_volume`、`active_addresses`、`online_chains`。

order-stats：`order_count`、`success_count`、`success_rate`、`avg_payment_seconds`、`expired_unpaid_count`。

rpc-stats：`generated_at`、`summary`、`chains[]`；summary 内有 enabled/active/ok/warning/down/unknown/disabled chains、成功与失败次数；单链数据有 network/display_name/has_data/status/latest_block_height/last_sync_at。

**注意**：`success_rate` 等是否为 0..1 比例，以及前端如何格式化成百分比需逐个核查；不得假设直接显示数值。

## 下一步应补
1. Go `comm` 收银台响应类型、`Order` 的公共字段过滤（禁止把管理字段和 secret 返回给公共接口）。
2. 验证 Create/Update 结构体的 `*bool`、`*int` 实际选填语义、默认值及范围。
3. 查清所有列表 API data 是否数组、是否含分页，抽取实际请求与脱敏响应样本。
4. 输出准确可编译的 `web/src/api/types`，不能直接把文档的草案视为已校验的最终 TS。
