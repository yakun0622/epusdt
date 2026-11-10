import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rpcApi, type RpcCreate, type RpcNodeView, type RpcPurpose,
  type RpcType, type RpcUpdate, type RpcHealthResult } from '../../api/endpoints/rpc';
import { Button, Card, DataTable, Dialog, SelectField, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { networkLabel, type NetworksKey } from './i18n';

interface RpcDraft {
  network: string;
  url: string;
  type: RpcType;
  weight: string;
  purpose: RpcPurpose;
  enabled: boolean;
  apiKey: string;
  clearCredential: boolean;
}
type Modal =
  | { kind: 'create' }
  | { kind: 'edit' | 'toggle' | 'delete'; row: RpcNodeView }
  | null;
const defaultRpc = (): RpcDraft => ({
  network: '', url: '', type: 'http', weight: '1', purpose: 'general',
  enabled: true, apiKey: '', clearCredential: false,
});
const errorText = (e: unknown, fallback: string): string => e instanceof Error ? e.message : fallback;
const labels: Array<{ value: RpcPurpose; key: NetworksKey }> = [
  { value: 'general', key: 'general' },
  { value: 'manual_verify', key: 'manual' },
  { value: 'both', key: 'both' },
];
function humanDate(date: string, locale: string): string {
  if (!date || date.startsWith('0001-')) return '—';
  const parsed = new Date(date.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? date :
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}
export function RpcPage() {
  const { locale } = useI18n();
  const t = useCallback((key: NetworksKey) => networkLabel(locale, key), [locale]);
  const { notify } = useToast();
  const [draftFilter, setDraftFilter] = useState('');
  const [network, setNetwork] = useState('');
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<RpcNodeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [checkId, setCheckId] = useState<number | null>(null);
  const [health, setHealth] = useState<Record<number, RpcHealthResult>>({});
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<RpcDraft>(defaultRpc);
  const [confirmId, setConfirmId] = useState('');

  const reloadList = () => setReload(v => v + 1);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLoading(true); setListError('');
    rpcApi.list(network, abort.signal).then(data => { if (active) setRows(data); })
      .catch(e => {
        if (active && !abort.signal.aborted) {
          setRows([]); setListError(errorText(e, t('error')));
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [network, reload, t]);

  const setField = <K extends keyof RpcDraft>(field: K, value: RpcDraft[K]) =>
    setDraft(old => ({ ...old, [field]: value }));
  function openModal(next: Exclude<Modal, null>) {
    if (busy || checkId !== null) return;
    setError(''); setConfirmId('');
    setModal(next);
    setDraft(next.kind === 'create' ? { ...defaultRpc(), network: network || 'tron' } : {
      ...defaultRpc(),
      network: next.row.network, type: next.row.type, weight: String(next.row.weight),
      purpose: next.row.purpose, enabled: next.row.enabled,
      // Crucial: raw URL and API Key are never returned from list projection or prefilled.
      url: '', apiKey: '', clearCredential: false,
    });
  }
  function closeModal() {
    if (busy) return;
    setModal(null); setDraft(defaultRpc()); setError('');
  }
  function success() {
    setDraft(defaultRpc()); setModal(null); setError(''); reloadList();
    notify({ title: t('success'), tone: 'success' });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!modal || busy || (modal.kind !== 'create' && modal.kind !== 'edit')) return;
    setBusy(true); setError('');
    try {
      if (modal.kind === 'create') {
        const input: RpcCreate = {
          network: draft.network, url: draft.url, type: draft.type,
          weight: Number(draft.weight), enabled: draft.enabled,
          purpose: draft.purpose, api_key: draft.apiKey,
        };
        await rpcApi.create(input);
      } else {
        const patch: RpcUpdate = {
          weight: Number(draft.weight), enabled: draft.enabled, purpose: draft.purpose,
        };
        if (draft.url.trim()) patch.url = draft.url;
        if (draft.clearCredential) patch.clear_api_key = true;
        else if (draft.apiKey) patch.api_key = draft.apiKey;
        await rpcApi.update(modal.row.id, modal.row.type, patch);
      }
      success();
    } catch (err) { setError(errorText(err, t('error'))); }
    finally { setBusy(false); }
  }
  async function confirmAction() {
    if (!modal || modal.kind === 'create' || modal.kind === 'edit' || busy) return;
    const row = modal.row;
    if (modal.kind === 'delete' && confirmId !== String(row.id)) return;
    setBusy(true); setError('');
    try {
      if (modal.kind === 'toggle') await rpcApi.changeEnabled(row.id, !row.enabled);
      else await rpcApi.remove(row.id);
      success();
    } catch (err) { setError(errorText(err, t('error'))); }
    finally { setBusy(false); }
  }
  async function runHealth(id: number) {
    if (checkId !== null || busy) return;
    setCheckId(id); setListError('');
    try {
      const value = await rpcApi.healthCheck(id);
      setHealth(old => ({ ...old, [id]: value }));
      reloadList();
      notify({ title: t('rpcHealthRuns'), tone: value.status === 'down' ? 'error' : 'info' });
    } catch (err) {
      const msg = errorText(err, t('error'));
      notify({ title: msg, tone: 'error' });
      setListError(msg);
    } finally { setCheckId(null); }
  }
  const title = !modal ? t('rpcTitle') :
    modal.kind === 'create' ? t('createRpc') :
    modal.kind === 'edit' ? t('edit') + ' #' + modal.row.id :
    modal.kind === 'toggle' ? t('confirm') + ' #' + modal.row.id :
    t('remove') + ' #' + modal.row.id;
  const types: Array<{ value: RpcType; label: string }> = [
    { value: 'http', label: 'HTTP/HTTPS' }, { value: 'ws', label: 'WS/WSS' },
    { value: 'lite', label: 'TON lite (HTTPS config)' },
  ];
  return <div className="network-pages">
    <Card title={t('rpcTitle')} description={t('rpcHealthNote')}>
      <form className="network-toolbar" onSubmit={e => {
        e.preventDefault(); setNetwork(draftFilter.trim().toLowerCase());
      }}>
        <TextField label={t('network')} value={draftFilter}
          placeholder={t('all')} onChange={e => setDraftFilter(e.target.value)}/>
        <div className="network-toolbar-actions">
          <Button type="submit" variant="secondary">{t('confirm')}</Button>
          <Button type="button" variant="secondary" disabled={loading || busy} onClick={reloadList}>{t('refresh')}</Button>
          <Button type="button" disabled={busy} onClick={() => openModal({ kind: 'create' })}>{t('createRpc')}</Button>
        </div>
      </form>
      {listError && <p className="error network-inline-error" role="alert">{listError}
        <Button size="sm" variant="secondary" onClick={reloadList}>{t('retry')}</Button></p>}
      {!listError && <DataTable rows={rows} loading={loading}
        loadingLabel={t('loading')} emptyLabel={t('empty')} ariaLabel={t('rpcTitle')}
        getRowKey={row => row.id} columns={[
          { key: 'network', title: t('network'), render: row => row.network },
          { key: 'endpoint', title: t('rpcEndpoint'), render: row =>
            <span className="network-code">{row.endpoint}</span> },
          { key: 'type', title: t('rpcType'), render: row => row.type },
          { key: 'purpose', title: t('rpcPurpose'), render: row =>
            t(labels.find(v => v.value === row.purpose)?.key ?? 'general') },
          { key: 'weight', title: t('weight'), render: row => row.weight },
          { key: 'enabled', title: t('status'), render: row =>
            <span className={'network-badge ' + (row.enabled ? 'is-enabled' : 'is-disabled')}>
              {row.enabled ? t('enabled') : t('disabled')}</span> },
          { key: 'health', title: t('healthStatus'), render: row => {
            const value = health[row.id]?.status ?? row.status;
            return <span className={'network-health network-health--' + value}>
              {value === 'ok' ? t('healthy') : value === 'down' ? t('down') : t('unknown')}
            </span>;
          }},
          { key: 'latency', title: t('latency'), render: row =>
            (health[row.id]?.last_latency_ms ?? row.last_latency_ms) >= 0
              ? health[row.id]?.last_latency_ms ?? row.last_latency_ms : '—' },
          { key: 'checked', title: t('lastChecked'), render: row => humanDate(row.last_checked_at, locale) },
          { key: 'actions', title: t('actions'), render: row => <div className="network-row-actions">
            <Button size="sm" variant="secondary" disabled={checkId !== null || busy}
              busy={checkId === row.id} onClick={() => { void runHealth(row.id); }}>{t('rpcHealth')}</Button>
            <Button size="sm" variant="ghost" disabled={checkId !== null || busy}
              onClick={() => openModal({ kind: 'edit', row })}>{t('edit')}</Button>
            <Button size="sm" variant="secondary" disabled={checkId !== null || busy}
              onClick={() => openModal({ kind: 'toggle', row })}>
              {row.enabled ? t('disable') : t('enable')}</Button>
            <Button size="sm" variant="danger" disabled={checkId !== null || busy}
              onClick={() => openModal({ kind: 'delete', row })}>{t('remove')}</Button>
          </div> },
        ]}/>}
    </Card>
    <Dialog open={Boolean(modal)} title={title} closeLabel={t('close')} onClose={closeModal}>
      {(modal?.kind === 'create' || modal?.kind === 'edit') &&
        <form className="form-stack" autoComplete="off" onSubmit={submit}>
          {modal.kind === 'edit' ? <p className="muted">{t('newRpcOnly')}</p> :
            <TextField label={t('network')} required value={draft.network}
              onChange={e => setField('network', e.target.value)}/>}
          {modal.kind === 'edit' &&
            <div className="network-static"><strong>{t('rpcEndpoint')}</strong>
              <span className="network-code">{modal.row.endpoint}</span></div>}
          {modal.kind === 'create' &&
            <SelectField label={t('rpcType')} value={draft.type} options={types}
              onChange={e => setField('type', e.target.value as RpcType)}/>}
          <TextField label={t('rpcURL')} required={modal.kind === 'create'}
            hint={modal.kind === 'edit' ? t('rpcChangeURL') : t('rpcURLTypeError')}
            autoComplete="off" value={draft.url} onChange={e => setField('url', e.target.value)}/>
          <TextField label={t('weight')} type="number" required min={1} max={100000}
            value={draft.weight} onChange={e => setField('weight', e.target.value)}/>
          <SelectField label={t('rpcPurpose')} value={draft.purpose}
            options={labels.map(x => ({ value: x.value, label: t(x.key) }))}
            onChange={e => setField('purpose', e.target.value as RpcPurpose)}/>
          <SelectField label={t('status')} value={String(draft.enabled)}
            options={[{ value: 'true', label: t('enabled') }, { value: 'false', label: t('disabled') }]}
            onChange={e => setField('enabled', e.target.value === 'true')}/>
          <TextField label={t('rpcCredential')} type="password" autoComplete="new-password"
            hint={modal.kind === 'edit' ? t('rpcCredentialEdit') : t('rpcCredentialHint')}
            value={draft.apiKey} disabled={draft.clearCredential}
            onChange={e => setField('apiKey', e.target.value)}/>
          {modal.kind === 'edit' &&
            <label className="network-checkbox"><input type="checkbox" checked={draft.clearCredential}
              onChange={e => setDraft(d => ({ ...d, clearCredential: e.target.checked, apiKey: '' }))}/>
              {t('rpcClearCredential')}</label>}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="network-modal-actions">
            <Button variant="secondary" type="button" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}>{t('save')}</Button>
          </div>
        </form>}
      {(modal?.kind === 'toggle' || modal?.kind === 'delete') &&
        <div className="form-stack">
          <p className="network-warning">{t('rpcWarning')}</p>
          <div className="network-static"><strong>{t('rpcEndpoint')}</strong>
            <span className="network-code">{modal.row.endpoint}</span></div>
          {modal.kind === 'delete' &&
            <TextField label={t('typeEndpoint')} value={confirmId}
              placeholder={String(modal.row.id)} onChange={e => setConfirmId(e.target.value)}/>}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="network-modal-actions">
            <Button variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button variant={modal.kind === 'delete' ? 'danger' : 'primary'} busy={busy}
              disabled={modal.kind === 'delete' && confirmId !== String(modal.row.id)}
              onClick={() => { void confirmAction(); }}>{t('confirm')}</Button>
          </div>
        </div>}
    </Dialog>
  </div>;
}
