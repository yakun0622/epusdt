import { adminClient } from '../../api';

export type SettingsPage = 'system' | 'telegram' | 'pay' | 'epay' | 'okpay';
export type StoredSettingType = 'string' | 'int' | 'bool' | 'json';
export type FieldKind = 'text' | 'number' | 'boolean' | 'json' | 'secret' | 'select';
export interface SettingField {
  page: SettingsPage;
  group: 'system' | 'rate' | 'brand' | 'epay' | 'okpay';
  key: string;
  type: StoredSettingType;
  kind: FieldKind;
  min?: number;
  max?: number;
  options?: readonly string[];
}
export interface PublicSetting {
  key: string;
  value: string;
  group: string;
  type: StoredSettingType;
}
export interface SettingWrite {
  group: SettingField['group'];
  key: string;
  value: string | number | boolean;
  type: StoredSettingType;
}
export interface SaveRow {
  key: string;
  ok: boolean;
  error_code?: number;
  error?: string;
}
export interface SaveSummary {
  rows: SaveRow[];
  successCount: number;
  failureCount: number;
  failedKeys: string[];
  allSucceeded: boolean;
}
const spec = (page: SettingsPage, group: SettingField['group'], key: string,
  type: StoredSettingType, kind: FieldKind, extra: Partial<SettingField> = {}): SettingField =>
  ({ page, group, key: group + '.' + key, type, kind, ...extra });

