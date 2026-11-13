import { test, expect } from '@playwright/test';
import { installSandbox, assertNoUnsafeWrites, orderFixture } from './sandbox.mjs';

async function signIn(page) {
  await page.goto('/sign-in');
  await page.getByLabel('Username').fill('w60-admin');
  await page.getByLabel('Password').fill('test-isolated-only');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('W60 unauthenticated protected route redirects, login restores destination, logout invalidates cookie',async({page})=>{
  const state=await installSandbox(page);
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(state.calls.some(x=>x.path==='/admin/api/v1/orders')).toBe(false);
  await page.getByLabel('Password').fill('test-only');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/orders/);
  await expect(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
  expect(state.loginCount).toBe(1);
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  assertNoUnsafeWrites(state);
});

test('W60 rejected login cannot leak admin data or manufacture an authenticated session',async({page})=>{
  const state=await installSandbox(page,{failLogin:true});
  await page.goto('/sign-in');
  await page.getByLabel('Password').fill('bad');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
  expect(state.calls.some(x=>x.path==='/admin/api/v1/orders')).toBe(false);
  assertNoUnsafeWrites(state);
});

test('W60 critical authenticated routes render without page crash or any writes',async({page})=>{
  const state=await installSandbox(page);
  await signIn(page);
  for(const [route,title] of [
    ['/dashboard','Dashboard'],['/orders','Orders'],['/addresses','Wallet addresses'],
    ['/chains','Payment networks'],['/rpc','RPC nodes'],['/keys','API keys'],
    ['/payment-setup','Payment setup'],['/settings','Settings'],
    ['/settings/appearance','Appearance'],['/account/password','Account security'],
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('main.content')).toBeVisible();
  }
  assertNoUnsafeWrites(state);
});

test('W60 invalid admin token is not accepted by client session validation',async({page})=>{
  const state=await installSandbox(page);
  await page.goto('/sign-in');
  await page.evaluate(()=>document.cookie='access_token='+encodeURIComponent(JSON.stringify('expired-test-token'))+'; Path=/');
  // Simulate the actual server's expired JWT, not a mock success.
  await page.route('**/admin/api/v1/auth/me',route=>route.fulfill({
    status:401,contentType:'application/json',
    body:JSON.stringify({status_code:401,message:'JWT expired',data:null}),
  }));
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel('Password')).toBeVisible();
  assertNoUnsafeWrites(state);
});

test('W60 mobile and desktop page screenshots have no horizontal document overflow',async({page},testInfo)=>{
  const state=await installSandbox(page,{orders:[orderFixture()]});
  await signIn(page);
  for(const width of [360,768,1280]) {
    await page.setViewportSize({width,height:850});
    await page.goto('/orders');
    await expect(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
    const excess=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(excess,'orders overflow at '+width+'px').toBeLessThanOrEqual(2);
    await page.screenshot({path:testInfo.outputPath('orders-'+width+'.png'),fullPage:true});
  }
  assertNoUnsafeWrites(state);
});
