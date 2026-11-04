/** Go util/http.Response envelope. Business errors generally arrive as HTTP 400. */
export interface ApiEnvelope<T> {
  status_code: number;
  message: string;
  data: T;
  request_id: string;
}
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}
export interface BaseRow {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
export type ToggleStatus = 1 | 2;
export type OrderStatus = 1 | 2 | 3 | 4;
export interface BatchItemResult {
  address?: string;
  key?: string;
  ok: boolean;
  error_code?: number;
  error?: string;
}
