import { afterEach, describe, expect, it, vi } from 'vitest';
import { chainsApi, decodeChains, decodeTokens, tokensApi, validateTokenCreate } from './networks';
afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown) => new Response(JSON.stringify({
  status_code: 200, message: 'success', data, request_id: '',
}), { status: 200, headers: { 'content-type': 'application/json' } });
const chain = { id: 1, network: 'aptos', display_name: 'Aptos', enabled: false,
  min_confirmations: 1, scan_interval_sec: 5 };
const token = { id: 10, network: 'aptos', symbol: 'USDT', contract_address: '0x1::x::X',
  decimals: 6, enabled: true, min_amount: 0 };

describe('W40 Go chains and token contracts', () => {
  it('decodes actual arrays, differentiates boolean enabled from numeric status', () => {
    expect(decodeChains([chain])[0].enabled).toBe(false);
    expect(decodeTokens([token])[0].enabled).toBe(true);
    expect(() => decodeChains([{ ...chain, enabled: 2 }])).toThrow('Invalid chain');
    expect(() => decodeTokens([{ ...token, enabled: 1 }])).toThrow('Invalid chain token');
    expect(() => decodeChains({ list: [chain] })).toThrow('array');
  });
  it('lists and patches seeded chains only, never invents POST /chains', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => ok([chain]));
    vi.stubGlobal('fetch', fetchImpl);
    await chainsApi.list();
    await chainsApi.update(' Aptos ', { enabled: true, display_name: 'Aptos', min_confirmations: 1, scan_interval_sec: 5 });
    expect(fetchImpl.mock.calls.map(([url, opts]) => [url, opts?.method ?? 'GET'])).toEqual([
      ['/admin/api/v1/chains', 'GET'],
      ['/admin/api/v1/chains/aptos', 'PATCH'],
    ]);
  });
  it('uses Go token endpoints, enabled:boolean and retains Aptos asset id semantics', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => ok([token]));
    vi.stubGlobal('fetch', fetchImpl);
    await tokensApi.list('aptos');
    await tokensApi.create(token);
    await tokensApi.update(10, 'aptos', { contract_address: '0x1::x::X', decimals: 6, enabled: true, min_amount: 0 });
    await tokensApi.changeEnabled(10, false);
    await tokensApi.remove(10);
    expect(fetchImpl.mock.calls.map(([url, opts]) => [url, opts?.method ?? 'GET'])).toEqual([
      ['/admin/api/v1/chain-tokens?network=aptos', 'GET'],
      ['/admin/api/v1/chain-tokens', 'POST'],
      ['/admin/api/v1/chain-tokens/10', 'PATCH'],
      ['/admin/api/v1/chain-tokens/10/status', 'POST'],
      ['/admin/api/v1/chain-tokens/10', 'DELETE'],
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[3][1]?.body))).toEqual({ enabled: false });
  });
  it('rejects enabling Aptos tokens without an asset identifier', () => {
    expect(() => validateTokenCreate({ network: 'aptos', symbol: 'USDT',
      contract_address: '', enabled: true, decimals: 6, min_amount: 0 })).toThrow('Aptos asset');
    expect(validateTokenCreate({ network: 'aptos', symbol: 'USDT', contract_address: '',
      enabled: false, decimals: 6, min_amount: 0 }).enabled).toBe(false);
  });
});
