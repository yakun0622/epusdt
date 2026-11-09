import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import type { Order, OrderList } from '../../api/types/admin';
import type { OrderFilters } from '../../api/endpoints/orders';
import {
  DEFAULT_ORDER_FILTERS, asLocalDateTime, fromLocalDateTime,
  orderPageUrl, ordersApi, readOrderFilters,
} from '../../api/endpoints/orders';
import { Button, Card, DataTable, Dialog, LoadingState, SelectField, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { orderLabel, orderStatusLabel, type OrderMessageKey } from './i18n';

interface OrdersPageProps {
  location: string;
  onNavigate: (path: string) => void;
}
type FilterDraft = {
  keyword: string; network: string; token: string; address: string;
  status: string; start: string; end: string;
};
function asDraft(filters: OrderFilters): FilterDraft {
  return {
    keyword: filters.keyword, network: filters.network, token: filters.token,
    address: filters.address, status: String(filters.status ?? ''),
    start: asLocalDateTime(filters.startAt), end: asLocalDateTime(filters.endAt),
  };
}
function getSearch(location: string): string {
  const queryIndex = location.indexOf('?');
  return queryIndex < 0 ? '' : location.slice(queryIndex);
}
function showValue(value: string | number | undefined | null, fallback: string): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function showAmount(value: number | undefined, fallback: string): string {
  return value === undefined || !Number.isFinite(value) ? fallback :
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);
}
function showDate(value: string | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? value :
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function OrderDetails({ tradeId, onClose }: { tradeId: string | null; onClose: () => void }) {
  const { locale } = useI18n();
  const t = useCallback((key: OrderMessageKey) => orderLabel(locale, key), [locale]);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOrder(null); setError('');
    if (!tradeId) { setLoading(false); return; }
    let active = true;
    const abort = new AbortController();
    setLoading(true);
    ordersApi.detail(tradeId, abort.signal)
      .then(result => { if (active) setOrder(result); })
      .catch(cause => { if (active && !abort.signal.aborted) setError(readableError(cause, t('fetchError'))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [tradeId, t]);

  const info: Array<[OrderMessageKey, string]> = order ? [
    ['trade', order.trade_id], ['order', order.order_id],
    ['name', order.name], ['status', orderStatusLabel(locale, order.status)],
    ['amount', showAmount(order.amount, t('empty')) + ' ' + order.currency],
    ['actual', showAmount(order.actual_amount, t('empty')) + ' ' + order.token],
    ['currency', order.currency], ['network', order.network], ['token', order.token],
    ['provider', order.pay_provider], ['paymentType', order.payment_type],
    ['receive', order.receive_address], ['txHash', order.block_transaction_id],
    ['parentTrade', order.parent_trade_id], ['paidByChild', order.pay_by_sub_id ? String(order.pay_by_sub_id) : ''],
    ['notify', order.notify_url], ['redirect', order.redirect_url],
    ['callbackAttempts', String(order.callback_num)],
    ['callbackConfirm', order.callback_confirm === 1 ? t('yes') : t('no')],
    ['created', showDate(order.created_at, locale, t('empty'))],
    ['updated', showDate(order.updated_at, locale, t('empty'))],
  ] : [];

  return <Dialog open={Boolean(tradeId)} title={t('orderDetail')}
    onClose={onClose} closeLabel={t('close')}
    footer={<Button variant="secondary" type="button" onClick={onClose}>{t('close')}</Button>}>
    {loading ? <LoadingState label={t('loadingDetail')}/> :
      error ? <p role="alert" className="error">{error}</p> :
      order ? <div>
        <p className="muted orders-readonly-note">{t('readOnly')}</p>
        <dl className="orders-detail-grid">
          {info.map(([label, value]) => <div key={label}>
            <dt>{t(label)}</dt><dd>{showValue(value, t('empty'))}</dd>
          </div>)}
        </dl>
      </div> : null}
  </Dialog>;
}

export function OrdersPage({ location, onNavigate }: OrdersPageProps) {
  const { locale } = useI18n();
  const { notify } = useToast();
  const t = useCallback((key: OrderMessageKey) => orderLabel(locale, key), [locale]);
  const filters = useMemo(() => readOrderFilters(getSearch(location)), [location]);
  const [draft, setDraft] = useState<FilterDraft>(() => asDraft(filters));
  const [formError, setFormError] = useState('');
  const [data, setData] = useState<OrderList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => { setDraft(asDraft(filters)); setFormError(''); }, [filters]);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setData(null); setLoading(true); setError('');
    ordersApi.list(filters, abort.signal)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active && !abort.signal.aborted) setError(readableError(cause, t('fetchError'))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [filters, refreshVersion, t]);

  const setField = (field: keyof FilterDraft, value: string) =>
    setDraft(current => ({ ...current, [field]: value }));

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const startAt = fromLocalDateTime(draft.start);
    const endAt = fromLocalDateTime(draft.end);
    if ((draft.start && startAt === undefined) || (draft.end && endAt === undefined) ||
      (startAt !== undefined && endAt !== undefined && startAt > endAt)) {
      setFormError(t('invalidRange')); return;
    }
    setFormError('');
    const parsedStatus = draft.status ? Number(draft.status) : undefined;
    const status = parsedStatus && [1, 2, 3, 4].includes(parsedStatus) ? parsedStatus as 1 | 2 | 3 | 4 : undefined;
    onNavigate(orderPageUrl({
      ...filters, page: 1, keyword: draft.keyword, network: draft.network,
      token: draft.token, address: draft.address, status, startAt, endAt,
    }));
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true); setError('');
    try {
      const blob = await ordersApi.exportCsv(filters);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = 'orders-' + Date.now() + '.csv';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        notify({ tone: 'success', title: t('exportSuccess') });
      } finally { window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
    } catch (cause) {
      const message = readableError(cause, t('exportError'));
      setError(message);
      notify({ tone: 'error', title: message });
    } finally { setExporting(false); }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.page_size || filters.pageSize)));
  const currentPage = data?.page ?? filters.page;

  return <div className="orders-page">
    <Card title={t('filterTitle')}>
      <form className="orders-filters" onSubmit={applyFilters}>
        <TextField label={t('keyword')} value={draft.keyword} onChange={e => setField('keyword', e.target.value)}/>
        <TextField label={t('network')} value={draft.network} onChange={e => setField('network', e.target.value)}/>
        <TextField label={t('token')} value={draft.token} onChange={e => setField('token', e.target.value)}/>
        <TextField label={t('address')} value={draft.address} onChange={e => setField('address', e.target.value)}/>
        <SelectField label={t('status')} value={draft.status} onChange={e => setField('status', e.target.value)}
          options={[
            { value: '', label: t('all') },
            ...([1, 2, 3, 4] as const).map(value => ({ value: String(value), label: orderStatusLabel(locale, value) })),
          ]}/>
        <TextField label={t('from')} type="datetime-local" value={draft.start}
          onChange={e => setField('start', e.target.value)}/>
        <TextField label={t('to')} type="datetime-local" value={draft.end}
          onChange={e => setField('end', e.target.value)}/>
        <div className="orders-filter-actions">
          <Button type="submit">{t('apply')}</Button>
          <Button type="button" variant="secondary" onClick={() => {
            setDraft(asDraft(DEFAULT_ORDER_FILTERS)); setFormError('');
            onNavigate(orderPageUrl(DEFAULT_ORDER_FILTERS));
          }}>{t('reset')}</Button>
        </div>
        {formError && <p className="error orders-form-error" role="alert">{formError}</p>}
      </form>
    </Card>

    <Card>
      <div className="orders-toolbar">
        <div><strong>{t('title')}</strong><p className="muted orders-readonly-note">{t('readOnly')}</p></div>
        <div className="orders-actions">
          <Button variant="secondary" onClick={() => setRefreshVersion(version => version + 1)}
            disabled={loading}>{t('refresh')}</Button>
          <Button onClick={exportCsv} busy={exporting}>
            {exporting ? t('exporting') : t('export')}
          </Button>
        </div>
      </div>
      <p className="muted orders-export-note">{t('filtersExportNote')}</p>
      {error && <p role="alert" className="error">{error}</p>}
      <DataTable rows={data?.list ?? []} loading={loading} loadingLabel={t('loading')}
        emptyLabel={t('noOrders')} ariaLabel={t('title')}
        getRowKey={row => row.trade_id}
        columns={[
          { key: 'trade', title: t('trade'), render: row =>
            <button className="orders-link" type="button" onClick={() => setSelected(row.trade_id)}>{row.trade_id}</button> },
          { key: 'order', title: t('order'), render: row => showValue(row.order_id, t('empty')) },
          { key: 'name', title: t('name'), render: row => showValue(row.name, t('empty')) },
          { key: 'amount', title: t('amount'), align: 'right', render: row =>
            <span className="orders-money">{showAmount(row.amount, t('empty'))} {row.currency}</span> },
          { key: 'actual', title: t('actual'), align: 'right', render: row =>
            <span className="orders-money">{showAmount(row.actual_amount, t('empty'))} {row.token}</span> },
          { key: 'network', title: t('networkToken'), render: row =>
            <span>{showValue(row.network, t('empty'))} / {showValue(row.token, t('empty'))}</span> },
          { key: 'status', title: t('status'), render: row =>
            <span className={'orders-status orders-status--' + row.status}>{orderStatusLabel(locale, row.status)}</span> },
          { key: 'created', title: t('created'), render: row => showDate(row.created_at, locale, t('empty')) },
          { key: 'detail', title: t('details'), render: row =>
            <Button size="sm" variant="ghost" onClick={() => setSelected(row.trade_id)}>{t('details')}</Button> },
        ]}/>
      <div className="orders-pagination">
        <span className="muted">{t('total')}: {total.toLocaleString(locale)}</span>
        <div className="orders-page-controls">
          <SelectField label={t('perPage')} value={String(filters.pageSize)}
            options={[10, 20, 50, 100, 200].map(value => ({ value: String(value), label: String(value) }))}
            onChange={event => onNavigate(orderPageUrl({ ...filters, page: 1, pageSize: Number(event.target.value) }))}/>
          <span aria-live="polite">{t('page')} {currentPage} {t('of')} {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={loading || currentPage <= 1}
            onClick={() => onNavigate(orderPageUrl({ ...filters, page: currentPage - 1 }))}>
            {t('previous')}
          </Button>
          <Button variant="secondary" size="sm" disabled={loading || currentPage >= totalPages}
            onClick={() => onNavigate(orderPageUrl({ ...filters, page: currentPage + 1 }))}>
            {t('next')}
          </Button>
        </div>
      </div>
    </Card>
    <OrderDetails tradeId={selected} onClose={() => setSelected(null)}/>
  </div>;
}
