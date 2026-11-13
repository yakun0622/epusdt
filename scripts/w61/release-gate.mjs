// W61 automated acceptance output. A green GitHub Action means the isolated
// regression gate passed; it MUST NOT imply that real testnet/provider/PWA
// migration or production release were approved.
import {writeFileSync} from 'node:fs';

const checks=[
  ['SCOPE','Source boundaries, src/www and W31 unmodified'],
  ['WEB','Types, Vitest and restored React build'],
  ['BROWSER','Actual Chromium / isolated Go API and legacy visual evidence'],
  ['GO','Scanner, wallet/amount/contract, settlement, callbacks and race regressions'],
  ['MYSQL57','MySQL 5.7 separate OS process crash/commit uncertainty'],
];
const automation=checks.map(([key,name])=>({
  id:'AUTO-'+key,description:name,
  status:process.env['W61_'+key+'_RESULT']==='success'?'PASS':'BLOCKED',
  evidence:'GitHub Actions job: '+key,
  detail:process.env['W61_'+key+'_RESULT']||'missing',
}));
const external=[
  {
    id:'EXT-TESTNET',status:'BLOCKED',
    description:'Real testnet token transfer / contract, destination, raw amount, block confirmations and chain receipt',
    detail:'No funded test-only wallet, issuer-confirmed test token, chain ID, RPC and independently checked transaction receipt supplied. Fake RPC events are not a testnet transfer.',
  },
  {
    id:'EXT-OKPAY',status:'BLOCKED',
    description:'Provider-confirmed OkPay official sandbox payLink, signed callback and transaction identity',
    detail:'No provider-confirmed sandbox hostname, shop ID/secret and written no-real-funds guarantee for the exact /payLink + MD5 protocol. Similar-named OPay/OkePay documents do NOT authorize requests.',
  },
  {
    id:'EXT-PWA-UPGRADE',status:'BLOCKED',
    description:'Same-origin old src/www PWA service worker upgrade to web/ without stale asset retention',
    detail:'Legacy has manifest.webmanifest, registerSW.js and sw.js but new web/ has no matching manifest/SW handoff. Comparing separate localhost origins is not a same-origin upgrade.',
  },
  {
    id:'EXT-VISUAL-APPROVAL',status:'BLOCKED',
    description:'Human-reviewed original vs new desktop/mobile screenshots and six-language layouts',
    detail:'Paired raw PNGs and pixel-change metadata are attached to Chromium artifacts; differing DOM/routes must be reviewed, never automatically marked equivalent.',
  },
  {
    id:'EXT-ROLLBACK',status:'BLOCKED',
    description:'Staging release, schema restore, cache invalidation and rollback rehearsal signed by operator',
    detail:'No deployment or destructive schema/production action permitted under W61. Independent approval required.',
  },
  {
    id:'EXT-MERCHANT-SANDBOX',status:'BLOCKED',
    description:'Independent external merchant sandbox receiver verification',
    detail:'Local httptest receiver proves delivery-header idempotency and lost ACK only; no separately managed merchant endpoint tested.',
  },
];
const all=[...automation,...external];
const autoReady=automation.every(x=>x.status==='PASS');
const releaseReady=all.every(x=>x.status==='PASS');
const commit=process.env.GITHUB_SHA||'local';
const result={phase:'W61',commit,generatedAt:new Date().toISOString(),
  automatedGate:autoReady?'PASS':'BLOCKED',
  productionRelease:releaseReady?'GO':'NO-GO',
  guarantees:['No live/mainnet transfer','No provider sandbox call without verified config','No production src/www sync','W31 untouched','No deployment'],
  checks:all,
};
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const lines=[
 '# W61 preproduction acceptance: '+result.productionRelease,
 '',
 'Commit: `'+commit+'` · generated '+result.generatedAt,
 '',
 'Automated isolated integration gate: **'+result.automatedGate+'**.',
 'Production release gate: **'+result.productionRelease+'**.',
 '',
 '| ID | Result | Required check | Evidence / reason |',
 '|---|---|---|---|',
 ...all.map(x=>'| '+x.id+' | '+x.status+' | '+esc(x.description)+' | '+esc(x.detail||x.evidence)+' |'),
 '',
 '## What was actually run',
 '',
 '- Real Chromium mobile/desktop browser (restored UI, legacy src/www read-only mirror). PNG screenshots and JSON comparison data require independent human signoff.',
 '- Real Go model/service and mq callbacks against isolated temporary databases; fake RPC/test tokens are contract fixtures, not payments.',
 '- Isolated MySQL 5.7: separate OS worker SIGKILL before COMMIT and after COMMIT-before-response; SQL read and immutable claim determine safe recovery.',
 '- Loopback HTTP merchant receives duplicate stable X-Epusdt-Delivery-ID without duplicate business effects after lost ACK/timeout.',
 '',
 '## Production safeguard',
 '',
 'There is **no automatic deployment, no real payment, no official OkPay order, no callback to a real merchant, no W31 changes and no src/www modifications**.',
 'Never replace a BLOCKED external gate with a mock PASS. Follow docs/frontend-recovery/W61-RELEASE-RUNBOOK.md for human approval.',
 '',
];
writeFileSync('W61-ACCEPTANCE.json',JSON.stringify(result,null,2)+'\n');
writeFileSync('W61-ACCEPTANCE.md',lines.join('\n'));
console.log(lines.join('\n'));
if(!autoReady)process.exitCode=1;
