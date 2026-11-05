import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantProbe,AssistantProbeError} from '../worker/assistants.js';
import {unseal} from '../worker/security.js';
import {fixture,preview,PAS,PEER,ADMIN,OTHER} from './support/supervision-fixture.mjs';

// Synthetic API keys and identities only. No provider receives a real credential.
const key='QA-ONLY-ASSISTANT-KEY-DO-NOT-USE',token='QA-ONLY-EPHEMERAL-DIRECT-LINE-TOKEN';
const config={expectedVersion:0,apiKey:key,model:'fixture-model',authorized:true};
const result=provider=>Response.json(provider==='gemini'?{models:[{name:'models/fixture'}]}:provider==='copilot'?{token,expires_in:1800,conversationId:'qa-conversation'}:{data:[{id:'fixture-model'}]});
const clean=value=>{const text=JSON.stringify(value);for(const secret of [key,token])assert.ok(!text.includes(secret));};
const save=(f,id='openai',options={})=>f.call('/assistants/'+id,{method:'POST',data:config,...options});

test('las cinco pruebas utilizan sólo endpoints oficiales, sin mensajes ni datos personales',async()=>{
 const expected={openai:'https://api.openai.com/v1/models',gemini:'https://generativelanguage.googleapis.com/v1beta/models',claude:'https://api.anthropic.com/v1/models',meta:'https://api.meta.ai/v1/models',copilot:'https://directline.botframework.com/v3/directline/tokens/generate'};
 for(const provider of Object.keys(expected)){
  let calls=0;const r=await assistantProbe(provider,{apiKey:key,region:'global',workspaceId:'workspace-fixture'},{fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,expected[provider]);assert.equal(options.redirect,'error');assert.equal(options.method,provider==='copilot'?'POST':'GET');assert.ok(!url.includes(key));
   if(provider==='gemini'){assert.equal(options.headers['x-goog-api-key'],key);assert.equal(options.headers['x-goog-api-client'],'turi-gestion/1.0');}
   else assert.equal(options.headers.Authorization,'Bearer '+key);
   if(provider==='claude'){assert.equal(options.headers['anthropic-version'],'2026-10-21');assert.equal(options.headers['anthropic-workspace-id'],'workspace-fixture');}
   assert.equal(options.body,provider==='copilot'?'{}':undefined);return result(provider);
  }});assert.deepEqual(r,{verified:true});assert.equal(calls,1);clean(r);
 }
});

test('una respuesta arbitraria, vacía, excesiva o un token incompleto no validan el acceso',async()=>{
 const invalid=[Response.json({}),Response.json({data:[]}),Response.json({data:[{}]}),new Response('<html>sign in</html>'),new Response('x'.repeat(270000))];
 for(const response of invalid)await assert.rejects(assistantProbe('openai',{apiKey:key},{fetchImpl:async()=>response}),e=>e instanceof AssistantProbeError&&e.code==='RESPONSE');
 await assert.rejects(assistantProbe('copilot',{apiKey:key},{fetchImpl:async()=>Response.json({token})}),e=>e.code==='RESPONSE');
});

test('rechazos, redirecciones y fallos del proveedor no exponen sus cuerpos ni secretos',async()=>{
 for(const [status,code] of [[401,'CREDENTIALS'],[403,'CREDENTIALS'],[429,'RATE_LIMIT'],[302,'UNAVAILABLE'],[503,'UNAVAILABLE']]){
  await assert.rejects(assistantProbe('openai',{apiKey:key},{fetchImpl:async()=>new Response(key+' '+token,{status})}),e=>{clean({message:e.message});return e.code===code;});
 }
 await assert.rejects(assistantProbe('openai',{apiKey:key},{fetchImpl:async()=>{throw Error(key);}}),e=>{clean({message:e.message});return e.code==='NETWORK';});
 await assert.rejects(assistantProbe('openai',{apiKey:key},{timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error(key))))}),e=>e.code==='TIMEOUT');
});

