import {useCallback,useEffect,useMemo,useState} from 'react';
import {checkoutApi,validTradeId,verifyCheckout,type CheckoutView,type CheckoutStatusView} from '../../api/endpoints/checkout';
import {Button} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {checkoutLabel,type CheckoutKey} from './i18n';

type Loaded={checkout:CheckoutView;status:CheckoutStatusView;receivedAt:number};
function formatDate(millis:number,locale:string):string {
  return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium'}).format(new Date(millis));
}
function formatNumber(value:number,locale:string,precision=8):string {
  return new Intl.NumberFormat(locale,{maximumFractionDigits:precision,useGrouping:false}).format(value);
}
export function CheckoutPage({tradeId}:{tradeId:string}) {
  const {locale}=useI18n();
  const t=useCallback((key:CheckoutKey)=>checkoutLabel(locale,key),[locale]);
  const [snapshot,setSnapshot]=useState<Loaded|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [clock,setClock]=useState(0);

  useEffect(()=>{
    if(!validTradeId(tradeId)){
      setSnapshot(null);setLoading(false);setError(t('invalidOrder'));return;
    }
    let active=true;const abort=new AbortController();
    setLoading(true);setError('');setSnapshot(null);
    // Both independent public GET endpoints must succeed and agree on trade_id.
    // Never retain an old payment destination after a failed refresh.
    Promise.all([checkoutApi.details(tradeId,abort.signal),checkoutApi.status(tradeId,abort.signal)])
      .then(([checkout,status])=>{
        if(active)setSnapshot({checkout,status,receivedAt:performance.now()});
      }).catch(()=>{
        if(active&&!abort.signal.aborted){setSnapshot(null);setError(t('failed'));}
      }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[tradeId,revision,t]);
  useEffect(()=>{
    if(!snapshot||snapshot.status.status===2||snapshot.status.status===3)return;
    const id=window.setInterval(()=>setRevision(v=>v+1),15000);
    return()=>window.clearInterval(id);
  },[snapshot]);
  useEffect(()=>{
    if(!snapshot)return;
    const id=window.setInterval(()=>setClock(v=>v+1),1000);
    return()=>window.clearInterval(id);
  },[snapshot]);

  // serverTime is milliseconds. Elapsed time is measured from a monotonic
  // clock, not from a possibly inaccurate client wall clock.
  const serverNow=snapshot?snapshot.checkout.serverTime+
    Math.max(0,performance.now()-snapshot.receivedAt):null;
  const view=verifyCheckout(snapshot?.checkout??null,snapshot?.status??null,serverNow);
  const checkout=snapshot?.checkout??null;
  const remaining=checkout&&serverNow!==null?
    Math.max(0,Math.ceil((checkout.expirationTime-serverNow)/1000)):0;
  // Explicitly use the live tick, even when no clock label is visible.
  void clock;
  const onchain=view.kind==='payment'&&view.payment==='onchain'&&checkout;
  const statusLabel=useMemo(()=>{
    switch(view.kind){
      case 'paid':return t('paid');
      case 'expired':return t('expired');
      case 'choose':return t('choose');
      case 'payment':return t('waiting');
      case 'awaiting-details':return t('detailsPending');
      default:return t('statusUnknown');
    }
  },[view.kind,t]);
  return <section className="checkout-page" aria-label={t('title')}>
    <div className="checkout-header">
      <div><h2>{t('title')}</h2><p className="muted">{t('order')}: <code>{tradeId}</code></p></div>
      <Button type="button" variant="secondary" disabled={loading||!validTradeId(tradeId)}
        onClick={()=>setRevision(v=>v+1)}>{t('refresh')}</Button>
    </div>
    {loading?<p className="muted" role="status">{t('loading')}</p>:
      error?<div role="alert" className="checkout-alert">
        <p>{error}</p><p className="muted">{t('stale')}</p>
        <Button onClick={()=>setRevision(v=>v+1)}>{t('retry')}</Button>
      </div>:checkout?<div>
        <div className={'checkout-state checkout-state--'+view.kind} role="status">{statusLabel}</div>
        <dl className="checkout-fields">
          <div><dt>{t('amount')}</dt>
            <dd>{formatNumber(checkout.amount,locale,8)} {checkout.currency}</dd></div>
          <div><dt>{t('created')}</dt><dd>{formatDate(checkout.createdAt,locale)}</dd></div>
          <div><dt>{t('expires')}</dt><dd>{formatDate(checkout.expirationTime,locale)}</dd></div>
          {view.kind==='payment'&&<div><dt>{t('remaining')}</dt><dd>{remaining} {t('seconds')}</dd></div>}
        </dl>
        {onchain&&<div className="checkout-destination">
          <p className="muted">{t('unit')}</p>
          <dl className="checkout-fields">
            <div><dt>{t('transferAmount')}</dt>
              <dd className="checkout-important">{formatNumber(checkout.actualAmount,locale,12)} {checkout.token}</dd></div>
            <div><dt>{t('network')}</dt><dd>{checkout.network}</dd></div>
            <div><dt>{t('token')}</dt><dd>{checkout.token}</dd></div>
            <div><dt>{t('address')}</dt>
              <dd className="checkout-address">{view.address}</dd></div>
          </dl>
          {!checkout.isSelected&&<p className="warning" role="note">{t('notSelected')}</p>}
          <p className="muted">{t('readOnly')}</p>
        </div>}
        {view.kind==='payment'&&view.payment==='hosted'&&
          <div role="note" className="checkout-alert">
            <strong>{t('hosted')}</strong><p>{t('hostedHint')}</p>
          </div>}
        {view.kind==='choose'&&<p className="checkout-alert">{t('chooseHint')}</p>}
        {view.kind==='awaiting-details'&&
          <p className="checkout-alert" role="note">{t('paymentUnavailable')}</p>}
        {view.kind==='payment'&&<p className="muted">{t('noAuto')}</p>}
      </div>:<p role="alert">{t('offline')}</p>}
    <p className="muted checkout-boundary">{t('noWrites')}</p>
  </section>;
}
