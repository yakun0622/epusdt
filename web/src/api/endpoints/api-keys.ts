import { adminClient } from '../../api';
import type { ApiKey, ApiKeyCreated, ApiKeySecret } from '../types/admin';
import type { ToggleStatus } from '../types/common';

export interface ApiKeyForm {
  name: string;
  ip_whitelist: string;
  notify_url: string;
}
export interface ApiKeyStats {
  call_count: number;
  last_used_at: string | null;
}

const secretOptions: RequestInit = {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
};
const statusCodes = new Set([1, 2]);

function keyPath(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('Invalid API key ID');
  return '/api-keys/' + String(id);
}
export function parseApiKeyForm(value: ApiKeyForm): ApiKeyForm {
  const form = {
    name: value.name.trim(),
    ip_whitelist: value.ip_whitelist.trim(),
    notify_url: value.notify_url.trim(),
  };
  if (!form.name || form.name.length > 128) throw new TypeError('API key name must have 1–128 characters');
  if (form.notify_url) {
    let url: URL;
    try { url = new URL(form.notify_url); } catch { throw new TypeError('Invalid notification URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
      throw new TypeError('Invalid notification URL');
  }
  return form;
}

/** The list must not retain a secret, even if a server accidentally returns one. */
export function decodeApiKeyList(value: unknown): ApiKey[] {
  if (!Array.isArray(value)) throw new TypeError('Expected API key list array');
  return value.map((item: unknown): ApiKey => {
    if (!item || typeof item !== 'object') throw new TypeError('Invalid API key row');
    const row = item as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
      typeof row.pid !== 'string' || typeof row.name !== 'string' ||
      !statusCodes.has(Number(row.status))) throw new TypeError('Invalid API key row');
    // Never spread the raw server object: Go's json:"-" must remain true at our boundary.
    return {
      id: Number(row.id),
      name: row.name,
      pid: row.pid,
      status: Number(row.status) as ToggleStatus,
      ip_whitelist: typeof row.ip_whitelist === 'string' ? row.ip_whitelist : '',
      notify_url: typeof row.notify_url === 'string' ? row.notify_url : '',
      call_count: typeof row.call_count === 'number' ? row.call_count : 0,
      last_used_at: typeof row.last_used_at === 'string' ? row.last_used_at : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    };
  });
}
function parseSecret(value: ApiKeySecret): string {
  if (!value || typeof value.secret_key !== 'string' || !value.secret_key)
    throw new TypeError('Missing API key secret');
  return value.secret_key;
}
function parseCreated(value: ApiKeyCreated): ApiKeyCreated {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 ||
    typeof value.pid !== 'string' || typeof value.name !== 'string') throw new TypeError('Invalid API key response');
  return { id: value.id, pid: value.pid, name: value.name, secret_key: parseSecret(value) };
}
export const apiKeysApi = {
  list: async (signal?: AbortSignal): Promise<ApiKey[]> =>
    decodeApiKeyList(await adminClient.json<unknown>('/api-keys', { signal })),
  create: async (form: ApiKeyForm): Promise<ApiKeyCreated> =>
    parseCreated(await adminClient.json<ApiKeyCreated>('/api-keys', {
      ...secretOptions, method: 'POST',
      headers: { ...secretOptions.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(parseApiKeyForm(form)),
    })),
  update: (id: number, form: ApiKeyForm): Promise<null> =>
    adminClient.postJson<null>(keyPath(id), parseApiKeyForm(form), 'PATCH'),
  changeStatus: (id: number, status: ToggleStatus): Promise<null> => {
    if (!statusCodes.has(status)) throw new TypeError('Invalid API key status');
    return adminClient.postJson<null>(keyPath(id) + '/status', { status });
  },
  stats: (id: number, signal?: AbortSignal): Promise<ApiKeyStats> =>
    adminClient.json<ApiKeyStats>(keyPath(id) + '/stats', { signal, cache: 'no-store' }),
  viewSecret: async (id: number, signal?: AbortSignal): Promise<string> =>
    parseSecret(await adminClient.json<ApiKeySecret>(keyPath(id) + '/secret', {
      ...secretOptions, signal,
    })),
  rotateSecret: async (id: number): Promise<string> =>
    parseSecret(await adminClient.json<ApiKeySecret>(keyPath(id) + '/rotate-secret', {
      ...secretOptions, method: 'POST',
    })),
  remove: (id: number): Promise<null> =>
    adminClient.json<null>(keyPath(id), { method: 'DELETE' }),
};
