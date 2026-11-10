import { adminClient } from '../../api';

export type DashboardRange = 'today' | '7d' | '30d' | 'custom';
export type DashboardFilter = { range: DashboardRange; startAt?: number; endAt?: number };
export interface Overview {
  total_asset: number; volume: number; order_count: number; success_rate: number;
  seven_day_volume: number; active_addresses: number; online_chains: number;
}
export interface OrderStats {
  order_count: number; success_count: number; success_rate: number;
  avg_payment_seconds: number; expired_unpaid_count: number;
}
export interface DailyOrderStat {
  day: string; order_count: number; success_count: number;
  total_amount: number; actual_amount: number;
}
export interface RpcChainState {
  network: string; display_name: string; enabled: boolean; has_data: boolean;
  status: 'ok'|'warning'|'down'|'unknown'|'disabled';
  success_count: number; failure_count: number; success_rate: number;
  latest_block_height: number; last_sync_at: string;
}
export interface RpcSnapshot {
  generated_at: string;
  summary: { total_chains: number; enabled_chains: number; active_chains: number;
    ok_chains: number; warning_chains: number; down_chains: number;
    unknown_chains: number; disabled_chains: number; success_count: number;
    failure_count: number; success_rate: number };
  chains: RpcChainState[];
}
function obj(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new TypeError('Invalid dashboard response');
  return x as Record<string, unknown>;
}
function num(x: Record<string,unknown>, key: string, integer=false): number {
  const n=x[key];
  if (typeof n!=='number'||!Number.isFinite(n)||(integer&&(!Number.isInteger(n)||n<0)))
    throw new TypeError('Invalid dashboard field '+key);
  return n;
}
function ratio(x:Record<string,unknown>,key:string) {
  const n=num(x,key);if(n<0||n>1)throw new TypeError('Invalid ratio '+key);return n;
}
export function decodeOverview(raw:unknown):Overview {
  const x=obj(raw);
  return {total_asset:num(x,'total_asset'),volume:num(x,'volume'),
    order_count:num(x,'order_count',true),success_rate:ratio(x,'success_rate'),
    seven_day_volume:num(x,'seven_day_volume'),
    active_addresses:num(x,'active_addresses',true),online_chains:num(x,'online_chains',true)};
}
export function decodeOrderStats(raw:unknown):OrderStats {
  const x=obj(raw);
  return {order_count:num(x,'order_count',true),success_count:num(x,'success_count',true),
    success_rate:ratio(x,'success_rate'),avg_payment_seconds:num(x,'avg_payment_seconds'),
    expired_unpaid_count:num(x,'expired_unpaid_count',true)};
}
export function decodeTrend(raw:unknown):DailyOrderStat[] {
  if(!Array.isArray(raw))throw new TypeError('Invalid trend array');
  return raw.map(r=>{
    const x=obj(r);
    if(typeof x.day!=='string'||!/^\d{4}-\d{2}-\d{2}( \d{2}:00)?$/.test(x.day))
      throw new TypeError('Invalid trend date');
    return {day:x.day,order_count:num(x,'order_count',true),
      success_count:num(x,'success_count',true),total_amount:num(x,'total_amount'),
      actual_amount:num(x,'actual_amount')};
  });
}
export function decodeRpcSnapshot(raw:unknown):RpcSnapshot {
  const x=obj(raw),s=obj(x.summary);
  if(typeof x.generated_at!=='string'||!Array.isArray(x.chains))
    throw new TypeError('Invalid RPC snapshot');
  const keys=['total_chains','enabled_chains','active_chains','ok_chains','warning_chains',
    'down_chains','unknown_chains','disabled_chains','success_count','failure_count'] as const;
  const summary=Object.fromEntries(keys.map(k=>[k,num(s,k,true)])) as
    Record<(typeof keys)[number],number>;
  const statuses=new Set(['ok','warning','down','unknown','disabled']);
  return {generated_at:x.generated_at,summary:{...summary,success_rate:ratio(s,'success_rate')},
    chains:x.chains.map(item=>{
      const row=obj(item);
      if(typeof row.network!=='string'||typeof row.display_name!=='string'||
        typeof row.enabled!=='boolean'||typeof row.has_data!=='boolean'||
        !statuses.has(String(row.status))||typeof row.last_sync_at!=='string')
        throw new TypeError('Invalid RPC chain snapshot');
      return {network:row.network,display_name:row.display_name,enabled:row.enabled,
        has_data:row.has_data,status:row.status as RpcChainState['status'],
        success_count:num(row,'success_count',true),failure_count:num(row,'failure_count',true),
        success_rate:ratio(row,'success_rate'),latest_block_height:num(row,'latest_block_height',true),
        last_sync_at:row.last_sync_at};
    })};
}
export function dashboardQuery(f:DashboardFilter):string {
  if(!['today','7d','30d','custom'].includes(f.range))throw new TypeError('Invalid range');
  const q=new URLSearchParams({range:f.range});
  if(f.range==='custom'){
    if(!Number.isSafeInteger(f.startAt)||!Number.isSafeInteger(f.endAt)||
      f.startAt!<0||f.endAt!<f.startAt!)throw new TypeError('Invalid custom Unix seconds');
    q.set('start_at',String(f.startAt));q.set('end_at',String(f.endAt));
  }
  return '?'+q.toString();
}
export const dashboardApi={
  overview:async(f:DashboardFilter,signal?:AbortSignal):Promise<Overview>=>
    decodeOverview(await adminClient.json<unknown>('/dashboard/overview'+dashboardQuery(f),{signal})),
  orders:async(f:DashboardFilter,signal?:AbortSignal):Promise<OrderStats>=>
    decodeOrderStats(await adminClient.json<unknown>('/dashboard/order-stats'+dashboardQuery(f),{signal})),
  trend:async(f:DashboardFilter,signal?:AbortSignal):Promise<DailyOrderStat[]>=>
    decodeTrend(await adminClient.json<unknown>('/dashboard/revenue-trend'+dashboardQuery(f),{signal})),
  rpc:async(signal?:AbortSignal):Promise<RpcSnapshot>=>
    decodeRpcSnapshot(await adminClient.json<unknown>('/dashboard/rpc-stats/snapshot',{signal,cache:'no-store'})),
};
