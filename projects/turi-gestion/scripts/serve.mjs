// Standalone MVP server: SQLite and encrypted originals on disk; no Sites or ChatGPT account required.
import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';
import {opaque,equal,passwordHash} from '../worker/security.js';
import {DiskDB,DiskBucket,localKeys} from './disk-storage.mjs';
import {setupHtml,setupJs} from './setup-page.mjs';
const loopback=value=>value==='127.0.0.1'||value==='::1'||value==='::ffff:127.0.0.1';
export async function startStandalone({dataDir=process.env.TURI_DATA_DIR||'.turi-data',host='127.0.0.1',port=Number(process.env.PORT||5173),publicOrigin=process.env.TURI_PUBLIC_ORIGIN||''}={}){
 const directory=resolve(dataDir),keys=localKeys(directory),DB=new DiskDB(directory),BUCKET=new DiskBucket(resolve(directory,'objects'));
 const env={DB,BUCKET,TURI_AUTH_PEPPER:keys.authPepper,TURI_VAULT_KEY:keys.vaultKey,RESEND_API_KEY:process.env.RESEND_API_KEY,TURI_MAIL_FROM:process.env.TURI_MAIL_FROM};
 const isEmpty=()=>DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n===0;
 if(isEmpty()&&(!loopback(host)||publicOrigin)){DB.close();throw Error('Creá primero tu cuenta iniciando en localhost. Después podés habilitar el acceso externo con HTTPS.');}
 let setupToken=isEmpty()?opaque():'',pending=Promise.resolve();
 const siteOrigin=publicOrigin?new URL(publicOrigin).origin:'';if(siteOrigin&&!siteOrigin.startsWith('https://')){DB.close();throw Error('TURI_PUBLIC_ORIGIN debe ser una dirección HTTPS.');}
 const reply=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const server=http.createServer((req,res)=>{const task=async()=>{try{
  const address=server.address(),localHosts=new Set(['localhost:'+address.port,'127.0.0.1:'+address.port,'[::1]:'+address.port]),requestHost=req.headers.host||'';
  if(siteOrigin?requestHost!==new URL(siteOrigin).host:!localHosts.has(requestHost)){res.writeHead(400);res.end('Abrí la dirección configurada para Turi.');return;}
  const origin=siteOrigin||'http://'+requestHost,url=new URL(req.url,origin),headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');
  const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>11*1024*1024){res.writeHead(413);res.end('El archivo supera el límite de carga.');return;}chunks.push(chunk)}const bytes=Buffer.concat(chunks);
  let response;
  if(url.pathname==='/configurar/'||url.pathname==='/configurar'){
   if(req.method!=='GET')response=reply({message:'Operación no disponible.'},405);else if(!isEmpty()||!loopback(req.socket.remoteAddress))response=reply({message:'El primer inicio ya está completo.'},404);else response=new Response(setupHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'",'X-Frame-Options':'DENY'}});
  }else if(url.pathname==='/setup.js'){response=new Response(setupJs,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
  }else if(url.pathname==='/api/setup'){
   if(req.method!=='POST'||headers.get('origin')!==origin||!loopback(req.socket.remoteAddress))response=reply({message:'Abrí el formulario de primer inicio desde localhost.'},403);
   else if(!isEmpty())response=reply({message:'La administración ya fue creada.'},409);
   else{let b;try{if(!headers.get('content-type')?.startsWith('application/json')||bytes.length>24576)throw Error();b=JSON.parse(bytes.toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))throw Error()}catch{response=reply({message:'Revisá el formulario.'},400)}
    if(!response){const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';if(!setupToken||!equal(String(b.token||''),setupToken))response=reply({message:'Abrí el enlace de primer inicio de la terminal.'},403);
     else if(!/^[a-z][a-z0-9._-]{2,39}$/.test(username)||b.password!==b.passwordConfirmation)response=reply({message:'Revisá el usuario y que las contraseñas coincidan.'},400);
     else{let hash;try{hash=passwordHash(b.password,keys.authPepper)}catch{response=reply({message:'Usá una contraseña de entre 14 y 128 caracteres.'},400)}
      if(!response){const id='LOCAL-ADMIN-'+opaque(12);DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,username,String(b.name||'Administrador de pruebas').trim().slice(0,120),'superadmin','TURI-LOCAL',hash,'',Date.now());setupToken='';response=await worker.fetch(new Request(origin+'/api/pilot/auth/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':req.socket.remoteAddress||'local'},body:JSON.stringify({username,password:b.password})}),env);}
     }
    }
   }
  }else response=await worker.fetch(new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&bytes.length?{body:bytes}:{} )}),env);
  const outgoing={};response.headers.forEach((value,key)=>{if(key!=='set-cookie')outgoing[key]=value});const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies;res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message:'No pudimos completar la operación.'}));}};const next=pending.then(task);pending=next.catch(()=>{});});
 server.requestTimeout=30000;server.headersTimeout=10000;
 await new Promise((ok,no)=>{server.once('error',no);server.listen(port,host,ok)});const actualPort=server.address().port,baseUrl='http://localhost:'+actualPort;
 return {server,env,dataDir:directory,baseUrl,setupUrl:setupToken?baseUrl+'/configurar/#setup='+setupToken:null,close:async()=>{await new Promise(ok=>server.close(ok));await pending;DB.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]},runtime=await startStandalone({host:arg('--host')||'127.0.0.1',port:Number(arg('--port')||process.env.PORT||5173)});
 console.log('Turi Gestión: '+runtime.baseUrl);if(runtime.setupUrl)console.log('Primer inicio: '+runtime.setupUrl);else console.log('Administración: '+runtime.baseUrl+'/admin/');console.log('Los datos y PDF se conservan en el directorio local privado.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await runtime.close();process.exit(0)});
}
