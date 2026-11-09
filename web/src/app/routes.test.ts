import { describe, expect, it } from 'vitest';
import { initialDestination, resolveRoute, safeRedirect, signInPath } from './routes';

describe('compiled route compatibility', () => {
  it('maps public cashier and protected admin routes', () => {
    expect(resolveRoute('/cashier/tx%201')).toMatchObject({ public: true, tradeId: 'tx 1', page: 'cashier' });
    expect(resolveRoute('/orders')).toMatchObject({ public: false, page: 'orders' });
    expect(resolveRoute('/settings/telegram')).toMatchObject({ public: false, page: 'settings-telegram' });
    expect(resolveRoute('/payment-setup/integrations').page).toBe('integrations');
    expect(resolveRoute('/missing').page).toBe('404');
    expect(resolveRoute('/cashier/a%2Fb').page).toBe('404');
  });
  it('redirects root and account routes', () => {
    expect(initialDestination('/', false)).toBe('/sign-in');
    expect(initialDestination('/', true)).toBe('/dashboard');
    expect(initialDestination('/account', true)).toBe('/account/password');
  });
  it('protects login return route from external redirects', () => {
    expect(signInPath('/orders?page=2')).toBe('/sign-in?redirect=%2Forders%3Fpage%3D2');
    expect(safeRedirect('/orders?page=2')).toBe('/orders?page=2');
    expect(safeRedirect('//evil.test')).toBe('/dashboard');
    expect(safeRedirect('https://evil.test')).toBe('/dashboard');
    expect(safeRedirect('/\\evil.test')).toBe('/dashboard');
    expect(safeRedirect('/sign-in')).toBe('/dashboard');
  });
});
