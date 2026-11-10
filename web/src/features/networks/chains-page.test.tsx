import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/i18n-provider';
import { ToastProvider } from '../../components/ui/toast';
import { ChainsPage } from './chains-page';

describe('W40 chain/token page', () => {
  it('provides real chain and token lists without invented chain creation or W31 actions', () => {
    const html = renderToStaticMarkup(<I18nProvider><ToastProvider><ChainsPage/></ToastProvider></I18nProvider>);
    expect(html).toContain('Blockchain networks');
    expect(html).toContain('Network assets');
    expect(html).toContain('Add token');
    expect(html).toContain('only existing networks can be updated');
    expect(html).not.toContain('/orders/');
    expect(html).not.toContain('/mark-paid');
  });
});
