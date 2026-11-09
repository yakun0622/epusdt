import type { ReactNode } from 'react';
import { navItems } from '../app/routes';
import type { Profile } from '../api/types/admin';

const secondary = [
  { path: '/settings/system', label: '系统' },
  { path: '/settings/telegram', label: 'Telegram' },
  { path: '/settings/pay', label: '支付参数' },
  { path: '/settings/epay', label: 'EPay' },
  { path: '/settings/okpay', label: 'OkPay' },
  { path: '/settings/appearance', label: '外观' },
  { path: '/account/password', label: '修改密码' },
  { path: '/help', label: '帮助' },
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
  const isSettings = pathname.startsWith('/settings');
  return <div className="app">
    <aside className="admin-sidebar" aria-label="管理导航">
      <div className="brand"><span className="brand-icon">G</span><span>GMPay <small>Console</small></span></div>
      <nav aria-label="主要菜单" className="admin-nav">
        {navItems.map(item => <button key={item.path} type="button"
          aria-current={pathname === item.path ? 'page' : undefined}
          className={pathname === item.path || pathname.startsWith(item.path + '/') ? 'active' : ''}
          onClick={() => onNavigate(item.path)}>{item.label}</button>)}
      </nav>
      <div className="nav-footer">
        <button type="button" onClick={() => onNavigate('/account/password')}>账户安全</button>
        <button type="button" onClick={() => onNavigate('/help')}>帮助</button>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-header">
        <div className="breadcrumb">管理后台 <span>/</span> <strong>{title}</strong></div>
        <div className="header-account"><span>{user.username}</span>
          <button className="secondary" type="button" onClick={onLogout}>退出登录</button>
        </div>
      </header>
      <main className="content">
        <h1>{title}</h1>
        {user.password_is_default && <div className="warning" role="alert">当前仍使用初始管理员密码，建议立即
          <button className="inline-link" type="button" onClick={() => onNavigate('/account/password')}>修改密码</button>。
        </div>}
        <div className={isSettings ? 'settings-grid' : ''}>
          {isSettings && <nav className="settings-nav" aria-label="设置导航">
            {secondary.filter(item => item.path.startsWith('/settings')).map(item =>
              <button type="button" key={item.path} aria-current={pathname === item.path ? 'page' : undefined}
                className={pathname === item.path ? 'active' : ''}
                onClick={() => onNavigate(item.path)}>{item.label}</button>)}
          </nav>}
          <div className="page-body">{children}</div>
        </div>
      </main>
    </div>
  </div>;
}
