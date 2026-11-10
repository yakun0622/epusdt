import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import type { Wallet } from '../../api/types/admin';
import type { WalletBatchResult, WalletFilters, WalletImportSummary, WalletStatus } from '../../api/endpoints/wallets';
import {
  DEFAULT_WALLET_FILTERS, NETWORKS, normalizeImportAddresses,
  parseWalletFilters, walletPageUrl, walletsApi,
} from '../../api/endpoints/wallets';
import { Button, Card, DataTable, Dialog, LoadingState, SelectField, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { walletImportError, walletLabel, type WalletMessageKey } from './i18n';

type Modal =
  | { kind: 'create' }
  | { kind: 'edit'; wallet: Wallet }
  | { kind: 'import' }
  | { kind: 'toggle'; wallet: Wallet }
  | { kind: 'delete'; wallet: Wallet }
  | null;
interface WalletsPageProps {
  location: string;
  onNavigate: (url: string) => void;
}
function errorMessage(value: unknown, fallback: string): string {
  return value instanceof ApiError || value instanceof Error ? value.message : fallback;
}
function listFilterSearch(location: string): string {
  const question = location.indexOf('?');
  return question < 0 ? '' : location.slice(question);
}
function importRowLabel(row: WalletBatchResult, locale: Parameters<typeof walletLabel>[0]): string {
  return row.ok ? walletLabel(locale, 'rowSuccess') : walletLabel(locale, 'rowFailure');
}

export function WalletsPage({ location, onNavigate }: WalletsPageProps) {
  const { locale } = useI18n();
  const t = useCallback((key: WalletMessageKey) => walletLabel(locale, key), [locale]);
  const { notify } = useToast();
  const filters = useMemo(() => parseWalletFilters(listFilterSearch(location)), [location]);
  const [filterDraft, setFilterDraft] = useState<WalletFilters>(filters);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [network, setNetwork] = useState('tron');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [confirmAddress, setConfirmAddress] = useState('');
  const [importText, setImportText] = useState('');
  const [importSummary, setImportSummary] = useState<WalletImportSummary | null>(null);

  useEffect(() => { setFilterDraft(filters); }, [filters]);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setListError('');
    setLoading(true);
    walletsApi.list(filters, abort.signal)
      .then(rows => { if (active) setWallets(rows); })
      .catch(error => {
        if (active && !abort.signal.aborted) {
          setWallets([]);
          setListError(errorMessage(error, t('error')));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [filters, reloadVersion, t]);

  function openModal(next: Exclude<Modal, null>) {
    if (busy) return;
    setModalError('');
    setConfirmAddress('');
    setImportSummary(null);
    setNetwork(next.kind === 'edit' || next.kind === 'toggle' || next.kind === 'delete'
      ? next.wallet.network : 'tron');
    setAddress(next.kind === 'edit' ? next.wallet.address : '');
    setRemark(next.kind === 'edit' ? next.wallet.remark : '');
    setImportText('');
    setModal(next);
  }
  function closeModal() { if (!busy) setModal(null); }
  function refresh() { setReloadVersion(version => version + 1); }

  async function execute(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setModalError('');
    try {
      await action();
      setModal(null);
      notify({ title: t('success'), tone: 'success' });
      refresh(); // always refetch authoritative server state
    } catch (error) {
      const message = errorMessage(error, t('error'));
      setModalError(message);
      notify({ title: message, tone: 'error' });
    } finally { setBusy(false); }
  }

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!network.trim()) { setModalError(t('invalidNetwork')); return; }
    if (!address.trim()) { setModalError(t('invalidAddress')); return; }
    void execute(() => walletsApi.create({ network, address, remark }));
  }
  function submitRemark(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== 'edit') return;
    const wallet = modal.wallet;
    void execute(() => walletsApi.editRemark(wallet.id, remark));
  }
  async function submitImport(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const addresses = normalizeImportAddresses(importText);
    if (!addresses.length) { setModalError(t('noAddresses')); return; }
    if (!network.trim()) { setModalError(t('invalidNetwork')); return; }
    setModalError('');
    setImportSummary(null);
    setBusy(true);
    try {
      const summary = await walletsApi.batchImport(network, addresses);
      setImportSummary(summary);
      if (summary.successCount > 0) refresh();
      // HTTP 200 may contain per-row failures: do not close dialog or say all succeeded.
      notify({
        title: summary.allSucceeded ? t('allSucceeded') :
          summary.successCount > 0 ? t('partialWarning') : t('noneSucceeded'),
        tone: summary.allSucceeded ? 'success' : 'error',
      });
    } catch (error) {
      const message = errorMessage(error, t('error'));
      setModalError(message);
      notify({ title: message, tone: 'error' });
    } finally { setBusy(false); }
  }

  const netOptions = NETWORKS.map(value => ({ value, label: value }));
  const statusOptions = [
    { value: '', label: t('all') },
    { value: '1', label: t('enabled') },
    { value: '2', label: t('disabled') },
  ];
  const selectedTitle = modal?.kind === 'create' ? t('createTitle') :
    modal?.kind === 'edit' ? t('editTitle') :
    modal?.kind === 'import' ? t('importTitle') :
    modal?.kind === 'toggle' ? t('statusTitle') :
    modal?.kind === 'delete' ? t('deleteTitle') : t('title');

  return <div className="wallets-page">
    <Card title={t('filters')}>
      <form className="wallets-filters" onSubmit={event => {
        event.preventDefault();
        onNavigate(walletPageUrl(filterDraft));
      }}>
        <SelectField label={t('network')} value={filterDraft.network}
          options={[{ value: '', label: t('all') }, ...netOptions]}
          onChange={event => setFilterDraft(value => ({ ...value, network: event.target.value }))}/>
        <SelectField label={t('status')} value={String(filterDraft.status ?? '')}
          options={statusOptions}
          onChange={event => setFilterDraft(value => ({
            ...value,
            status: event.target.value ? Number(event.target.value) as WalletStatus : undefined,
          }))}/>
        <TextField label={t('keyword')} value={filterDraft.keyword}
          onChange={event => setFilterDraft(value => ({ ...value, keyword: event.target.value }))}/>
        <div className="wallets-filter-actions">
          <Button type="submit">{t('apply')}</Button>
          <Button type="button" variant="secondary" onClick={() => {
            setFilterDraft(DEFAULT_WALLET_FILTERS);
            onNavigate(walletPageUrl(DEFAULT_WALLET_FILTERS));
          }}>{t('reset')}</Button>
        </div>
      </form>
    </Card>

    <Card>
      <div className="wallets-toolbar">
        <div><h2>{t('title')}</h2><p className="muted">{t('watchOnly')}</p></div>
        <div className="wallets-toolbar-actions">
          <Button variant="secondary" type="button" disabled={loading || busy} onClick={refresh}>
            {t('refresh')}
          </Button>
          <Button variant="secondary" type="button" disabled={busy}
            onClick={() => openModal({ kind: 'import' })}>{t('import')}</Button>
          <Button type="button" disabled={busy} onClick={() => openModal({ kind: 'create' })}>
            {t('add')}
          </Button>
        </div>
      </div>
      <p className="muted wallets-total">{t('count')}: {wallets.length}</p>
      {listError && <div className="wallets-load-error" role="alert">
        {listError}
        <Button variant="secondary" size="sm" onClick={refresh}>{t('retry')}</Button>
      </div>}
      {listError ? null :
        <DataTable rows={wallets} getRowKey={wallet => wallet.id}
          loading={loading} loadingLabel={t('loading')} emptyLabel={t('empty')} ariaLabel={t('title')}
          columns={[
            { key: 'network', title: t('network'), render: row => row.network },
            { key: 'address', title: t('address'), render: row =>
              <span className="wallets-address">{row.address}</span> },
            { key: 'remark', title: t('remark'), render: row => row.remark || t('noRemark') },
            { key: 'source', title: t('source'), render: row =>
              row.source === 'manual' ? t('sourceManual') : row.source === 'import' ? t('sourceImport') : row.source },
            { key: 'status', title: t('status'), render: row =>
              <span className={'wallets-status wallets-status--' + row.status}>
                {row.status === 1 ? t('enabled') : t('disabled')}
              </span> },
            { key: 'orders', title: t('orderCount'), align: 'right', render: row => row.order_count },
            { key: 'actions', title: t('actions'), render: row =>
              <div className="wallets-row-actions">
                <Button type="button" variant="ghost" size="sm" disabled={busy}
                  onClick={() => openModal({ kind: 'edit', wallet: row })}>{t('edit')}</Button>
                <Button type="button" variant="secondary" size="sm" disabled={busy}
                  onClick={() => openModal({ kind: 'toggle', wallet: row })}>
                  {row.status === 1 ? t('disable') : t('enable')}
                </Button>
                <Button type="button" variant="danger" size="sm" disabled={busy}
                  onClick={() => openModal({ kind: 'delete', wallet: row })}>{t('delete')}</Button>
              </div> },
          ]}/>}
    </Card>

    <Dialog open={Boolean(modal)} title={selectedTitle} closeLabel={t('close')}
      onClose={closeModal}>
      {modal?.kind === 'create' &&
        <form className="form-stack" onSubmit={submitCreate}>
          <p className="muted">{t('watchOnly')}</p>
          <SelectField label={t('network')} value={network} options={netOptions}
            required onChange={event => setNetwork(event.target.value)}/>
          <TextField label={t('address')} value={address} required
            onChange={event => setAddress(event.target.value)}/>
          <TextField label={t('remark')} value={remark} maxLength={255}
            onChange={event => setRemark(event.target.value)}/>
          {modalError && <p role="alert" className="error">{modalError}</p>}
          <div className="wallets-modal-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}>{busy ? t('saving') : t('save')}</Button>
          </div>
        </form>}
      {modal?.kind === 'edit' &&
        <form className="form-stack" onSubmit={submitRemark}>
          <div className="wallets-static-detail"><strong>{t('network')}</strong><span>{modal.wallet.network}</span></div>
          <div className="wallets-static-detail"><strong>{t('address')}</strong>
            <span className="wallets-address">{modal.wallet.address}</span></div>
          <TextField label={t('remark')} value={remark} maxLength={255}
            onChange={event => setRemark(event.target.value)}/>
          {modalError && <p role="alert" className="error">{modalError}</p>}
          <div className="wallets-modal-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}>{busy ? t('saving') : t('save')}</Button>
          </div>
        </form>}
      {modal?.kind === 'toggle' && <div className="form-stack">
        <p>{t('statusWarning')}</p>
        <div className="wallets-static-detail"><strong>{t('address')}</strong>
          <span className="wallets-address">{modal.wallet.address}</span></div>
        <div className="wallets-static-detail"><strong>{t('status')}</strong>
          <span>{modal.wallet.status === 1 ? t('disable') : t('enable')}</span></div>
        {modalError && <p role="alert" className="error">{modalError}</p>}
        <div className="wallets-modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
          <Button type="button" busy={busy} onClick={() => {
            if (modal.kind !== 'toggle') return;
            void execute(() => walletsApi.changeStatus(modal.wallet.id, modal.wallet.status === 1 ? 2 : 1));
          }}>{t('confirm')}</Button>
        </div>
      </div>}
      {modal?.kind === 'delete' && <div className="form-stack">
        <p className="wallets-delete-warning">{t('deleteWarning')}</p>
        <div className="wallets-static-detail"><strong>{t('orderCount')}</strong>
          <span>{modal.wallet.order_count}</span></div>
        <TextField label={t('typeAddress')} value={confirmAddress}
          placeholder={modal.wallet.address} autoComplete="off"
          onChange={event => setConfirmAddress(event.target.value)}/>
        {modalError && <p role="alert" className="error">{modalError}</p>}
        <div className="wallets-modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('cancel')}</Button>
          <Button type="button" variant="danger" busy={busy}
            disabled={confirmAddress !== modal.wallet.address}
            onClick={() => {
              if (modal.kind !== 'delete') return;
              void execute(() => walletsApi.remove(modal.wallet.id));
            }}>{t('delete')}</Button>
        </div>
      </div>}
      {modal?.kind === 'import' && <form className="form-stack" onSubmit={submitImport}>
        <p className="muted">{t('watchOnly')}</p>
        <SelectField label={t('network')} value={network} options={netOptions} required
          onChange={event => setNetwork(event.target.value)}/>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="wallets-import-text">{t('importAddresses')}</label>
          <textarea id="wallets-import-text" className="ui-input wallets-import-textarea"
            value={importText} rows={8} disabled={busy}
            onChange={event => setImportText(event.target.value)}/>
          <p className="ui-field-hint">{t('importHint')}</p>
        </div>
        {modalError && <p role="alert" className="error">{modalError}</p>}
        <div className="wallets-modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={closeModal}>{t('close')}</Button>
          <Button type="submit" busy={busy}>{busy ? t('importing') : t('importSubmit')}</Button>
        </div>
        {importSummary && <section className="wallets-import-results" aria-live="polite">
          <h3>{t('importResults')}</h3>
          <div className="wallets-import-summary">
            <strong>{t('successCount')}: {importSummary.successCount}</strong>
            <strong>{t('failureCount')}: {importSummary.failureCount}</strong>
          </div>
          <p className={importSummary.allSucceeded ? 'wallets-import-success' : 'wallets-import-warning'}>
            {importSummary.allSucceeded ? t('allSucceeded') :
              importSummary.successCount > 0 ? t('partialWarning') : t('noneSucceeded')}
          </p>
          <div className="wallets-import-rows">
            {importSummary.rows.map((row, index) => <div className="wallets-import-row" key={index}>
              <span className={row.ok ? 'wallets-import-ok' : 'wallets-import-failed'}>
                {importRowLabel(row, locale)}
              </span>
              <span className="wallets-address">{row.address}</span>
              {!row.ok && <span className="wallets-import-reason">
                {t('resultError')}: {walletImportError(locale, row.error_code, row.error)}
                {row.error_code !== undefined ? ' (' + row.error_code + ')' : ''}
              </span>}
            </div>)}
          </div>
          {importSummary.failedAddresses.length > 0 &&
            <Button type="button" variant="secondary" disabled={busy} onClick={() => {
              setImportText(importSummary.failedAddresses.join('\n'));
              setImportSummary(null);
              setModalError('');
            }}>{t('retryFailed')}</Button>}
        </section>}
      </form>}
    </Dialog>
  </div>;
}
