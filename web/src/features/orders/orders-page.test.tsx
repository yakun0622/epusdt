import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '../../theme/theme-provider';
import { I18nProvider } from '../../i18n/i18n-provider';
import { ToastProvider } from '../../components/ui/toast';
import { OrdersPage } from './orders-page';

describe('W30 orders page rendering', () => {
  it('renders read-only filters and export without W31 destructive actions', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider><I18nProvider><ToastProvider>
        <OrdersPage location="/orders?page=1&pageSize=10" onNavigate={() => {}}/>
      </ToastProvider></I18nProvider></ThemeProvider>
    );
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('pageSize');
    expect(html).not.toContain('/mark-paid');
    expect(html).not.toContain('/resend-callback');
    expect(html).not.toContain('/close');
  });
});
