import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, auth, ApiError, type Profile, session } from './api';
import './style.css';

type View = 'dashboard' | 'orders';
function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(Boolean(session.get()));
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [result, setResult] = useState<unknown>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!session.get()) return;
    auth.me().then(setProfile).catch(() => session.clear()).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    setLoadingData(true);
    setResult(null);
    const endpoint = view === 'dashboard' ? '/dashboard/overview' : '/orders';
    api<unknown>(endpoint).then(data => { if (alive) setResult(data); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoadingData(false); });
    return () => { alive = false; };
  }, [profile, view]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await auth.login(username, password);
      session.set(data.token);
      try { setProfile(await auth.me()); } catch (e) { session.clear(); throw e; }
      setPassword('');
    } catch (e) { setError(e instanceof ApiError ? e.message : '登录失败'); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await auth.logout(); } catch { /* stateless JWT: local cleanup still required */ }
    session.clear(); setProfile(null); setResult(null); setError('');
  }
  if (checking) return <main className="center"><p>正在校验登录状态…</p></main>;
  if (!profile) return <main className="center"><form className="panel login" onSubmit={login}>
    <h1>Epusdt 管理后台</h1><p className="muted">源码恢复工程 · 第一阶段</p>
    <label>用户名<input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username"/></label>
    <label>密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button disabled={busy} type="submit">{busy ? '登录中…' : '登录'}</button>
  </form></main>;
  return <div className="app"><aside><h2>Epusdt</h2><nav>
    <button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setError(''); setView('dashboard'); }}>仪表盘</button>
    <button className={view === 'orders' ? 'active' : ''} onClick={() => { setError(''); setView('orders'); }}>订单（原始数据预览）</button>
  </nav></aside><main className="content"><header><h1>{view === 'dashboard' ? '仪表盘' : '订单数据预览'}</h1><div>{String(profile.username)} <button className="secondary" onClick={logout}>退出</button></div></header>
    {profile.password_is_default && <p className="warning">当前使用初始管理员密码，请通过原管理后台尽快修改。</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {loadingData ? <p>加载中…</p> : <section className="panel"><p className="muted">这是 API 连通性验证视图，还不是最终还原的页面。</p><pre>{JSON.stringify(result, null, 2)}</pre></section>}
  </main></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
