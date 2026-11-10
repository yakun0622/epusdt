import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {DashboardPage} from './dashboard-page';
describe('W43 live dashboard',()=>{
  it('starts without placeholder KPI or fabricated money totals',()=>{
    const html=renderToStaticMarkup(<I18nProvider><DashboardPage/></I18nProvider>);
    expect(html).toContain('Live Dashboard');
    expect(html).toContain('sum different token quantities');
    expect(html).not.toContain('12345.6789');
    expect(html).not.toContain('$0.00');
    expect(html).not.toContain('/mark-paid');
  });
});
