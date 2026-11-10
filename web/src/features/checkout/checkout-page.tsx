import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {validTradeId} from '../../api/endpoints/checkout';
import {reconciliationApi,evaluateCashier,stopCashierPolling,nextCashierPollDelay,
  classifyStatusReadError,type VerifiedCashierSnapshot} from '../../api/endpoints/reconciliation';
import {txHashApi,validHashInput,canVerifyTxHash,classifyHashFailure,
  type HashProblem} from '../../api/endpoints/tx-hash';
import {Button,TextField} from '../../components/ui';
import {PaymentSelector,switchMessageKey} from './payment-selector';
import type {SwitchProblem} from '../../api/endpoints/payment-switch';
import {useI18n} from '../../i18n/i18n-provider';
import {checkoutLabel,type CheckoutKey} from './i18n';

function formatDate(millis:number,locale:string):string {
  return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium'}).format(new Date(millis));
}
function formatNumber(value:number,locale:string,precision=8):string {
  return new Intl.NumberFormat(locale,{maximumFractionDigits:precision,useGrouping:false}).format(value);
}
export function CheckoutPage({tradeId,onNavigate}:{tradeId:string;onNavigate?:(path:string)=>void}) {
  const {locale}=useI18n();
  const t=useCallback((key:CheckoutKey)=>checkoutLabel(locale,key),[locale]);
  const [snapshot,setSnapshot]=useState<VerifiedCashierSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [clock,setClock]=useState(0);
  const [failures,setFailures]=useState(0);
  const [switching,setSwitching]=useState(false);
  const [switchProblem,setSwitchProblem]=useState<SwitchProblem|null>(null);
  const [uncertain,setUncertain]=useState(false);
  // W53 verification is never a settlement. A lock survives all 5s GET
  // refreshes, including component rerenders and failed/uncertain POSTs.
  const [hashInput,setHashInput]=useState('');
  const [hashConfirm,setHashConfirm]=useState(false);
  const [hashChecking,setHashChecking]=useState(false);
  const [hashOutcome,setHashOutcome]=useState<'verified'|HashProblem|null>(null);
  const hashAttempted=useRef(false);
  useEffect(()=>{
    hashAttempted.current=false;
    setHashInput('');setHashConfirm(false);setHashChecking(false);setHashOutcome(null);
  },[tradeId]);

  useEffect(()=>{
    if(!validTradeId(tradeId)){
      setSnapshot(null);setLoading(false);setError(t('invalidOrder'));return;
    }
    let active=true;const abort=new AbortController();
    setLoading(true);setError('');setSnapshot(null);
    // Do not use a cached address or a previous paid label while verifying.
    reconciliationApi.snapshot(tradeId,abort.signal)
      .then(next=>{if(active){setSnapshot(next);setFailures(0);}})
      .catch(cause=>{if(active&&!abort.signal.aborted){
        setSnapshot(null);setFailures(n=>n+1);
        const kind=classifyStatusReadError(cause);
        setError(kind==='conflict'?t('reconConflict'):
          kind==='missing'?t('invalidOrder'):t('failed'));
      }}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[tradeId,revision,t]);
  // Network failure must never permanently stop status polling: retry GETs
  // with bounded backoff. Only confirmed terminal SQL states stop polling.
  useEffect(()=>{
    if(!validTradeId(tradeId)||switching||loading)return;
    const state=evaluateCashier(snapshot,snapshot?.reconciliation.serverTime??null);
    if(stopCashierPolling(state))return;
    const delay=nextCashierPollDelay(failures);
    const timer=window.setTimeout(()=>setRevision(v=>v+1),delay);
    return()=>window.clearTimeout(timer);
  },[tradeId,revision,snapshot,loading,failures,switching]);
  // Reconnect/focus performs a fresh read; it never retries payment writes.
  useEffect(()=>{
    const reload=()=>{if(!document.hidden && navigator.onLine) setRevision(v=>v+1);};
    const visible=()=>{if(!document.hidden)reload();};
    window.addEventListener('online',reload);
    document.addEventListener('visibilitychange',visible);
    return()=>{
      window.removeEventListener('online',reload);
      document.removeEventListener('visibilitychange',visible);
    };
  },[tradeId]);
  useEffect(()=>{
    if(!snapshot)return;
    const id=window.setInterval(()=>setClock(v=>v+1),1000);
    return()=>window.clearInterval(id);
  },[snapshot]);

  // serverTime is milliseconds. Elapsed time is measured from a monotonic
  // clock, not from a possibly inaccurate client wall clock.
  const serverNow=snapshot?snapshot.reconciliation.serverTime+
    Math.max(0,performance.now()-snapshot.receivedAt):null;
  const view=evaluateCashier(snapshot,serverNow);
  const checkout=snapshot?.checkout??null;
  const remaining=checkout&&serverNow!==null?
    Math.max(0,Math.ceil((checkout.expirationTime-serverNow)/1000)):0;
  // Explicitly use the live tick, even when no clock label is visible.
  void clock;
  // Hide the old address immediately when a switch preflight begins.
  const onchain=!switching&&view.kind==='payment'&&view.payment==='onchain'&&checkout;
  const canChoose=Boolean(checkout&&snapshot&&serverNow!==null&&
    !error&&!loading&&(view.kind==='choose'||view.kind==='payment')&&
    checkout.canSwitch&&
    !snapshot?.reconciliation.relatedTradeId&& !checkout.hasHostedPaymentLink&&
    checkout.receiveAddress.trim().toUpperCase()!=='OKPAY'&&
    serverNow<checkout.expirationTime);
  const canHash=canVerifyTxHash(snapshot,serverNow) && !switching && !uncertain;
  const hashProblemLabels:Record<HashProblem,CheckoutKey>={
    invalid:'hashInvalid',changed:'hashChanged',used:'hashUsed',
    'not-waiting':'hashNotWaiting',failed:'hashFailed',provider:'hashProvider',
    unknown:'hashUnknown',
  };
  const verifyHash=async()=>{
    if(hashAttempted.current||!snapshot||serverNow===null||!canHash||!validHashInput(hashInput))return;
    hashAttempted.current=true;
    setHashConfirm(false);setHashChecking(true);setHashOutcome(null);
    try {
      // Only a server RPC evidence check. No call to /pay/submit-tx-hash.
      await txHashApi.verifyOnce(snapshot,hashInput,serverNow);
      setHashOutcome('verified');
    } catch(cause) {
      setHashOutcome(classifyHashFailure(cause));
    } finally {
      setHashChecking(false);
      // A fresh triple GET, never the verification response, decides paid.
      setRevision(v=>v+1);
    }
  };
  const statusLabel=useMemo(()=>{
    switch(view.kind){
      case 'paid':return t('paid');
      case 'review':return t('reconReview');
      case 'elapsed':return t('reconElapsed');
      case 'selected-child':return t('reconChild');
      case 'expired':return t('expired');
      case 'choose':return t('choose');
      case 'payment':return t('waiting');
      case 'awaiting-details':return t('detailsPending');
      default:return t('statusUnknown');
    }
  },[view.kind,t]);
  const onSwitchResolved=(newId:string)=>{
    setSwitching(false);setSwitchProblem(null);
    if(newId!==tradeId&&onNavigate)onNavigate('/cashier/'+encodeURIComponent(newId));
    else setRevision(v=>v+1);
  };
  const onSwitchFailure=(problem:SwitchProblem)=>{
    setSwitching(false);setSwitchProblem(problem);
    // An unknown/provider result can already have committed an order.
    // Prevent another POST until someone reconciles it externally.
    if(problem==='unknown'||problem==='provider')setUncertain(true);
    setRevision(v=>v+1);
  };
  return <section className="checkout-page" aria-label={t('title')}>
    <div className="checkout-header">
      <div><h2>{t('title')}</h2><p className="muted">{t('order')}: <code>{tradeId}</code></p></div>
      <Button type="button" variant="secondary" disabled={loading||switching||!validTradeId(tradeId)}
        onClick={()=>setRevision(v=>v+1)}>{t('refresh')}</Button>
    </div>
    {loading?<p className="muted" role="status">{t('loading')}</p>:
      error?<div role="alert" className="checkout-alert">
        <p>{error}</p><p className="muted">{t('stale')}</p>
        <Button onClick={()=>setRevision(v=>v+1)}>{t('retry')}</Button>
      </div>:checkout?<div>
        <div className={'checkout-state checkout-state--'+view.kind} role="status">{switching?t('selecting'):statusLabel}</div>
        {switchProblem&&<p role="alert" className="checkout-alert">{t(switchMessageKey(switchProblem))}</p>}
        {uncertain&&<p role="alert" className="warning">{t('selectBlocked')}</p>}
        {view.kind==='review'&&<p className="checkout-alert" role="alert">{t('reconReviewHint')}</p>}
        {view.kind==='elapsed'&&<p className="checkout-alert" role="status">{t('reconElapsedHint')}</p>}
        {view.kind==='selected-child'&&<div className="checkout-alert" role="note">
          <p>{t('reconChildHint')}</p>
          <p><code>{view.childTradeId}</code></p>
          <Button variant="secondary" disabled={!onNavigate}
            onClick={()=>onNavigate?.('/cashier/'+encodeURIComponent(view.childTradeId))}>
            {t('reconOpenChild')}
          </Button>
        </div>}
        {snapshot?.reconciliation.provider==='okpay'&&
          <p className="muted checkout-provider-state">{t('reconProviderLocal')}
            {' · '}{snapshot.reconciliation.providerStatus}
          </p>}
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
          <div className="checkout-hash-verifier">
            <h3>{t('hashTitle')}</h3>
            <p className="muted">{t('hashHelp')}</p>
            {canHash&&!hashAttempted.current&&!hashChecking&&
              <>
                <TextField label={t('hashLabel')} autoComplete="off" spellCheck={false}
                  value={hashInput} maxLength={256}
                  onChange={e=>{setHashInput(e.target.value);setHashConfirm(false);}}/>
                {!hashConfirm?
                  <Button variant="secondary" type="button" disabled={!validHashInput(hashInput)}
                    onClick={()=>setHashConfirm(true)}>{t('hashStart')}</Button>:
                  <div className="checkout-hash-confirm" role="group">
                    <p className="warning">{t('hashConfirm')}</p>
                    <Button type="button" disabled={!validHashInput(hashInput)}
                      onClick={()=>void verifyHash()}>{t('hashSubmit')}</Button>
                    <Button type="button" variant="secondary"
                      onClick={()=>setHashConfirm(false)}>{t('hashCancel')}</Button>
                  </div>}
              </>}
            {hashChecking&&<p role="status" className="muted">{t('hashChecking')}</p>}
            {hashOutcome&&<div className="checkout-alert"
              role={hashOutcome==='verified'?'status':'alert'}>
              {hashOutcome==='verified'?t('hashVerified'):t(hashProblemLabels[hashOutcome])}
              <p className="muted">{t('hashLocked')}</p>
            </div>}
          </div>
        </div>}
        {!switching&&view.kind==='payment'&&view.payment==='hosted'&&
          <div role="note" className="checkout-alert">
            <strong>{t('hosted')}</strong><p>{t('hostedHint')}</p>
          </div>}
        {view.kind==='choose'&&<p className="checkout-alert">{t('chooseHint')}</p>}
        {view.kind==='awaiting-details'&&
          <p className="checkout-alert" role="note">{t('paymentUnavailable')}</p>}
        {view.kind==='payment'&&!switching&&<p className="muted">{t('reconPolling')}</p>}
        {canChoose&&snapshot&&serverNow!==null&&<PaymentSelector
          initial={{checkout:snapshot.checkout,status:snapshot.status}}
          serverNow={serverNow} disabled={uncertain} busy={switching}
          onBegin={()=>{setSwitching(true);setSwitchProblem(null);}}
          onResolved={onSwitchResolved} onFailure={onSwitchFailure}/>}
      </div>:<p role="alert">{t('offline')}</p>}
    <p className="muted checkout-boundary">{t('noWrites')}</p>
    <p className="muted checkout-boundary">{t('reconNoRemote')}</p>
  </section>;
}
