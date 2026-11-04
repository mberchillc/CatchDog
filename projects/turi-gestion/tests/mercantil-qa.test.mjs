import test from 'node:test';
import assert from 'node:assert/strict';
import {TestDB} from './support/private-harness.mjs';
import worker from '../dist/server/index.js';
import {opaque,digest,unseal} from '../worker/security.js';
import {companyAccessState} from '../worker/company-setup.js';
import {MQA_TOKEN_URL,MercantilQaError,mercantilQaAuthenticate,mercantilQaCredentials} from '../worker/mercantil-qa.js';

// All credentials, PAS codes, users and responses in this file are synthetic.
const creds={username:'qa-fixture-user',password:'NOT-A-REAL-API-PASSWORD +&',subscriptionKey:'NOT-A-REAL-SUBSCRIPTION-KEY'};
const form={apiUsername:creds.username,apiPassword:creds.password,subscriptionKey:creds.subscriptionKey,authorized:true,expectedVersion:1};
const token='NOT_A_REAL_ACCESS_TOKEN';
const approved=()=>Response.json({access_token:token,token_type:'Bearer',expires_in:300});
function noSecrets(value){const text=JSON.stringify(value);for(const secret of [creds.password,creds.subscriptionKey,token])assert.ok(!text.includes(secret));}

test('QA usa sólo el endpoint oficial, el body de la guía y cabecera sin secretos en la URL o resultado',async()=>{
 let count=0;
 const result=await mercantilQaAuthenticate(creds,{fetchImpl:async(url,opts)=>{count++;assert.equal(url,MQA_TOKEN_URL);assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.equal(opts.headers['Ocp-Apim-Subscription-Key'],creds.subscriptionKey);const b=new URLSearchParams(opts.body);assert.equal(b.get('client_id'),'api-clientes-login');assert.equal(b.get('grant_type'),'password');assert.equal(b.get('username'),creds.username);assert.equal(b.get('password'),creds.password);return approved();}});
 assert.equal(count,1);assert.equal(result.authenticated,true);assert.equal(result.environment,'qa');assert.equal(result.portfolioAvailable,false);assert.equal(result.pasAttributionVerified,false);assert.equal(result.automaticQuotes,false);noSecrets(result);
});
test('rechazos del proveedor nunca devuelven sus cuerpos ni credenciales',async()=>{
 for(const [http,expected] of [[401,'MERCANTIL_QA_CREDENTIALS'],[403,'MERCANTIL_QA_SUBSCRIPTION'],[429,'MERCANTIL_QA_RATE_LIMIT'],[500,'MERCANTIL_QA_UNAVAILABLE'],[302,'MERCANTIL_QA_UNAVAILABLE']]){
  await assert.rejects(mercantilQaAuthenticate(creds,{fetchImpl:async()=>new Response(creds.password+' '+token,{status:http})}),e=>{assert.equal(e.code,expected);noSecrets({message:e.message});return true;});
 }
});
test('no se valida una respuesta vacía, HTML, demasiado grande o sin access_token',async()=>{
 for(const response of [Response.json({}),Response.json({access_token:''}),Response.json({access_token:token,token_type:'Other'}),new Response('<html>login</html>'),new Response('x'.repeat(66000))]){
  await assert.rejects(mercantilQaAuthenticate(creds,{fetchImpl:async()=>response}),e=>e.code==='MERCANTIL_QA_RESPONSE');
 }
});
test('faltantes, encabezados con saltos y usuario de ejemplo se rechazan antes de cualquier llamada',()=>{
 for(const value of [{},{...form,subscriptionKey:'key\r\nx: injected'},{...form,apiPassword:''},{...form,apiUsername:'USUARIODETEST'}])assert.throws(()=>mercantilQaCredentials(value),e=>e instanceof MercantilQaError&&e.status===400);
 assert.deepEqual(mercantilQaCredentials(form),creds);
});
test('timeout y fallo de red se comunican sin filtrar el error externo',async()=>{
 await assert.rejects(mercantilQaAuthenticate(creds,{timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error(token))))}),e=>e.status===504&&e.code==='MERCANTIL_QA_TIMEOUT');
 await assert.rejects(mercantilQaAuthenticate(creds,{fetchImpl:async()=>{throw Error(creds.password)}}),e=>{noSecrets({message:e.message});return e.status===502;});
});

