import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const source=join(dir,'playwright-results.json');
const output=join(dir,'W60-BROWSER-RESULTS.md');
let data;
try {data=JSON.parse(readFileSync(source,'utf8'))}
catch(err) {console.error('Missing Playwright JSON results: '+err.message);process.exit(1)}
const stats=data.stats??{};
const expected=Number(stats.expected??0);
const unexpected=Number(stats.unexpected??0);
const flaky=Number(stats.flaky??0);
const skipped=Number(stats.skipped??0);
const duration=Number(stats.duration??0);
const minimum=50; // 2 Chromium profiles * >=25 independent real-browser cases
const passed=expected>=minimum&&unexpected===0&&flaky===0&&skipped===0;
const lines=[
 '# W60 isolated Chromium browser acceptance results',
 '',
 '| Property | Recorded value |',
 '|---|---|',
 '| Commit | '+(process.env.GITHUB_SHA??'local')+' |',
 '| Browser profiles | Chromium desktop 1280px; Chromium touch/mobile 375px |',
 '| Simulated backend | All /pay, /payments and /admin/api/v1 requests intercepted locally |',
 '| Required passing test executions | '+minimum+' |',
 '| Expected passes | '+expected+' |',
 '| Unexpected failures | '+unexpected+' |',
 '| Flaky tests | '+flaky+' |',
 '| Skipped tests | '+skipped+' |',
 '| Duration (ms) | '+duration+' |',
 '| Automated browser gate | '+(passed?'PASS':'BLOCKED')+' |',
 '',
 'The test-only fixture can simulate server SQL states but never performs',
 'a real transfer, settlement, OkPay order or merchant callback. This is',
 'not a production approval or evidence of a real-chain E2E payment.',
 '',
 'Release remains BLOCKED until separate production-like network and',
 'merchant receiver E2E, provider sandbox validation, operator review',
 'and deployment rollback rehearsal have been completed.',
 '',
];
writeFileSync(output,lines.join('\n'),'utf8');
console.log(lines.join('\n'));
if(!passed) process.exitCode=1;
