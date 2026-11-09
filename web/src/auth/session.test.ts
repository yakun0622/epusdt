import { describe, expect, it, vi, afterEach } from 'vitest';

const cookies = new Map<string, string>();
const dispatchEvent = vi.fn();
const removeItem = vi.fn();
vi.stubGlobal('window', { dispatchEvent, addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('sessionStorage', { removeItem });
vi.stubGlobal('localStorage', { removeItem });
vi.stubGlobal('document', {
  get cookie() { return [...cookies.entries()].map(([k, v]) => k + '=' + v).join('; '); },
  set cookie(value: string) {
    const [first, ...attrs] = value.split('; ');
    const cut = first.indexOf('=');
    const name = first.slice(0, cut);
    const contents = first.slice(cut + 1);
    if (attrs.some(attr => attr.toLowerCase() === 'max-age=0')) cookies.delete(name);
    else cookies.set(name, contents);
  },
});
import { session } from './session';

afterEach(() => { cookies.clear(); dispatchEvent.mockClear(); removeItem.mockClear(); });

describe('compiled frontend session cookie', () => {
  it('uses JSON-encoded cookie with original name and supports logout', () => {
    session.set('abc.def.jwt');
    expect(cookies.has('access_token')).toBe(true);
    expect(session.get()).toBe('abc.def.jwt');
    session.clear();
    expect(session.get()).toBeNull();
    expect(removeItem).toHaveBeenCalledWith('epusdt_admin_token');
  });
  it('does not treat malformed cookie as a token', () => {
    cookies.set('access_token', 'broken-json');
    expect(session.get()).toBeNull();
  });
});
