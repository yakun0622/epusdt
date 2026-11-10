import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {notificationsApi,defaultFlags,events,type Channel,type Flags} from '../../api/endpoints/notifications';
import {Button,Card,DataTable,Dialog,TextField,useToast} from '../../components/ui';
import {useI18n} from '../../i18n/i18n-provider';
import {auxLabel,type AuxiliaryKey} from './i18n';

type Modal={kind:'create'}|{kind:'edit'|'credentials'|'toggle'|'delete';row:Channel}|null;
const eventNames:Record<string,AuxiliaryKey>={
  pay_success:'paid',order_expired:'expired',daily_report:'daily',
};
const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

export function NotificationsPage() {
  const {locale}=useI18n();
  const t=useCallback((key:AuxiliaryKey)=>auxLabel(locale,key),[locale]);
  const {notify}=useToast();
  const [rows,setRows]=useState<Channel[]>([]);
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState('');
  const [revision,setRevision]=useState(0);
  const [modal,setModal]=useState<Modal>(null);
  const [name,setName]=useState('');
  const [token,setToken]=useState('');
  const [chatId,setChatId]=useState('');
  const [flags,setFlags]=useState<Flags>(defaultFlags);
  const [enabled,setEnabled]=useState(true);
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=()=>setRevision(n=>n+1);

  useEffect(()=>{
    let alive=true;const abort=new AbortController();
    setLoading(true);setListError('');
    notificationsApi.list(abort.signal).then(value=>{if(alive)setRows(value);})
      .catch(e=>{if(alive&&!abort.signal.aborted){
        setRows([]);setListError(message(e,t('error')));
      }}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;abort.abort();};
  },[revision,t]);

  function open(next:Exclude<Modal,null>) {
    if(busy)return;
    setModal(next);setName(next.kind==='create'?'':next.row.name);
    setFlags(next.kind==='create'?defaultFlags():{...next.row.events});
    setEnabled(next.kind==='create'?true:next.row.enabled);
    setToken('');setChatId('');setConfirmation('');setError('');
  }
  function dismiss(){
    if(busy)return;
    setModal(null);setToken('');setChatId('');setConfirmation('');setError('');
  }
  function success(){
    setModal(null);setError('');refresh();
    notify({tone:'success',title:t('successful')});
  }
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy||!modal||!['create','edit','credentials'].includes(modal.kind))return;
    setBusy(true);setError('');
    try{
      if(modal.kind==='create'){
        await notificationsApi.createTelegram({name,token,chatId,events:flags,enabled});
      }else if(modal.kind==='edit'){
        await notificationsApi.updateMetadata(modal.row.id,name,flags);
      }else if(modal.kind==='credentials'){
        if(confirmation!==String(modal.row.id))throw new TypeError('Confirm channel ID');
        await notificationsApi.replaceTelegram(modal.row.id,token,chatId);
      }
      success();
    }catch(e){
      // No raw server response for secret changes.
      setError(modal.kind==='create'||modal.kind==='credentials'?t('error'):message(e,t('error')));
    }finally{
      setToken('');setChatId('');setBusy(false);
    }
  }
  async function confirm() {
    if(busy||!modal||!['toggle','delete'].includes(modal.kind)||!('row' in modal))return;
    if(modal.kind==='delete'&&confirmation!==String(modal.row.id))return;
    setBusy(true);setError('');
    try{
      if(modal.kind==='toggle')await notificationsApi.toggle(modal.row.id,!modal.row.enabled);
      else await notificationsApi.remove(modal.row.id);
      success();
    }catch(e){setError(message(e,t('error')));}finally{setBusy(false);}
  }
  const modalTitle=!modal?t('notifications'):
    modal.kind==='create'?t('newTelegram'):
    modal.kind==='edit'?t('edit'):
    modal.kind==='credentials'?t('replace'):
    modal.kind==='toggle'?t('toggle'):t('delete');
  return <div className="auxiliary-page">
    <Card title={t('notifications')} description={t('telegramOnly')}>
      <div className="auxiliary-toolbar">
        <Button variant="secondary" disabled={loading||busy} onClick={refresh}>{t('refresh')}</Button>
        <Button disabled={busy} onClick={()=>open({kind:'create'})}>{t('newTelegram')}</Button>
      </div>
      {listError?<p role="alert" className="error">{listError} <Button variant="secondary" size="sm"
        onClick={refresh}>{t('retry')}</Button></p>:
        <DataTable rows={rows} getRowKey={r=>r.id} ariaLabel={t('notifications')}
          loading={loading} loadingLabel={t('loading')} emptyLabel={t('empty')}
          columns={[
            {key:'name',title:t('name'),render:r=>r.name},
            {key:'type',title:t('type'),render:r=>r.type},
            {key:'configured',title:t('configured'),render:r=>r.configured?'✓':'—'},
            {key:'enabled',title:t('enabled'),render:r=>r.enabled?t('enabled'):t('disabled')},
            {key:'events',title:t('events'),render:r=>events.filter(key=>r.events[key])
              .map(key=>t(eventNames[key])).join(' · ')||'—'},
            {key:'actions',title:t('manage'),render:r=>r.type==='telegram'?
              <div className="auxiliary-actions">
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={()=>open({kind:'edit',row:r})}>{t('edit')}</Button>
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={()=>open({kind:'credentials',row:r})}>{t('replace')}</Button>
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={()=>open({kind:'toggle',row:r})}>{t('toggle')}</Button>
                <Button variant="danger" size="sm" disabled={busy}
                  onClick={()=>open({kind:'delete',row:r})}>{t('delete')}</Button>
              </div>:<span className="muted">{t('readOnly')}</span>},
          ]}/>}
    </Card>
    <Dialog open={Boolean(modal)} title={modalTitle} closeLabel={t('close')} onClose={dismiss}>
      {(modal?.kind==='create'||modal?.kind==='edit'||modal?.kind==='credentials')&&
        <form className="form-stack" autoComplete="off" onSubmit={submit}>
          {modal.kind!=='credentials'&&
            <TextField label={t('name')} value={name} required maxLength={128}
              onChange={e=>setName(e.target.value)}/>}
          {modal.kind!=='edit'&&<>
            <p className="muted">{t('replaceWarning')}</p>
            <TextField label={t('token')} type="password" value={token} required autoComplete="new-password"
              onChange={e=>setToken(e.target.value)}/>
            <TextField label={t('chatId')} value={chatId} required autoComplete="off"
              onChange={e=>setChatId(e.target.value)}/>
          </>}
          {modal.kind!=='credentials'&&<div className="auxiliary-events">
            <strong>{t('events')}</strong>
            {events.map(key=><label key={key} className="auxiliary-check">
              <input type="checkbox" checked={flags[key]} onChange={e=>setFlags(old=>({...old,[key]:e.target.checked}))}/>
              {t(eventNames[key])}
            </label>)}
          </div>}
          {modal.kind==='credentials'&&
            <TextField label={t('confirm')+' ID'} value={confirmation}
              placeholder={String(modal.row.id)} onChange={e=>setConfirmation(e.target.value)}/>}
          {error&&<p role="alert" className="error">{error}</p>}
          <div className="auxiliary-actions">
            <Button variant="secondary" type="button" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
            <Button type="submit" busy={busy}
              disabled={modal.kind==='credentials'&&confirmation!==String(modal.row.id)}>{t('save')}</Button>
          </div>
        </form>}
      {(modal?.kind==='toggle'||modal?.kind==='delete')&&
        <div className="form-stack">
          <p className="warning">{t('risk')}</p>
          <p>{modal.row.name} · ID {modal.row.id}</p>
          {modal.kind==='delete'&&
            <TextField label={t('confirm')+' ID'} value={confirmation}
              placeholder={String(modal.row.id)} onChange={e=>setConfirmation(e.target.value)}/>}
          {error&&<p role="alert" className="error">{error}</p>}
          <div className="auxiliary-actions">
            <Button variant="secondary" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
            <Button variant={modal.kind==='delete'?'danger':'primary'} busy={busy}
              disabled={modal.kind==='delete'&&confirmation!==String(modal.row.id)}
              onClick={()=>void confirm()}>{t('confirm')}</Button>
          </div>
        </div>}
    </Dialog>
  </div>;
}
