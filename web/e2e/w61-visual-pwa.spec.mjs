import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
import {writeFileSync} from 'node:fs';
import {installSandbox} from './sandbox.mjs';

// Source is byte-for-byte src/www; target is the restored React web/.
// Screenshots are evidence for human review, NOT a pixel-equality release pass.
const original='http://127.0.0.1:4174';
function difference(before,after){
  const a=PNG.sync.read(before),b=PNG.sync.read(after);
  if(a.width!==b.width||a.height!==b.height)throw new Error('differing viewport pixels');
  let count=0;
  for(let i=0;i<a.data.length;i+=4){
    if(Math.max(Math.abs(a.data[i]-b.data[i]),
      Math.abs(a.data[i+1]-b.data[i+1]),
      Math.abs(a.data[i+2]-b.data[i+2]))>28)count++;
  }
  return {width:a.width,height:a.height,changedPixels:count,
    totalPixels:a.width*a.height,ratio:Number((count/(a.width*a.height)).toFixed(5))};
}

for(const [route,label] of [['/sign-in','sign-in'],['/cashier/w60_parent','cashier']]){
 test('W61 original-versus-restored browser viewport evidence: '+label,async({page,browser},info)=>{
  const state=await installSandbox(page);
  const width=info.project.name.includes('mobile')?375:1280;
  const height=info.project.name.includes('mobile')?812:800;
  const old=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
  await old.route('**/*',route=>{
    const hostname=new URL(route.request().url()).hostname;
    return hostname==='127.0.0.1'||hostname==='localhost'
      ?route.continue():route.abort();
  });
  try{
    const response=await old.goto(original+route,{waitUntil:'domcontentloaded'});
    expect(response?.status()).toBe(200);
    await page.goto(route,{waitUntil:'domcontentloaded'});
    if(label==='cashier')await expect(page.locator('.checkout-state')).toBeVisible();
    else await expect(page.getByLabel('Password')).toBeVisible();
    await old.waitForTimeout(650);
    const oldPng=await old.screenshot({animations:'disabled'});
    const newPng=await page.screenshot({animations:'disabled'});
    const oldName='legacy-'+label+'.png',newName='restored-'+label+'.png';
    writeFileSync(info.outputPath(oldName),oldPng);
    writeFileSync(info.outputPath(newName),newPng);
    await info.attach(oldName,{body:oldPng,contentType:'image/png'});
    await info.attach(newName,{body:newPng,contentType:'image/png'});
    const diff=difference(oldPng,newPng);
    const metadata={...diff,route,baseline:'src/www',candidate:'web/',
      viewport:info.project.name,manualVisualApproval:'BLOCKED',
      legacyDOMTextLength:(await old.locator('body').innerText()).length,
      noRealPaymentOrExternalBackend:true};
    writeFileSync(info.outputPath('comparison.json'),JSON.stringify(metadata,null,2));
    expect(diff.totalPixels).toBe(width*height);
    expect(diff.ratio).toBeGreaterThanOrEqual(0);
    // No percent threshold: restored UI is not pixel-identical to the
    // original, and accepting arbitrary deviations must require a reviewer.
    expect(state.calls.every(c=>c.method==='GET')).toBe(true);
  }finally{await old.close()}
 });
}

test('W61 PWA migration audit: legacy worker exists, new web does not register an upgrade',async({page,request})=>{
 const manifest=await request.get(original+'/manifest.webmanifest');
 const registration=await request.get(original+'/registerSW.js');
 const serviceWorker=await request.get(original+'/sw.js');
 expect(manifest.ok()).toBe(true);
 expect(registration.ok()).toBe(true);
 expect(serviceWorker.ok()).toBe(true);
 const meta=await manifest.json();
 expect(meta.scope).toBe('/');
 expect(meta.start_url).toBe('/');
 expect((await registration.text())).toContain("navigator.serviceWorker.register('/sw.js'");
 expect((await serviceWorker.text()).length).toBeGreaterThan(100);
 const state=await installSandbox(page);
 await page.goto('/sign-in');
 await expect(page.getByLabel('Password')).toBeVisible();
 expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
 const registrations=await page.evaluate(async()=>('serviceWorker' in navigator
   ?(await navigator.serviceWorker.getRegistrations()).length:0));
 expect(registrations).toBe(0);
 // No production same-origin SW replacement was performed. The missing
 // upgrade path is a mandatory BLOCKED criterion, not a passing migration.
 expect(state.blocked).toEqual([]);
});
