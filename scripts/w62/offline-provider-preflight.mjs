// Offline preflight ONLY: fail closed when exact OkPay protocol or testnet
// provenance is unverified. Never dial a provider or submit a transaction.
import {readFileSync} from 'node:fs';
const code=readFileSync('src/model/service/okpay_service.go','utf8');
const expected=[
 ['payLink endpoint',/base\.Path\s*=\s*path\.Join\(base\.Path,\s*"payLink"\)/],
 ['MD5 create signature',/md5\.Sum\(\[\]byte\(query\s*\+\s*"&token="\s*\+\s*shopToken\)\)/],
 ['merchant shop token',/data\.GetOkPayShopToken\(\)/],
 ['signed notify validation',/func verifyOkPayNotify\(/],
 ['provider ID and amount',/payload\.OrderID|payload\.Amount/],
];
for(const [title,pattern] of expected){
 if(!pattern.test(code)){console.error('BLOCK: Go provider contract changed: '+title);process.exit(1)}
}
const template=JSON.parse(readFileSync('docs/frontend-recovery/W62-APPROVAL-TEMPLATE.json','utf8'));
for(const id of ['EXT-TESTNET','EXT-OKPAY','EXT-MERCHANT-SANDBOX',
 'EXT-PWA-UPGRADE','EXT-VISUAL-APPROVAL','EXT-ROLLBACK']){
 const record=template.external?.[id];
 if(!record||record.status!=='BLOCKED'||record.approved_by!==null||
   record.evidence_sha256!==null) {
  console.error('W62 commit must not preapprove manual gate '+id);
  process.exit(1);
 }
}
console.log('PASS: Go exact /payLink MD5 contract audited offline; manual gates remain BLOCKED.');
