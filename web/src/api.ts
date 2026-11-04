import { createApiClient, ApiError } from './api/client';
import type { LoginResponse, Profile } from './api/types/admin';

export { ApiError };
export type { ApiEnvelope } from './api/types/common';
export type { LoginResponse, Profile } from './api/types/admin';

const TOKEN_KEY = 'epusdt_admin_token';
export const session = {
  get: (): string | null => typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY),
  set: (token: string): void => { sessionStorage.setItem(TOKEN_KEY, token); },
  clear: (): void => { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TOKEN_KEY); },
};

// Until auth layout migration, preserve the initial scaffold's sessionStorage behavior.
// Original compiled UI used a cookie; this is an intentional temporary difference.
export const adminClient = createApiClient({
  basePath: '/admin/api/v1',
  getToken: session.get,
  onUnauthorized: session.clear,
});
// Public payment endpoints must never inherit admin Bearer credentials.
export const paymentClient = createApiClient({ basePath: '' });

export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return adminClient.json<T>(path, options);
}

export const auth = {
  login: (username: string, password: string) => adminClient.postJson<LoginResponse>('/auth/login', { username, password }),
  me: () => adminClient.json<Profile>('/auth/me'),
  logout: () => adminClient.postJson<null>('/auth/logout', {}),
};

export const exportOrdersCsv = () => adminClient.download('/orders/export');
