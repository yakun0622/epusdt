const COOKIE_NAME = 'access_token';
const LEGACY_TOKEN_KEY = 'epusdt_admin_token';
const PROFILE_KEY = 'auth_user';
const CHANGE_EVENT = 'epusdt-auth-changed';
const AGE_SECONDS = 7 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const found = document.cookie.split('; ').find(part => part.startsWith(name + '='));
  return found ? found.slice(name.length + 1) : null;
}

export const session = {
  get(): string | null {
    const encoded = readCookie(COOKIE_NAME);
    if (!encoded) return null;
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
      return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
    } catch { return null; }
  },
  set(token: string): void {
    if (typeof document === 'undefined') return;
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(token))
      + '; Path=/; Max-Age=' + AGE_SECONDS + '; SameSite=Lax';
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
  clear(): void {
    if (typeof document !== 'undefined') {
      document.cookie = COOKIE_NAME + '=; Path=/; Max-Age=0; SameSite=Lax';
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LEGACY_TOKEN_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  },
  subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(CHANGE_EVENT, listener);
    const onFocus = () => listener();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(CHANGE_EVENT, listener);
      window.removeEventListener('focus', onFocus);
    };
  },
};
