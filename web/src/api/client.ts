import type { ApiEnvelope } from './types/common';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly businessCode: number | null = null,
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientConfig {
  basePath: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export interface JsonOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null;
}

/** Do not log request bodies or responses: merchant keys/payment metadata may be sensitive. */
export function createApiClient(config: ClientConfig) {
  const request = async (path: string, options: JsonOptions = {}): Promise<Response> => {
    if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('API paths must be relative to the client base');
    const headers = new Headers(options.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const token = config.getToken?.();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const runFetch = config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await runFetch(config.basePath + path, { ...options, headers, redirect: 'follow' });
    } catch {
      throw new ApiError('网络连接失败，请检查后端服务', 0);
    }
    if (response.status === 401) config.onUnauthorized?.();
    return response;
  };

  const json = async <T>(path: string, options: JsonOptions = {}): Promise<T> => {
    const response = await request(path, options);
    let envelope: ApiEnvelope<T>;
    try {
      envelope = await response.json() as ApiEnvelope<T>;
      if (!envelope || typeof envelope.status_code !== 'number') throw new Error('Invalid envelope');
    } catch {
      throw new ApiError('服务器返回的内容不是预期 JSON', response.status);
    }
    if (!response.ok || envelope.status_code !== 200) {
      throw new ApiError(envelope.message || '请求失败', response.status, envelope.status_code, envelope.request_id);
    }
    return envelope.data;
  };

  const postJson = <T>(path: string, body: unknown, method: 'POST'|'PUT'|'PATCH' = 'POST') =>
    json<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /** CSV export intentionally bypasses the Go ApiEnvelope JSON parser. */
  const download = async (path: string): Promise<Blob> => {
    const response = await request(path, { headers: { Accept: 'text/csv' } });
    if (!response.ok) {
      let message = '下载失败';
      let code: number | null = null;
      try {
        const payload = await response.json() as Partial<ApiEnvelope<never>>;
        message = payload.message || message;
        code = payload.status_code ?? null;
      } catch { /* non-JSON error response */ }
      throw new ApiError(message, response.status, code);
    }
    return response.blob();
  };
  return { json, postJson, download };
}
