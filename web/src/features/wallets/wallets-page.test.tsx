import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/i18n-provider';
import { ToastProvider } from '../../components/ui/toast';
import { WalletsPage } from './wallets-page';

describe('W33/W34 wallet UI', () => {
  it('provides wallet filters, actions and batch import without W31 order mutations', () => {
    const html = renderToStaticMarkup(
      <I18nProvider><ToastProvider><WalletsPage
        location="/addresses?network=tron&status=1" onNavigate={() => {}}/>
      </ToastProvider></I18nProvider>
    );
    expect(html).toContain('Batch import');
    expect(html).toContain('Add wallet');
    expect(html).toContain('Address or remark');
    expect(html).not.toContain('/mark-paid');
    expect(html).not.toContain('/resend-callback');
    expect(html).not.toContain('/orders/');
  });
});
