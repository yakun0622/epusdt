import { createApiClient, ApiError } from './api/client';
import type { LoginResponse, Profile } from './api/types/admin';
import { session } from './auth/session';

export { ApiError, session };
export type { ApiEnvelope } from './api/types/common';
export type { LoginResponse, Profile } from './api/types/admin';

// The compiled frontend uses the JSON-encoded access_token cookie. Unlike the
// former scaffold, the temporary sessionStorage key is not used for auth.
export const adminClient = createApiClient({
  basePath: '/admin/api/v1',
  getToken: session.get,
  onUnauthorized: session.clear,
});
export const paymentClient = createApiClient({ basePath: '' });

export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return adminClient.json<T>(path, options);
}

export const auth = {
  login: (username: string, password: string) => adminClient.postJson<LoginResponse>('/auth/login', { username, password }),
  me: () => adminClient.json<Profile>('/auth/me'),
  logout: () => adminClient.postJson<null>('/auth/logout', {}),
  changePassword: (oldPassword: string, newPassword: string) =>
    adminClient.postJson<null>('/auth/password', { old_password: oldPassword, new_password: newPassword }),
};

export const exportOrdersCsv = () => adminClient.download('/orders/export');
