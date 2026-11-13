// W62: single ephemeral loopback origin, switchable between committed src/www
// and unmodified web/dist. No Go proxy, no network I/O to external services.
// The replacement SW is intentionally a *test-only* migration prototype.
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const roots={
  old:resolve(here,'../../src/www'),
  candidate:resolve(here,'../dist'),
};
const ctrl=process.env.W62_CONTROL_TOKEN;
const ready=process.env.W62_READY_FILE;
if(process.env.W62_ISOLATED!=='1'||ctrl!=='w62-isolated-only'||!ready)
 throw new Error('W62 same-origin staging must be isolated');
let mode='old';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json',
  '.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json','.woff2':'font/woff2',
  '.woff':'font/woff','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{
  if(req.socket.remoteAddress!=='127.0.0.1'){
    res.writeHead(403);return res.end('loopback only');
  }
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-W62-Isolated-Origin','1');
  const url=new URL(req.url??'/', 'http://127.0.0.1');
  const p=url.pathname;
  if(p==='/__w62/health'&&req.method==='GET'){
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({isolated:true,mode}));
  }
  if(p==='/__w62/mode'&&req.method==='POST'){
    if(req.headers['x-w62-control']!==ctrl){
      res.writeHead(403);return res.end('control only');
    }
    const next=req.headers['x-w62-mode'];
    if(next!=='old'&&next!=='candidate'){
      res.writeHead(400);return res.end('invalid mode');
    }
    mode=next;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({mode}));
  }
  if(p.startsWith('/pay/')||p.startsWith('/payments/')||p.startsWith('/admin/api/')){
    res.writeHead(403);return res.end('W62 no external payment or admin backend');
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405);return res.end();
  }
  // The existing legacy SW source and its bundle bytes are never edited.
  // Only the candidate-mode /sw.js is a staged, test-only migration worker.
  let file;
  if(p==='/sw.js'&&mode==='candidate')file=resolve(here,'w62-upgrade-sw.js');
  else {
    const root=roots[mode];
    let name;
    try{name=decodeURIComponent(p);}catch{res.writeHead(400);return res.end();}
    if(name.includes('\\')||name.includes('\0')){
      res.writeHead(403);return res.end();
    }
    file=extname(name)?resolve(root,'.'+name):resolve(root,'index.html');
    if(file!==root&&!file.startsWith(root+sep)){
      res.writeHead(403);return res.end();
    }
  }
  try{
    const stat=statSync(file);
    if(!stat.isFile())throw Error('not a file');
    const content=readFileSync(file);
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
    if(p==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
    res.writeHead(200);return res.end(req.method==='HEAD'?undefined:content);
  }catch{
    res.writeHead(404);return res.end('W62 static asset not found');
  }
});
server.listen(0,'127.0.0.1',()=>{
 const address=server.address();
 writeFileSync(ready,JSON.stringify({port:address.port,pid:process.pid})+'\n',{mode:0o600});
 console.log('W62 same-origin test server ready localhost');
});
