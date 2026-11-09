import { useI18n } from '../../i18n/i18n-provider';
import { localeNames, supportedLocales, type Locale } from '../../i18n/locale';
import { useTheme } from '../../theme/theme-provider';
import type { ThemePreference } from '../../theme/theme';
import { SelectField } from './field';

export function LocaleSelect() {
  const { locale, setLocale, t } = useI18n();
  return <SelectField label={t('common.language')} value={locale}
    onChange={event => setLocale(event.target.value as Locale)}
    options={supportedLocales.map(value => ({ value, label: localeNames[value] }))}/>;
}
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return <SelectField label={t('common.theme')} value={theme}
    onChange={event => setTheme(event.target.value as ThemePreference)}
    options={[
      { value: 'system', label: t('common.themeSystem') },
      { value: 'light', label: t('common.themeLight') },
      { value: 'dark', label: t('common.themeDark') },
    ]}/>;
}
export function PreferencesControls() {
  return <div className="preferences-controls"><ThemeSelect/><LocaleSelect/></div>;
}
