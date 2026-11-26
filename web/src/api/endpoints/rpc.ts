import { adminClient } from '../../api';

export const rpcTypes = [
  'http', 'ws', 'lite', 'grpc', 'rest', 'graphql', 'jsonrpc', 'ipc', 'sse',
  'solidity-grpc', 'solidity-http', 'toncenter-v3', 'unisat',
] as const;
export type RpcType = typeof rpcTypes[number];
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
const purposes = new Set(['general', 'manual_verify', 'both']);

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
    return parsed.host ? parsed.protocol + '//' + parsed.host : '[hidden endpoint]';
  } catch { return '[hidden endpoint]'; }
}
export function validateRpcUrl(url: string, type: RpcType): string {
  const value = url.trim();
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new TypeError('Invalid RPC URL'); }
  if (parsed.username || parsed.password || parsed.hash || value.length > 4096) throw new TypeError('Invalid RPC URL');
  if (type === 'ipc') {
    if (parsed.protocol !== 'ipc:' || parsed.host || !parsed.pathname.startsWith('/') || parsed.search) {
      throw new TypeError('Local IPC path required');
    }
    return value;
  }
  if (!parsed.hostname) throw new TypeError('Invalid RPC URL');
  if (type === 'ws') {
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new TypeError('WebSocket RPC URL required');
  } else if (type === 'grpc' || type === 'solidity-grpc') {
    if (!['grpc:', 'grpcs:', 'http:', 'https:'].includes(parsed.protocol) ||
        !['', '/'].includes(parsed.pathname) || parsed.search) throw new TypeError('gRPC origin required');
  } else if (!(type === 'lite' && parsed.protocol === 'adnl:')) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new TypeError('HTTP RPC URL required');
  }
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
  if (!rpcTypes.includes(input.type) || typeof input.enabled !== 'boolean' || input.api_key.length > 255) throw new TypeError('Invalid RPC fields');
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
    if (input.api_key.length > 255) throw new TypeError('RPC credential is too long');
    clean.api_key = input.api_key;
  }
  return clean;
}
function decodeRpcStatus(status: unknown): RpcHealthStatus {
  if (status === '' || status == null || status === 'untested') return 'unknown';
  if (status === 'ok') return 'ok';
  if (status === 'down' || status === 'unavailable' || status === 'timeout') return 'down';
  throw new TypeError('Invalid RPC status');
}

function scannerTimestamp(value: unknown): string {
  if (typeof value !== 'number') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function decodeRpcNodes(value: unknown): RpcNodeView[] {
  if (!Array.isArray(value)) throw new TypeError('Expected RPC array');
  return value.map((item: unknown): RpcNodeView => {
    if (!item || typeof item !== 'object') throw new TypeError('Invalid RPC row');
    const row = item as Record<string, unknown>;
    const purpose = row.purpose === '' || row.purpose == null ? 'general' : row.purpose;
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
        typeof row.network !== 'string' || typeof row.url !== 'string' ||
        !rpcTypes.includes(row.protocol as RpcType) || !purposes.has(String(purpose)) ||
        !Number.isInteger(row.weight) || typeof row.enabled !== 'boolean') {
      throw new TypeError('Invalid RPC row');
    }
    return {
      id: row.id as number, network: row.network, endpoint: publicEndpoint(row.url),
      type: row.protocol as RpcType, weight: row.weight as number, enabled: row.enabled,
      purpose: purpose as RpcPurpose, ...decodeRpcHealth(row),
      last_checked_at: scannerTimestamp(row.checked_at_ms),
    };
  });
}

export function decodeRpcHealth(value: unknown): RpcHealthResult {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid RPC health result');
  const row = value as Record<string, unknown>;
  return {
    status: decodeRpcStatus(row.status),
    last_latency_ms: typeof row.latency_ms === 'number' ? row.latency_ms : -1,
  };
}

const nodesPath = '/chainscanner/admin/nodes';
const redacted = '?redact=1';
function writeNode(path: string, method: 'POST' | 'PATCH', value: unknown) {
  return adminClient.rawJson<unknown>(path + redacted, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
}

export const rpcApi = {
  list: async (network = '', signal?: AbortSignal): Promise<RpcNodeView[]> =>
    decodeRpcNodes(await adminClient.rawJson<unknown>(
      nodesPath + redacted + (network.trim() ? '&network=' + encodeURIComponent(networkPart(network)) : ''), { signal })),
  create: async (input: RpcCreate): Promise<void> => {
    const { type, ...node } = validateRpcCreate(input);
    await writeNode(nodesPath, 'POST', { ...node, protocol: type });
  },
  update: async (id: number, type: RpcType, patch: RpcUpdate): Promise<void> => {
    const { clear_api_key, ...changes } = validateRpcUpdate(patch, type);
    if (clear_api_key) changes.api_key = '';
    await writeNode(nodesPath + '/' + idPart(id), 'PATCH', changes);
  },
  changeEnabled: async (id: number, enabled: boolean): Promise<void> => {
    if (typeof enabled !== 'boolean') throw new TypeError('RPC enabled must be boolean');
    await writeNode(nodesPath + '/' + idPart(id), 'PATCH', { enabled });
  },
  remove: async (id: number): Promise<void> => {
    await adminClient.rawJson(nodesPath + '/' + idPart(id) + redacted, { method: 'DELETE' });
  },
  healthCheck: async (id: number): Promise<RpcHealthResult> =>
    decodeRpcHealth(await writeNode(nodesPath + '/' + idPart(id) + '/test', 'POST', {})),
};
