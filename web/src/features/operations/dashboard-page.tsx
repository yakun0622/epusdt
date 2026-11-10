import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {dashboardApi,type DashboardFilter,type DashboardRange,type Overview,
  type OrderStats,type DailyOrderStat,type RpcSnapshot} from '../../api/endpoints/dashboard';
import {Button,Card,DataTable,SelectField,TextField} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {opsLabel,type OperationsKey} from './i18n';

function errorText(e:unknown,fallback:string):string {return e instanceof Error?e.message:fallback;}
function dateText(date:string,locale:string):string {
  if(!date||date.startsWith('0001-'))return '—';
  const parsed=new Date(date.replace(' ','T'));
  return Number.isNaN(parsed.getTime())?date:
    new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(parsed);
}
function count(n:number,locale:string):string {return new Intl.NumberFormat(locale).format(n);}
function percent(value:number,locale:string):string {
  return new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:2}).format(value);
}
function localUnixSeconds(input:string):number|undefined {
  const ms=new Date(input).getTime();
  return input&&Number.isFinite(ms)?Math.trunc(ms/1000):undefined;
}
interface SectionState<T> {data:T|null;error:string;loading:boolean}
const empty=<T,>():SectionState<T>=>({data:null,error:'',loading:true});
export function DashboardPage() {
  const {locale}=useI18n();
  const t=useCallback((key:OperationsKey)=>opsLabel(locale,key),[locale]);
  const [range,setRange]=useState<DashboardRange>('today');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [filter,setFilter]=useState<DashboardFilter>({range:'today'});
  const [formError,setFormError]=useState('');
  const [revision,setRevision]=useState(0);
  const [rpcRevision,setRpcRevision]=useState(0);
  const [overview,setOverview]=useState<SectionState<Overview>>(empty);
  const [orders,setOrders]=useState<SectionState<OrderStats>>(empty);
  const [trend,setTrend]=useState<SectionState<DailyOrderStat[]>>(empty);
  const [rpc,setRpc]=useState<SectionState<RpcSnapshot>>(empty);

  useEffect(()=>{
    let live=true;const abort=new AbortController();
    setOverview(empty());setOrders(empty());setTrend(empty());
    const run=<T,>(load:Promise<T>,setter:(value:SectionState<T>)=>void)=>{
      load.then(data=>{if(live)setter({data,error:'',loading:false});})
        .catch(e=>{if(live&&!abort.signal.aborted)
          setter({data:null,error:errorText(e,t('error')),loading:false});});
    };
    run(dashboardApi.overview(filter,abort.signal),setOverview);
    run(dashboardApi.orders(filter,abort.signal),setOrders);
    run(dashboardApi.trend(filter,abort.signal),setTrend);
    return()=>{live=false;abort.abort();};
  },[filter,revision,t]);
  useEffect(()=>{
    let live=true;const abort=new AbortController();
    setRpc(empty());
    dashboardApi.rpc(abort.signal)
      .then(data=>{if(live)setRpc({data,error:'',loading:false});})
      .catch(e=>{if(live&&!abort.signal.aborted)
        setRpc({data:null,error:errorText(e,t('error')),loading:false});});
    return()=>{live=false;abort.abort();};
  },[rpcRevision,t]);
  const fmtRate=useCallback((rate:number|null,denominator:number):string=>
    rate===null||denominator===0?'—':percent(rate,locale),[locale]);
  function applyRange(e:FormEvent) {
    e.preventDefault();setFormError('');
    if(range!=='custom'){setFilter({range});return;}
    const from=localUnixSeconds(start),to=localUnixSeconds(end);
    if(from===undefined||to===undefined||from<0||from>to){
      setFormError(t('invalid'));return;
    }
    setFilter({range:'custom',startAt:from,endAt:to});
  }
  const rpcChains=rpc.data?.chains??[];
  const peak=useMemo(()=>Math.max(1,...(trend.data??[]).map(r=>r.order_count)),[trend.data]);
  const metrics:Array<{key:OperationsKey;value:string}>=[];
  if(overview.data){
    metrics.push({key:'orderCount',value:count(overview.data.order_count,locale)});
    metrics.push({key:'successRate',value:fmtRate(overview.data.success_rate,overview.data.order_count)});
    metrics.push({key:'activeAddresses',value:count(overview.data.active_addresses,locale)});
    metrics.push({key:'onlineChains',value:count(overview.data.online_chains,locale)});
  }
  if(orders.data){
    metrics.push({key:'successCountMetric',value:count(orders.data.success_count,locale)});
    metrics.push({key:'expired',value:count(orders.data.expired_unpaid_count,locale)});
    metrics.push({key:'avgPayment',value:orders.data.success_count
      ? count(Math.round(orders.data.avg_payment_seconds*10)/10,locale)+' '+t('seconds'):'—'});
  }
  return <div className="operations-dashboard">
    <Card title={t('dashboardTitle')} description={t('dashboardInfo')}>
      <form className="operations-range" onSubmit={applyRange}>
        <SelectField label={t('period')} value={range}
          options={[
            {value:'today',label:t('today')},{value:'7d',label:t('sevenDays')},
            {value:'30d',label:t('thirtyDays')},{value:'custom',label:t('custom')},
          ]}
          onChange={e=>setRange(e.target.value as DashboardRange)}/>
        {range==='custom'&&<>
          <TextField label={t('start')} type="datetime-local" value={start}
            onChange={e=>setStart(e.target.value)}/>
          <TextField label={t('end')} type="datetime-local" value={end}
            onChange={e=>setEnd(e.target.value)}/>
        </>}
        <div className="operations-range-actions">
          <Button type="submit">{t('apply')}</Button>
          <Button type="button" variant="secondary" onClick={()=>setRevision(v=>v+1)}>{t('refresh')}</Button>
        </div>
      </form>
      {formError&&<p role="alert" className="error">{formError}</p>}
      <p className="muted operations-note">{t('disclaimer')}</p>
      {(overview.error||orders.error)&&
        <p role="alert" className="error">{[overview.error,orders.error].filter(Boolean).join(' · ')}</p>}
      {overview.loading||orders.loading?<p className="muted">{t('loading')}</p>:
        metrics.length===0?<p className="muted">{t('noKpi')}</p>:
          <div className="operations-metrics">
            {metrics.map(item=><div className="operations-metric" key={item.key}>
              <span className="muted">{t(item.key)}</span>
              <strong>{item.value}</strong>
            </div>)}
          </div>}
      <p className="muted operations-unit-caution">{t('mixedUnits')}</p>
    </Card>
    <Card title={t('trendTitle')}>
      {trend.loading?<p className="muted">{t('loading')}</p>:
      trend.error?<p className="error" role="alert">{trend.error}
        <Button variant="secondary" size="sm" onClick={()=>setRevision(v=>v+1)}>{t('refresh')}</Button></p>:
      <DataTable rows={trend.data??[]} getRowKey={r=>r.day}
        emptyLabel={t('noKpi')} ariaLabel={t('trendTitle')}
        columns={[
          {key:'period',title:t('period'),render:r=>r.day},
          {key:'orders',title:t('orderCount'),render:r=>
            <div className="operations-trend">
              <span className="operations-trend-bar" style={{width:(r.order_count/peak*100)+'%'}}/>
              <span>{count(r.order_count,locale)}</span>
            </div>},
          {key:'paid',title:t('successCountMetric'),render:r=>count(r.success_count,locale)},
        ]}/>}
    </Card>
    <Card title={t('rpcTitle')} description={t('rpcInfo')}>
      <div className="operations-rpc-toolbar">
        <Button variant="secondary" onClick={()=>setRpcRevision(v=>v+1)}>{t('refresh')}</Button>
        {rpc.data&&<span className="muted">{t('rpcGenerated')}: {dateText(rpc.data.generated_at,locale)}</span>}
      </div>
      {rpc.loading?<p className="muted">{t('loading')}</p>:
        rpc.error?<p className="error" role="alert">{rpc.error}</p>:
        rpc.data?<div>
          <div className="operations-rpc-summary">
            <span>{t('rpcCalls')}: {count(rpc.data.summary.success_count+rpc.data.summary.failure_count,locale)}</span>
            <span>{t('rpcFailures')}: {count(rpc.data.summary.failure_count,locale)}</span>
            <span>{t('successRate')}: {fmtRate(rpc.data.summary.success_rate,
              rpc.data.summary.success_count+rpc.data.summary.failure_count)}</span>
          </div>
          <DataTable rows={rpcChains} getRowKey={r=>r.network}
            emptyLabel={t('noKpi')} ariaLabel={t('rpcTitle')}
            columns={[
              {key:'chain',title:t('network'),render:r=>r.display_name||r.network},
              {key:'status',title:t('rpcStatus'),render:r=>
                <span className={'network-health network-health--'+r.status}>{r.status}</span>},
              {key:'counts',title:t('rpcCalls'),render:r=>r.has_data
                ?count(r.success_count+r.failure_count,locale):t('rpcNoSample')},
              {key:'rate',title:t('successRate'),render:r=>r.has_data
                ?fmtRate(r.success_rate,r.success_count+r.failure_count):'—'},
              {key:'height',title:t('rpcBlock'),render:r=>r.has_data&&r.latest_block_height>0
                ?count(r.latest_block_height,locale):'—'},
              {key:'sync',title:t('lastSync'),render:r=>dateText(r.last_sync_at,locale)},
            ]}/>
        </div>:<p className="muted">{t('noKpi')}</p>}
    </Card>
  </div>;
}
