/** Browser-visible route inventory from the compiled router. No backend calls here. */
export type PageId =
  | 'sign-in' | 'install' | 'cashier' | 'dashboard' | 'orders'
  | 'addresses' | 'chains' | 'rpc' | 'keys' | 'payment-setup'
  | 'integrations' | 'settings' | 'settings-system' | 'settings-telegram'
  | 'settings-pay' | 'settings-epay' | 'settings-okpay'
  | 'settings-notifications' | 'settings-display' | 'settings-appearance'
  | 'account-password' | 'help' | '401' | '403' | '404' | '500' | '503';

export interface RouteMatch {
  page: PageId;
  pathname: string;
  public: boolean;
  tradeId?: string;
}
export const navItems: ReadonlyArray<{ path: string; label: string; page: PageId }> = [
  { path: '/dashboard', label: '仪表盘', page: 'dashboard' },
  { path: '/orders', label: '订单', page: 'orders' },
  { path: '/addresses', label: '钱包地址', page: 'addresses' },
  { path: '/chains', label: '支付网络', page: 'chains' },
  { path: '/rpc', label: 'RPC 节点', page: 'rpc' },
  { path: '/keys', label: 'API 密钥', page: 'keys' },
  { path: '/payment-setup', label: '支付配置', page: 'payment-setup' },
  { path: '/settings', label: '系统设置', page: 'settings' },
];
const protectedPages: Record<string, PageId> = {
  '/dashboard': 'dashboard', '/orders': 'orders', '/addresses': 'addresses',
  '/chains': 'chains', '/rpc': 'rpc', '/keys': 'keys',
  '/payment-setup': 'payment-setup',
  '/payment-setup/integrations': 'integrations',
  '/settings': 'settings', '/settings/system': 'settings-system',
  '/settings/telegram': 'settings-telegram', '/settings/pay': 'settings-pay',
  '/settings/epay': 'settings-epay', '/settings/okpay': 'settings-okpay',
  '/settings/notifications': 'settings-notifications',
  '/settings/display': 'settings-display',
  '/settings/appearance': 'settings-appearance',
  '/account/password': 'account-password', '/help': 'help',
};
const errors = new Set(['401', '403', '404', '500', '503']);

export function resolveRoute(pathname: string): RouteMatch {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/sign-in') return { page: 'sign-in', pathname: path, public: true };
  if (path === '/install') return { page: 'install', pathname: path, public: true };
  const match = /^\/cashier\/([^/]+)$/.exec(path);
  if (match) {
    let tradeId: string;
    try { tradeId = decodeURIComponent(match[1]); } catch { return { page: '404', pathname: path, public: true }; }
    if (!tradeId || tradeId.includes('/') || tradeId.includes('\\')) return { page: '404', pathname: path, public: true };
    return { page: 'cashier', pathname: path, public: true, tradeId };
  }
  if (errors.has(path.slice(1)) && path.lastIndexOf('/') === 0)
    return { page: path.slice(1) as PageId, pathname: path, public: true };
  return { page: protectedPages[path] ?? '404', pathname: path, public: Boolean(!protectedPages[path]) };
}
export function initialDestination(pathname: string, hasToken: boolean): string {
  if (pathname === '/') return hasToken ? '/dashboard' : '/sign-in';
  if (pathname === '/account') return '/account/password';
  return pathname;
}
export function signInPath(destination: string): string {
  return '/sign-in?redirect=' + encodeURIComponent(destination);
}
export function safeRedirect(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\'))
    return '/dashboard';
  // Auth and home routes are not useful post-login destinations.
  if (candidate === '/' || candidate.startsWith('/sign-in')) return '/dashboard';
  return candidate;
}
