import {useCallback,useEffect,useState} from 'react';
import {ratesApi,type RateStatus,type RateRefreshRow} from '../../api/endpoints/settings';
import {Button,Card,DataTable,Dialog,useToast} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {opsLabel,type OperationsKey} from './i18n';
function dateText(s:string,locale:string){
  if(!s)return '—';
  const date=new Date(s);
  return Number.isNaN(date.getTime())?s:new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(date);
}
export function RateCachePanel() {
  const {locale}=useI18n();
  const t=useCallback((k:OperationsKey)=>opsLabel(locale,k),[locale]);
  const {notify}=useToast();
  const [state,setState]=useState<RateStatus|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refreshVersion,setRefreshVersion]=useState(0);
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [outcome,setOutcome]=useState<RateRefreshRow[]|null>(null);

  useEffect(()=>{
    let active=true;
    const abort=new AbortController();
    setLoading(true);setError('');
    ratesApi.status(abort.signal).then(data=>{if(active)setState(data);})
      .catch(()=>{if(active&&!abort.signal.aborted){setState(null);setError(t('error'));}})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[refreshVersion,t]);

  async function refresh(){
    if(busy)return;
    setBusy(true);setError('');setConfirm(false);setOutcome(null);
    try {
      const rows=await ratesApi.refresh();
      setOutcome(rows);
      const all=rows.length>0&&rows.every(r=>r.ok);
      notify({tone:all?'success':'error',title:all?t('rateSuccess'):t('partial')});
      setRefreshVersion(v=>v+1);
    }catch{
      setError(t('rateFailure'));
      notify({tone:'error',title:t('rateFailure')});
    }finally{setBusy(false);}
  }
  return <Card title={t('rateStatus')} description={t('rateWarning')}>
    <div className="operations-rpc-toolbar">
      <Button variant="secondary" disabled={busy||loading}
        onClick={()=>setRefreshVersion(v=>v+1)}>{t('refresh')}</Button>
      <Button disabled={busy} onClick={()=>setConfirm(true)}>{t('rateRefresh')}</Button>
    </div>
    {loading?<p className="muted">{t('loading')}</p>:
      error?<p role="alert" className="error">{error}</p>:
      state?<div>
        <p className="muted">{t('rateMode')}: {state.mode} · {t('rateCacheTTL')}: {state.cache_ttl_seconds}</p>
        <DataTable rows={state.bases} ariaLabel={t('rateStatus')}
          emptyLabel={t('rateEmpty')} getRowKey={r=>r.base}
          columns={[
            {key:'base',title:t('rateBase'),render:r=>r.base.toUpperCase()},
            {key:'rates',title:t('rateCached'),render:r=>
              <span className="operations-rate-currencies">
                {Object.entries(r.rates).map(([currency,value])=>currency.toUpperCase()+' '+value).join(' · ')||'—'}
              </span>},
            {key:'fresh',title:t('status'),render:r=>r.is_stale?t('rateStale'):t('rateFresh')},
            {key:'success',title:t('rateLastSuccess'),render:r=>dateText(r.last_success_at,locale)},
          ]}/>
      </div>:<p className="muted">{t('rateEmpty')}</p>}
    {outcome&&<div className="operations-save-results" aria-live="polite">
      <h3>{t('pendingResults')}</h3>
      {outcome.length===0&&<p className="error">{t('rateFailure')}</p>}
      {outcome.map((r,i)=><div className={r.ok?'operations-save-ok':'operations-save-failed'} key={i}>
        <strong>{r.base.toUpperCase()}</strong> — {r.ok?t('rateSuccess'):t('rateFailure')}
      </div>)}
    </div>}
    <Dialog open={confirm} title={t('rateRefresh')} onClose={()=>{if(!busy)setConfirm(false);}}
      closeLabel={t('close')}>
      <p>{t('rateConfirm')}</p>
      <p className="muted">{t('rateWarning')}</p>
      <div className="operations-form-actions">
        <Button variant="secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('cancel')}</Button>
        <Button busy={busy} onClick={()=>{void refresh();}}>{t('rateRefresh')}</Button>
      </div>
    </Dialog>
  </Card>;
}