export const settingFields: readonly SettingField[] = [
  spec('system', 'system', 'order_expiration_time', 'int', 'number', { min: 1, max: 525600 }),
  spec('system', 'system', 'amount_precision', 'int', 'number', { min: 2, max: 6 }),
  spec('system', 'system', 'log_level', 'string', 'select', { options: ['debug', 'info', 'warn', 'error'] }),
  spec('telegram', 'system', 'telegram_bot_token', 'string', 'secret'),
  spec('telegram', 'system', 'telegram_chat_id', 'string', 'text'),
  spec('telegram', 'system', 'telegram_payment_notice_enabled', 'bool', 'boolean'),
  spec('telegram', 'system', 'telegram_abnormal_notice_enabled', 'bool', 'boolean'),
  spec('pay', 'rate', 'mode', 'string', 'select', { options: ['fixed', 'auto'] }),
  spec('pay', 'rate', 'forced_rate_list', 'json', 'json'),
  spec('pay', 'rate', 'api_url', 'string', 'text'),
  spec('pay', 'rate', 'cache_ttl_seconds', 'int', 'number', { min: 10, max: 86400 }),
  spec('pay', 'rate', 'adjust_percent', 'string', 'number', { min: -100, max: 1000 }),
  spec('pay', 'rate', 'okx_c2c_enabled', 'bool', 'boolean'),
  spec('pay', 'brand', 'checkout_name', 'string', 'text'),
  spec('pay', 'brand', 'logo_url', 'string', 'text'),
  spec('pay', 'brand', 'site_title', 'string', 'text'),
  spec('pay', 'brand', 'success_copy', 'string', 'text'),
  spec('pay', 'brand', 'support_url', 'string', 'text'),
  spec('pay', 'brand', 'background_color', 'string', 'text'),
  spec('pay', 'brand', 'background_image_url', 'string', 'text'),
  spec('epay', 'epay', 'default_token', 'string', 'text'),
  spec('epay', 'epay', 'default_currency', 'string', 'text'),
  spec('epay', 'epay', 'default_network', 'string', 'text'),
  spec('okpay', 'okpay', 'enabled', 'bool', 'boolean'),
  spec('okpay', 'okpay', 'shop_id', 'string', 'text'),
  spec('okpay', 'okpay', 'shop_token', 'string', 'secret'),
  spec('okpay', 'okpay', 'api_url', 'string', 'text'),
  spec('okpay', 'okpay', 'callback_url', 'string', 'text'),
  spec('okpay', 'okpay', 'return_url', 'string', 'text'),
  spec('okpay', 'okpay', 'timeout_seconds', 'int', 'number', { min: 1, max: 3600 }),
  spec('okpay', 'okpay', 'allow_tokens', 'string', 'text'),
];
const fields = new Map(settingFields.map(field => [field.key, field]));
export const sensitiveKeys = new Set(settingFields.filter(f => f.kind === 'secret').map(f => f.key));
const allowedTypes = new Set<StoredSettingType>(['string', 'int', 'bool', 'json']);
export function settingsForPage(page: SettingsPage): SettingField[] {
  return settingFields.filter(field => field.page === page);
}
export function redactSettingsURL(value: string): string {
  if (!value.trim()) return '';
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) return '[configured URL hidden]';
    return parsed.protocol + '//' + parsed.host;
  } catch { return '[configured URL hidden]'; }
}
export function decodeSettings(payload: unknown): PublicSetting[] {
  if (!Array.isArray(payload)) throw new TypeError('Settings list must be an array');
  const output: PublicSetting[] = [];
  for (const raw of payload as unknown[]) {
    if (!raw || typeof raw !== 'object') throw new TypeError('Invalid settings row');
    const item = raw as Record<string, unknown>;
    if (typeof item.key !== 'string' || typeof item.value !== 'string' ||
      typeof item.group !== 'string' || !allowedTypes.has(item.type as StoredSettingType))
      throw new TypeError('Invalid settings row');
    const field = fields.get(item.key);
    // Never copy unknown settings or secrets to React state, even on a broken Go server.
    if (!field || field.kind === 'secret' || field.group !== item.group) continue;
    output.push({ key: item.key, value: item.key.endsWith('_url') ? redactSettingsURL(item.value) : item.value, group: item.group,
      type: item.type as StoredSettingType });
  }
  return output;
}
export function validateSetting(field: SettingField, text: string): SettingWrite {
  if (field.kind === 'secret') return { group: field.group, key: field.key, type: field.type, value: text };
  if (field.kind === 'boolean') {
    if (text !== 'true' && text !== 'false') throw new TypeError(field.key + ': expected boolean');
    return { group: field.group, key: field.key, type: 'bool', value: text === 'true' };
  }
  if (field.kind === 'number') {
    if (text.trim() === '') throw new TypeError(field.key + ': empty numeric input');
    const value = Number(text);
    if (!Number.isFinite(value) || (field.type === 'int' && !Number.isInteger(value)) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)) throw new TypeError(field.key + ': invalid number');
    return { group: field.group, key: field.key, type: field.type,
      value: field.type === 'int' ? value : String(value) };
  }
  if (field.kind === 'select' && !field.options?.includes(text))
    throw new TypeError(field.key + ': unsupported value');
  if (field.kind === 'json') {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new TypeError(field.key + ': invalid JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new TypeError(field.key + ': expected a JSON object');
    return { group: field.group, key: field.key, type: 'json', value: text };
  }
  return { group: field.group, key: field.key, type: field.type, value: text };
}
export function reconcileSettingsWrite(requested: readonly SettingWrite[], payload: unknown): SaveSummary {
  if (!Array.isArray(payload)) throw new TypeError('Invalid settings save response');
  const rows: SaveRow[] = requested.map((item, i) => {
    const r: unknown = payload[i];
    if (!r || typeof r !== 'object') return { key: item.key, ok: false, error: 'Missing per-key result' };
    const result = r as Record<string, unknown>;
    if (result.key !== item.key || typeof result.ok !== 'boolean')
      return { key: item.key, ok: false, error: 'Mismatched per-key result' };
    return {
      key: item.key, ok: result.ok,
      error_code: typeof result.error_code === 'number' ? result.error_code : undefined,
      // Never echo server-provided text for credential keys: even errors may reflect input.
      error: sensitiveKeys.has(item.key) ? undefined :
        typeof result.error === 'string' ? result.error : undefined,
    };
  });
  for (const extra of payload.slice(requested.length) as unknown[]) {
    const key = extra && typeof extra === 'object' && typeof (extra as Record<string, unknown>).key === 'string'
      ? String((extra as Record<string, unknown>).key) : '(unknown)';
    rows.push({ key, ok: false, error: 'Unexpected additional result from server' });
  }
  const failures = rows.filter(row => !row.ok);
  return {
    rows, successCount: rows.filter(row => row.ok).length,
    failureCount: failures.length, failedKeys: requested.map(item => item.key)
      .filter((_, i) => !rows[i]?.ok), allSucceeded: failures.length === 0 && rows.length === requested.length,
  };
}
export const settingsApi = {
  list: async (signal?: AbortSignal): Promise<PublicSetting[]> =>
    decodeSettings(await adminClient.json<unknown>('/settings?redact=1', { signal, cache: 'no-store' })),
  save: async (items: readonly SettingWrite[]): Promise<SaveSummary> => {
    if (!items.length) throw new TypeError('No modified settings');
    const raw = await adminClient.json<unknown>('/settings', {
      method: 'PUT', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ items }),
    });
    return reconcileSettingsWrite(items, raw);
  },
};

