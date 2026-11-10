import { adminClient } from '../../api';
import type { Wallet } from '../types/admin';
import type { ToggleStatus } from '../types/common';

export type WalletStatus = ToggleStatus;
export interface WalletFilters {
  network: string;
  status?: WalletStatus;
  keyword: string;
}
export interface WalletCreate {
  network: string;
  address: string;
  remark: string;
}
export interface WalletBatchResult {
  address: string;
  ok: boolean;
  error_code?: number;
  error?: string;
}
export interface WalletImportSummary {
  rows: WalletBatchResult[];
  successCount: number;
  failureCount: number;
  allSucceeded: boolean;
  failedAddresses: string[];
}
export const DEFAULT_WALLET_FILTERS: Readonly<WalletFilters> = {
  network: '', keyword: '',
};
const statuses = new Set([1, 2]);
export const NETWORKS = [
  'tron', 'solana', 'ethereum', 'binance', 'polygon', 'plasma', 'ton', 'aptos',
] as const;

export function parseWalletFilters(search: string): WalletFilters {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  const rawStatus = params.get('status');
  const statusNumber = rawStatus === null ? 0 : Number(rawStatus);
  return {
    network: (params.get('network') ?? '').trim().toLowerCase(),
    status: rawStatus !== null && statuses.has(statusNumber) ?
      statusNumber as WalletStatus : undefined,
    keyword: (params.get('keyword') ?? '').trim(),
  };
}
export function walletQuery(filters: WalletFilters): string {
  const params = new URLSearchParams();
  if (filters.network.trim()) params.set('network', filters.network.trim().toLowerCase());
  if (filters.status !== undefined && statuses.has(filters.status))
    params.set('status', String(filters.status));
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  return params.size ? '?' + params.toString() : '';
}
export function walletPageUrl(filters: WalletFilters): string {
  return '/addresses' + walletQuery(filters);
}
export function normalizeImportAddresses(raw: string): string[] {
  // Preserve duplicates and input order; the backend must report each entry's actual status.
  return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
export function reconcileBatchResults(input: readonly string[], response: unknown): WalletImportSummary {
  if (!Array.isArray(response)) throw new Error('Invalid wallet batch import response');
  const rows: WalletBatchResult[] = input.map((address, index) => {
    const raw: unknown = response[index];
    if (!raw || typeof raw !== 'object') {
      return { address, ok: false, error: 'No result returned for this address' };
    }
    const item = raw as Partial<WalletBatchResult>;
    // A mismatched result must not be counted as a success.
    if (item.address !== address || typeof item.ok !== 'boolean') {
      return { address, ok: false, error: 'Mismatched import result' };
    }
    return {
      address,
      ok: item.ok,
      error_code: typeof item.error_code === 'number' ? item.error_code : undefined,
      error: typeof item.error === 'string' ? item.error : undefined,
    };
  });
  // Do not silently report full success if the server provided an unexpected extra row.
  if (response.length > input.length) {
    for (const unexpected of response.slice(input.length)) {
      const address = typeof unexpected?.address === 'string' ? unexpected.address : '';
      rows.push({ address, ok: false, error: 'Unexpected extra import result' });
    }
  }
  const failed = rows.filter(row => !row.ok);
  return {
    rows,
    successCount: rows.filter(row => row.ok).length,
    failureCount: failed.length,
    allSucceeded: failed.length === 0 && rows.length === input.length,
    failedAddresses: rows.slice(0, input.length).filter(row => !row.ok).map(row => row.address),
  };
}
export function decodeWalletList(value: unknown): Wallet[] {
  if (!Array.isArray(value) || !value.every(item =>
    item && Number.isSafeInteger(item.id) && typeof item.address === 'string' &&
    typeof item.network === 'string' && statuses.has(item.status) &&
    Number.isSafeInteger(item.order_count) && item.order_count >= 0)) {
    throw new Error('Invalid wallet list response');
  }
  return value as Wallet[];
}
function walletIdSegment(id: number): string {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid wallet id');
  return String(id);
}
function normalizeNetwork(network: string): string {
  const trimmed = network.trim().toLowerCase();
  if (!trimmed) throw new TypeError('Network is required');
  return trimmed;
}
export const walletsApi = {
  list: async (filters: WalletFilters, signal?: AbortSignal): Promise<Wallet[]> =>
    decodeWalletList(await adminClient.json<unknown>('/wallets' + walletQuery(filters), { signal })),
  get: (id: number, signal?: AbortSignal): Promise<Wallet> =>
    adminClient.json<Wallet>('/wallets/' + walletIdSegment(id), { signal }),
  create: (request: WalletCreate): Promise<Wallet> =>
    adminClient.postJson<Wallet>('/wallets', {
      network: normalizeNetwork(request.network),
      address: request.address.trim(),
      remark: request.remark.trim(),
    }),
  editRemark: (id: number, remark: string): Promise<null> =>
    adminClient.postJson<null>('/wallets/' + walletIdSegment(id),
      { remark }, 'PATCH'),
  changeStatus: (id: number, status: WalletStatus): Promise<null> => {
    if (!statuses.has(status)) throw new TypeError('Invalid wallet status');
    return adminClient.postJson<null>('/wallets/' + walletIdSegment(id) + '/status', { status });
  },
  remove: (id: number): Promise<null> =>
    adminClient.json<null>('/wallets/' + walletIdSegment(id), { method: 'DELETE' }),
  batchImport: (network: string, addresses: readonly string[]): Promise<WalletImportSummary> => {
    if (!addresses.length) throw new TypeError('At least one address is required');
    return adminClient.postJson<unknown>('/wallets/batch-import', {
      network: normalizeNetwork(network), addresses,
    }).then(result => reconcileBatchResults(addresses, result));
  },
};
