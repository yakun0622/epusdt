import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeSettings, reconcileSettingsWrite, sensitiveKeys,
  settingFields, settingsApi, validateSetting, decodeRateStatus, decodeRateRefresh } from './settings';
afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown) => new Response(JSON.stringify({
  status_code: 200, message: 'success', data, request_id: '',
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
const field = (key: string) => {
  const found = settingFields.find(x => x.key === key);
  if (!found) throw new Error(key);
  return found;
};
describe('W42 settings exact Go contracts', () => {
  it('omits credentials, unknown rows and backend-supplied sensitive data from list', () => {
    const data = decodeSettings([
      { key: 'system.order_expiration_time', group: 'system', value: '20', type: 'int' },
      { key: 'system.telegram_bot_token', group: 'system', value: 'TELEGRAM_SECRET', type: 'string' },
      { key: 'okpay.shop_token', group: 'okpay', value: 'OKPAY_SECRET', type: 'string' },
      { key: 'system.jwt_secret', group: 'system', value: 'JWT_SECRET', type: 'string' },
    ]);
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/SECRET/);
    expect(sensitiveKeys.has('system.telegram_bot_token')).toBe(true);
    expect(sensitiveKeys.has('okpay.shop_token')).toBe(true);
  });
  it('sends booleans as native bool, integers as numbers, JSON as validated object string', () => {
    expect(validateSetting(field('okpay.enabled'), 'false').value).toBe(false);
    expect(validateSetting(field('system.amount_precision'), '6').value).toBe(6);
    expect(validateSetting(field('rate.forced_rate_list'), '{"cny":{"usdt":0.15}}').type).toBe('json');
    expect(() => validateSetting(field('system.amount_precision'), '7')).toThrow();
    expect(() => validateSetting(field('okpay.enabled'), '2')).toThrow();
    expect(() => validateSetting(field('rate.forced_rate_list'), '[]')).toThrow();
  });
  it('treats HTTP 200 partial failures, mismatches and unexpected extra rows as not all succeeded', () => {
    const items = [validateSetting(field('system.amount_precision'), '4'),
      validateSetting(field('okpay.shop_token'), 'a-sensitive-value')];
    const summary = reconcileSettingsWrite(items, [
      { key: 'system.amount_precision', ok: true },
      { key: 'okpay.shop_token', ok: false, error_code: 10044, error: 'leak a-sensitive-value' },
    ]);
    expect(summary).toMatchObject({ successCount: 1, failureCount: 1,
      failedKeys: ['okpay.shop_token'], allSucceeded: false });
    expect(JSON.stringify(summary)).not.toContain('a-sensitive-value');
    const mismatch = reconcileSettingsWrite(items, [{ key: 'okpay.shop_token', ok: true }]);
    expect(mismatch.allSucceeded).toBe(false);
    expect(mismatch.failureCount).toBe(2);
    const extra = reconcileSettingsWrite(items, [
      { key: items[0].key, ok: true }, { key: items[1].key, ok: true },
      { key: 'rate.forced_rate_list', ok: false },
    ]);
    expect(extra.allSucceeded).toBe(false);
    expect(extra.failureCount).toBe(1);
  });
  it('uses the Go batch PUT endpoint without exposing raw secret values in results', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => ok([
      { key: 'okpay.enabled', ok: true }, { key: 'okpay.shop_token', ok: false, error_code: 10045 },
    ]));
    vi.stubGlobal('fetch', fetcher);
    const payload = [validateSetting(field('okpay.enabled'), 'false'),
      validateSetting(field('okpay.shop_token'), 'top-secret')];
    const summary = await settingsApi.save(payload);
    expect(fetcher.mock.calls[0][0]).toBe('/admin/api/v1/settings');
    expect(fetcher.mock.calls[0][1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ items: payload });
    expect(JSON.stringify(summary)).not.toContain('top-secret');
  });
});

describe('W42 rate cache: no token-bearing URLs in UI state',()=>{
  it('projects live cache state without source url or last error',()=>{
    const data=decodeRateStatus({mode:'auto',api_url:'https://example.com/?secret=hidden',
      cache_ttl_seconds:300,bases:[{
        base:'cny',rates:{usdt:0.14},source_url:'https://example.com/key/token',
        is_stale:true,last_refresh_ok:false,last_error:'token leaked',
        last_success_at:'2026-11-09T00:00:00Z',last_attempt_at:'2026-11-10T00:00:00Z',
      }]});
    expect(data.bases).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/token|secret|source_url/);
    expect(data.bases[0].is_stale).toBe(true);
    expect(()=>decodeRateStatus({bases:[]})).toThrow();
  });
  it('honors per-base failed refreshes under HTTP 200 without exposing raw errors',()=>{
    const data=decodeRateRefresh([{base:'cny',ok:true,rates:{usdt:0.14}},
      {base:'usd',ok:false,error:'credentials: secret'}]);
    expect(data.map(x=>x.ok)).toEqual([true,false]);
    expect(JSON.stringify(data)).not.toContain('credentials');
    expect(()=>decodeRateRefresh({ok:true})).toThrow();
  });
});

describe('rate snapshot requests server-side redaction',()=>{
  it('uses redact=1 so provider URL secrets do not cross the wire',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>ok({
      mode:'fixed',api_url:'',cache_ttl_seconds:300,bases:[],
    }));
    vi.stubGlobal('fetch',fetcher);
    const {ratesApi}=await import('./settings');
    await ratesApi.status();
    expect(fetcher.mock.calls[0][0]).toBe('/admin/api/v1/settings/rate/status?redact=1');
  });
});
