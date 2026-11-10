import {afterEach,describe,expect,it,vi} from 'vitest';
import {dashboardApi,dashboardQuery,decodeOrderStats,decodeOverview,decodeRpcSnapshot,decodeTrend} from './dashboard';
afterEach(()=>vi.unstubAllGlobals());
const base={total_asset:1,volume:2,order_count:10,success_rate:0.8,
  seven_day_volume:3,active_addresses:5,online_chains:2};
const orders={order_count:10,success_count:8,success_rate:0.8,
  avg_payment_seconds:120.5,expired_unpaid_count:1};
const rpc={generated_at:'2026-11-10T10:00:00Z',
  summary:{total_chains:1,enabled_chains:1,active_chains:0,ok_chains:0,warning_chains:0,
    down_chains:0,unknown_chains:1,disabled_chains:0,success_count:0,failure_count:0,
    success_rate:0},
  chains:[{network:'tron',display_name:'TRON',enabled:true,has_data:false,status:'unknown',
    success_count:0,failure_count:0,success_rate:0,latest_block_height:0,last_sync_at:''}]};
const envelope=(data:unknown)=>new Response(JSON.stringify({
  status_code:200,message:'OK',data,request_id:''}),{status:200});
describe('W43 real metrics and units',()=>{
  it('preserves 0..1 fractions and seconds, rejects fake percentage or incomplete KPI',()=>{
    expect(decodeOverview(base).success_rate).toBe(0.8);
    expect(decodeOrderStats(orders).avg_payment_seconds).toBe(120.5);
    expect(()=>decodeOrderStats({...orders,success_rate:80})).toThrow();
    expect(()=>decodeOverview({...base,order_count:'10'})).toThrow();
  });
  it('uses Unix seconds for custom range',()=>{
    expect(dashboardQuery({range:'7d'})).toBe('?range=7d');
    expect(dashboardQuery({range:'custom',startAt:1000,endAt:2000}))
      .toBe('?range=custom&start_at=1000&end_at=2000');
    expect(()=>dashboardQuery({range:'custom',startAt:2000,endAt:1000})).toThrow();
  });
  it('validates trend bucket counts, and RPC has_data=false must not be called 0% success',()=>{
    expect(decodeTrend([{day:'2026-11-10',order_count:2,success_count:1,
      total_amount:5,actual_amount:2}])[0].order_count).toBe(2);
    expect(()=>decodeTrend([{day:'today'}])).toThrow();
    expect(decodeRpcSnapshot(rpc).chains[0].has_data).toBe(false);
    expect(()=>decodeRpcSnapshot({...rpc,chains:[{...rpc.chains[0],enabled:1}]})).toThrow();
  });
  it('requests real JSON snapshot rather than parsing SSE as JSON',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async(url)=>{
      const p=String(url);
      return envelope(p.includes('overview')?base:p.includes('order-stats')?orders:
        p.includes('revenue-trend')?[]:rpc);
    });
    vi.stubGlobal('fetch',fetcher);
    await Promise.all([dashboardApi.overview({range:'today'}),dashboardApi.orders({range:'today'}),
      dashboardApi.trend({range:'today'}),dashboardApi.rpc()]);
    expect(fetcher.mock.calls.map(c=>c[0])).toEqual([
      '/admin/api/v1/dashboard/overview?range=today',
      '/admin/api/v1/dashboard/order-stats?range=today',
      '/admin/api/v1/dashboard/revenue-trend?range=today',
      '/admin/api/v1/dashboard/rpc-stats/snapshot',
    ]);
  });
});
