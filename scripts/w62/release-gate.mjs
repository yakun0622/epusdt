// W62 production decision: automated test success NEVER clears an external gate.
// Only GitHub job verdicts are imported; no live secrets or payment endpoints.
import {readFileSync,writeFileSync} from 'node:fs';
const required=[
 ['SCOPE','W31, src/www and deployment unchanged'],
 ['PROVIDER','Offline exact /payLink MD5 verification and all external gates blocked'],
 ['WEB','React typecheck + existing Vitest + build'],
 ['MERCHANT','Independent Node receiver and Go signed real HTTP, restart and dedup'],
 ['PWA','Same-origin localhost legacy SW -> test-only migration -> rollback'],
 ['MYSQL57','W61 independent MySQL5.7 OS process crash/transaction test'],
 ['GO','W51–W61 full payment/chain regressions'],
 ['ROLLBACK','Disposable asset rollback integrity'],
];
const external=[
 ['EXT-TESTNET','Real testnet token transfer, chain ID, contract, destination, integer amount and min confirmations',
  'BLOCKED: no issuer-verified chain/test token + test-only wallet and independently checked receipt. Synthetic fixture is not a transfer.'],
 ['EXT-OKPAY','Exact production Go /payLink + MD5 provider official sandbox',
  'BLOCKED: provider identity, test-only base URL, shop ID/token and confirmed signed notification contract missing. OkePay Invoice/HMAC and okePay create_transaction are NOT interchangeable.'],
 ['EXT-MERCHANT-SANDBOX','External separately administered merchant sandbox idempotency',
  'BLOCKED: local independent Node process PASS does not establish third-party merchant integration or security sign-off.'],
 ['EXT-PWA-UPGRADE','Production-equivalent same-origin Workbox to web/ service worker migration',
  'BLOCKED: only disposable same-origin test migration shim exercised. New web/ has no approved shipped SW upgrade plan.'],
 ['EXT-VISUAL-APPROVAL','Human review of six-language desktop/mobile paired screenshots and payment flow',
  'BLOCKED: evidence screenshots/pixel metrics generated, named reviewer and approvals missing.'],
 ['EXT-ROLLBACK','Dedicated staging release, DB snapshot restore, SW cache verification and operator sign-off',
  'BLOCKED: only local asset rollback demonstrated; production and real preprod changes forbidden.'],
];
const rows=required.map(([id,description])=>({
 id:'AUTO-'+id,description,source:'GitHub job result',
 status:process.env['W62_'+id+'_RESULT']==='success'?'PASS':'BLOCKED',
 evidence:process.env['W62_'+id+'_RESULT']||'not run',
}));
const externalRows=external.map(([id,description,reason])=>({
 id,description,status:'BLOCKED',reason,requiresHumanApproval:true,
}));
const automatic=rows.every(x=>x.status==='PASS');
const out={phase:'W62',commit:process.env.GITHUB_SHA||'local',
 generated_at:new Date().toISOString(),automatic_gate:automatic?'PASS':'BLOCKED',
 production_release:'NO-GO',
 test_scope:'strictly localhost + isolated SQLite and MySQL 5.7; no real payment or provider API call',
 jobs:rows,external:externalRows,
 security:{production_www_unchanged:true,W31_not_implemented:true,
   mainnet_transactions:false,provider_orders:false,real_merchant_callbacks:false,auto_deployment:false},
};
const clean=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const lines=[
 '# W62 自动化与真实发布双闸门 · 生产 NO-GO','',
 '- SHA: `'+out.commit+'`',
 '- 生成时间: '+out.generated_at,
 '- **自动隔离验收：'+out.automatic_gate+'**',
 '- **生产发布：NO-GO**（外部六项验证尚未获得正式批准）','',
 '| ID | 状态 | 验证目标 | 证据/阻断原因 |','|---|---|---|---|',
 ...rows.map(x=>'| '+x.id+' | '+x.status+' | '+clean(x.description)+' | '+clean(x.evidence)+' |'),
 ...externalRows.map(x=>'| '+x.id+' | BLOCKED | '+clean(x.description)+' | '+clean(x.reason)+' |'),
 '',
 '### 自动测试与真实批准的区别',
 '',
 '- W62 商户接收器在独立 Node OS 进程上通过真实 localhost HTTP，模拟 ACK 丢失、重启与非法签名，仍非外部商户沙箱。',
 '- PWA 在同一个随机 localhost origin 上使用真实旧 Workbox SW 和仅限测试的迁移脚本验证缓存切换及资产回退，**不是已批准的生产 SW**。',
 '- 六语言手机/桌面截图应人工审阅每个 PNG；像素差异记录是审查材料，不构成视觉通过。',
 '- 按 W61 Go MySQL 5.7 事务前强杀和 COMMIT 后丢失响应测试，未触发任何主网或官方 OkPay 付款。',
 '- 不得因自动 CI 全绿将 BLOCKED 改为 PASS。需要独立负责人、沙箱凭据和交易/升级实证。',
 '',
 '相关说明：docs/frontend-recovery/W62-IMPLEMENTATION.md、W62-RELEASE-APPROVAL.md。',
];
writeFileSync('W62-ACCEPTANCE.json',JSON.stringify(out,null,2)+'\n');
writeFileSync('W62-ACCEPTANCE.md',lines.join('\n')+'\n');
console.log(lines.join('\n'));
if(!automatic)process.exitCode=1;
