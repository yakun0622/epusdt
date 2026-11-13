import { test, expect } from '@playwright/test';
import { installSandbox, orderFixture, assertNoUnsafeWrites, TEST_TRON_ADDRESS, TEST_TX, TEST_CHILD } from './sandbox.mjs';

async function open(page,id='w60_parent') {
  await page.goto('/cashier/'+id);
  await expect(page.locator('.checkout-page')).toBeVisible();
  await expect(page.locator('.checkout-page .checkout-state')).toBeVisible();
}

test('W60 W52 pending checkout refresh is GET-only, no invented paid state',async({page})=>{
  const state=await installSandbox(page);
  await open(page);
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  await expect(page.locator('.checkout-address')).toContainText(TEST_TRON_ADDRESS);
  await page.getByRole('button',{name:'Refresh status'}).click();
  await expect.poll(()=>state.calls.filter(x=>x.path.includes('/pay/check-status/')).length).toBeGreaterThanOrEqual(2);
  expect(state.calls.every(x=>x.method==='GET')).toBe(true);
  await expect(page.locator('.checkout-state')).not.toContainText('Payment confirmed');
  assertNoUnsafeWrites(state);
});

test('W60 W52 offline read recovers using GET without retrying switch/settlement',async({page})=>{
  const state=await installSandbox(page,{readFailures:1});
  await page.goto('/cashier/w60_parent');
  await expect(page.getByRole('alert')).toContainText('Payment details cannot be verified');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  expect(state.calls.some(x=>x.method!=='GET')).toBe(false);
  assertNoUnsafeWrites(state);
});

test('W60 SQL paid requires independent consistent order/reconciliation confirmation',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{
    status:2,rootStatus:2,paidConfirmed:false,requiresReview:false,
  })]});
  await open(page);
  await expect(page.locator('.checkout-state')).toContainText('Reconciliation required');
  await expect(page.locator('.checkout-state')).not.toContainText('Payment confirmed');
  state.orders.get('w60_parent').paidConfirmed=true; // isolated SQL fixture switch, no POST
  await page.getByRole('button',{name:'Refresh status'}).click();
  await expect(page.locator('.checkout-state')).toContainText('Payment confirmed');
  assertNoUnsafeWrites(state);
});

test('W60 parent with child hides stale receiving address and navigates to child',async({page})=>{
  const parent=orderFixture('w60_parent',{
    relatedTradeId:TEST_CHILD,relatedStatus:1,canSwitch:true,
  });
  const child=orderFixture(TEST_CHILD,{
    rootTradeId:'w60_parent',relatedTradeId:'w60_parent',relatedStatus:1,
    canSwitch:false,
  });
  const state=await installSandbox(page,{orders:[parent,child]});
  await open(page);
  await expect(page.locator('.checkout-state')).toContainText('Child checkout selected');
  await expect(page.locator('.checkout-destination')).toHaveCount(0);
  await page.getByRole('button',{name:'Open child checkout'}).click();
  await expect(page).toHaveURL(/\/cashier\/w60_child$/);
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  await expect(page.locator('.checkout-address')).toContainText(TEST_TRON_ADDRESS);
  expect(state.switchCount).toBe(0);
  assertNoUnsafeWrites(state);
});

test('W60 passed deadline remains awaiting server confirmation, explicit SQL status 3 expires',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{
    expiresAt:Date.now()-1000,status:1,rootStatus:1,
  })]});
  await open(page);
  await expect(page.locator('.checkout-state')).toContainText('Payment deadline elapsed');
  await expect(page.locator('.checkout-destination')).toHaveCount(0);
  state.orders.get('w60_parent').status=3;
  state.orders.get('w60_parent').rootStatus=3;
  await page.getByRole('button',{name:'Refresh status'}).click();
  await expect(page.locator('.checkout-state')).toContainText('Order expired');
  assertNoUnsafeWrites(state);
});

test('W60 W51 placeholder chooses network/token in isolated fixture, exactly one switch POST',async({page})=>{
  const placeholder=orderFixture('w60_parent',{
    status:4,rootStatus:4,address:'',network:'',token:'',actualAmount:0,
    canSwitch:true,isSelected:false,
  });
  const state=await installSandbox(page,{orders:[placeholder]});
  await open(page);
  await expect(page.locator('.checkout-state')).toContainText('Payment method not selected');
  await page.getByLabel('Payment method').selectOption('onchain');
  await page.getByLabel('Choose network').selectOption('ethereum');
  await page.getByLabel('Choose token').selectOption('USDC');
  await page.getByRole('button',{name:'Confirm payment selection'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Submit once'}).click();
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  const writes=state.calls.filter(x=>x.path==='/pay/switch-network');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0].body)).toEqual({trade_id:'w60_parent',network:'ethereum',token:'USDC'});
  await expect(page.locator('.checkout-destination')).toBeVisible();
  assertNoUnsafeWrites(state);
});

