import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, auth, ApiError, type Profile, session } from './api';
import { safeRedirect, signInPath } from './app/routes';
import { AdminLayout } from './layouts/admin-layout';
import { PasswordPage } from './features/auth/password-page';
import { useBrowserRoute } from './app/use-browser-route';
import './style.css';

const titles: Record<string, string> = {
  dashboard: '仪表盘', orders: '订单管理', addresses: '钱包地址', chains: '支付网络',
  rpc: 'RPC 节点', keys: 'API 密钥', 'payment-setup': '支付配置', integrations: '接入指南',
  settings: '系统设置', 'settings-system': '系统设置', 'settings-telegram': 'Telegram',
  'settings-pay': '支付参数', 'settings-epay': 'EPay', 'settings-okpay': 'OkPay',
  'settings-notifications': '通知设置', 'settings-display': '显示设置',
  'settings-appearance': '外观设置', 'account-password': '修改密码', help: '帮助',
};

function App() {
  const [tokenPresent, setTokenPresent] = useState(Boolean(session.get()));
  useEffect(() => session.subscribe(() => setTokenPresent(Boolean(session.get()))), []);
  const { route, location, navigate } = useBrowserRoute(tokenPresent);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(Boolean(session.get()));
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!tokenPresent) {
      setProfile(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    auth.me().then(value => { if (alive) setProfile(value); })
      .catch(() => {
        session.clear();
        if (alive) { setProfile(null); setTokenPresent(false); }
      }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [tokenPresent]);

  // Protected pages must not issue API requests before auth.me has succeeded.
  useEffect(() => {
    if (!profile || route.public) return;
    let alive = true;
    setResult(null);
    setError('');
    if (route.page !== 'dashboard' && route.page !== 'orders') return;
    setLoadingData(true);
    const endpoint = route.page === 'dashboard' ? '/dashboard/overview' : '/orders';
    api<unknown>(endpoint).then(data => { if (alive) setResult(data); })
      .catch(e => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) {
          setProfile(null);
          setTokenPresent(false);
        } else setError(e instanceof Error ? e.message : '请求失败');
      })
      .finally(() => { if (alive) setLoadingData(false); });
    return () => { alive = false; };
  }, [profile, route.page, route.public]);

  // Keep the originally requested protected URL in the sign-in query.
  useEffect(() => {
    if (checking || route.public || profile) return;
    if (route.page !== '404') navigate(signInPath(location), true);
  }, [checking, route.public, route.page, profile, location, navigate]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await auth.login(username, password);
      session.set(data.token);
      const user = await auth.me();
      setProfile(user);
      setTokenPresent(true);
      setPassword('');
      navigate(safeRedirect(new URLSearchParams(window.location.search).get('redirect')), true);
    } catch (e) {
      session.clear();
      setTokenPresent(false);
      setProfile(null);
      setError(e instanceof ApiError ? e.message : '登录失败');
    } finally { setBusy(false); }
  }

  async function logout() {
    try { await auth.logout(); } catch { /* stateless JWT; local logout still required */ }
    session.clear();
    setTokenPresent(false);
    setProfile(null);
    setResult(null);
    setError('');
    navigate('/sign-in', true);
  }

  function go(to: string) {
    setError('');
    navigate(to);
  }

  if (checking) return <main className="center"><p>正在校验登录状态…</p></main>;
  if (route.page === 'cashier')
    return <main className="center"><section className="panel login">
      <h1>收银台</h1><p>订单号：{route.tradeId}</p>
      <p className="muted">公共收银台页面尚未恢复。此处不提供付款地址或确认付款按钮，以免误导。</p>
    </section></main>;
  if (route.page === 'install')
    return <main className="center"><section className="panel login">
      <h1>安装向导</h1><p className="muted">安装页待恢复。</p>
    </section></main>;
  if (['401', '403', '404', '500', '503'].includes(route.page))
    return <main className="center"><section className="panel login">
      <h1>{route.page}</h1><p className="muted">对应原版错误页面尚待恢复。</p>
      <button onClick={() => go('/')}>返回首页</button>
    </section></main>;

  if (route.page === 'sign-in' && !profile)
    return <main className="center"><form className="panel login" onSubmit={login}>
      <h1>Epusdt 管理后台</h1><p className="muted">源码恢复工程 · 管理后台</p>
      <label>用户名<input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username"/></label>
      <label>密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy} type="submit">{busy ? '登录中…' : '登录'}</button>
    </form></main>;

  if (route.page === 'sign-in' && profile) {
    // Avoid rendering a misleading login form for already-authenticated users.
    return <main className="center"><button onClick={() => go('/dashboard')}>进入管理后台</button></main>;
  }
  if (!profile) return <main className="center"><p>正在前往登录页…</p></main>;

  const section = route.page === 'dashboard' || route.page === 'orders';
  return <AdminLayout pathname={route.pathname} title={titles[route.page] ?? '管理后台'}
    user={profile} onNavigate={go} onLogout={logout}>
    {error && <p role="alert" className="error">{error}</p>}
    {route.page === 'account-password' ? <PasswordPage /> :
      section ? (loadingData ? <p>加载中…</p> : <section className="panel">
        <p className="muted">仅 API 联通性预览；真实业务页面待恢复。</p>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </section>) : <section className="panel">
        <p className="muted">已建立原版路由路径与登录守卫。该业务页面尚未开发，未进行任何敏感操作。</p>
      </section>}
  </AdminLayout>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
