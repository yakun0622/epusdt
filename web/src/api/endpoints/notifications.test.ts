import {afterEach,describe,expect,it,vi} from 'vitest';
import {decodeChannels,notificationsApi,defaultFlags} from './notifications';
afterEach(()=>vi.unstubAllGlobals());
const safe={id:17,type:'telegram',name:'Alert',enabled:true,configured:true,
 events:{pay_success:true,order_expired:false,daily_report:true}};
const ok=(data:unknown)=>new Response(JSON.stringify({
 status_code:200,message:'OK',data,request_id:''}),{status:200});
describe('W44 notification safety and real API routes',()=>{
 it('projects only known nonsecret fields and boolean events',()=>{
  const result=decodeChannels([{...safe,config:'bot_token=SECRET',api_key:'SECRET',
   events:{...safe.events,PRIVATE_SECRET:true}}]);
  expect(result).toEqual([safe]);
  expect(JSON.stringify(result)).not.toContain('SECRET');
  expect(()=>decodeChannels([{...safe,enabled:2}])).toThrow();
  expect(()=>decodeChannels([{...safe,configured:null}])).toThrow();
 });
 it('uses the real Go read/create/update/status/delete endpoints',async()=>{
  const fetcher=vi.fn<typeof fetch>()
   .mockImplementationOnce(async()=>ok([safe]))
   .mockImplementationOnce(async()=>ok(safe))
   .mockImplementation(async()=>ok(null));
  vi.stubGlobal('fetch',fetcher);
  expect(await notificationsApi.list()).toEqual([safe]);
  expect(await notificationsApi.createTelegram({
   name:'Alert',token:'SECRET_BOT',chatId:'123',events:defaultFlags(),enabled:true,
  })).toEqual([safe]);
  await notificationsApi.updateMetadata(17,'Alert',defaultFlags());
  await notificationsApi.toggle(17,false);
  await notificationsApi.remove(17);
  expect(fetcher.mock.calls.map(([url,opts])=>[url,opts?.method??'GET'])).toEqual([
   ['/admin/api/v1/notification-channels?redact=1','GET'],
   ['/admin/api/v1/notification-channels?redact=1','POST'],
   ['/admin/api/v1/notification-channels/17','PATCH'],
   ['/admin/api/v1/notification-channels/17/status','POST'],
   ['/admin/api/v1/notification-channels/17','DELETE'],
  ]);
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
   type:'telegram',name:'Alert',enabled:true,config:{bot_token:'SECRET_BOT',chat_id:'123'},
   events:defaultFlags(),
  });
  expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toEqual({enabled:false});
 });
 it('replaces full credentials only via explicit input and redacts failure messages',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>ok(null));
  vi.stubGlobal('fetch',fetcher);
  await notificationsApi.replaceTelegram(17,'NEW_SECRET','123');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
   config:{bot_token:'NEW_SECRET',chat_id:'123'},
  });
  fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({
   status_code:400,message:'leak NEW_SECRET',data:null
  }),{status:400}));
  await expect(notificationsApi.replaceTelegram(17,'NEW_SECRET','123'))
   .rejects.toThrow('Telegram channel request failed');
 });
});
