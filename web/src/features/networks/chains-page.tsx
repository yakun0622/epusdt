import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { chainsApi, tokensApi, type TokenCreate } from '../../api/endpoints/networks';
import type { Chain, ChainToken } from '../../api/types/admin';
import { Button, Card, DataTable, Dialog, SelectField, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { networkLabel, type NetworksKey } from './i18n';

type Modal =
  | { kind: 'chain-edit'; row: Chain }
  | { kind: 'chain-toggle'; row: Chain }
  | { kind: 'token-create' }
  | { kind: 'token-edit'; row: ChainToken }
  | { kind: 'token-toggle'; row: ChainToken }
  | { kind: 'token-delete'; row: ChainToken }
  | null;
type ChainDraft = { display_name: string; min_confirmations: string; scan_interval_sec: string };
type TokenDraft = { network: string; symbol: string; contract_address: string;
  decimals: string; min_amount: string; enabled: boolean };
const defaultToken = (): TokenDraft => ({
  network: '', symbol: '', contract_address: '', decimals: '6', min_amount: '0', enabled: true,
});
const formatError = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
const toToken = (draft: TokenDraft): TokenCreate => ({
  network: draft.network, symbol: draft.symbol, contract_address: draft.contract_address,
  enabled: draft.enabled, decimals: Number(draft.decimals), min_amount: Number(draft.min_amount),
});
const toDisplayStatus = (enabled: boolean, t: (key: NetworksKey) => string) =>
  enabled ? t('enabled') : t('disabled');

export function ChainsPage() {
  const { locale } = useI18n();
  const t = useCallback((key: NetworksKey) => networkLabel(locale, key), [locale]);
  const { notify } = useToast();
  const [chains, setChains] = useState<Chain[]>([]);
  const [tokens, setTokens] = useState<ChainToken[]>([]);
  const [network, setNetwork] = useState('');
  const [reload, setReload] = useState(0);
  const [chainLoading, setChainLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [chainError, setChainError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [typedSymbol, setTypedSymbol] = useState('');
  const [chainDraft, setChainDraft] = useState<ChainDraft>({ display_name: '', min_confirmations: '1', scan_interval_sec: '5' });
  const [tokenDraft, setTokenDraft] = useState<TokenDraft>(defaultToken);

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setChainLoading(true); setChainError('');
    chainsApi.list(abort.signal).then(data => { if (active) setChains(data); })
      .catch(e => { if (active && !abort.signal.aborted) { setChains([]); setChainError(formatError(e, t('error'))); } })
      .finally(() => { if (active) setChainLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [reload, t]);

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setTokenLoading(true); setTokenError('');
    tokensApi.list(network, abort.signal).then(data => { if (active) setTokens(data); })
      .catch(e => { if (active && !abort.signal.aborted) { setTokens([]); setTokenError(formatError(e, t('error'))); } })
      .finally(() => { if (active) setTokenLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [network, reload, t]);

  const networkOptions = useMemo(() => [
    { value: '', label: t('all') },
    ...chains.map(row => ({ value: row.network, label: row.display_name || row.network })),
  ], [chains, t]);
  const refresh = () => setReload(v => v + 1);
  function openModal(next: Exclude<Modal, null>) {
    if (busy) return;
    setModal(next); setModalError(''); setTypedSymbol('');
    if (next.kind === 'chain-edit' || next.kind === 'chain-toggle') {
      setChainDraft({
        display_name: next.row.display_name,
        min_confirmations: String(next.row.min_confirmations),
        scan_interval_sec: String(next.row.scan_interval_sec),
      });
    } else if (next.kind === 'token-create') {
      setTokenDraft({ ...defaultToken(), network: network || chains[0]?.network || '' });
    } else {
      setTokenDraft({
        network: next.row.network, symbol: next.row.symbol,
        contract_address: next.row.contract_address, decimals: String(next.row.decimals),
        min_amount: String(next.row.min_amount), enabled: next.row.enabled,
      });
    }
  }
  function dismiss() { if (!busy) { setModal(null); setModalError(''); } }
  function done() {
    setModal(null); setModalError(''); refresh();
    notify({ title: t('success'), tone: 'success' });
  }
  function failed(e: unknown) { setModalError(formatError(e, t('error'))); }
  async function saveForm(e: FormEvent) {
    e.preventDefault();
    if (!modal || busy) return;
    setBusy(true); setModalError('');
    try {
      if (modal.kind === 'chain-edit') {
        await chainsApi.update(modal.row.network, {
          display_name: chainDraft.display_name,
          min_confirmations: Number(chainDraft.min_confirmations),
          scan_interval_sec: Number(chainDraft.scan_interval_sec),
        });
      } else if (modal.kind === 'token-create') {
        await tokensApi.create(toToken(tokenDraft));
      } else if (modal.kind === 'token-edit') {
        await tokensApi.update(modal.row.id, modal.row.network, {
          contract_address: tokenDraft.contract_address, decimals: Number(tokenDraft.decimals),
          min_amount: Number(tokenDraft.min_amount), enabled: tokenDraft.enabled,
        });
      } else return;
      done();
    } catch (error) { failed(error); } finally { setBusy(false); }
  }
  async function confirmAction() {
    if (!modal || busy) return;
    setBusy(true); setModalError('');
    try {
      switch (modal.kind) {
        case 'chain-toggle':
          await chainsApi.update(modal.row.network, { enabled: !modal.row.enabled });
          break;
        case 'token-toggle':
          await tokensApi.changeEnabled(modal.row.id, !modal.row.enabled);
          break;
        case 'token-delete':
          if (typedSymbol !== modal.row.symbol) return;
          await tokensApi.remove(modal.row.id);
          break;
        default: return;
      }
      done();
    } catch (error) { failed(error); } finally { setBusy(false); }
  }
  const modalTitle = !modal ? t('chainTitle') :
    modal.kind === 'chain-edit' ? t('edit') + ': ' + modal.row.network :
    modal.kind === 'chain-toggle' ? t('confirm') + ': ' + modal.row.network :
    modal.kind === 'token-create' ? t('create') :
    modal.kind === 'token-edit' ? t('edit') + ': ' + modal.row.symbol :
    modal.kind === 'token-toggle' ? t('confirm') + ': ' + modal.row.symbol :
    t('remove') + ': ' + modal.row.symbol;
  return <div className="network-pages">
    <Card title={t('chainTitle')} description={t('chainInfo')}>
      <div className="network-toolbar">
        <p className="muted">{t('noMutation')}</p>
        <Button variant="secondary" disabled={busy || chainLoading} onClick={refresh}>{t('refresh')}</Button>
      </div>
      {chainError && <p role="alert" className="error">{chainError}
        <Button variant="secondary" size="sm" onClick={refresh}>{t('retry')}</Button></p>}
      {!chainError && <DataTable rows={chains} loading={chainLoading}
        loadingLabel={t('loading')} emptyLabel={t('empty')} ariaLabel={t('chainTitle')}
        getRowKey={row => row.network} columns={[
          { key: 'network', title: t('network'), render: row => row.network },
          { key: 'name', title: t('name'), render: row => row.display_name },
          { key: 'confirmations', title: t('confirmations'), render: row => row.min_confirmations },
          { key: 'interval', title: t('scanInterval'), render: row => row.scan_interval_sec },
          { key: 'enabled', title: t('status'), render: row =>
            <span className={'network-badge ' + (row.enabled ? 'is-enabled' : 'is-disabled')}>
              {toDisplayStatus(row.enabled, t)}</span> },
          { key: 'actions', title: t('actions'), render: row => <div className="network-row-actions">
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'chain-edit', row })}>{t('edit')}</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal({ kind: 'chain-toggle', row })}>
              {row.enabled ? t('disable') : t('enable')}</Button>
          </div> },
        ]}/>}
    </Card>

    <Card title={t('tokenTitle')} description={t('aptosHint')}>
      <div className="network-toolbar">
        <SelectField label={t('network')} value={network} options={networkOptions}
          onChange={e => setNetwork(e.target.value)}/>
        <div className="network-toolbar-actions">
          <Button variant="secondary" disabled={busy || tokenLoading} onClick={refresh}>{t('refresh')}</Button>
          <Button disabled={busy} onClick={() => openModal({ kind: 'token-create' })}>{t('create')}</Button>
        </div>
      </div>
      {tokenError && <p role="alert" className="error">{tokenError}
        <Button variant="secondary" size="sm" onClick={refresh}>{t('retry')}</Button></p>}
      {!tokenError && <DataTable rows={tokens} loading={tokenLoading} loadingLabel={t('loading')}
        emptyLabel={t('empty')} ariaLabel={t('tokenTitle')} getRowKey={row => row.id}
        columns={[
          { key: 'network', title: t('network'), render: row => row.network },
          { key: 'symbol', title: t('symbol'), render: row => row.symbol },
          { key: 'asset', title: t('assetId'), render: row =>
            <span className="network-code">{row.contract_address || '—'}</span> },
          { key: 'decimals', title: t('decimals'), render: row => row.decimals },
          { key: 'min', title: t('minAmount'), render: row => row.min_amount },
          { key: 'enabled', title: t('status'), render: row =>
            <span className={'network-badge ' + (row.enabled ? 'is-enabled' : 'is-disabled')}>
              {toDisplayStatus(row.enabled, t)}</span> },
          { key: 'actions', title: t('actions'), render: row => <div className="network-row-actions">
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'token-edit', row })}>{t('edit')}</Button>
            <Button size="sm" variant="secondary" onClick={() => openModal({ kind: 'token-toggle', row })}>
              {row.enabled ? t('disable') : t('enable')}</Button>
            <Button size="sm" variant="danger" onClick={() => openModal({ kind: 'token-delete', row })}>{t('remove')}</Button>
          </div> },
        ]}/>}
    </Card>

    <Dialog open={Boolean(modal)} title={modalTitle} closeLabel={t('close')} onClose={dismiss}>
      {modal?.kind === 'chain-edit' && <form className="form-stack" onSubmit={saveForm}>
        <p className="muted">{t('chainWarning')}</p>
        <TextField label={t('name')} required maxLength={64} value={chainDraft.display_name}
          onChange={e => setChainDraft(d => ({ ...d, display_name: e.target.value }))}/>
        <TextField label={t('confirmations')} type="number" min={0} max={1000000} required
          value={chainDraft.min_confirmations} onChange={e => setChainDraft(d => ({ ...d, min_confirmations: e.target.value }))}/>
        <TextField label={t('scanInterval')} type="number" min={1} max={86400} required
          value={chainDraft.scan_interval_sec} onChange={e => setChainDraft(d => ({ ...d, scan_interval_sec: e.target.value }))}/>
        {modalError && <p className="error" role="alert">{modalError}</p>}
        <div className="network-modal-actions">
          <Button variant="secondary" type="button" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
          <Button type="submit" busy={busy}>{t('save')}</Button>
        </div>
      </form>}
      {(modal?.kind === 'token-create' || modal?.kind === 'token-edit') &&
        <form className="form-stack" onSubmit={saveForm}>
          {modal.kind === 'token-create' ?
            <SelectField label={t('network')} required value={tokenDraft.network}
              options={networkOptions.filter(x => x.value !== '')}
              onChange={e => setTokenDraft(d => ({ ...d, network: e.target.value }))}/> :
            <div className="network-static"><strong>{t('network')} / {t('symbol')}</strong>
              <span>{modal.row.network} / {modal.row.symbol}</span></div>}
          {modal.kind === 'token-create' && <TextField label={t('symbol')} required maxLength={32}
            value={tokenDraft.symbol} onChange={e => setTokenDraft(d => ({ ...d, symbol: e.target.value }))}/>}
          <TextField label={t('assetId')} hint={t('aptosHint')} value={tokenDraft.contract_address}
            onChange={e => setTokenDraft(d => ({ ...d, contract_address: e.target.value }))}/>
          <TextField label={t('decimals')} type="number" min={0} max={36} required
            value={tokenDraft.decimals} onChange={e => setTokenDraft(d => ({ ...d, decimals: e.target.value }))}/>
          <TextField label={t('minAmount')} type="number" min={0} step="any" required
            value={tokenDraft.min_amount} onChange={e => setTokenDraft(d => ({ ...d, min_amount: e.target.value }))}/>
          <SelectField label={t('status')} value={String(tokenDraft.enabled)}
            options={[{ value: 'true', label: t('enabled') }, { value: 'false', label: t('disabled') }]}
            onChange={e => setTokenDraft(d => ({ ...d, enabled: e.target.value === 'true' }))}/>
          {modalError && <p className="error" role="alert">{modalError}</p>}
          <div className="network-modal-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}>{t('save')}</Button>
          </div>
        </form>}
      {(modal?.kind === 'chain-toggle' || modal?.kind === 'token-toggle' || modal?.kind === 'token-delete') &&
        <div className="form-stack">
          <p className="network-warning">{modal.kind === 'chain-toggle' ? t('chainWarning') : t('tokenWarning')}</p>
          {modal.kind === 'token-delete' && <TextField label={t('typeSymbol')}
            value={typedSymbol} placeholder={modal.row.symbol}
            onChange={e => setTypedSymbol(e.target.value)}/>}
          {modalError && <p role="alert" className="error">{modalError}</p>}
          <div className="network-modal-actions">
            <Button variant="secondary" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
            <Button variant={modal.kind === 'token-delete' ? 'danger' : 'primary'} busy={busy}
              disabled={modal.kind === 'token-delete' && typedSymbol !== modal.row.symbol}
              onClick={() => { void confirmAction(); }}>{t('confirm')}</Button>
          </div>
        </div>}
    </Dialog>
  </div>;
}
