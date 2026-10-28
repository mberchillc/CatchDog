import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {startStandalone} from '../scripts/serve.mjs';
const root=resolve('.sites-runtime');mkdirSync(root,{recursive:true});
function temp(){return mkdtempSync(join(root,'standalone-test-'))}
function cleanup(path){const target=resolve(path);if(!target.startsWith(root+sep))throw Error('Target outside test workspace');rmSync(target,{recursive:true,force:true})}
function envelope(bytes,meta){const json=new TextEncoder().encode(JSON.stringify(meta)),out=new Uint8Array(4+json.length+bytes.length);new DataView(out.buffer).setUint32(0,json.length,false);out.set(json,4);out.set(bytes,4+json.length);return out;}
const password='Contraseña ficticia del entorno independiente!';
async function call(runtime,path,{method='GET',data,bytes,session,headers={}}={}){return fetch(runtime.baseUrl+path,{method,headers:{...(method==='POST'?{Origin:runtime.baseUrl,'Content-Type':bytes?'application/octet-stream':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-Turi-CSRF':session.csrf}:{}),...headers},body:bytes||(data?JSON.stringify(data):undefined)})}
async function auth(response){assert.equal(response.status,200,await response.clone().text());return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrf}}
async function setup(runtime){const token=new URLSearchParams(new URL(runtime.setupUrl).hash.slice(1)).get('setup');return auth(await call(runtime,'/api/setup',{method:'POST',data:{token,username:'adminlocal',name:'Administrador local',password,passwordConfirmation:password}}))}

test('servidor independiente conserva cuentas, clientes, claves y PDF después de reiniciar',async()=>{
 const directory=temp();let app;try{app=await startStandalone({dataDir:directory,port:0});assert.equal((await call(app,'/privado/')).status,200);assert.equal((await call(app,'/api/pilot/status')).status,200);const admin=await setup(app);
 const created=await call(app,'/api/pilot/admin/producers',{method:'POST',session:admin,data:{username:'paslocal',name:'PAS ficticio',password,passwordConfirmation:password}});assert.equal(created.status,201);const account=await created.json();const pas=await auth(await call(app,'/api/pilot/auth/login',{method:'POST',data:{username:'paslocal',password,code:account.accessCode}}));
 const clientResponse=await call(app,'/api/pilot/work/clients',{method:'POST',session:pas,data:{name:'PRUEBA - Cliente persistente'}});assert.equal(clientResponse.status,201);const client=(await clientResponse.json()).record;
 const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),meta={ownerId:account.user.id,clientId:client.id,filename:'prueba.pdf',category:'other',title:'PRUEBA PDF',bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')};const upload=await call(app,'/api/pilot/documents',{method:'POST',session:pas,bytes:envelope(pdf,meta),headers:{'X-Turi-Upload-ID':randomUUID()}});assert.equal(upload.status,201,await upload.clone().text());const document=(await upload.json()).document;const keys=readFileSync(join(directory,'keys.json'),'utf8');for(const f of readdirSync(join(directory,'objects')))assert.ok(!readFileSync(join(directory,'objects',f)).includes(Buffer.from('%PDF')));
 await app.close();app=null;app=await startStandalone({dataDir:directory,port:0});assert.equal(app.setupUrl,null);assert.equal(readFileSync(join(directory,'keys.json'),'utf8'),keys);const clients=await call(app,'/api/pilot/work/overview',{session:pas});assert.equal(clients.status,200);assert.equal((await clients.json()).clients[0].name,'PRUEBA - Cliente persistente');const download=await call(app,'/api/pilot/documents/'+document.id+'/download',{session:pas});assert.equal(download.status,200);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),pdf);assert.equal((await call(app,'/api/pilot/admin/overview',{session:pas})).status,403);
 }finally{if(app)await app.close();cleanup(directory)}
});

test('primer inicio exige el permiso local y se cierra al crear el administrador',async()=>{
 const directory=temp();let app;try{app=await startStandalone({dataDir:directory,port:0});assert.equal((await call(app,'/configurar/')).status,200);assert.equal((await call(app,'/api/setup',{method:'POST',data:{token:'equivocado',username:'adminlocal',password,passwordConfirmation:password}})).status,403);const token=new URLSearchParams(new URL(app.setupUrl).hash.slice(1)).get('setup');assert.equal((await call(app,'/api/setup',{method:'POST',data:{token,username:'adminlocal',password,passwordConfirmation:password},headers:{Origin:'https://evil.test'}})).status,403);const admin=await setup(app);assert.equal((await call(app,'/api/setup',{method:'POST',data:{token,username:'segundo',password,passwordConfirmation:password}})).status,409);assert.equal((await call(app,'/configurar/')).status,404);assert.equal((await call(app,'/api/pilot/admin/overview',{session:admin})).status,200);assert.equal(await new Promise((ok,no)=>{http.get(app.baseUrl+'/',{headers:{Host:'evil.test'}},r=>{r.resume();ok(r.statusCode)}).on('error',no)}),400);
 }finally{if(app)await app.close();cleanup(directory)}
});
