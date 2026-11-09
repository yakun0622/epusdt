import { useState, type FormEvent } from 'react';
import { auth, ApiError } from '../../api';

export function PasswordPage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setSuccess('');
    if (newPassword.length < 6) { setError('新密码至少 6 位'); return; }
    if (confirm !== newPassword) { setError('两次输入的新密码不一致'); return; }
    setBusy(true);
    try {
      await auth.changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setConfirm('');
      setSuccess('密码修改成功，请重新登录以使用新会话。');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '修改失败，请重试');
    } finally { setBusy(false); }
  }
  return <section className="panel form-panel">
    <h2>修改管理员密码</h2>
    <form onSubmit={submit}>
      <label>原密码<input type="password" required autoComplete="current-password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}/></label>
      <label>新密码<input type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}/></label>
      <label>确认新密码<input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
      {error && <p role="alert" className="error">{error}</p>}
      {success && <p role="status">{success}</p>}
      <button type="submit" disabled={busy}>{busy ? '提交中…' : '保存密码'}</button>
    </form>
  </section>;
}
