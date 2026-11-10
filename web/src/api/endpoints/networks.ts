import { adminClient } from '../../api';
import type { Chain, ChainToken } from '../types/admin';

export interface ChainUpdate {
  enabled?: boolean;
  display_name?: string;
  min_confirmations?: number;
  scan_interval_sec?: number;
}
export interface TokenCreate {
  network: string;
  symbol: string;
  contract_address: string;
  decimals: number;
  enabled: boolean;
  min_amount: number;
}
export type TokenUpdate = Pick<TokenCreate, 'contract_address' | 'decimals' | 'enabled' | 'min_amount'>;

export function normalizedNetwork(network: string): string {
  const value = network.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(value)) throw new TypeError('Invalid network');
  return value;
}
function positiveID(id: number): string {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid ID');
  return String(id);
}
function finiteInteger(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError('Invalid ' + name);
  return value;
}
function finiteNonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError('Invalid minimum amount');
  return value;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function ensureArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isObject)) throw new TypeError('Expected list array');
  return value;
}
export function decodeChains(value: unknown): Chain[] {
  return ensureArray(value).map(row => {
    if (typeof row.network !== 'string' || typeof row.enabled !== 'boolean' ||
      typeof row.display_name !== 'string' ||
      !Number.isInteger(row.min_confirmations) || !Number.isInteger(row.scan_interval_sec)) {
      throw new TypeError('Invalid chain response');
    }
    return {
      id: Number(row.id ?? 0), network: row.network, enabled: row.enabled,
      display_name: row.display_name, min_confirmations: row.min_confirmations as number,
      scan_interval_sec: row.scan_interval_sec as number,
      extra: typeof row.extra === 'string' ? row.extra : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    };
  });
}
export function decodeTokens(value: unknown): ChainToken[] {
  return ensureArray(value).map(row => {
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
      typeof row.network !== 'string' || typeof row.symbol !== 'string' ||
      typeof row.enabled !== 'boolean' || typeof row.contract_address !== 'string' ||
      typeof row.decimals !== 'number' || typeof row.min_amount !== 'number') {
      throw new TypeError('Invalid chain token response');
    }
    return {
      id: row.id as number, network: row.network, symbol: row.symbol,
      contract_address: row.contract_address, enabled: row.enabled,
      decimals: row.decimals, min_amount: row.min_amount,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    };
  });
}
export function validateChainUpdate(update: ChainUpdate): ChainUpdate {
  const clean: ChainUpdate = {};
  if (update.enabled !== undefined) {
    if (typeof update.enabled !== 'boolean') throw new TypeError('Chain enabled must be boolean');
    clean.enabled = update.enabled;
  }
  if (update.display_name !== undefined) {
    clean.display_name = update.display_name.trim();
    if (!clean.display_name || clean.display_name.length > 64) throw new TypeError('Invalid chain name');
  }
  if (update.min_confirmations !== undefined) clean.min_confirmations = finiteInteger(update.min_confirmations, 0, 1000000, 'confirmations');
  if (update.scan_interval_sec !== undefined) clean.scan_interval_sec = finiteInteger(update.scan_interval_sec, 1, 86400, 'scan interval');
  return clean;
}
export function validateTokenCreate(input: TokenCreate): TokenCreate {
  const clean: TokenCreate = {
    network: normalizedNetwork(input.network), symbol: input.symbol.trim().toUpperCase(),
    contract_address: input.contract_address.trim(),
    decimals: finiteInteger(input.decimals, 0, 36, 'decimals'),
    enabled: input.enabled, min_amount: finiteNonnegative(input.min_amount),
  };
  if (typeof clean.enabled !== 'boolean' || !clean.symbol || clean.symbol.length > 32) throw new TypeError('Invalid token fields');
  if (clean.network === 'aptos' && clean.enabled && !clean.contract_address) throw new TypeError('Aptos asset ID required to enable token');
  return clean;
}
export function validateTokenUpdate(input: TokenUpdate, network: string): TokenUpdate {
  const clean: TokenUpdate = {
    contract_address: input.contract_address.trim(),
    decimals: finiteInteger(input.decimals, 0, 36, 'decimals'),
    enabled: input.enabled, min_amount: finiteNonnegative(input.min_amount),
  };
  if (typeof clean.enabled !== 'boolean') throw new TypeError('Token enabled must be boolean');
  if (normalizedNetwork(network) === 'aptos' && clean.enabled && !clean.contract_address)
    throw new TypeError('Aptos asset ID required to enable token');
  return clean;
}
export const chainsApi = {
  list: async (signal?: AbortSignal): Promise<Chain[]> =>
    decodeChains(await adminClient.json<unknown>('/chains', { signal })),
  update: (network: string, input: ChainUpdate): Promise<null> =>
    adminClient.postJson<null>('/chains/' + encodeURIComponent(normalizedNetwork(network)), validateChainUpdate(input), 'PATCH'),
};
export const tokensApi = {
  list: async (network = '', signal?: AbortSignal): Promise<ChainToken[]> =>
    decodeTokens(await adminClient.json<unknown>(
      '/chain-tokens' + (network.trim() ? '?network=' + encodeURIComponent(normalizedNetwork(network)) : ''), { signal })),
  create: (input: TokenCreate): Promise<ChainToken> =>
    adminClient.postJson<ChainToken>('/chain-tokens', validateTokenCreate(input)),
  update: (id: number, network: string, input: TokenUpdate): Promise<null> =>
    adminClient.postJson<null>('/chain-tokens/' + positiveID(id), validateTokenUpdate(input, network), 'PATCH'),
  changeEnabled: (id: number, enabled: boolean): Promise<null> => {
    if (typeof enabled !== 'boolean') throw new TypeError('Token enabled must be boolean');
    return adminClient.postJson<null>('/chain-tokens/' + positiveID(id) + '/status', { enabled });
  },
  remove: (id: number): Promise<null> =>
    adminClient.json<null>('/chain-tokens/' + positiveID(id), { method: 'DELETE' }),
};
