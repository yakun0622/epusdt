import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import { apiKeysApi, parseApiKeyForm, type ApiKeyForm, type ApiKeyStats } from '../../api/endpoints/api-keys';
import type { ApiKey } from '../../api/types/admin';
import type { ToggleStatus } from '../../api/types/common';
import { Button, Card, DataTable, Dialog, LoadingState, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { keyLabel, type ApiKeyMessageKey } from './i18n';
import { SecretDialog, type TransientSecret } from './secret-dialog';

type KeyModal =
  | { kind: 'create' }
  | { kind: 'edit' | 'status' | 'rotate' | 'delete' | 'view' | 'stats'; row: ApiKey }
  | null;
const blankForm: ApiKeyForm = { name: '', ip_whitelist: '', notify_url: '' };
function showError(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
function showWhen(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value || value.startsWith('0001-01-01')) return fallback;
  const stamp = new Date(value.replace(' ', 'T'));
  return Number.isNaN(stamp.getTime()) ? value :
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(stamp);
}
function KeyStatsView({ row }: { row: ApiKey }) {
  const { locale } = useI18n();
  const t = useCallback((key: ApiKeyMessageKey) => keyLabel(locale, key), [locale]);
  const [stats, setStats] = useState<ApiKeyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    apiKeysApi.stats(row.id, abort.signal).then(value => {
      if (live) setStats(value);
    }).catch(cause => {
      if (live && !abort.signal.aborted) setError(showError(cause, t('fetchError')));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; abort.abort(); };
  }, [row.id, t]);

  if (loading) return <LoadingState label={t('loading')}/>;
  if (error) return <p role="alert" className="error">{error}</p>;
  return <div className="keys-stats">
    <div><strong>{t('pid')}</strong><span>{row.pid}</span></div>
    <div><strong>{t('calls')}</strong><span>{stats?.call_count ?? 0}</span></div>
    <div><strong>{t('lastUsed')}</strong>
      <span>{showWhen(stats?.last_used_at, locale, t('never'))}</span></div>
    <p className="muted">{t('statsNote')}</p>
  </div>;
}

