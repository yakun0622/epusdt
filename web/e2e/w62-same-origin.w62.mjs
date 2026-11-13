import {test,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';

const here=dirname(fileURLToPath(import.meta.url));
const locales=['en-US','zh-CN','zh-TW','ja-JP','ko-KR','ru-RU'];
async function serverForTest(){
 const dir=mkdtempSync(join(tmpdir(),'w62-pwa-'));
 const ready=join(dir,'ready.json');
 const logs=[];
 const child=spawn(process.execPath,[join(here,'w62-same-origin-server.mjs')],{
  cwd:here,env:{...process.env,W62_ISOLATED:'1',W62_READY_FILE:ready,
    W62_CONTROL_TOKEN:'w62-isolated-only'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs.push(d.toString()));
 child.stderr.on('data',d=>logs.push(d.toString()));
 const deadline=Date.now()+8000;let port;
 while(Date.now()<deadline){
  try{const info=JSON.parse(readFileSync(ready,'utf8'));if(info.port>0){port=info.port;break}}
  catch{}
  if(child.exitCode!==null)break;
  await new Promise(r=>setTimeout(r,30));
 }
 if(!port){
  child.kill();rmSync(dir,{recursive:true,force:true});
  throw new Error('W62 same-origin server failed: '+logs.join(''));
 }
 return {origin:'http://127.0.0.1:'+port,stop:()=>{
    child.kill();rmSync(dir,{recursive:true,force:true});
  }};
}
async function switchTo(request,origin,mode){
 const response=await request.post(origin+'/__w62/mode',{
  headers:{'X-W62-Control':'w62-isolated-only','X-W62-Mode':mode}});
 expect(response.status()).toBe(200);
 expect((await response.json()).mode).toBe(mode);
}
async function workerVersion(page){
 return page.evaluate(async()=>{
  if(!navigator.serviceWorker?.controller)return '';
  const ch=new MessageChannel();
  const p=new Promise(resolve=>{
   ch.port1.onmessage=e=>resolve(e.data);
   setTimeout(()=>resolve(''),350);
  });
  navigator.serviceWorker.controller.postMessage('W62_VERSION',[ch.port2]);
  return await p;
 });
}
async function renderLocale(page,origin,locale,info,stage){
 await page.context().addCookies([{name:'PARAGLIDE_LOCALE',value:locale,
   url:origin,sameSite:'Lax'}]);
 const res=await page.goto(origin+'/sign-in',{waitUntil:'domcontentloaded'});
 expect(res?.status()).toBe(200);
 if(stage==='candidate')await expect(page.getByLabel('Password')).toBeVisible();
 await page.waitForTimeout(stage==='old'?300:80);
 const png=await page.screenshot({animations:'disabled'});
 const filename='w62-'+stage+'-'+locale+'.png';
 writeFileSync(info.outputPath(filename),png);
 await info.attach(filename,{body:png,contentType:'image/png'});
 const text=await page.locator('body').innerText();
 const image=PNG.sync.read(png);
 return {filename,bodyChars:text.length,textSha256:createHash('sha256').update(text).digest('hex'),
   width:image.width,height:image.height,bytes:png.length,
   pageTitle:await page.title()};
}
async function candidates(page,origin,info,oldScreens){
 const manifest=[];
 for(const locale of locales){
  const current=await renderLocale(page,origin,locale,info,'candidate');
  const old=oldScreens[locale];
  const oldPng=PNG.sync.read(readFileSync(info.outputPath(old.filename)));
  const newPng=PNG.sync.read(readFileSync(info.outputPath(current.filename)));
  expect(oldPng.width).toBe(newPng.width);
  expect(oldPng.height).toBe(newPng.height);
  let changed=0;
  for(let i=0;i<newPng.data.length;i+=4){
   const max=Math.max(...[0,1,2].map(x=>Math.abs(newPng.data[i+x]-oldPng.data[i+x])));
   if(max>28)changed++;
  }
  manifest.push({locale,viewport:info.project.name,
   baseline:old,candidate:current,
   changedPixels:changed,ratio:changed/(oldPng.width*oldPng.height),
   independentReviewer:null,approval:'BLOCKED'});
 }
 writeFileSync(info.outputPath('W62-VISUAL-REVIEW.json'),JSON.stringify({
  gitSha:process.env.GITHUB_SHA||'local',
  origin:'ephemeral localhost same-origin',
  noExternalMoney:true,
  visualReleaseApproval:'BLOCKED',
  cases:manifest,
 },null,2));
 await info.attach('W62-VISUAL-REVIEW.json',{
  body:readFileSync(info.outputPath('W62-VISUAL-REVIEW.json')),
  contentType:'application/json'});
 expect(manifest).toHaveLength(6);
 expect(manifest.every(item=>item.approval==='BLOCKED')).toBe(true);
}
test('W62 same-origin legacy PWA -> isolated migration shim -> old rollback with 6-locale visual evidence',async({browser,request},info)=>{
 test.setTimeout(120_000);
 const node=await serverForTest();
 // Separate ephemeral context per test makes old Workbox caches unshared.
 const context=await browser.newContext({viewport:info.project.name.includes('mobile')
   ?{width:375,height:812}:{width:1280,height:800},serviceWorkers:'allow'});
 const page=await context.newPage();
 const outbound=[];
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==node.origin){
   outbound.push(url.host);
   return route.abort();
  }
  return route.continue();
 });
 try{
  const oldScreens={};
  for(const locale of locales)
    oldScreens[locale]=await renderLocale(page,node.origin,locale,info,'old');
  // Legacy registerSW.js installs the actual src/www/sw.js as scope '/'.
  await page.waitForFunction(async()=>{
   const r=await navigator.serviceWorker?.getRegistration('/');
   return !!r?.active;
  },null,{timeout:30_000});
  const registration=await page.evaluate(()=>navigator.serviceWorker.getRegistration('/'));
  expect(registration).toBeTruthy();
  const oldCache=await page.evaluate(()=>caches.keys());
  // The legacy precache may still be completing on the first load, but
  // the actual old worker must be active before the candidate is served.
  await switchTo(request,node.origin,'candidate');
  await page.evaluate(async()=>{
   const reg=await navigator.serviceWorker.getRegistration('/');
   await reg.update();
  });
  await expect.poll(()=>workerVersion(page),{timeout:15_000}).toBe('w62-isolated-migration-v1');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByLabel('Password')).toBeVisible();
  await candidates(page,node.origin,info,oldScreens);
  const candidateCache=await page.evaluate(()=>caches.keys());
  expect(candidateCache.filter(x=>x.startsWith('workbox-precache'))).toHaveLength(0);
  // Roll back ONLY this disposable origin. Simulate staged asset restore;
  // no production service worker or user cache is modified.
  await switchTo(request,node.origin,'old');
  await page.goto(node.origin+'/sign-in',{waitUntil:'domcontentloaded'});
  const legacy=await request.get(node.origin+'/manifest.webmanifest');
  expect(legacy.status()).toBe(200);
  const m=await legacy.json();
  expect(m.scope).toBe('/');
  const sw=await request.get(node.origin+'/sw.js');
  expect((await sw.text())).toContain('workbox-');
  expect(outbound).toEqual([]);
  writeFileSync(info.outputPath('W62-PWA-REVIEW.json'),JSON.stringify({
   originalWorkerRegistered:true,
   stagedMigrationWorker:'w62-isolated-migration-v1',
   oldCacheKeysBefore:oldCache.length,
   oldWorkboxPrecacheKeysAfter:candidateCache.filter(x=>x.startsWith('workbox-precache')).length,
   oldAssetsRestored:true,realProductionUpgrade:'BLOCKED',
   safety:'ephemeral same origin; test-only shim not shipped',
  },null,2));
 }finally{await context.close();node.stop()}
});
