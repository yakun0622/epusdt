import { adminClient } from '../../api';

export type ChannelType = 'telegram' | 'webhook' | 'email';
export type ChannelEvent = 'pay_success' | 'order_expired' | 'daily_report';
export const events = ['pay_success','order_expired','daily_report'] as const;
export type Flags = Record<ChannelEvent, boolean>;
export interface Channel { id:number; type:ChannelType; name:string; enabled:boolean; configured:boolean; events:Flags }
export const defaultFlags = ():Flags => ({pay_success:true,order_expired:true,daily_report:false});
const idPath=(id:number)=>{
  if(!Number.isSafeInteger(id)||id<1)throw new TypeError('Invalid channel ID');
  return '/notification-channels/'+id;
};
const nameCheck=(name:string)=>{
  const value=name.trim();
  if(!value||value.length>128)throw new TypeError('Name must be 1–128 characters');
  return value;
};
const flagsCheck=(value:Flags):Flags=>{
  for(const key of events)if(typeof value[key]!=='boolean')throw new TypeError('Invalid event flags');
  return {pay_success:value.pay_success,order_expired:value.order_expired,daily_report:value.daily_report};
};
export function decodeChannels(value:unknown):Channel[]{
  if(!Array.isArray(value))throw new TypeError('Expected channel array');
  return value.map(raw=>{
    if(!raw||typeof raw!=='object')throw new TypeError('Invalid channel');
    const row=raw as Record<string,unknown>;
    if(!Number.isSafeInteger(row.id)||Number(row.id)<1||!['telegram','webhook','email'].includes(String(row.type))
      ||typeof row.name!=='string'||typeof row.enabled!=='boolean'||typeof row.configured!=='boolean')
      throw new TypeError('Invalid channel');
    const flags=row.events&&typeof row.events==='object'&&!Array.isArray(row.events)
      ? row.events as Record<string,unknown> : {};
    // Explicit allowlist: never keep config JSON, bot tokens, webhook headers, or unknown keys.
    return {id:row.id as number,type:row.type as ChannelType,name:row.name,enabled:row.enabled,
      configured:row.configured,events:Object.fromEntries(events.map(k=>[k,flags[k]===true])) as Flags};
  });
}
export interface TelegramInput{ name:string;token:string;chatId:string;events:Flags;enabled:boolean }
function credentials(token:string,chatId:string){
  if(!token.trim()||!chatId.trim())throw new TypeError('Bot token and chat ID required');
  return {bot_token:token.trim(),chat_id:chatId.trim()};
}
async function sendSecret(path:string,body:unknown,method:'POST'|'PATCH'):Promise<unknown>{
  try{return await adminClient.json<unknown>(path,{
    method,cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify(body),
  });}catch{throw new Error('Telegram channel request failed; check credentials and retry');}
}
export const notificationsApi={
  list:async(signal?:AbortSignal):Promise<Channel[]>=>decodeChannels(
    await adminClient.json<unknown>('/notification-channels?redact=1',{signal,cache:'no-store'})),
  createTelegram:async(input:TelegramInput):Promise<Channel>=>{
    if(typeof input.enabled!=='boolean')throw new TypeError('Invalid enabled');
    const result=await sendSecret('/notification-channels?redact=1',{
      type:'telegram',name:nameCheck(input.name),config:credentials(input.token,input.chatId),
      enabled:input.enabled,events:flagsCheck(input.events),
    },'POST');
    return decodeChannels([result])[0];
  },
  updateMetadata:(id:number,name:string,eventFlags:Flags):Promise<null>=>
    adminClient.postJson<null>(idPath(id),{name:nameCheck(name),events:flagsCheck(eventFlags)},'PATCH'),
  replaceTelegram:async(id:number,token:string,chatId:string):Promise<void>=>{
    await sendSecret(idPath(id),{config:credentials(token,chatId)},'PATCH');
  },
  toggle:(id:number,enabled:boolean):Promise<null>=>{
    if(typeof enabled!=='boolean')throw new TypeError('Enabled must be boolean');
    return adminClient.postJson<null>(idPath(id)+'/status',{enabled});
  },
  remove:(id:number):Promise<null>=>adminClient.json<null>(idPath(id),{method:'DELETE'}),
};
