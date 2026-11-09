import { useState, type FormEvent } from 'react';
import { auth, ApiError } from '../../api';
import { Button, Card, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';

export function PasswordPage({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const { t } = useI18n();
  const { notify } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError(t('auth.passwordTooShort')); return; }
    if (confirm !== newPassword) { setError(t('auth.passwordMismatch')); return; }
    setBusy(true);
    try {
      await auth.changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setConfirm('');
      notify({ title: t('auth.passwordChanged'), tone: 'success' });
      onPasswordChanged(); // invalidate the old session on success
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('auth.passwordChangeError'));
    } finally { setBusy(false); }
  }
  return <Card className="form-panel" title={t('auth.changePassword')}>
    <form onSubmit={submit} className="form-stack">
      <TextField label={t('auth.currentPassword')} type="password" required
        autoComplete="current-password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}/>
      <TextField label={t('auth.newPassword')} type="password" required minLength={6}
        autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
      <TextField label={t('auth.confirmPassword')} type="password" required
        autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="form-actions"><Button type="submit" busy={busy}>
        {busy ? t('common.submitting') : t('common.save')}
      </Button></div>
    </form>
  </Card>;
}
