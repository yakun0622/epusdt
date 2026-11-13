import { test, expect } from '@playwright/test';
import { installSandbox, orderFixture, assertNoUnsafeWrites, TEST_TX } from './sandbox.mjs';

test('W60 W52 10010 means a state conflict, never an expired order',async({page})=>{
  const state=await installSandbox(page,{readErrorCode:10010});
  await page.goto('/cashier/w60_parent');
  await expect(page.getByRole('alert')).toContainText('Order state changed');
  await expect(page.locator('.checkout-state')).toHaveCount(0);
  state.readErrorCode=null; // Release the persistent isolated error explicitly.
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  await expect(page.locator('.checkout-state')).not.toContainText('Order expired');
  assertNoUnsafeWrites(state);
});

test('W60 malformed payment reconciliation rejects optimistic paid status and remains read-only',async({page})=>{
  const state=await installSandbox(page);
  await page.route('**/pay/reconcile-status/w60_parent',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({status_code:200,message:'ok',data:{
      trade_id:'w60_parent',status:1,root_trade_id:'w60_parent',root_status:1,
      related_trade_id:'',related_status:null,provider:'on_chain',provider_status:'none',
      paid_confirmed:true,requires_review:false,
      server_time:Date.now(),expiration_time:Date.now()+300_000,
    }}),
  }));
  await page.goto('/cashier/w60_parent');
  await expect(page.getByRole('alert')).toContainText('Payment details cannot be verified');
  await expect(page.locator('.checkout-state')).toHaveCount(0);
  expect(state.calls.filter(x=>x.method!=='GET')).toHaveLength(0);
  assertNoUnsafeWrites(state);
});

test('W60 W53 invalid Hash input cannot send any POST',async({page})=>{
  const state=await installSandbox(page);
  await page.goto('/cashier/w60_parent');
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  await page.getByLabel('Transaction hash / network reference').fill('bad hash with spaces');
  await expect(page.getByRole('button',{name:'Review verification request'})).toBeDisabled();
  expect(state.verifyCount).toBe(0);
  assertNoUnsafeWrites(state);
});

test('W60 stale Hash target after preflight never invokes the read-only POST',async({page})=>{
  const state=await installSandbox(page);
  await page.goto('/cashier/w60_parent');
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  await page.getByLabel('Transaction hash / network reference').fill(TEST_TX);
  await page.getByRole('button',{name:'Review verification request'}).click();
  // Isolated state changes between the browser's confirmed destination and its
  // next three GETs. No actual payment, remote RPC or provider action happens.
  state.orders.get('w60_parent').address='TChangedIsolatedDestination';
  await page.getByRole('button',{name:'Verify once'}).click();
  await expect(page.locator('.checkout-alert')).toContainText('Order status or payment target changed');
  expect(state.verifyCount).toBe(0);
  assertNoUnsafeWrites(state);
});

test('W60 W55 paid OkPay provider ledger conflicts remain review, never paid',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{
    status:2,rootStatus:2,paidConfirmed:false,requiresReview:true,
    provider:'okpay',providerStatus:'paid',
    address:'OKPAY',hasHostedPaymentLink:true,
  })]});
  await page.goto('/cashier/w60_parent');
  await expect(page.locator('.checkout-state')).toContainText('Reconciliation required');
  await expect(page.locator('.checkout-state')).not.toContainText('Payment confirmed');
  await expect(page.locator('.checkout-destination')).toHaveCount(0);
  expect(state.verifyCount).toBe(0);
  assertNoUnsafeWrites(state);
});

test('W60 sandbox rejects any legacy payment-write endpoint without hitting Go',async({page})=>{
  const state=await installSandbox(page);
  await page.goto('/cashier/w60_parent');
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  const result=await page.evaluate(async()=>{
    const r=await fetch('/pay/submit-tx-hash/w60_parent',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({block_transaction_id:'TEST_ONLY_NEVER_SETTLE'}),
    });
    return {status:r.status,body:await r.json()};
  });
  expect(result.status).toBe(403);
  expect(result.body.status_code).toBe(403);
  expect(state.blocked).toContain('POST:/pay/submit-tx-hash/w60_parent');
  // Deliberately tests the fail-closed network fence, not the app's submit UI.
  expect(state.verifyCount).toBe(0);
});

const locales=['en-US','zh-CN','zh-TW','ja-JP','ko-KR','ru-RU'];
for(const locale of locales){
  test('W60 six-locale browser checkout '+locale+' is readable and does not leak provider secrets',async({page},info)=>{
    const state=await installSandbox(page);
    await page.goto('/cashier/w60_parent');
    await expect(page.locator('.checkout-state')).toBeVisible();
    const language=page.locator('.preferences-controls select').last();
    await language.selectOption(locale);
    await expect(language).toHaveValue(locale);
    await expect(page.locator('.checkout-page h2')).not.toBeEmpty();
    await expect(page.locator('.checkout-destination')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('TEST_SECRET_MUST_NOT_RENDER');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,'checkout overflow locale='+locale).toBeLessThanOrEqual(2);
    await page.screenshot({path:info.outputPath('checkout-'+locale+'.png'),fullPage:true});
    assertNoUnsafeWrites(state);
  });
}
