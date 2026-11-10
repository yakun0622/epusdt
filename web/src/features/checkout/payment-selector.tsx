import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Button,Dialog,SelectField} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {paymentOptionsApi,type PaymentOption,type PublicPaymentOptions} from '../../api/endpoints/payment-options';
import {allowPaymentSelection,unchangedBeforeSwitch,paymentSwitchApi,SwitchPaymentError,
  type SwitchProblem,type VerifiedBeforeSwitch} from '../../api/endpoints/payment-switch';
import {checkoutLabel,type CheckoutKey} from './i18n';

export interface PaymentSelectorProps {
  initial:VerifiedBeforeSwitch;
  serverNow:number;
  disabled:boolean;
  busy:boolean;
  onBegin:()=>void;
  onResolved:(tradeId:string)=>void;
  onFailure:(problem:SwitchProblem)=>void;
}
const problemLabels:Record<SwitchProblem,CheckoutKey>={
  stale:'selectChanged',limit:'selectLimit',suborder:'selectChild',
  expired:'selectExpired',unsupported:'selectUnsupported',
  provider:'selectProviderError',unknown:'selectUnknown',
};
export const switchMessageKey=(problem:SwitchProblem):CheckoutKey=>problemLabels[problem];

export function PaymentSelector({
  initial,serverNow,disabled,busy,onBegin,onResolved,onFailure,
}:PaymentSelectorProps) {
  const {locale}=useI18n();
  const t=useCallback((key:CheckoutKey)=>checkoutLabel(locale,key),[locale]);
  const [options,setOptions]=useState<PublicPaymentOptions|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [revision,setRevision]=useState(0);
  const [method,setMethod]=useState<'onchain'|'okpay'>('onchain');
  const [network,setNetwork]=useState('');
  const [token,setToken]=useState('');
  const [confirm,setConfirm]=useState(false);
  const inFlight=useRef(false);

  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setLoading(true);setError(false);setOptions(null);
    paymentOptionsApi.list(controller.signal)
      .then(data=>{if(active)setOptions(data);})
      .catch(()=>{if(active&&!controller.signal.aborted)setError(true);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[initial.checkout.tradeId,revision]);

  const methodOptions=useMemo(()=>
    (options?.options??[]).filter(o=>o.method===method),
    [options,method]);
  const networks=useMemo(()=>{
    const found=new Map<string,string>();
    for(const option of methodOptions)found.set(option.network,option.label);
    return Array.from(found,([value,label])=>({value,label}));
  },[methodOptions]);
  const effectiveNetwork=networks.some(o=>o.value===network)?network:(networks[0]?.value??'');
  const tokens=useMemo(()=>methodOptions.filter(o=>o.network===effectiveNetwork),
    [methodOptions,effectiveNetwork]);
  const effectiveToken=tokens.some(o=>o.token===token)?token:(tokens[0]?.token??'');
  const target=methodOptions.find(o=>o.network===effectiveNetwork && o.token===effectiveToken)??null;
  const canSubmit=Boolean(target)&&!busy&&!disabled&&!loading&&!error&&
    (initial.status.status===1||initial.status.status===4)&&
    serverNow<initial.checkout.expirationTime;

  function changeMethod(value:string) {
    if(value==='onchain'||value==='okpay') {
      setMethod(value);setNetwork('');setToken('');
    }
  }
  function changeNetwork(value:string){
    setNetwork(value);setToken('');
  }
  function dismiss(){
    if(!busy&&!inFlight.current)setConfirm(false);
  }
  async function submitOnce(){
    if(inFlight.current||!canSubmit||!target||!options)return;
    const choice:PaymentOption=target;
    inFlight.current=true;setConfirm(false);
    onBegin();
    try {
      const fresh=await paymentSwitchApi.preflight(initial.checkout.tradeId);
      if(!unchangedBeforeSwitch(initial,fresh))
        throw new SwitchPaymentError('stale');
      const decision=allowPaymentSelection(
        fresh,options,choice.network,choice.token,fresh.checkout.serverTime);
      if(decision==='same'){
        onResolved(fresh.checkout.tradeId);
        return;
      }
      const result=await paymentSwitchApi.switchOnce(
        fresh.checkout,choice.network,choice.token);
      // Never use mutation response as proof of a payable address or paid
      // order. Read both GET endpoints again for the returned (possibly
      // child) trade ID. Do not automatically retry the POST if this fails.
      const checked=await paymentSwitchApi.preflight(result.tradeId);
      if(checked.checkout.tradeId!==result.tradeId ||
        checked.status.status===4 ||
        (result.method==='okpay'&&!checked.checkout.hasHostedPaymentLink))
        throw new SwitchPaymentError('unknown');
      onResolved(result.tradeId);
    }catch(cause){
      onFailure(cause instanceof SwitchPaymentError?cause.problem:'unknown');
    }finally{inFlight.current=false;}
  }
  const providerAvailable=Boolean(options?.options.some(o=>o.method==='okpay'));
  const chainAvailable=Boolean(options?.options.some(o=>o.method==='onchain'));

  return <section className="checkout-method-select" aria-label={t('chooseMethod')}>
    <h3>{t('chooseMethod')}</h3>
    <p className="muted">{t('selectMax')} {t('selectInitial')}</p>
    {disabled&&<p className="warning" role="alert">{t('selectBlocked')}</p>}
    {loading?<p className="muted">{t('loading')}</p>:
      error?<div role="alert">
        <p>{t('selectError')}</p>
        <Button variant="secondary" onClick={()=>setRevision(x=>x+1)}>{t('selectRetryOptions')}</Button>
      </div>:(!options||!options.options.length)?<p className="muted">{t('selectUnavailable')}</p>:
      <div className="checkout-method-controls">
        <SelectField label={t('method')} value={method} disabled={busy||disabled}
          onChange={e=>changeMethod(e.target.value)}
          options={[
            ...(chainAvailable?[{value:'onchain',label:t('chain')}]:[]),
            ...(providerAvailable?[{value:'okpay',label:t('provider')}]:[]),
          ]}/>
        {method==='onchain'&&<SelectField label={t('chooseNetwork')} value={effectiveNetwork}
          disabled={busy||disabled} onChange={e=>changeNetwork(e.target.value)}
          options={networks}/>}
        <SelectField label={t('chooseToken')} value={effectiveToken}
          disabled={busy||disabled||!effectiveNetwork}
          onChange={e=>setToken(e.target.value)}
          options={tokens.map(o=>({value:o.token,label:o.token}))}/>
        <Button type="button" disabled={!canSubmit}
          onClick={()=>setConfirm(true)}>{t('selectConfirm')}</Button>
      </div>}
    <p className="muted checkout-boundary">{t('selectNoRedirect')}</p>
    <Dialog open={confirm} title={t('selectConfirm')} closeLabel={t('selectCancel')}
      onClose={dismiss}>
      <p>{t('selectConfirmBody')}</p>
      <p className="warning">{t('selectMax')}</p>
      <p><strong>{target?.label}</strong> · {target?.token}</p>
      <div className="checkout-selector-actions">
        <Button variant="secondary" type="button" disabled={busy}
          onClick={dismiss}>{t('selectCancel')}</Button>
        <Button type="button" busy={busy} disabled={!canSubmit}
          onClick={()=>{void submitOnce();}}>{t('selectProceed')}</Button>
      </div>
    </Dialog>
  </section>;
}
