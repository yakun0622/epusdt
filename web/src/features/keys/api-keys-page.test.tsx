import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/i18n-provider';
import { ToastProvider } from '../../components/ui/toast';
import { ApiKeysPage } from './api-keys-page';
import { SecretDialog } from './secret-dialog';

describe('W35 security-focused API key views', () => {
  it('does not fetch or render secret fields in normal list markup', () => {
    const html = renderToStaticMarkup(
      <I18nProvider><ToastProvider><ApiKeysPage/></ToastProvider></I18nProvider>
    );
    expect(html).toContain('Create API key');
    expect(html).toContain('Secrets are not returned');
    expect(html).not.toContain('secret_key');
    expect(html).not.toContain('/mark-paid');
    expect(html).not.toContain('/resend-callback');
  });
  it('renders secrets masked by default and warns about limited lifetime', () => {
    const html = renderToStaticMarkup(
      <I18nProvider><SecretDialog
        grant={{ id: 9, pid: '1009', secret: 'test-ephemeral-secret', origin: 'create' }}
        onClose={() => {}}/></I18nProvider>
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('60 seconds');
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain('localStorage');
  });
});
