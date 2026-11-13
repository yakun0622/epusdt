import { expect } from '@playwright/test';

// W60 ISOLATION CONTRACT: every /pay, /payments and /admin/api request is
// intercepted and fulfilled in the browser. The Vite proxy points at port 1,
// not Go. No real ledger, wallet, merchant or provider network is reachable.
export const TEST_TRON_ADDRESS = 'TW60IsolatedPayeeAddress000000000000';
export const TEST_TX = 'a'.repeat(64);
export const TEST_CHILD = 'w60_child';
const ok = data => ({status_code:200,message:'ok',data});
const failed = (code,message) => ({status_code:code,message,data:null});

export function orderFixture(id='w60_parent',overrides={}) {
  const now = Date.now();
  return {
    tradeId:id,status:1,rootTradeId:id,rootStatus:1,
    relatedTradeId:'',relatedStatus:null,
    provider:'on_chain',providerStatus:'none',paidConfirmed:false,
    requiresReview:false,amount:10,actualAmount:1.25,
    currency:'CNY',token:'USDT',network:'tron',address:TEST_TRON_ADDRESS,
    paymentType:'gmpay',createdAt:now-30_000,expiresAt:now+300_000,
    isSelected:true,canSwitch:false,hasHostedPaymentLink:false,
    ...overrides,
  };
}
function checkoutData(s) {
  return {
    trade_id:s.tradeId,status:s.status,amount:s.amount,actual_amount:s.actualAmount,
    currency:s.currency,token:s.token,network:s.network,
    receive_address:s.address,payment_type:s.paymentType,
    created_at:s.createdAt,server_time:Date.now(),expiration_time:s.expiresAt,
    is_selected:s.isSelected,can_switch:s.canSwitch,
    payment_url:s.hasHostedPaymentLink?'https://provider.invalid/payment/TEST-CANARY':'',
  };
}
function reconciliationData(s) {
  return {
    trade_id:s.tradeId,status:s.status,root_trade_id:s.rootTradeId,
    root_status:s.rootStatus,related_trade_id:s.relatedTradeId,
    related_status:s.relatedStatus,provider:s.provider,
    provider_status:s.providerStatus,
    paid_confirmed:s.paidConfirmed,requires_review:s.requiresReview,
    server_time:Date.now(),expiration_time:s.expiresAt,
  };
}
const paymentOptions = {
  supported_assets:[
    {network:'tron',display_name:'Tron',tokens:['USDT']},
    {network:'ethereum',display_name:'Ethereum',tokens:['USDT','USDC']},
  ],
  okpay:{enabled:true,allow_tokens:['USDT'],shop_token:'TEST_SECRET_MUST_NOT_RENDER'},
  version:'W60-test-only',site:{cashier_name:'W60 test'},
};
const adminOverview = {
  total_asset:0,volume:0,order_count:0,success_rate:0,
  seven_day_volume:0,active_addresses:0,online_chains:0,
};
const adminOrders = {
  order_count:0,success_count:0,success_rate:0,avg_payment_seconds:0,expired_unpaid_count:0,
};
const rpcSnapshot = {
  generated_at:new Date().toISOString(),
  summary:{total_chains:0,enabled_chains:0,active_chains:0,ok_chains:0,
    warning_chains:0,down_chains:0,unknown_chains:0,disabled_chains:0,
    success_count:0,failure_count:0,success_rate:0},
  chains:[],
};
const adminProfile = {
  id:1,username:'w60-admin',status:1,password_is_default:false,
  last_login_at:'',created_at:'',updated_at:'',
};

