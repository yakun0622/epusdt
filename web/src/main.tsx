import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, ApiError, type Profile, session } from './api';
import { safeRedirect, signInPath, type PageId } from './app/routes';
import { useBrowserRoute } from './app/use-browser-route';
import { AdminLayout } from './layouts/admin-layout';
import { PasswordPage } from './features/auth/password-page';
import { AppearancePage } from './features/settings/appearance-page';
import { OrdersPage } from './features/orders/orders-page';
import { WalletsPage } from './features/wallets/wallets-page';
import { ApiKeysPage } from './features/keys/api-keys-page';
import { ChainsPage } from './features/networks/chains-page';
import { RpcPage } from './features/networks/rpc-page';
import { SettingsPage } from './features/operations/settings-page';
import { DashboardPage } from './features/operations/dashboard-page';
import type { SettingsPage as SettingsSection } from './api/endpoints/settings';
import { Button, Card, LoadingState, PreferencesControls, TextField, ToastProvider } from './components/ui';
import { I18nProvider, useI18n } from './i18n/i18n-provider';
import type { MessageKey } from './i18n/messages';
import { ThemeProvider } from './theme/theme-provider';
import './style.css';

const titles: Partial<Record<PageId, MessageKey>> = {
  dashboard: 'nav.dashboard',
  orders: 'nav.orders',
  addresses: 'nav.addresses',
  chains: 'nav.chains',
  rpc: 'nav.rpc',
  keys: 'nav.keys',
  'payment-setup': 'nav.paymentSetup',
  integrations: 'nav.paymentSetup',
  settings: 'nav.settings',
  'settings-system': 'settings.system',
  'settings-telegram': 'settings.telegram',
  'settings-pay': 'settings.pay',
  'settings-epay': 'settings.epay',
  'settings-okpay': 'settings.okpay',
  'settings-notifications': 'settings.notifications',
  'settings-display': 'settings.display',
  'settings-appearance': 'settings.appearance',
  'account-password': 'auth.changePassword',
  help: 'nav.help',
};

function PublicPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="public-shell">
    <div className="public-topbar"><strong>GMPay</strong><PreferencesControls/></div>
    <div className="public-body"><Card className="public-panel" title={title}>{children}</Card></div>
  </main>;
}

function App() {
  const { t } = useI18n();
  const [tokenPresent, setTokenPresent] = useState(Boolean(session.get()));
  useEffect(() => session.subscribe(() => setTokenPresent(Boolean(session.get()))), []);
  const { route, location, navigate } = useBrowserRoute(tokenPresent);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(Boolean(session.get()));
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Public checkout/install/error routes must not validate admin JWT just because a cookie exists.
    if (route.public && route.page !== 'sign-in') { setChecking(false); return; }
    if (!tokenPresent) { setProfile(null); setChecking(false); return; }
    setChecking(true);
    auth.me().then(value => { if (alive) setProfile(value); })
      .catch(() => {
        session.clear();
        if (alive) { setProfile(null); setTokenPresent(false); }
      }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [tokenPresent, route.public, route.page]);

  useEffect(() => {
    if (checking || route.public || profile) return;
    if (route.page !== '404') navigate(signInPath(location), true);
  }, [checking, route.public, route.page, profile, location, navigate]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await auth.login(username, password);
      session.set(data.token);
      const user = await auth.me();
      setProfile(user); setTokenPresent(true); setPassword('');
      navigate(safeRedirect(new URLSearchParams(window.location.search).get('redirect')), true);
    } catch (e) {
      session.clear(); setTokenPresent(false); setProfile(null);
      setError(e instanceof ApiError ? e.message : t('auth.signInError'));
    } finally { setBusy(false); }
  }
  async function logout() {
    try { await auth.logout(); } catch { /* Stateless JWT: local logout always succeeds. */ }
    clearSession();
  }
  function clearSession() {
    session.clear(); setTokenPresent(false); setProfile(null); setError('');
    navigate('/sign-in', true);
  }
  const go = (to: string) => { setError(''); navigate(to); };

  if (checking && (!route.public || route.page === 'sign-in'))
    return <main className="center"><LoadingState label={t('auth.checking')}/></main>;
  if (route.page === 'cashier')
    return <PublicPage title={t('checkout.title')}>
      <p>{t('checkout.order')}: {route.tradeId}</p>
      <p className="muted">{t('checkout.notReady')}</p>
    </PublicPage>;
  if (route.page === 'install')
    return <PublicPage title={t('pages.install')}><p>{t('pages.installNotReady')}</p></PublicPage>;
  if (['401', '403', '404', '500', '503'].includes(route.page))
    return <PublicPage title={route.page}>
      <p>{t('pages.errorNotReady')}</p>
      <Button onClick={() => go('/')}>{t('common.backHome')}</Button>
    </PublicPage>;

  if (route.page === 'sign-in' && !profile)
    return <PublicPage title={t('app.console')}>
      <form className="login-form" onSubmit={login}>
        <p className="muted">{t('app.loginSubtitle')}</p>
        <TextField label={t('common.username')} value={username} onChange={e => setUsername(e.target.value)}
          required autoComplete="username"/>
        <TextField label={t('common.password')} type="password" value={password}
          onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/>
        {error && <p role="alert" className="error">{error}</p>}
        <Button type="submit" busy={busy}>{busy ? t('common.loading') : t('common.signIn')}</Button>
      </form>
    </PublicPage>;

  if (route.page === 'sign-in' && profile)
    return <PublicPage title={t('app.console')}>
      <Button onClick={() => go('/dashboard')}>{t('nav.dashboard')}</Button>
    </PublicPage>;
  if (!profile) return <main className="center"><LoadingState label={t('auth.checking')}/></main>;

  const settingsSection: SettingsSection | null = route.page === 'settings' ? 'system' :
    route.page === 'settings-system' ? 'system' :
    route.page === 'settings-telegram' ? 'telegram' :
    route.page === 'settings-pay' ? 'pay' :
    route.page === 'settings-epay' ? 'epay' :
    route.page === 'settings-okpay' ? 'okpay' : null;
  return <AdminLayout pathname={route.pathname} title={t(titles[route.page] ?? 'app.console')}
    user={profile} onNavigate={go} onLogout={logout}>
    {error && <p role="alert" className="error">{error}</p>}
    {route.page === 'account-password' ? <PasswordPage onPasswordChanged={clearSession}/> :
      route.page === 'settings-appearance' ? <AppearancePage/> :
      route.page === 'orders' ? <OrdersPage location={location} onNavigate={go}/> :
      route.page === 'addresses' ? <WalletsPage location={location} onNavigate={go}/> :
      route.page === 'keys' ? <ApiKeysPage/> :
      route.page === 'chains' ? <ChainsPage/> :
      route.page === 'rpc' ? <RpcPage/> :
      route.page === 'dashboard' ? <DashboardPage/> :
      settingsSection ? <SettingsPage section={settingsSection} onNavigate={go}/> :
        <Card><p className="muted">{t('pages.unimplemented')}</p></Card>}
  </AdminLayout>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider><App/></ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