export interface RateBaseState {
  base: string;
  rates: Record<string,number>;
  is_stale: boolean;
  last_refresh_ok: boolean;
  last_success_at: string;
  last_attempt_at: string;
}
export interface RateStatus {
  mode: 'auto'|'fixed';
  cache_ttl_seconds: number;
  bases: RateBaseState[];
}
export interface RateRefreshRow {
  base: string;
  ok: boolean;
  skipped: boolean;
  rates: Record<string,number>;
}
function redactRates(value:unknown):Record<string,number> {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const out:Record<string,number>={};
  for(const [key,n] of Object.entries(value)) {
    if(/^[a-zA-Z0-9_-]{1,16}$/.test(key)&&typeof n==='number'&&Number.isFinite(n)&&n>=0)
      out[key]=n;
  }
  return out;
}
export function decodeRateStatus(value:unknown):RateStatus {
  if(!value||typeof value!=='object')throw new TypeError('Invalid rate status');
  const x=value as Record<string,unknown>;
  if((x.mode!=='auto'&&x.mode!=='fixed')||!Number.isInteger(x.cache_ttl_seconds)||!Array.isArray(x.bases))
    throw new TypeError('Invalid rate status');
  const bases:RateBaseState[]=x.bases.map((raw:unknown)=>{
    if(!raw||typeof raw!=='object')throw new TypeError('Invalid rate base');
    const r=raw as Record<string,unknown>;
    if(typeof r.base!=='string'||typeof r.is_stale!=='boolean'||typeof r.last_refresh_ok!=='boolean')
      throw new TypeError('Invalid rate base');
    // No API URL, source URL or last_error is copied: they may contain credentials.
    return {base:r.base,rates:redactRates(r.rates),is_stale:r.is_stale,
      last_refresh_ok:r.last_refresh_ok,
      last_success_at:typeof r.last_success_at==='string'?r.last_success_at:'',
      last_attempt_at:typeof r.last_attempt_at==='string'?r.last_attempt_at:''};
  });
  return {mode:x.mode,cache_ttl_seconds:x.cache_ttl_seconds as number,bases};
}
export function decodeRateRefresh(value:unknown):RateRefreshRow[] {
  if(!Array.isArray(value))throw new TypeError('Invalid rate refresh results');
  return value.map((raw:unknown)=>{
    if(!raw||typeof raw!=='object')throw new TypeError('Invalid rate refresh row');
    const r=raw as Record<string,unknown>;
    if(typeof r.base!=='string'||typeof r.ok!=='boolean')throw new TypeError('Invalid rate refresh row');
    return {base:r.base,ok:r.ok,skipped:r.skipped===true,rates:redactRates(r.rates)};
  });
}
export const ratesApi={
  status:async(signal?:AbortSignal):Promise<RateStatus>=>
    decodeRateStatus(await adminClient.json<unknown>('/settings/rate/status?redact=1',{signal,cache:'no-store'})),
  refresh:async():Promise<RateRefreshRow[]>=>
    decodeRateRefresh(await adminClient.postJson<unknown>('/settings/rate/refresh',{bases:[]})),
};