export async function installSandbox(page,{ orders=[orderFixture()], readFailures=0,
    switchFailure=null, verifyFailure=null, readErrorCode=null, failLogin=false }={}) {
  const state = {
    orders:new Map(orders.map(o=>[o.tradeId,o])),
    calls:[], blocked:[], readFailures,
    switchFailure,verifyFailure,readErrorCode,failLogin,
    switchCount:0,verifyCount:0,loginCount:0,
  };
  await page.route('**/*',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    const method=request.method();
    if(!['127.0.0.1','localhost'].includes(url.hostname)) {
      state.blocked.push('external:'+url.hostname);
      return route.abort();
    }
    const isAPI=/^\/(admin\/api\/v1|pay|payments)\//.test(path);
    if(!isAPI)return route.continue();
    state.calls.push({method,path,body:request.postData()});
    const reply=(data,httpStatus=200)=>route.fulfill({
      status:httpStatus,contentType:'application/json',
      headers:{'Cache-Control':'no-store'},body:JSON.stringify(data),
    });
    const parts=path.split('/');
    const id=decodeURIComponent(parts.at(-1));
    const row=state.orders.get(id);
    if(path.startsWith('/admin/api/v1/')){
      if(path==='/admin/api/v1/auth/login'&&method==='POST'){
        state.loginCount++;
        return state.failLogin?reply(failed(10002,'invalid credentials'),401):
          reply(ok({token:'W60_SANDBOX_ONLY',username:'w60-admin',user_id:1}));
      }
      if(path==='/admin/api/v1/auth/me'&&method==='GET')return reply(ok(adminProfile));
      if(path==='/admin/api/v1/auth/logout'&&method==='POST')return reply(ok(null));
      if(method!=='GET'){
        state.blocked.push(method+':'+path);
        return reply(failed(403,'W60 does not mutate admin records'),403);
      }
      if(path==='/admin/api/v1/orders')
        return reply(ok({list:[],total:0,page:1,page_size:10}));
      if(path==='/admin/api/v1/dashboard/overview')return reply(ok(adminOverview));
      if(path==='/admin/api/v1/dashboard/order-stats')return reply(ok(adminOrders));
      if(path==='/admin/api/v1/dashboard/revenue-trend')return reply(ok([]));
      if(path==='/admin/api/v1/dashboard/rpc-stats/snapshot')return reply(ok(rpcSnapshot));
      if(path==='/admin/api/v1/settings/rate/status')
        return reply(ok({mode:'fixed',cache_ttl_seconds:60,bases:[]}));
      if(['/admin/api/v1/wallets','/admin/api/v1/chains',
           '/admin/api/v1/chain-tokens','/admin/api/v1/rpc-nodes',
           '/admin/api/v1/api-keys','/admin/api/v1/settings',
           '/admin/api/v1/notification-channels'].includes(path))
        return reply(ok([]));
      state.blocked.push('unknown-admin:'+path);
      return reply(failed(404,'Unknown W60 sandbox endpoint'),404);
    }
    if(path==='/payments/gmpay/v1/config'&&method==='GET')return reply(ok(paymentOptions));
    if(path.startsWith('/pay/checkout-counter-resp/')&&method==='GET'){
      if(!row)return reply(failed(10008,'order not found'),404);
      return reply(ok(checkoutData(row)));
    }
    if(path.startsWith('/pay/check-status/')&&method==='GET'){
      if(state.readErrorCode!==null) {
        const code=state.readErrorCode;
        return reply(failed(code,'isolated server status conflict'),400);
      }
      if(state.readFailures>0){
        state.readFailures--;
        return reply(failed(500,'isolated network simulation'),500);
      }
      if(!row)return reply(failed(10008,'order not found'),404);
      return reply(ok({trade_id:id,status:row.status}));
    }
    if(path.startsWith('/pay/reconcile-status/')&&method==='GET'){
      if(!row)return reply(failed(10008,'order not found'),404);
      return reply(ok(reconciliationData(row)));
    }
    if(path==='/pay/switch-network'&&method==='POST'){
      state.switchCount++;
      if(state.switchFailure)return reply(failed(state.switchFailure,'simulated conflict'),400);
      const payload=JSON.parse(request.postData()||'{}');
      const parent=state.orders.get(payload.trade_id);
      if(!parent||!parent.canSwitch||![1,4].includes(parent.status)){
        return reply(failed(10010,'conflict'),400);
      }
      const destination=payload.network==='okpay'
        ? {token:payload.token,network:'tron',address:'OKPAY',provider:'okpay',
          providerStatus:'pending',hasHostedPaymentLink:true}
        : {token:payload.token,network:payload.network,address:TEST_TRON_ADDRESS,
          provider:'on_chain',providerStatus:'none',hasHostedPaymentLink:false};
      if(parent.status===4){
        Object.assign(parent,destination,{status:1,rootStatus:1,actualAmount:1.25,
          isSelected:true,canSwitch:true});
        return reply(ok(checkoutData(parent)));
      }
      const child=orderFixture(TEST_CHILD,{...destination,rootTradeId:parent.tradeId,
        relatedTradeId:parent.tradeId,relatedStatus:1,canSwitch:false,
        isSelected:true,actualAmount:1.25});
      state.orders.set(child.tradeId,child);
      parent.relatedTradeId=child.tradeId;
      parent.relatedStatus=1;
      return reply(ok(checkoutData(child)));
    }
    if(path.startsWith('/pay/verify-tx-hash/')&&method==='POST'){
      state.verifyCount++;
      if(!row||row.status!==1)return reply(failed(10010,'conflict'),400);
      if(state.verifyFailure)return reply(failed(state.verifyFailure,'verification failed'),400);
      return reply(ok({trade_id:id,verification:'verified',
        block_transaction_id:JSON.parse(request.postData()||'{}').block_transaction_id,
        // A test-only hostile extra field must NOT become authoritative paid state.
        status:2,paid:true,
      }));
    }
    // The real settlement endpoint and any unknown write always fail CLOSED.
    state.blocked.push(method+':'+path);
    return reply(failed(403,'W60 blocks real settlement and provider writes'),403);
  });
  return state;
}
export function assertNoUnsafeWrites(state) {
  expect(state.blocked,JSON.stringify(state.blocked)).toEqual([]);
  const mutations=state.calls.filter(x=>!['GET','HEAD'].includes(x.method));
  const allowed=new Set(['/pay/switch-network']);
  for(const call of mutations) {
    const safe=allowed.has(call.path)||call.path.startsWith('/pay/verify-tx-hash/')||
      ['/admin/api/v1/auth/login','/admin/api/v1/auth/logout'].includes(call.path);
    expect(safe,'unexpected write in isolated W60 E2E: '+call.path).toBe(true);
  }
  expect(state.calls.some(c=>c.path.startsWith('/pay/submit-tx-hash'))).toBe(false);
}