test('W60 W51 switching an existing parent creates child only in isolated server fixture',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{canSwitch:true})]});
  await open(page);
  await page.getByLabel('Choose network').selectOption('ethereum');
  await page.getByRole('button',{name:'Confirm payment selection'}).click();
  await page.getByRole('button',{name:'Submit once'}).click();
  await expect(page).toHaveURL(/\/cashier\/w60_child$/);
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  expect(state.switchCount).toBe(1);
  const root=state.orders.get('w60_parent');
  expect(root.relatedTradeId).toBe(TEST_CHILD);
  await page.getByRole('button',{name:'Refresh status'}).click();
  expect(state.switchCount).toBe(1);
  assertNoUnsafeWrites(state);
});

test('W60 W51 server status-conflict never creates a second child nor claims expiry',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{canSwitch:true})],
    switchFailure:10010});
  await open(page);
  await page.getByLabel('Choose network').selectOption('ethereum');
  await page.getByRole('button',{name:'Confirm payment selection'}).click();
  await page.getByRole('button',{name:'Submit once'}).click();
  await expect(page.getByRole('alert')).toContainText('Order changed while selecting');
  expect(state.switchCount).toBe(1);
  await expect(page.locator('.checkout-state')).not.toContainText('Order expired');
  assertNoUnsafeWrites(state);
});

test('W60 W51 unknown provider switch locks further mutation; no auto provider order',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{canSwitch:true})],
    switchFailure:10042});
  await open(page);
  await page.getByLabel('Payment method').selectOption('okpay');
  await page.getByRole('button',{name:'Confirm payment selection'}).click();
  await page.getByRole('button',{name:'Submit once'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Further selections are blocked'}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm payment selection'})).toBeDisabled();
  expect(state.switchCount).toBe(1);
  assertNoUnsafeWrites(state);
});

test('W60 W53 hash verification checks evidence only; hostile paid flag is ignored',async({page})=>{
  const state=await installSandbox(page);
  await open(page);
  await page.getByLabel('Transaction hash / network reference').fill(TEST_TX);
  await page.getByRole('button',{name:'Review verification request'}).click();
  await page.getByRole('button',{name:'Verify once'}).click();
  await expect(page.locator('.checkout-alert')).toContainText('Chain evidence verified');
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  expect(state.verifyCount).toBe(1);
  const verify=state.calls.find(x=>x.path==='/pay/verify-tx-hash/w60_parent');
  expect(JSON.parse(verify.body)).toEqual({block_transaction_id:TEST_TX});
  await page.getByRole('button',{name:'Refresh status'}).click();
  expect(state.verifyCount).toBe(1);
  expect(state.calls.some(x=>x.path.includes('submit-tx-hash'))).toBe(false);
  assertNoUnsafeWrites(state);
});

test('W60 W53 business error 10007 blocks replay, never marks paid',async({page})=>{
  const state=await installSandbox(page,{verifyFailure:10007});
  await open(page);
  await page.getByLabel('Transaction hash / network reference').fill(TEST_TX);
  await page.getByRole('button',{name:'Review verification request'}).click();
  await page.getByRole('button',{name:'Verify once'}).click();
  await expect(page.locator('.checkout-alert')).toContainText('already recorded');
  await expect(page.locator('.checkout-state')).toContainText('Awaiting payment');
  expect(state.verifyCount).toBe(1);
  assertNoUnsafeWrites(state);
});

test('W60 hosted OkPay never exposes token-bearing URL or on-chain Hash input',async({page})=>{
  const state=await installSandbox(page,{orders:[orderFixture('w60_parent',{
    provider:'okpay',providerStatus:'pending',address:'OKPAY',network:'tron',
    hasHostedPaymentLink:true,canSwitch:false,
  })]});
  await open(page);
  await expect(page.getByText('External payment provider')).toBeVisible();
  await expect(page.locator('.checkout-destination')).toHaveCount(0);
  await expect(page.getByLabel('Transaction hash / network reference')).toHaveCount(0);
  await expect(page.locator('a[href*="provider"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('TEST-CANARY');
  expect(state.switchCount).toBe(0);
  assertNoUnsafeWrites(state);
});
