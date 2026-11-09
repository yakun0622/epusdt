import type { ReactNode } from 'react';
import { navItems } from '../app/routes';
import { Button, PreferencesControls, SelectField } from '../components/ui';
import { useI18n } from '../i18n/i18n-provider';
import type { MessageKey } from '../i18n/messages';
import type { Profile } from '../api/types/admin';

const navLabels: Record<string, MessageKey> = {
  '/dashboard': 'nav.dashboard',
  '/orders': 'nav.orders',
  '/addresses': 'nav.addresses',
  '/chains': 'nav.chains',
  '/rpc': 'nav.rpc',
  '/keys': 'nav.keys',
  '/payment-setup': 'nav.paymentSetup',
  '/settings': 'nav.settings',
};
const secondary: ReadonlyArray<{ path: string; key: MessageKey }> = [
  { path: '/settings/system', key: 'settings.system' },
  { path: '/settings/telegram', key: 'settings.telegram' },
  { path: '/settings/pay', key: 'settings.pay' },
  { path: '/settings/epay', key: 'settings.epay' },
  { path: '/settings/okpay', key: 'settings.okpay' },
  { path: '/settings/notifications', key: 'settings.notifications' },
  { path: '/settings/display', key: 'settings.display' },
  { path: '/settings/appearance', key: 'settings.appearance' },
];

interface AdminLayoutProps {
  pathname: string;
  title: string;
  user: Profile;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AdminLayout({ pathname, title, user, onNavigate, onLogout, children }: AdminLayoutProps) {
  const { t } = useI18n();
  const isSettings = pathname.startsWith('/settings');
  return <div className="app">
    <aside className="admin-sidebar" aria-label={t('app.console')}>
      <div className="brand"><span className="brand-icon">G</span>
        <span>{t('app.brand')} <small>{t('app.console')}</small></span></div>
      <nav aria-label={t('app.console')} className="admin-nav">
        {navItems.map(item => <Button key={item.path} variant="ghost" size="sm"
          aria-current={pathname === item.path ? 'page' : undefined}
          className={pathname === item.path || pathname.startsWith(item.path + '/') ? 'active' : ''}
          onClick={() => onNavigate(item.path)}>{t(navLabels[item.path])}</Button>)}
      </nav>
      <div className="nav-footer">
        <Button variant="ghost" size="sm" onClick={() => onNavigate('/account/password')}>{t('nav.accountSecurity')}</Button>
        <Button variant="ghost" size="sm" onClick={() => onNavigate('/help')}>{t('nav.help')}</Button>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-header">
        <div className="breadcrumb">{t('app.breadcrumb')} <span>/</span> <strong>{title}</strong></div>
        <div className="header-account">
          <PreferencesControls/>
          <span className="account-name">{user.username}</span>
          <Button variant="secondary" size="sm" onClick={onLogout}>{t('common.signOut')}</Button>
        </div>
      </header>
      <main className="content">
        <h1>{title}</h1>
        {user.password_is_default && <div className="warning" role="alert">
          {t('auth.defaultPassword')}{' '}
          <Button variant="ghost" size="sm" className="inline-link"
            onClick={() => onNavigate('/account/password')}>{t('auth.changePassword')}</Button>
        </div>}
        {isSettings ? <div className="settings-grid">
          <div className="settings-nav-mobile">
            <SelectField label={t('nav.settings')} value={pathname}
              options={[{ value: '/settings', label: t('nav.settings') },
                ...secondary.map(item => ({ value: item.path, label: t(item.key) }))]}
              onChange={event => onNavigate(event.target.value)}/>
          </div>
          <nav className="settings-nav" aria-label={t('nav.settings')}>
            {secondary.map(item => <Button key={item.path} variant="ghost" size="sm"
              aria-current={pathname === item.path ? 'page' : undefined}
              className={pathname === item.path ? 'active' : ''}
              onClick={() => onNavigate(item.path)}>{t(item.key)}</Button>)}
          </nav>
          <div className="page-body">{children}</div>
        </div> : <div className="page-body">{children}</div>}
      </main>
    </div>
  </div>;
}
