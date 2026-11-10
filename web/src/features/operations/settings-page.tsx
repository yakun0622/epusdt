import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { settingsApi, settingsForPage, sensitiveKeys, validateSetting,
  type SettingsPage as Section, type SaveSummary, type SettingField, type SettingWrite } from '../../api/endpoints/settings';
import { Button, Card, SelectField, TextField, useToast } from '../../components/ui';
import { useI18n } from '../../i18n/i18n-provider';
import { opsLabel, settingFieldLabel, type OperationsKey } from './i18n';
import { RateCachePanel } from './rate-cache-panel';

interface SettingsPageProps {
  section: Section;
  onNavigate: (path: string) => void;
}
type SecretMode = 'keep' | 'replace' | 'clear';
const tabs: ReadonlyArray<{ page: Section; path: string }> = [
  { page: 'system', path: '/settings/system' },
  { page: 'telegram', path: '/settings/telegram' },
  { page: 'pay', path: '/settings/pay' },
  { page: 'epay', path: '/settings/epay' },
  { page: 'okpay', path: '/settings/okpay' },
];
function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
export function SettingsPage({ section, onNavigate }: SettingsPageProps) {
  const { locale } = useI18n();
  const t = useCallback((key: OperationsKey) => opsLabel(locale, key), [locale]);
  const { notify } = useToast();
  const fields = useMemo(() => settingsForPage(section), [section]);
  const [draft, setDraft] = useState<Record<string,string>>({});
  const [dirty, setDirty] = useState<string[]>([]);
  const [secretModes, setSecretModes] = useState<Record<string,SecretMode>>({});
  const [clearConfirmed, setClearConfirmed] = useState<Record<string,boolean>>({});
  const [results, setResults] = useState<SaveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active=true;
    const abort=new AbortController();
    setLoading(true);setError('');setResults(null);
    setDraft({});setDirty([]);setSecretModes({});setClearConfirmed({});
    settingsApi.list(abort.signal).then(settings=>{
      if(!active)return;
      const values:Record<string,string>={};
      for(const item of settings)
        if(fields.some(f=>f.key===item.key)&&!sensitiveKeys.has(item.key))
          values[item.key]=item.value;
      setDraft(values);
    }).catch(cause=>{
      if(active&&!abort.signal.aborted)setError(readableError(cause,t('error')));
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;abort.abort();};
  },[fields,refreshKey,t]);

  const edit=(key:string,value:string)=>{
    setDraft(old=>({...old,[key]:value}));
    setDirty(old=>old.includes(key)?old:[...old,key]);
  };
  const setSecretMode=(key:string,mode:SecretMode)=>{
    setSecretModes(old=>({...old,[key]:mode}));
    setDraft(old=>({...old,[key]:''}));
    setClearConfirmed(old=>({...old,[key]:false}));
  };
  const mode=(key:string):SecretMode=>secretModes[key]??'keep';
  const isModified=(field:SettingField)=>field.kind==='secret'?
    mode(field.key)!=='keep':dirty.includes(field.key);

  async function save(event:FormEvent) {
    event.preventDefault();
    if(busy)return;
    const chosen=fields.filter(isModified);
    if(!chosen.length){setError(t('noChanges'));return;}
    let containsSensitive=false;
    const requested:SettingWrite[]=[];
    try {
      for(const field of chosen){
        if(field.kind==='secret'){
          containsSensitive=true;
          const decision=mode(field.key);
          if(decision==='replace'&&!draft[field.key]?.trim())
            throw new TypeError(t('secretPlaceholder'));
          if(decision==='clear'&&!clearConfirmed[field.key])
            throw new TypeError(t('secretConfirm'));
          requested.push(validateSetting(field,decision==='clear'?'':draft[field.key]||''));
        } else requested.push(validateSetting(field,draft[field.key]??''));
      }
    }catch(cause){
      setError(containsSensitive?t('invalid'):readableError(cause,t('invalid')));
      return;
    }
    setError('');setResults(null);setBusy(true);
    try{
      const summary=await settingsApi.save(requested);
      setResults(summary);
      setDirty(summary.failedKeys.filter(key=>!sensitiveKeys.has(key)));
      // Credential inputs are cleared after *every* response, including partial failure.
      setDraft(old=>{
        const next={...old};
        for(const key of sensitiveKeys) delete next[key];
        return next;
      });
      setSecretModes({});setClearConfirmed({});
      if(summary.allSucceeded){
        notify({tone:'success',title:t('success')});
        setRefreshKey(v=>v+1);
      }else{
        notify({tone:'error',title:t('partial')});
      }
    }catch(cause){
      // Never show a server-provided error message that could reflect a secret.
      setError(containsSensitive?t('failed'):readableError(cause,t('failed')));
      setDraft(old=>{
        const next={...old};
        for(const key of sensitiveKeys)delete next[key];
        return next;
      });
      setSecretModes({});setClearConfirmed({});
      setDirty(chosen.filter(field=>field.kind!=='secret').map(field=>field.key));
    }finally{setBusy(false);}
  }
  const fieldControl=(field:SettingField)=>{
    const value=draft[field.key]??'';
    const name=settingFieldLabel(locale,field.key);
    if(field.kind==='secret'){
      const currentMode=mode(field.key);
      return <div className="operations-secret-config" key={field.key}>
        <label className="ui-field-label">{name}</label>
        <SelectField label={name} value={currentMode}
          options={[
            {value:'keep',label:t('secretKeep')},
            {value:'replace',label:t('secretReplace')},
            {value:'clear',label:t('secretClear')},
          ]}
          onChange={e=>setSecretMode(field.key,e.target.value as SecretMode)}/>
        {currentMode==='replace'&&
          <TextField label={t('secretPlaceholder')} type="password" autoComplete="new-password"
            value={value} onChange={e=>setDraft(old=>({...old,[field.key]:e.target.value}))}/>}
        {currentMode==='clear'&&
          <label className="operations-clear-confirm">
            <input type="checkbox" checked={Boolean(clearConfirmed[field.key])}
              onChange={e=>setClearConfirmed(old=>({...old,[field.key]:e.target.checked}))}/>
            {t('secretConfirm')}
          </label>}
        <small className="muted">{t('secretWarning')}</small>
      </div>;
    }
    if(field.kind==='boolean'||field.kind==='select'){
      return <SelectField key={field.key} label={name} value={value}
        options={[
          {value:'',label:t('notConfigured')},
          ...(field.kind==='boolean'
            ?[{value:'true',label:t('boolTrue')},{value:'false',label:t('boolFalse')}]
            :(field.options??[]).map(v=>({value:v,label:v}))),
        ]}
        onChange={e=>edit(field.key,e.target.value)}/>;
    }
    if(field.kind==='json'){
      return <div className="ui-field" key={field.key}>
        <label className="ui-field-label" htmlFor={'setting-'+field.key}>{name}</label>
        <textarea className="ui-input operations-json-field" id={'setting-'+field.key}
          rows={5} spellCheck={false} value={value}
          onChange={e=>edit(field.key,e.target.value)}/>
      </div>;
    }
    return <TextField key={field.key} label={name}
      type={field.kind==='number'?'number':'text'}
      min={field.min} max={field.max}
      step={field.kind==='number'&&field.type!=='int'?'any':undefined}
      value={value} onChange={e=>edit(field.key,e.target.value)}/>;
  };

  return <div className="operations-settings">
    <nav className="operations-tabs" aria-label={t('settingsTitle')}>
      {tabs.map(tab=><Button key={tab.page} type="button"
        variant={tab.page===section?'primary':'secondary'} disabled={busy}
        onClick={()=>onNavigate(tab.path)}>{t(tab.page)}</Button>)}
    </nav>
    <Card title={t(section)} description={t('settingsHint')}>
      {loading?<p className="muted">{t('loading')}</p>:
        error&&!Object.keys(draft).length?
          <div role="alert" className="error">{error}
            <Button size="sm" variant="secondary" onClick={()=>setRefreshKey(v=>v+1)}>{t('reload')}</Button>
          </div>:
          <form autoComplete="off" onSubmit={save} className="operations-form">
            <div className="operations-fields">{fields.map(field=>fieldControl(field))}</div>
            {error&&<p role="alert" className="error">{error}</p>}
            <div className="operations-form-actions">
              <Button type="button" variant="secondary" disabled={busy}
                onClick={()=>setRefreshKey(v=>v+1)}>{t('reload')}</Button>
              <Button type="submit" busy={busy}
                disabled={!fields.some(isModified)}>{busy?t('saving'):t('save')}</Button>
            </div>
          </form>}
      {results&&<div className="operations-save-results" aria-live="polite">
        <h3>{t('pendingResults')}</h3>
        <p className={results.allSucceeded?'muted':'error'}>
          {results.allSucceeded?t('success'):t('partial')}
        </p>
        <p>{t('successCount')}: {results.successCount} · {t('failureCount')}: {results.failureCount}</p>
        {results.rows.map((row,index)=><div key={index}
          className={row.ok?'operations-save-ok':'operations-save-failed'}>
          <code>{row.key}</code> — {row.ok?t('successCount'):t('failureCount')}
          {!row.ok&&row.error_code!==undefined?' ('+row.error_code+')':''}
          {!row.ok&&row.error?' — '+row.error:''}
        </div>)}
        {results.failedKeys.some(key=>sensitiveKeys.has(key))&&
          <p className="muted">{t('reenterSecret')}</p>}
      </div>}
    </Card>
    {section==='pay'&&<RateCachePanel/>}
  </div>;
}
