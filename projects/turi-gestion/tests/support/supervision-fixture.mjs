import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {TestDB,TestBucket} from './private-harness.mjs';
import {opaque,digest} from '../../worker/security.js';
import worker from '../../dist/server/index.js';

// All identities, clients and secrets in this fixture are isolated synthetic data.
export const PAS='QA-MAURO-PAS',PEER='QA-PEER',ADMIN='QA-ADMIN',OTHER='QA-OTHER';
export const preview=(path,id=PAS)=>'/supervision/'+id+path;
export async function fixture(){
 const DB=new TestDB(),BUCKET=new TestBucket(),env={DB,BUCKET,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.alloc(32,4).toString('base64')},sessions={};
 for(const [id,role,tenant,name] of [[PAS,'producer','QA-TURI','PAS ficticio de Mauro'],[PEER,'producer','QA-TURI','Segundo PAS ficticio'],[OTHER,'producer','QA-OTHER','PAS de otra organización'],[ADMIN,'superadmin','QA-TURI','Superadmin ficticio']]){
  DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,access_code_hash,created_at,email,email_verified) VALUES (?,?,?,?,?,?,?,?,?,?,1)').run(id,id.toLowerCase(),name,role,tenant,'fixture-no-login','','fixture-code-hash',Date.now(),'qa-'+id.toLowerCase()+'@example.invalid');
  const token=opaque(),csrf=opaque();sessions[id]={cookie:'__Host-turi_session='+token,csrf,id:digest(token)};
  DB.db.prepare('INSERT INTO pilot_sessions(id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,1,?,?)').run(digest(token),id,csrf,Date.now()+3600000,Date.now()-3000);
 }
 async function response(path,{as=PAS,method='GET',data,bytes,headers={}}={}){
  const s=sessions[as];return worker.fetch(new Request('https://turi.test'+path,{method,headers:{Origin:'https://turi.test','Content-Type':bytes?'application/octet-stream':'application/json',...(s?{Cookie:s.cookie,'X-Turi-CSRF':s.csrf}:{}),'CF-Connecting-IP':'192.0.2.51',...headers},...(method==='GET'||method==='HEAD'?{}:{body:bytes??JSON.stringify(data??{})})}),env);
 }
 async function call(path,options){const r=await response('/api/pilot'+path,options),json=(r.headers.get('content-type')||'').includes('application/json');return {status:r.status,data:json?await r.json():null,bytes:json?null:new Uint8Array(await r.arrayBuffer()),response:r};}
 async function create(type,data,as=PAS){const r=await call('/work/'+type,{method:'POST',data,as});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.record;}
 async function receive(as=PAS,name='Cliente ficticio de prueba'){
  const c=await create('emission',{branch:'Autos',title:'Solicitud ficticia',data:{}},as),s=await call('/work/emission/'+c.id+'/share',{method:'POST',as,data:{expectedVersion:c.version}});
  assert.equal(s.status,200);const token=new URLSearchParams(new URL(s.data.url).hash.slice(1)).get('token');
  const r=await call('/public/emission/submit',{method:'POST',as:'',data:{id:c.id,token,data:{holder_name:name,owner_same:'yes'},fileIds:[],consent:true}});assert.equal(r.status,201);
  return {id:c.id,responseId:r.data.receipt.responseId};
 }
 async function upload(clientId,as=PAS){
  const bytes=new Uint8Array(readFileSync('public/assets/logo.png')),meta={ownerId:as,clientId,filename:'foto-ficticia.png',category:'other',title:'Foto de prueba',notes:'',bytes:bytes.length,sha256:digest(bytes)},json=new TextEncoder().encode(JSON.stringify(meta)),framed=new Uint8Array(4+json.length+bytes.length);
  new DataView(framed.buffer).setUint32(0,json.length,false);framed.set(json,4);framed.set(bytes,4+json.length);
  const r=await call('/documents',{method:'POST',as,bytes:framed,headers:{'X-Turi-Upload-ID':crypto.randomUUID()}});assert.equal(r.status,201,JSON.stringify(r.data));return {document:r.data.document,bytes};
 }
 return {DB,BUCKET,env,sessions,response,call,create,receive,upload};
}
export const wait=async(fn,details=()=> '')=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail(details()||'La interfaz no llegó al estado esperado');};
export async function ui(f,{as=PAS,producerId='',page='companies'}={}){
 const path=producerId?'/admin/vista-pas/'+producerId+'/':'/privado/',dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test'+path+'#view='+page,runScripts:'outside-only'}),w=dom.window,calls=[];
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.structuredClone=structuredClone;w.AbortController=AbortController;
 w.fetch=async(input,options={})=>{const url=new URL(input,w.location);calls.push({path:url.pathname+url.search,method:options.method||'GET'});const s=f.sessions[as];return worker.fetch(new Request(url,{...options,headers:{Origin:'https://turi.test',...options.headers,Cookie:s.cookie,'CF-Connecting-IP':'192.0.2.51'}}),f.env);};
 const blobs=[];w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:qa-'+blobs.length};w.URL.revokeObjectURL=()=>{};w.Blob=Blob;
 for(const file of ['amounts.js','intake-fields.js','supervision.js','notifications.js','emission.js','multiquote.js','documents.js','company-setup.js','assistants.js','workspace.js','pilot.js'])w.eval(readFileSync('public/'+file,'utf8'));
 await wait(()=>w.document.querySelector('.w-sidebar')||w.document.querySelector('[role="alert"]')?.textContent,()=>w.document.body.textContent);
 const close=()=>{w.TuriWorkspace?.leave();w.close();};return {dom,w,calls,blobs,close};
}