test('catálogo privado de cinco proveedores sin claves antes ni después de guardarlas',async()=>{
 const f=await fixture();let r=await f.call('/assistants');assert.equal(r.status,200);assert.deepEqual(r.data.providers.map(p=>p.id),['openai','gemini','claude','copilot','meta']);assert.ok(r.data.providers.every(p=>p.version===0&&!p.configured));
 assert.equal((await f.call('/assistants',{as:''})).status,401);assert.equal((await f.call('/assistants',{as:ADMIN})).status,403);
 const saved=await save(f);assert.equal(saved.status,201);assert.equal(saved.data.record.status,'configured');assert.equal(saved.data.record.apiKeyConfigured,true);assert.equal(saved.data.record.version,1);clean(saved.data);
 r=await f.call('/assistants');assert.equal(r.data.providers[0].model,'fixture-model');clean(r.data);
 const row=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get();clean(row);assert.equal(row.owner_id,PAS);const decrypted=await unseal(f.env,row.encrypted_payload,'assistant:QA-TURI:'+PAS+':openai:1');assert.equal(decrypted.apiKey,key);
});

test('guardar vacío conserva la clave y los controles de versión impiden pisar cambios',async()=>{
 const f=await fixture();await save(f);
 const update=await save(f,'openai',{data:{expectedVersion:1,apiKey:'',model:'another-model',authorized:true}});assert.equal(update.status,200);assert.equal(update.data.record.version,2);assert.equal(update.data.record.apiKeyConfigured,true);
 assert.equal((await save(f)).status,409);const row=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get();assert.equal((await unseal(f.env,row.encrypted_payload,'assistant:QA-TURI:'+PAS+':openai:2')).apiKey,key);
});

test('claves, campos y proveedor se validan sin recibir endpoints arbitrarios',async()=>{
 const f=await fixture();
 for(const data of [{expectedVersion:0},{...config,apiKey:key+'\r\nInjected: yes'},{...config,apiKey:[]},{...config,model:'model\nname'},{...config,workspaceId:'bad\nworkspace'}]){
  const id=data.workspaceId?'claude':'openai';assert.equal((await save(f,id,{data})).status,400);
 }
 assert.equal((await save(f,'copilot',{data:{...config,region:'https://attacker.invalid'}})).status,400);
 assert.equal((await f.call('/assistants/custom',{method:'POST',data:config})).status,404);
 assert.equal((await f.call('/assistants/openai',{method:'DELETE',data:{}})).status,405);
});

test('la conexión pertenece al PAS autenticado y no puede moverse mediante IDs enviados',async()=>{
 const f=await fixture();await save(f);
 for(const as of [PEER,OTHER]){const r=await f.call('/assistants',{as});assert.ok(r.data.providers.every(p=>!p.configured));assert.equal((await save(f,'openai',{as,data:{...config,ownerId:PAS}})).status,403);assert.equal((await f.call('/assistants/openai/test',{as,method:'POST',data:{expectedVersion:0}})).status,400);}
 assert.equal((await save(f,'gemini',{data:{...config,tenantId:'OTHER'}})).status,403);
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_ai_connections').get().n,1);
});

test('origen, CSRF y roles protegen el guardado normal y delegado',async()=>{
 const f=await fixture();
 for(const headers of [{'X-Turi-CSRF':'invalid'},{Origin:'https://attacker.invalid'}]){assert.equal((await save(f,'openai',{headers})).status,403);assert.equal((await f.call(preview('/assistants/openai'),{as:ADMIN,method:'POST',data:config,headers})).status,403);}
 for(const as of [PAS,PEER,OTHER])assert.equal((await f.call(preview('/assistants/openai'),{as,method:'POST',data:config})).status,403);
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_ai_connections').get().n,0);
});

test('Superadmin guarda en la vista PAS con su actor real y sin cambiar sesiones del productor',async()=>{
 const f=await fixture(),before=f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS);
 const r=await f.call(preview('/assistants/meta'),{as:ADMIN,method:'POST',data:config});assert.equal(r.status,201,JSON.stringify(r.data));clean(r.data);
 const row=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get();assert.equal(row.owner_id,PAS);assert.equal(row.provider,'meta');assert.equal(f.DB.db.prepare("SELECT actor_id FROM pilot_audit WHERE action='supervision.assistant.created'").get().actor_id,ADMIN);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS),before);
 const listed=await f.call(preview('/assistants'),{as:ADMIN});assert.equal(listed.status,200);assert.equal(listed.data.providers.find(p=>p.id==='meta').configured,true);
 assert.equal((await f.call(preview('/assistants',OTHER),{as:ADMIN})).status,404);
});

