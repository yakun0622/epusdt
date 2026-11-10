import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {ToastProvider} from '../../components/ui/toast';
import {RateCachePanel} from './rate-cache-panel';
describe('W42 rate cache view',()=>{
  it('requires explicit action for provider refresh, renders no secret API URL',()=>{
    const html=renderToStaticMarkup(<I18nProvider><ToastProvider>
      <RateCachePanel/>
    </ToastProvider></I18nProvider>);
    expect(html).toContain('Live rate cache');
    expect(html).toContain('Force refresh rates');
    expect(html).not.toContain('source_url');
    expect(html).not.toContain('api_url');
  });
});
