import type { BaseRow, OrderStatus, PageResult, ToggleStatus } from './common';

export interface LoginResponse { token: string; username: string; user_id: number }
export interface Profile extends BaseRow {
  username: string;
  status: ToggleStatus;
  last_login_at: string;
  password_is_default: boolean;
}
export interface Order extends BaseRow {
  trade_id: string; order_id: string; parent_trade_id: string;
  block_transaction_id: string; amount: number; currency: string;
  actual_amount: number; receive_address: string; token: string;
  network: string; status: OrderStatus; notify_url: string;
  redirect_url: string; name: string; callback_num: number;
  callback_confirm: ToggleStatus; is_selected: boolean;
  payment_type: string; pay_provider: string;
  api_key_id: number; pay_by_sub_id: number;
}
export type OrderList = PageResult<Order>;
export interface OrderWithSub extends Order { sub_orders: Order[] }
export interface Wallet extends BaseRow {
  network: string; address: string; status: ToggleStatus;
  remark: string; source: string; order_count: number;
}
export interface ApiKey extends BaseRow {
  name: string; pid: string; ip_whitelist: string; notify_url: string;
  status: ToggleStatus; call_count: number; last_used_at: string;
  // secret_key intentionally excluded from list DTO (Go json:"-").
}
export interface ApiKeyCreated { id: number; name: string; pid: string; secret_key: string }
export interface ApiKeySecret { secret_key: string }
export interface Chain extends BaseRow {
  network: string; display_name: string; enabled: boolean;
  min_confirmations: number; scan_interval_sec: number; extra: string;
}
export interface ChainToken extends BaseRow {
  network: string; symbol: string; contract_address: string;
  decimals: number; enabled: boolean; min_amount: number;
}
export interface RpcNode extends BaseRow {
  network: string; url: string; type: 'http'|'ws'|'lite'; weight: number;
  api_key: string; enabled: boolean; purpose: 'general'|'manual_verify'|'both';
  status: 'unknown'|'ok'|'down'; last_latency_ms: number; last_checked_at: string;
}
export interface Setting extends BaseRow {
  group: string; key: string; value: string;
  type: 'string'|'int'|'bool'|'json'; description: string;
}
export interface SettingUpsert {
  items: Array<Pick<Setting, 'group'|'key'|'value'|'type'>>;
}
export interface DashboardOverview {
  total_asset: number; volume: number; order_count: number;
  success_rate: number; seven_day_volume: number;
  active_addresses: number; online_chains: number;
}
