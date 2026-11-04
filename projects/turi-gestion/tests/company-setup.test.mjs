import test from 'node:test';
import assert from 'node:assert/strict';
import {TestDB} from './support/private-harness.mjs';
import worker from '../dist/server/index.js';
import {opaque,digest,unseal} from '../worker/security.js';
import {companyAccessState} from '../worker/company-setup.js';

// Synthetic accounts and credentials only. No hosted user or client is used.
const secret={portalUser:'QA-PORTAL-USER',portalPassword:'QA-PORTAL-SECRET',api:{username:'QA-API-USER',password:'QA-API-SECRET',subscriptionKey:'QA-SUBSCRIPTION-SECRET'}};
const base={pasCode:'000QA-007',taxId:'20123456786',authorized:true,expectedVersion:0};
function noSecrets(value){const text=JSON.stringify(value);for(const s of [secret.portalUser,secret.portalPassword,...Object.values(secret.api),'QA-TOKEN-ONLY-SERVER'])assert.ok(!text.includes(s));}
async function fixture(){
 const DB=new TestDB(),env={DB,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.alloc(32,4).toString('base64')},sessions={};
 for(const [id,role,tenant] of [['QA-MAURO-PAS','producer','QA-TURI'],['QA-PEER','producer','QA-TURI'],['QA-OTHER','producer','QA-OTHER'],['QA-ADMIN','superadmin','QA-TURI']]){
  DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,access_code_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,id,id,role,tenant,'fixture-no-login','','fixture-code-hash',Date.now());
  const session=opaque(),csrf=opaque();sessions[id]={session,csrf};DB.db.prepare('INSERT INTO pilot_sessions(id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,1,?,?)').run(digest(session),id,csrf,Date.now()+3600000,Date.now());
 }
 async function call(path,{as='QA-MAURO-PAS',data,method='POST',csrf=true}={}){
  const s=sessions[as];const response=await worker.fetch(new Request('https://turi.test/api/pilot'+path,{method,headers:{Origin:'https://turi.test','Content-Type':'application/json',...(s?{Cookie:'__Host-turi_session='+s.session,'X-Turi-CSRF':csrf?s.csrf:'invalid'}:{}),'CF-Connecting-IP':'192.0.2.49'},body:method==='GET'?undefined:JSON.stringify(data??{})}),env);return {status:response.status,data:await response.json()};
 }
 const save=(company,data=base,as)=>call('/company-setup/'+company,{data,as});
 async function payload(company='mercantil',actor='QA-MAURO-PAS'){
  const row=DB.db.prepare('SELECT * FROM pilot_connections WHERE producer_id=? AND company_id=?').get(actor,company);return {row,value:row?await unseal(env,row.encrypted_payload,`connection:${row.tenant_id}:${actor}:${company}:${row.version}`):null};
 }
 return {DB,env,call,save,payload};
}
test('diez compañías preparadas conservan el catálogo de quince y tienen guía oficial y pasos',async()=>{
 const f=await fixture(),r=await f.call('/companies',{method:'GET'});assert.equal(r.status,200);assert.equal(r.data.companies.length,15);const primary=r.data.companies.filter(c=>c.setup?.priority);assert.equal(primary.length,10);assert.equal(new Set(primary.map(c=>c.setup.priority)).size,10);assert.ok(primary.every(c=>c.setup.documentation.startsWith('https://')&&c.setup.steps.length>=3));assert.deepEqual(primary.filter(c=>c.setup.validation).map(c=>c.id),['mercantil']);
 for(const c of primary){const d=await f.call('/company-setup/'+c.id,{method:'GET'});assert.equal(d.status,200);assert.equal(d.data.record.pasConfigured,false);}
});
test('código obligatorio y credenciales opcionales se guardan cifrados; leer devuelve sólo indicadores',async()=>{
 const f=await fixture();assert.equal((await f.save('mercantil',{...base,pasCode:''})).status,400);
 const result=await f.save('mercantil',{...base,...secret});assert.equal(result.status,201);assert.equal(result.data.record.status,'credentials_saved');assert.equal(result.data.record.automaticQuotes,false);noSecrets(result.data);
 const {row,value}=await f.payload();noSecrets(row);assert.equal(value.pasCode,base.pasCode);assert.equal(companyAccessState(value).portal.password,secret.portalPassword);assert.equal(companyAccessState(value).taxId,'20-12345678-6');
 const view=await f.call('/company-setup/mercantil',{method:'GET'});assert.equal(view.data.record.pasHint,'••••-007');assert.equal(view.data.record.portalConfigured,true);assert.equal(view.data.record.apiConfigured.subscriptionKey,true);assert.equal(view.data.record.taxId,'20-12345678-6');noSecrets(view.data);
 const admin=await f.call('/admin/overview',{method:'GET',as:'QA-ADMIN'});noSecrets(admin.data);assert.ok(!JSON.stringify(admin.data).includes('20-12345678-6'));
 const audit=await f.call('/audit',{method:'GET'});noSecrets(audit.data);assert.ok(!JSON.stringify(audit.data).includes(base.pasCode));
});
test('campos vacíos conservan claves y código; modificar pares incompletos o CUIT inválido no altera datos',async()=>{
 const f=await fixture();await f.save('mercantil',{...base,...secret});
 const r=await f.save('mercantil',{expectedVersion:1,authorized:true,pasCode:'',taxId:'',portalUser:'',portalPassword:'',api:{username:'',password:'',subscriptionKey:''}});assert.equal(r.status,200);const before=await f.payload();assert.equal(before.value.pasCode,base.pasCode);assert.deepEqual(companyAccessState(before.value).api,companyAccessState((await f.payload()).value).api);assert.equal(companyAccessState(before.value).api.password,secret.api.password);
 for(const extra of [{portalUser:'new-user'},{portalPassword:'new-password'},{api:{username:'new-api'}},{api:{clientId:'only-id'}},{api:{endpoint:'https://intruso.invalid'}},{taxId:'20123456780'}]){
  const bad=await f.save('mercantil',{expectedVersion:2,authorized:true,...extra});assert.equal(bad.status,400);assert.deepEqual((await f.payload()).row,before.row);
 }
});
test('guardar credenciales de las diez nunca llama a la compañía ni anuncia conexión',async t=>{
 const f=await fixture();t.mock.method(globalThis,'fetch',async()=>{assert.fail('Saving settings must not contact an insurer');});const catalog=(await f.call('/companies',{method:'GET'})).data.companies;
 for(const c of catalog.filter(c=>c.setup?.priority)){const r=await f.save(c.id,{...base,...secret});assert.equal(r.status,201);assert.equal(r.data.record.qaAuthenticated,false);assert.equal(r.data.record.portfolioAvailable,false);}
 assert.equal(f.DB.db.prepare('SELECT count(*) AS n FROM pilot_connections').get().n,10);
});
test('productor ajeno, organización, administrador, CSRF y compañía inválida no exponen ni reemplazan accesos',async()=>{
 const f=await fixture();await f.save('mercantil',{...base,...secret});const original=(await f.payload()).row;
 for(const as of ['QA-PEER','QA-OTHER']){const r=await f.call('/company-setup/mercantil',{as,method:'GET'});assert.equal(r.data.record.pasConfigured,false);noSecrets(r.data);}
 assert.equal((await f.call('/company-setup/mercantil',{method:'GET',as:'QA-ADMIN'})).status,403);
 assert.equal((await f.call('/company-setup/mercantil',{data:{...base,expectedVersion:1},csrf:false})).status,403);
 assert.equal((await f.save('compania-inventada')).status,404);
 const peer=await f.save('mercantil',{...base,producerId:'QA-MAURO-PAS',tenantId:'QA-TURI'},'QA-PEER');assert.equal(peer.status,201);assert.deepEqual((await f.payload()).row,original);
});
test('control de versión y alta concurrente evitan duplicados y reemplazos inadvertidos',async()=>{
 const f=await fixture();const [a,b]=await Promise.all([f.save('mercantil',{...base,...secret}),f.save('mercantil',{...base,...secret})]);assert.deepEqual([a.status,b.status].sort(),[201,409]);assert.equal(f.DB.db.prepare('SELECT count(*) AS n FROM pilot_connections').get().n,1);
 const before=(await f.payload()).row;assert.equal((await f.save('mercantil',{...base,portalUser:'replacement',portalPassword:'replacement'})).status,409);assert.deepEqual((await f.payload()).row,before);
});
test('Mercantil valida las credenciales guardadas; cambiar API o código invalida la prueba y portal solo la conserva',async t=>{
 const f=await fixture();const saved=await f.save('mercantil',{...base,...secret});let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({access_token:'QA-TOKEN-ONLY-SERVER',token_type:'Bearer'});});
 const valid=await f.call('/connections/'+saved.data.record.id+'/mercantil-qa',{data:{expectedVersion:1,useSaved:true,authorized:true}});assert.equal(valid.status,200);assert.equal(calls,1);noSecrets(valid.data);
 const portal=await f.save('mercantil',{expectedVersion:2,authorized:true,portalUser:'QA-NEW-PORTAL',portalPassword:'QA-NEW-SECRET'});assert.equal(portal.data.record.qaAuthenticated,true);
 const api=await f.save('mercantil',{expectedVersion:3,authorized:true,api:{subscriptionKey:'QA-REPLACED-KEY'}});assert.equal(api.data.record.qaAuthenticated,false);assert.equal(api.data.record.status,'credentials_saved');assert.equal(calls,1);
 const row=(await f.payload()).row;const legacy=await f.call('/connections',{data:{companyId:'mercantil',method:'pas_only',pasCode:'NEW-QA-PAS',authorized:true,expectedVersion:row.version}});assert.equal(legacy.status,200);const kept=companyAccessState((await f.payload()).value);assert.equal(kept.api.subscriptionKey,'QA-REPLACED-KEY');assert.equal(kept.portal.password,'QA-NEW-SECRET');
});
test('revocar la sesión justo antes de escribir impide actualizar los accesos',async()=>{
 const f=await fixture();await f.save('mercantil',{...base,...secret});const before=(await f.payload()).row,prepare=f.DB.prepare.bind(f.DB);
 f.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('UPDATE pilot_connections SET method=')){const run=stmt.run.bind(stmt);stmt.run=async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run('QA-MAURO-PAS');return run();};}return stmt;};
 assert.equal((await f.save('mercantil',{expectedVersion:1,authorized:true,portalUser:'late',portalPassword:'late'})).status,409);assert.deepEqual((await f.payload()).row,before);
});
