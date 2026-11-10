import { useEffect, useState } from 'react';
import { Button, Dialog } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { keyLabel } from './i18n';

export interface TransientSecret {
  id: number;
  pid: string;
  secret: string;
  origin: 'create' | 'view' | 'rotate';
}

/** Mounted only after an explicit key operation. Never writes storage, clipboard or logs. */
export function SecretDialog({ grant, onClose }: { grant: TransientSecret; onClose: () => void }) {
  const { locale } = useI18n();
  const t = (key: Parameters<typeof keyLabel>[1]) => keyLabel(locale, key);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 60000);
    const hideWhenBackgrounded = () => { if (document.visibilityState === 'hidden') onClose(); };
    document.addEventListener('visibilitychange', hideWhenBackgrounded);
    window.addEventListener('pagehide', onClose);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', hideWhenBackgrounded);
      window.removeEventListener('pagehide', onClose);
    };
  }, [onClose]);
  return <Dialog open title={t('secretTitle')} closeLabel={t('close')} onClose={onClose}
    footer={<Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>}>
    <div className="keys-secret-dialog">
      <p className="muted">{t('secretHelp')}</p>
      {grant.origin === 'create' && <p className="keys-sensitive-warning">{t('secretCreateWarning')}</p>}
      <p className="keys-pid"><strong>{t('pid')}</strong> {grant.pid}</p>
      <div className="ui-field">
        <label className="ui-field-label" htmlFor="key-transient-secret">{t('secret')}</label>
        <div className="keys-secret-field">
          <input id="key-transient-secret" className="ui-input"
            value={grant.secret} type={revealed ? 'text' : 'password'}
            readOnly autoComplete="off" autoCapitalize="none" spellCheck={false}/>
          <Button type="button" variant="secondary" onClick={() => setRevealed(flag => !flag)}>
            {revealed ? t('mask') : t('reveal')}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>;
}