export function ApiKeysPage() {
  const { locale } = useI18n();
  const t = useCallback((key: ApiKeyMessageKey) => keyLabel(locale, key), [locale]);
  const { notify } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<KeyModal>(null);
  const [form, setForm] = useState<ApiKeyForm>(blankForm);
  const [confirmation, setConfirmation] = useState('');
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  // Isolated, ephemeral secret; never localStorage/sessionStorage/query/logs.
  const [secret, setSecret] = useState<TransientSecret | null>(null);
  const dismissSecret = useCallback(() => setSecret(null), []);

  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    setLoading(true); setListError('');
    apiKeysApi.list(abort.signal).then(value => {
      if (live) setKeys(value);
    }).catch(cause => {
      if (live && !abort.signal.aborted) {
        setKeys([]);
        setListError(showError(cause, t('fetchError')));
      }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; abort.abort(); };
  }, [refreshCount, t]);
  const visible = useMemo(() => keys.filter(row => {
    const query = filter.trim().toLowerCase();
    return !query || row.name.toLowerCase().includes(query) || row.pid.includes(query);
  }), [keys, filter]);
  const refresh = () => setRefreshCount(value => value + 1);
  function openModal(next: Exclude<KeyModal, null>) {
    if (busy || secret) return;
    setModal(next); setModalError(''); setConfirmation('');
    setForm(next.kind === 'edit' ? {
      name: next.row.name, ip_whitelist: next.row.ip_whitelist, notify_url: next.row.notify_url,
    } : { ...blankForm });
  }
  function closeModal() { if (!busy) { setModal(null); setModalError(''); } }
  const setField = (key: keyof ApiKeyForm, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  function succeeded() {
    setModal(null); setModalError('');
    refresh();
    notify({ title: t('success'), tone: 'success' });
  }
  function failed(cause: unknown) {
    setModalError(showError(cause, t('operationError')));
  }
  async function saveForm(event: FormEvent) {
    event.preventDefault();
    if (busy || !modal || (modal.kind !== 'create' && modal.kind !== 'edit')) return;
    if (!form.name.trim() || form.name.trim().length > 128) { setModalError(t('invalidName')); return; }
    setBusy(true); setModalError('');
    try {
      const validated = parseApiKeyForm(form);
      if (modal.kind === 'create') {
        const result = await apiKeysApi.create(validated);
        setModal(null);
        setSecret({ id: result.id, pid: result.pid, secret: result.secret_key, origin: 'create' });
        refresh();
      } else {
        await apiKeysApi.update(modal.row.id, validated);
        succeeded();
      }
    } catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  async function confirmAction() {
    if (busy || !modal || modal.kind === 'create' || modal.kind === 'edit' || modal.kind === 'stats') return;
    const target = modal.row;
    if ((modal.kind === 'rotate' || modal.kind === 'delete') && confirmation !== target.pid) return;
    setBusy(true); setModalError('');
    try {
      if (modal.kind === 'status') {
        const next: ToggleStatus = target.status === 1 ? 2 : 1;
        await apiKeysApi.changeStatus(target.id, next);
        succeeded();
      } else if (modal.kind === 'view') {
        // GET is performed only after explicit confirmation, never while rendering the list.
        const value = await apiKeysApi.viewSecret(target.id);
        setModal(null);
        setSecret({ id: target.id, pid: target.pid, secret: value, origin: 'view' });
      } else if (modal.kind === 'rotate') {
        const value = await apiKeysApi.rotateSecret(target.id);
        setModal(null);
        setSecret({ id: target.id, pid: target.pid, secret: value, origin: 'rotate' });
        refresh();
      } else if (modal.kind === 'delete') {
        await apiKeysApi.remove(target.id);
        succeeded();
      }
    } catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }

  const modalTitle = !modal ? t('title') :
    modal.kind === 'create' ? t('creation') :
    modal.kind === 'edit' ? t('editTitle') :
    modal.kind === 'stats' ? t('statsTitle') :
    modal.kind === 'status' ? t('statusTitle') :
    modal.kind === 'rotate' ? t('rotateTitle') :
    modal.kind === 'delete' ? t('deleteTitle') : t('viewTitle');

  return <div className="keys-page">
    <Card>
      <div className="keys-toolbar">
        <div><h2>{t('title')}</h2><p className="muted">{t('description')}</p>
          <p className="muted keys-hint">{t('noSecretList')}</p></div>
        <div className="keys-toolbar-actions">
          <Button variant="secondary" disabled={loading || busy} onClick={refresh}>{t('refresh')}</Button>
          <Button disabled={busy} onClick={() => openModal({ kind: 'create' })}>{t('create')}</Button>
        </div>
      </div>
      <div className="keys-filter">
        <TextField label={t('name')} value={filter} onChange={e => setFilter(e.target.value)}
          autoComplete="off" placeholder={t('pid')}/>
        <span className="muted">{t('count')}: {visible.length}</span>
      </div>
      {listError && <div className="keys-load-error" role="alert">
        {listError} <Button variant="secondary" size="sm" onClick={refresh}>{t('retry')}</Button>
      </div>}
      {!listError && <DataTable rows={visible} loading={loading} loadingLabel={t('loading')}
        emptyLabel={t('empty')} ariaLabel={t('title')} getRowKey={row => row.id}
        columns={[
          { key: 'name', title: t('name'), render: row => row.name },
          { key: 'pid', title: t('pid'), render: row => <span className="keys-pid">{row.pid}</span> },
          { key: 'status', title: t('status'), render: row =>
            <span className={'keys-status keys-status--' + row.status}>
              {row.status === 1 ? t('enabled') : t('disabled')}</span> },
          { key: 'calls', title: t('calls'), align: 'right', render: row => row.call_count.toLocaleString(locale) },
          { key: 'last', title: t('lastUsed'), render: row => showWhen(row.last_used_at, locale, t('never')) },
          { key: 'actions', title: t('actions'), render: row =>
            <div className="keys-row-actions">
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'edit', row })}>{t('edit')}</Button>
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'stats', row })}>{t('stats')}</Button>
              <Button variant="secondary" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'view', row })}>{t('view')}</Button>
              <Button variant="secondary" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'rotate', row })}>{t('rotate')}</Button>
              <Button variant="secondary" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'status', row })}>
                {row.status === 1 ? t('disable') : t('enable')}
              </Button>
              <Button variant="danger" size="sm" disabled={busy}
                onClick={() => openModal({ kind: 'delete', row })}>{t('remove')}</Button>
            </div> },
        ]}/>}
    </Card>
    <Dialog open={Boolean(modal)} title={modalTitle} closeLabel={t('close')} onClose={closeModal}>
      {(modal?.kind === 'create' || modal?.kind === 'edit') &&
        <form onSubmit={saveForm} className="form-stack" autoComplete="off">
          <p className="muted">{t('readOnly')}</p>
          {modal.kind === 'edit' && <div className="keys-static"><strong>{t('pid')}</strong>
            <span className="keys-pid">{modal.row.pid}</span></div>}
          <TextField label={t('name')} value={form.name} required maxLength={128}
            onChange={e => setField('name', e.target.value)}/>
          <TextField label={t('whitelist')} hint={t('whitelistHint')} value={form.ip_whitelist}
            onChange={e => setField('ip_whitelist', e.target.value)}/>
          <TextField label={t('notifyUrl')} value={form.notify_url} type="url"
            onChange={e => setField('notify_url', e.target.value)}/>
          {modalError && <p role="alert" className="error">{modalError}</p>}
          <div className="keys-modal-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}>{busy ? t('busy') : t('save')}</Button>
          </div>
        </form>}
      {modal?.kind === 'stats' && <div className="form-stack">
        <KeyStatsView key={modal.row.id} row={modal.row}/>
        <div className="keys-modal-actions">
          <Button variant="secondary" onClick={closeModal}>{t('close')}</Button>
        </div>
      </div>}
      {modal && ['status', 'rotate', 'delete', 'view'].includes(modal.kind) && 'row' in modal &&
        <div className="form-stack">
          <div className="keys-static"><strong>{t('pid')}</strong>
            <span className="keys-pid">{modal.row.pid}</span></div>
          <p className={modal.kind === 'rotate' || modal.kind === 'delete' ? 'keys-risk-warning' : 'muted'}>
            {modal.kind === 'rotate' ? t('rotateWarning') :
              modal.kind === 'delete' ? t('deleteWarning') :
              modal.kind === 'view' ? t('viewWarning') : t('statusWarning')}
          </p>
          {(modal.kind === 'rotate' || modal.kind === 'delete') &&
            <TextField label={t('typePid')} value={confirmation} autoComplete="off"
              placeholder={modal.row.pid} onChange={e => setConfirmation(e.target.value)}/>}
          {modalError && <p role="alert" className="error">{modalError}</p>}
          <div className="keys-modal-actions">
            <Button variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button variant={modal.kind === 'delete' ? 'danger' : 'primary'} busy={busy}
              disabled={(modal.kind === 'rotate' || modal.kind === 'delete') && confirmation !== modal.row.pid}
              onClick={() => { void confirmAction(); }}>{t('confirm')}</Button>
          </div>
        </div>}
    </Dialog>
    {secret && <SecretDialog key={secret.id + '-' + secret.origin}
      grant={secret} onClose={dismissSecret}/>}
  </div>;
}
