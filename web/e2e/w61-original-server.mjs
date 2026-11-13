// W61 read-only original production asset mirror. Serves byte-for-byte
// checked-in src/www from localhost:4174 and NEVER proxies API / payments.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../src/www');
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json',
 '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon',
 '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain'};
createServer(async(req,res)=>{
  if(!req.url||req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405);return res.end();
  }
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}
  catch{res.writeHead(400);return res.end()}
  if(pathname.startsWith('/admin/api/')||pathname.startsWith('/pay/')||
     pathname.startsWith('/payments/')){
    res.writeHead(403);return res.end('W61 read-only original asset server: API forbidden');
  }
  const requested=resolve(root,'.'+pathname);
  if(requested!==root&&!requested.startsWith(root+sep)){
    res.writeHead(403);return res.end();
  }
  const filename=pathname==='/'||!extname(pathname)?resolve(root,'index.html'):requested;
  if(filename!==root&&!filename.startsWith(root+sep)){
    res.writeHead(403);return res.end();
  }
  try{
    const information=await stat(filename);
    if(!information.isFile())throw new Error('not a file');
    const bytes=await readFile(filename);
    res.writeHead(200,{'Content-Type':mimes[extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store','X-W61-Read-Only':'1'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end('original asset missing')}
}).listen(4174,'127.0.0.1',()=>console.log('W61 original static asset mirror: 4174'));