async function fixture(){
 const DB=new TestDB(),env={DB,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.alloc(32,7).toString('base64')},sessions={};
 for(const [id,role,tenant] of [['QA-MAURO-PAS','producer','QA-TURI'],['QA-PEER','producer','QA-TURI'],['QA-OTHER','producer','QA-OTHER'],['QA-ADMIN','superadmin','QA-TURI']]){
  DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,access_code_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,id,id,role,tenant,'fixture-no-login','','fixture-code-hash',Date.now());
  const session=opaque(),csrf=opaque();sessions[id]={session,csrf};DB.db.prepare('INSERT INTO pilot_sessions(id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,1,?,?)').run(digest(session),id,csrf,Date.now()+3600000,Date.now());
 }
 async function call(path,{as='QA-MAURO-PAS',data,method='POST',csrf=true}={}){
  const s=sessions[as];const response=await worker.fetch(new Request('https://turi.test/api/pilot'+path,{method,headers:{Origin:'https://turi.test','Content-Type':'application/json',...(s?{Cookie:'__Host-turi_session='+s.session,'X-Turi-CSRF':csrf?s.csrf:'invalid'}:{}),'CF-Connecting-IP':'192.0.2.47'},body:method==='GET'?undefined:JSON.stringify(data??{})}),env);
  return {status:response.status,data:await response.json()};
 }
 const c=await call('/connections',{data:{companyId:'mercantil',pasCode:'TEST-PAS-0007',method:'pas_only',authorized:true}});assert.equal(c.status,201);
 return {DB,env,call,id:c.data.id,path:'/connections/'+c.data.id+'/mercantil-qa'};
}
test('la prueba exige sesión, CSRF, titular y compañía correctos antes de contactar al proveedor',async t=>{
 const f=await fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return approved()});
 assert.equal((await f.call(f.path,{as:'',data:form})).status,401);
 assert.equal((await f.call(f.path,{csrf:false,data:form})).status,403);
 for(const as of ['QA-PEER','QA-OTHER'])assert.equal((await f.call(f.path,{as,data:form})).status,404);
 assert.equal((await f.call(f.path,{as:'QA-ADMIN',data:form})).status,403);
 const sc=await f.call('/connections',{data:{companyId:'cristobal',pasCode:'TEST-OTHER-0008',method:'pas_only',authorized:true}});
 assert.equal((await f.call('/connections/'+sc.data.id+'/mercantil-qa',{data:form})).status,409);
 assert.equal(calls,0);
});
test('autenticación válida guarda credenciales cifradas para el titular y conserva el código PAS',async t=>{
 const f=await fixture();t.mock.method(globalThis,'fetch',async()=>approved());
 const result=await f.call(f.path,{data:form});assert.equal(result.status,200);assert.equal(result.data.status,'qa_auth_verified');assert.equal(result.data.automaticQuotes,false);assert.equal(result.data.pasAttributionVerified,false);noSecrets(result.data);
 const row=f.DB.db.prepare('SELECT * FROM pilot_connections WHERE id=?').get(f.id);assert.equal(row.version,2);assert.equal(row.method,'mercantil_qa');noSecrets(row);
 const p=await unseal(f.env,row.encrypted_payload,'connection:QA-TURI:QA-MAURO-PAS:mercantil:2');assert.equal(p.pasCode,'TEST-PAS-0007');const access=companyAccessState(p);for(const k of Object.keys(creds))assert.equal(access.api[k],creds[k]);
 const view=await f.call('/work/integrations',{method:'GET'});assert.equal(view.data.integrations[0].access_status,'qa_auth_verified');noSecrets(view.data);
 const admin=await f.call('/admin/overview',{method:'GET',as:'QA-ADMIN'});noSecrets(admin.data);assert.equal(admin.data.automaticQuotes,false);
 const activity=await f.call('/audit',{method:'GET'});assert.ok(activity.data.events.some(e=>e.action==='connection.mercantil_qa_authenticated'));noSecrets(activity.data);
});
test('un rechazo externo conserva el código y no se interpreta como vencimiento de sesión de Turi',async t=>{
 const f=await fixture(),before=f.DB.db.prepare('SELECT * FROM pilot_connections WHERE id=?').get(f.id);t.mock.method(globalThis,'fetch',async()=>new Response(token,{status:401}));
 const result=await f.call(f.path,{data:form});assert.equal(result.status,422);assert.equal(result.data.error,'MERCANTIL_QA_CREDENTIALS');noSecrets(result.data);
 assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_connections WHERE id=?').get(f.id),before);
 assert.equal((await f.call('/connections',{method:'GET'})).status,200);
});
test('el control de versión impide llamar con datos desactualizados o guardar sobre cambios concurrentes',async t=>{
 const f=await fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;f.DB.db.prepare('UPDATE pilot_connections SET version=2 WHERE id=?').run(f.id);return approved();});
 assert.equal((await f.call(f.path,{data:{...form,expectedVersion:0}})).status,409);assert.equal(calls,0);
 const before=f.DB.db.prepare('SELECT encrypted_payload FROM pilot_connections WHERE id=?').get(f.id);
 assert.equal((await f.call(f.path,{data:form})).status,409);assert.equal(calls,1);assert.equal(f.DB.db.prepare('SELECT encrypted_payload FROM pilot_connections WHERE id=?').get(f.id).encrypted_payload,before.encrypted_payload);
});
test('revocar la sesión durante la llamada externa impide guardar el acceso',async t=>{
 const f=await fixture();t.mock.method(globalThis,'fetch',async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run('QA-MAURO-PAS');return approved();});
 assert.equal((await f.call(f.path,{data:form})).status,401);assert.equal(f.DB.db.prepare('SELECT version FROM pilot_connections WHERE id=?').get(f.id).version,1);
});
test('el límite local evita reintentos ilimitados contra el usuario API',async t=>{
 const f=await fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:401});});
 for(let i=0;i<5;i++)assert.equal((await f.call(f.path,{data:form})).status,422);
 assert.equal((await f.call(f.path,{data:form})).status,429);assert.equal(calls,5);
});
