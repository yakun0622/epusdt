import {useCallback,useEffect,useState} from 'react';
import {settingsApi,type PublicSetting} from '../../api/endpoints/settings';
import {apiKeysApi} from '../../api/endpoints/api-keys';
import {chainsApi} from '../../api/endpoints/networks';
import {Button,Card,PreferencesControls} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {settingFieldLabel} from '../operations/i18n';
import {auxLabel,type AuxiliaryKey} from './i18n';

type Navigate=(path:string)=>void;
function useText(){
  const {locale}=useI18n();
  return {locale,t:useCallback((key:AuxiliaryKey)=>auxLabel(locale,key),[locale])};
}
function SafeReadError({message,retry}:{message:string;retry:()=>void}){
  const {t}=useText();
  return <p role="alert" className="error">{message} <Button variant="secondary" size="sm" onClick={retry}>{t('retry')}</Button></p>;
}

export function DisplayPage({onNavigate}:{onNavigate:Navigate}){
  const {locale,t}=useText();
  const [data,setData]=useState<PublicSetting[]|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;const abort=new AbortController();
    setLoading(true);setError('');
    settingsApi.list(abort.signal).then(rows=>{
      if(active)setData(rows.filter(row=>row.group==='brand'));
    }).catch(()=>{
      if(active&&!abort.signal.aborted){setData(null);setError(t('error'));}
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[revision,t]);
  return <div className="auxiliary-page">
    <Card title={t('display')} description={t('displayNote')}>
      <PreferencesControls/>
    </Card>
    <Card title={t('brand')}>
      <div className="auxiliary-toolbar">
        <Button variant="secondary" onClick={()=>onNavigate('/settings/pay')}>{t('brandLink')}</Button>
        <Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>{t('refresh')}</Button>
      </div>
      {loading?<p className="muted">{t('loading')}</p>:
        error?<SafeReadError message={error} retry={()=>setRevision(n=>n+1)}/>:
        data?.length?<dl className="auxiliary-details">
          {data.map(row=><div key={row.key}>
            <dt>{settingFieldLabel(locale,row.key)}</dt>
            <dd>{row.value||'—'}</dd>
          </div>)}
        </dl>:<p className="muted">{t('empty')}</p>}
    </Card>
  </div>;
}
interface IntegrationSummary {
  keys: number;
  chains: number;
  epay: string | null;
  okpay: boolean | null;
}
export function IntegrationsPage({onNavigate}:{onNavigate:Navigate}){
  const {t}=useText();
  const [summary,setSummary]=useState<IntegrationSummary|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;const abort=new AbortController();
    setLoading(true);setError('');
    // All three APIs are read-only. No private API key or raw settings URL enters state.
    Promise.all([apiKeysApi.list(abort.signal),chainsApi.list(abort.signal),
      settingsApi.list(abort.signal)]).then(([keys,chains,settings])=>{
      if(!active)return;
      const pick=(key:string)=>settings.find(row=>row.key===key)?.value??null;
      const rawEnabled=pick('okpay.enabled');
      setSummary({
        keys:keys.filter(key=>key.status===1).length,
        chains:chains.filter(chain=>chain.enabled).length,
        epay:pick('epay.default_network'),
        okpay:rawEnabled==='true'?true:rawEnabled==='false'?false:null,
      });
    }).catch(()=>{
      if(active&&!abort.signal.aborted){setSummary(null);setError(t('error'));}
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[revision,t]);
  const integrations=[
    {name:'EPAY',detail:summary?.epay??'—',path:'/settings/epay'},
    {name:'GMPAY',detail:summary?String(summary.keys)+' '+t('apiKeys'):'—',path:'/keys'},
    {name:'OkPay',detail:summary?.okpay===true?t('enabled'):
      summary?.okpay===false?t('disabled'):'—',path:'/settings/okpay'},
    {name:t('chains'),detail:summary?String(summary.chains)+' '+t('enabled'):'—',path:'/chains'},
  ];
  return <div className="auxiliary-page">
    <Card title={t('integrations')} description={t('integrationsNote')}>
      <div className="auxiliary-toolbar">
        <Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>{t('refresh')}</Button>
      </div>
      {loading?<p className="muted">{t('loading')}</p>:
        error?<SafeReadError message={error} retry={()=>setRevision(n=>n+1)}/>:
        <div className="auxiliary-integration-grid">
          {integrations.map(row=><section key={row.name} className="auxiliary-integration">
            <strong>{row.name}</strong>
            <p className="muted">{row.detail}</p>
            <Button variant="secondary" size="sm" onClick={()=>onNavigate(row.path)}>
              {t('manage')}
            </Button>
          </section>)}
        </div>}
    </Card>
  </div>;
}
export function HelpPage({onNavigate}:{onNavigate:Navigate}){
  const {t}=useText();
  return <div className="auxiliary-page">
    <Card title={t('help')} description={t('helpNote')}>
      <p className="muted">{t('integrationsNote')}</p>
      <div className="auxiliary-toolbar">
        <Button variant="secondary" onClick={()=>onNavigate('/keys')}>{t('apiKeys')}</Button>
        <Button variant="secondary" onClick={()=>onNavigate('/settings')}>{t('systemSettings')}</Button>
        <Button variant="secondary" onClick={()=>onNavigate('/payment-setup/integrations')}>{t('integrations')}</Button>
      </div>
      <p><a href="https://github.com/yakun0622/epusdt#readme" target="_blank" rel="noopener noreferrer">{t('repository')}</a></p>
    </Card>
  </div>;
}
export function InstallGuide({onNavigate}:{onNavigate:Navigate}){
  const {t}=useText();
  return <div className="auxiliary-page">
    <p className="warning" role="note">{t('installNotice')}</p>
    <p>{t('installSteps')}</p>
    <p><a href="https://github.com/yakun0622/epusdt#readme" target="_blank" rel="noopener noreferrer">{t('repository')}</a></p>
    <Button variant="secondary" onClick={()=>onNavigate('/sign-in')}>{t('manage')}</Button>
  </div>;
}
