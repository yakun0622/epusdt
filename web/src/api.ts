export interface ApiEnvelope<T> { status_code: number; message: string; data: T; request_id: string }
export interface LoginResponse { token: string; username: string; user_id: number }
export interface Profile { id: number; username: string; password_is_default: boolean; [key: string]: unknown }

const TOKEN_KEY = 'epusdt_admin_token';
export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = session.get();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  let response: Response;
  try {
    response = await fetch('/admin/api/v1' + path, { ...options, headers });
  } catch { throw new ApiError('网络连接失败，请检查后端服务', 0); }
  let envelope: ApiEnvelope<T>;
  try { envelope = await response.json() as ApiEnvelope<T>; }
  catch { throw new ApiError('服务器返回的内容不是预期 JSON', response.status); }
  if (!response.ok || envelope.status_code !== 200) {
    throw new ApiError(envelope.message || '请求失败', response.status);
  }
  return envelope.data;
}

export const auth = {
  login: (username: string, password: string) => api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => api<Profile>('/auth/me'),
  logout: () => api<null>('/auth/logout', { method: 'POST' }),
};
