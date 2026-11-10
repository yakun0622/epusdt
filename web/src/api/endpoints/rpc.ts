import { adminClient } from '../../api';

export type RpcType = 'http' | 'ws' | 'lite';
export type RpcPurpose = 'general' | 'manual_verify' | 'both';
export type RpcHealthStatus = 'unknown' | 'ok' | 'down';
export interface RpcNodeView {
  id: number;
  network: string;
  endpoint: string; // origin only: never show token-bearing URL paths, query or userinfo
  type: RpcType;
  weight: number;
  enabled: boolean;
  purpose: RpcPurpose;
  status: RpcHealthStatus;
  last_latency_ms: number;
  last_checked_at: string;
}
export interface RpcCreate {
  network: string;
  url: string;
  type: RpcType;
  weight: number;
  api_key: string;
  enabled: boolean;
  purpose: RpcPurpose;
}
export interface RpcUpdate {
  url?: string;
  weight?: number;
  api_key?: string; // nonempty replaces; empty or omitted preserves existing credential
  clear_api_key?: boolean; // only this explicit flag clears an existing credential
  enabled?: boolean;
  purpose?: RpcPurpose;
}
export interface RpcHealthResult { status: RpcHealthStatus; last_latency_ms: number }
const types = new Set(['http', 'ws', 'lite']);
const purposes = new Set(['general', 'manual_verify', 'both']);
const healthStatuses = new Set(['unknown', 'ok', 'down']);
const idPart = (id: number) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid RPC ID');
  return String(id);
};
const networkPart = (input: string) => {
  const n = input.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(n)) throw new TypeError('Invalid network');
  return n;
};
export function publicEndpoint(url: string): string {
  // A path/query may contain an embedded RPC token, even when api_key is empty.
  try {
    const parsed = new URL(url);
    return parsed.origin !== 'null' ? parsed.protocol + '//' + parsed.host : '[hidden endpoint]';
  } catch { return '[hidden endpoint]'; }
}
export function validateRpcUrl(url: string, type: RpcType): string {
  const value = url.trim();
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new TypeError('Invalid RPC URL'); }
  if (!parsed.hostname || parsed.username || parsed.password) throw new TypeError('Invalid RPC URL');
  if (type === 'http' || type === 'lite') {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new TypeError('HTTP RPC URL required');
  } else if (type === 'ws') {
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new TypeError('WebSocket RPC URL required');
  } else throw new TypeError('Invalid RPC type');
  return value;
}
function safeWeight(weight: number): number {
  if (!Number.isInteger(weight) || weight < 1 || weight > 100000) throw new TypeError('Invalid RPC weight');
  return weight;
}
function safePurpose(purpose: RpcPurpose): RpcPurpose {
  if (!purposes.has(purpose)) throw new TypeError('Invalid RPC purpose');
  return purpose;
}
export function validateRpcCreate(input: RpcCreate): RpcCreate {
  if (!types.has(input.type) || typeof input.enabled !== 'boolean') throw new TypeError('Invalid RPC fields');
  return {
    network: networkPart(input.network), type: input.type,
    url: validateRpcUrl(input.url, input.type), weight: safeWeight(input.weight),
    enabled: input.enabled, purpose: safePurpose(input.purpose), api_key: input.api_key,
  };
}
export function validateRpcUpdate(input: RpcUpdate, type: RpcType): RpcUpdate {
  const clean: RpcUpdate = {};
  if (input.url !== undefined) clean.url = validateRpcUrl(input.url, type);
  if (input.weight !== undefined) clean.weight = safeWeight(input.weight);
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw new TypeError('Invalid RPC enabled');
    clean.enabled = input.enabled;
  }
  if (input.purpose !== undefined) clean.purpose = safePurpose(input.purpose);
  if (input.clear_api_key === true) {
    if (input.api_key) throw new TypeError('Cannot replace and clear RPC credentials together');
    clean.clear_api_key = true;
  } else if (input.api_key) {
    clean.api_key = input.api_key;
  }
  return clean;
}
export function decodeRpcNodes(value: unknown): RpcNodeView[] {
  if (!Array.isArray(value)) throw new TypeError('Expected RPC array');
  return value.map((item: unknown): RpcNodeView => {
    if (!item || typeof item !== 'object') throw new TypeError('Invalid RPC row');
    const row = item as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
        typeof row.network !== 'string' || typeof row.url !== 'string' ||
        !types.has(String(row.type)) || !purposes.has(String(row.purpose)) ||
        !healthStatuses.has(String(row.status)) ||
        !Number.isInteger(row.weight) || typeof row.enabled !== 'boolean') {
      throw new TypeError('Invalid RPC row');
    }
    // Strict projection; no api_key, no raw URL, no arbitrary response fields enter state.
    return {
      id: row.id as number, network: row.network, endpoint: publicEndpoint(row.url),
      type: row.type as RpcType, weight: row.weight as number, enabled: row.enabled,
      purpose: row.purpose as RpcPurpose, status: row.status as RpcHealthStatus,
      last_latency_ms: typeof row.last_latency_ms === 'number' ? row.last_latency_ms : -1,
      last_checked_at: typeof row.last_checked_at === 'string' ? row.last_checked_at : '',
    };
  });
}
export function decodeRpcHealth(value: unknown): RpcHealthResult {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid RPC health result');
  const row = value as Record<string, unknown>;
  if (!healthStatuses.has(String(row.status)) || typeof row.last_latency_ms !== 'number')
    throw new TypeError('Invalid RPC health result');
  return { status: row.status as RpcHealthStatus, last_latency_ms: row.last_latency_ms };
}

export const rpcApi = {
  list: async (network = '', signal?: AbortSignal): Promise<RpcNodeView[]> =>
    decodeRpcNodes(await adminClient.json<unknown>(
      '/rpc-nodes?redact=1' + (network.trim() ? '&network=' + encodeURIComponent(networkPart(network)) : ''), { signal })),
  create: async (input: RpcCreate): Promise<void> => {
    // The Go create response may include the newly submitted URL. Never return it to React state.
    await adminClient.postJson<unknown>('/rpc-nodes', validateRpcCreate(input));
  },
  update: (id: number, type: RpcType, patch: RpcUpdate): Promise<null> =>
    adminClient.postJson<null>('/rpc-nodes/' + idPart(id), validateRpcUpdate(patch, type), 'PATCH'),
  changeEnabled: (id: number, enabled: boolean): Promise<null> => {
    if (typeof enabled !== 'boolean') throw new TypeError('RPC enabled must be boolean');
    return adminClient.postJson<null>('/rpc-nodes/' + idPart(id), { enabled }, 'PATCH');
  },
  remove: (id: number): Promise<null> =>
    adminClient.json<null>('/rpc-nodes/' + idPart(id), { method: 'DELETE' }),
  healthCheck: async (id: number): Promise<RpcHealthResult> =>
    decodeRpcHealth(await adminClient.postJson<unknown>('/rpc-nodes/' + idPart(id) + '/health-check', {})),
};
