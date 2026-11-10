import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/i18n-provider';
import { ToastProvider } from '../../components/ui/toast';
import { RpcPage } from './rpc-page';

describe('W41 RPC management view', () => {
  it('shows TCP-only health scope and does not render credentials', () => {
    const html = renderToStaticMarkup(<I18nProvider><ToastProvider><RpcPage/></ToastProvider></I18nProvider>);
    expect(html).toContain('RPC nodes');
    expect(html).toContain('TCP connectivity');
    expect(html).toContain('Add RPC node');
    expect(html).not.toContain('secret_key');
    expect(html).not.toContain('api_key');
    expect(html).not.toContain('/mark-paid');
  });
});