test('validar cada proveedor persiste sólo confirmación y una nueva versión cifrada',async t=>{
 const f=await fixture();let expected='';t.mock.method(globalThis,'fetch',async()=>result(expected));
 for(const provider of ['openai','gemini','claude','copilot','meta']){
  expected=provider;assert.equal((await save(f,provider)).status,201);const r=await f.call('/assistants/'+provider+'/test',{method:'POST',data:{expectedVersion:1}});assert.equal(r.status,200,provider+': '+JSON.stringify(r.data));assert.equal(r.data.verified,true);assert.equal(r.data.record.version,2);assert.equal(r.data.record.status,'verified');assert.ok(r.data.record.verifiedAt);clean(r.data);
 }
 const rows=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').all();clean(rows);assert.equal(rows.length,5);assert.ok(rows.every(row=>row.status==='verified'));
});

test('una prueba fallida retira la validación anterior sin filtrar el error externo',async t=>{
 const f=await fixture();await save(f);t.mock.method(globalThis,'fetch',async()=>result('openai'));await f.call('/assistants/openai/test',{method:'POST',data:{expectedVersion:1}});
 t.mock.method(globalThis,'fetch',async()=>new Response(key+' '+token,{status:401}));const r=await f.call('/assistants/openai/test',{method:'POST',data:{expectedVersion:2}});assert.equal(r.status,200);assert.equal(r.data.verified,false);assert.equal(r.data.record.status,'failed');assert.equal(r.data.record.verifiedAt,null);assert.equal(r.data.record.version,3);clean(r.data);clean(f.DB.db.prepare('SELECT * FROM pilot_audit').all());
});

test('una sesión revocada durante la consulta al proveedor no puede confirmar la conexión',async t=>{
 const f=await fixture();await save(f);const before=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get();
 t.mock.method(globalThis,'fetch',async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(PAS);return result('openai');});
 const r=await f.call('/assistants/openai/test',{method:'POST',data:{expectedVersion:1}});assert.equal(r.status,401);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get(),before);
});

test('la sesión de Superadmin sigue siendo obligatoria durante una prueba delegada',async t=>{
 const f=await fixture();await f.call(preview('/assistants/copilot'),{as:ADMIN,method:'POST',data:config});const before=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get();
 t.mock.method(globalThis,'fetch',async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(ADMIN);return result('copilot');});
 assert.equal((await f.call(preview('/assistants/copilot/test'),{as:ADMIN,method:'POST',data:{expectedVersion:1}})).status,401);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_ai_connections').get(),before);
});

test('la guarda SQL impide guardar si se revoca la sesión justo antes de escribir',async()=>{
 const f=await fixture(),prepare=f.DB.prepare.bind(f.DB);
 f.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO pilot_ai_connections')){const run=statement.run.bind(statement);statement.run=async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(ADMIN);return run();};}return statement;};
 const r=await f.call(preview('/assistants/claude'),{as:ADMIN,method:'POST',data:config});assert.equal(r.status,409);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_ai_connections').get().n,0);
});

test('cambiar configuración invalida una prueba previa y la clave de cada PAS permanece aislada',async t=>{
 const f=await fixture();await save(f);t.mock.method(globalThis,'fetch',async()=>result('openai'));await f.call('/assistants/openai/test',{method:'POST',data:{expectedVersion:1}});
 const r=await save(f,'openai',{data:{expectedVersion:2,model:'new-model',authorized:true}});assert.equal(r.data.record.status,'configured');assert.equal(r.data.record.verifiedAt,null);
 await save(f,'openai',{as:PEER});const rows=f.DB.db.prepare('SELECT * FROM pilot_ai_connections').all();assert.equal(rows.length,2);assert.notEqual(rows[0].encrypted_payload,rows[1].encrypted_payload);
});

test('guardar exige confirmar la autorización también en el servidor',async()=>{
 const f=await fixture();
 for(const authorized of [undefined,false,'true']){
  const r=await save(f,'openai',{data:{...config,authorized}});
  assert.equal(r.status,400);assert.equal(r.data.error,'AUTHORIZATION_REQUIRED');
 }
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_ai_connections').get().n,0);
});
