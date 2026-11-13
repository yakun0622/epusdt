// W62 independent, *separate OS process* merchant test receiver.
// No DB, provider or chain access. Only accepts loopback and synthetic w62_ IDs.
// MUST NOT run in production or behind a public reverse proxy.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

if (process.env.W62_ISOLATED !== '1' ||
    !process.env.W62_MERCHANT_SECRET ||
    !process.env.W62_STATE_FILE ||
    !process.env.W62_READY_FILE ||
    !process.env.W62_CONTROL_TOKEN ||
    !process.env.W62_STATE_FILE.includes('w62-')) {
  throw new Error('W62 independent merchant: isolation variables missing; refuse start');
}
const secret=process.env.W62_MERCHANT_SECRET;
const stateFile=process.env.W62_STATE_FILE;
const control=process.env.W62_CONTROL_TOKEN;
let journal={version:1,requests:0,rejected:0,orders:{}};
try {journal=JSON.parse(readFileSync(stateFile,'utf8'));} catch (err) {
  if(err.code!=='ENOENT')throw err;
}
if(journal.version!==1||!journal.orders||typeof journal.orders!=='object')
  throw new Error('corrupt or unknown merchant journal; stop instead of resetting');
function persist() {
  mkdirSync(dirname(stateFile),{recursive:true});
  const tmp=stateFile+'.tmp-'+process.pid;
  const fd=openSync(tmp,'w',0o600);
  try {
    writeFileSync(fd,JSON.stringify(journal,null,2)+'\n');
    fsyncSync(fd);
  } finally {closeSync(fd);}
  renameSync(tmp,stateFile);
}
function equalHex(a,b){
  if(!/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function canonical(body) {
  return Object.keys(body).filter(k=>k!=='signature'&&body[k]!==''&&body[k]!=null)
    .sort().map(k=>k+'='+String(body[k])).join('&');
}
function signatureValid(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  const expected=createHmac('sha256',secret).update(canonical(body)).digest('hex');
  return equalHex(body.signature,expected);
}
const srv=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.socket.remoteAddress!=='127.0.0.1'){
    res.writeHead(403);return res.end('loopback only');
  }
  if(req.url==='/__w62/evidence'&&req.method==='GET'){
    if(req.headers['x-w62-control']!==control){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify(journal));
  }
  if(req.url!=='/merchant/notify'||req.method!=='POST'){
    res.writeHead(404);return res.end();
  }
  let chunks=[],size=0;
  try {
    for await (const chunk of req) {
      size+=chunk.length;
      if(size>32_768){res.writeHead(413);return res.end();}
      chunks.push(chunk);
    }
  }catch{res.writeHead(400);return res.end();}
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch {journal.rejected++;persist();res.writeHead(400);return res.end('invalid json')}
  const delivery=req.headers['x-epusdt-delivery-id'];
  const valid=body&&typeof body.trade_id==='string'&&/^w62_[a-z0-9_]{3,96}$/.test(body.trade_id)&&
    body.pid==='test-token'&&
    body.status===2&&body.token==='USDT'&&body.actual_amount>0&&body.amount>0&&
    typeof body.order_id==='string'&&typeof body.block_transaction_id==='string'&&
    delivery==='epusdt:'+body.trade_id&&signatureValid(body);
  if(!valid){
    journal.rejected++;persist();
    res.writeHead(403);return res.end('invalid merchant signature or synthetic trade');
  }
  const id=delivery;
  const binding=[body.trade_id,body.order_id,body.pid,body.block_transaction_id,
    String(body.amount),String(body.actual_amount),body.receive_address,body.token].join('|');
  const existing=journal.orders[id];
  if(existing&&existing.binding!==binding){
    journal.rejected++;persist();res.writeHead(409);return res.end('delivery ID conflict');
  }
  if(!existing){
    journal.orders[id]={binding,effects:1,attempts:0,firstFailed:false};
  }
  const record=journal.orders[id];
  record.attempts++;
  journal.requests++;
  if(!record.firstFailed&&process.env.W62_FIRST_ACK_LOST==='1'){
    record.firstFailed=true;
    persist(); // *Merchant business effect has committed* before ACK error.
    res.writeHead(503);return res.end('simulated lost ACK after merchant commit');
  }
  persist();
  res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');
});
srv.listen(0,'127.0.0.1',()=>{
  const address=srv.address();
  mkdirSync(dirname(process.env.W62_READY_FILE),{recursive:true});
  writeFileSync(process.env.W62_READY_FILE,JSON.stringify({port:address.port,pid:process.pid})+'\n',{mode:0o600});
  console.log('w62 independent merchant listening on localhost ephemeral port');
});
