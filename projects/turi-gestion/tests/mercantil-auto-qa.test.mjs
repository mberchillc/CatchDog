import test from 'node:test';
import assert from 'node:assert/strict';
import {TestDB} from './support/private-harness.mjs';
import worker from '../dist/server/index.js';
import {opaque,digest,unseal} from '../worker/security.js';
import {mercantilAutoQaOperation} from '../worker/mercantil-auto-qa.js';

// All identities, documents, PAS codes and credentials here are synthetic.
const credentials={username:'qa-auto-fixture',password:'NOT_REAL_API_PASSWORD',subscriptionKey:'NOT_REAL_API_KEY'},token='NOT_REAL_BEARER_TOKEN',account=700007;
const vehicle={codigo:111,infoauto:777001,nombre:'VEHICULO FICTICIO LT 3P',propulsion:1};
const quoteInput={localidad:{codigo_postal:1000},vehiculo:{infoauto:vehicle.infoauto,anio:2012,uso:1,gnc:false,rastreo:0},comision:10,bonificacion:0,periodo:1,cuotas:1,pago:{tipo_pago:'C'},ajuste_suma:0,iva:5,productor:{id:999}};
const subscribeInput={codigo_producto:800,tomador:{dni:10000001,sexo:'F'},vehiculo:{dominio:'ABC123',chasis:'FICTICIO000000001',motor:'FICTICIO00001'}};
const quote={id:'quote-fixture',productor:{id:account},vehiculo:{...quoteInput.vehiculo,nombre:vehicle.nombre},localidad:{codigo_postal:1000},suma_asegurada:1000000,resultado:[{codigo_producto:800,producto:'A',texto:'Responsabilidad civil TEST',costo:100,error:'',inspeccion:{opciones:[{id:null,descripcion:null}]}},{codigo_producto:801,producto:'B',texto:'Terceros TEST',costo:150,error:'',inspeccion:{opciones:[{id:'AUTOINSPECCION',descripcion:'Autoinspección'}]}}]};
const schemes=[{esquema:'TEST',comision:10,bonificacion:0,descripcion:'Esquema ficticio'}];
function noSecrets(v){for(const secret of [credentials.password,credentials.subscriptionKey,token])assert.ok(!JSON.stringify(v).includes(secret));}
function provider(log=[],override){return async(url,options)=>{const u=new URL(url);log.push({url:u.href,method:options.method,body:options.body});assert.equal(u.origin,'https://apidev.mercantilandina.com.ar');assert.equal(options.redirect,'manual');const special=await override?.(u,options);if(special)return special;
 if(u.pathname==='/credenciales/v2/')return Response.json({access_token:token,token_type:'Bearer'});
 if(u.pathname==='/productores/v1/')return Response.json({datos:[{cuenta:account,nombre:'Productor ficticio'}]});
 if(u.pathname==='/vehiculos/v1/')return Response.json({datos:[vehicle],cantidad:1,total:1});
 if(u.pathname.endsWith('/esquemas/auto'))return Response.json({productor:account,datos:schemes});
 if(u.pathname==='/cotizaciones/v2/auto')return Response.json(quote);
 if(u.pathname.startsWith('/suscripciones/v2/inspecciones/'))return Response.json({url:'https://inspeccion.example.test/qa'});
 if(u.pathname.startsWith('/suscripciones/v2/auto/'))return Response.json({solicitud:10001,poliza:90001,productor:{id:account},estado_solicitud:{codigo:'E',descripcion:'EMISION'}});
 if(u.pathname==='/clientes/v1/')return Response.json({id:77,dni:10000001,sexo:'F',nombre:'Cliente',apellido:'Ficticio'});
 if(u.pathname==='/clientes/v1/personas')return Response.json({id:77,dni:10000001,sexo:'F',nombre:'Cliente',apellido:'Ficticio',estado:'REVISAR',email:'PRIVATE_CONTACT_NEVER_EXPOSE'});
 if(u.pathname==='/generales/v1/actividades'){assert.equal(u.searchParams.get('limite'),'500');assert.equal(u.searchParams.get('pagina'),'0');return Response.json({content:[{id:'7',nombre:'JUBILADA'}],number:0,size:500,totalElements:1,totalPages:1,first:true,last:true});}
 if(u.pathname==='/solicitudes/v1/')return Response.json({items:[],total:0,cantidad:0});
 throw Error('Unexpected fixture endpoint '+u.pathname);
};}
async function fixture(){
 const DB=new TestDB(),env={DB,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.alloc(32,9).toString('base64')},sessions={};
 for(const [id,role,tenant] of [['QA-AUTO-PAS','producer','QA-AUTO'],['QA-PEER','producer','QA-AUTO'],['QA-ADMIN','superadmin','QA-AUTO'],['QA-OTHER','producer','OTHER']]){DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,access_code_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,id,id,role,tenant,'fixture','','fixture',Date.now());const session=opaque(),csrf=opaque();sessions[id]={session,csrf};DB.db.prepare('INSERT INTO pilot_sessions(id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,1,?,?)').run(digest(session),id,csrf,Date.now()+3600000,Date.now());}
 async function call(path,{as='QA-AUTO-PAS',data,method='POST',csrf=true}={}){const s=sessions[as];const response=await worker.fetch(new Request('https://turi.test/api/pilot'+path,{method,headers:{Origin:'https://turi.test','Content-Type':'application/json',...(s?{Cookie:'__Host-turi_session='+s.session,'X-Turi-CSRF':csrf?s.csrf:'invalid'}:{}),'CF-Connecting-IP':'192.0.2.60'},body:method==='GET'?undefined:JSON.stringify(data||{})}),env);return {status:response.status,data:await response.json()};}
 const saved=await call('/company-setup/mercantil',{data:{expectedVersion:0,pasCode:String(account),authorized:true,api:credentials}});assert.equal(saved.status,201);
 const id=saved.data.record.id;DB.db.prepare("UPDATE pilot_connections SET status='qa_auth_verified' WHERE id=?").run(id);
 const path='/connections/'+id+'/mercantil-qa/auto';
 const state=(caseId='legacy')=>call(path+'?case='+encodeURIComponent(caseId),{method:'GET'});
 const act=async(action,input={},options={})=>{const caseId=options.caseId||'legacy',before=await state(caseId);return call(path,{data:{expectedVersion:before.data.connectionVersion,authorized:true,environment:'qa',caseId,action,input},...options});};
 return {DB,env,call,id,path,state,act};
}
test('Automotores QA verifica productor, catálogo, esquemas y un host fijo; ignora un productor inyectado',async()=>{
 const log=[],fetchImpl=provider(log),options={fetchImpl};let state={};
 for(const [action,input] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['activities',{}],['quote',quoteInput]]){const r=await mercantilAutoQaOperation(credentials,String(account),action,input,state,options);state=r.state;assert.equal(r.environment,'qa');noSecrets(r);}
 const sent=JSON.parse(log.find(x=>x.url.endsWith('/cotizaciones/v2/auto')).body);assert.equal(sent.productor.id,account);assert.equal(sent.vehiculo.anio,2012);assert.equal(new URL(log.find(x=>x.url.includes('/vehiculos/')).url).searchParams.get('tipo'),'AUTO');assert.ok(!('id' in sent.localidad));
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'quote',{...quoteInput,comision:99},state,options),e=>e.code==='QA_SCHEME');
});
test('seguimiento conserva sólo la solicitud actual, busca su referencia y no convierte una derivación en emisión',async()=>{
 const state={subscription:{solicitud:'10001',poliza:'0',estado_solicitud:'DERIVACION',issued:false}},log=[];
 const fetchImpl=provider(log,url=>url.pathname==='/solicitudes/v1/'?Response.json({items:[{referencia:10001,poliza:0,estado:{codigo:'001',descripcion:'DERIVACION'},asegurado:{dni:'PRIVATE_NEVER_EXPOSE'}},{referencia:10002,poliza:88888,estado:'EMITIDA',nombre:'OTHER_PERSON_NEVER_EXPOSE'}]}):url.pathname.endsWith('/historia/listar')?Response.json({accion:'ASEGURAR',referencia:'10001',items:[{fecha:'2026-01-01',motivo:'Revisión TEST '+credentials.password,de:'STAFF_NEVER_EXPOSE'}]}):null);
 const r=await mercantilAutoQaOperation(credentials,String(account),'requests',{},state,{fetchImpl});
 assert.equal(new URL(log.find(x=>x.url.includes('/solicitudes/')).url).searchParams.get('q'),'10001');
 assert.equal(r.state.requestStatus.coincidencias.length,1);assert.equal(r.state.requestStatus.coincidencias[0].estado,'DERIVACION');assert.equal(r.state.subscription.issued,false);
 assert.equal(r.state.requestStatus.historiaDisponible,false);assert.ok(!log.some(x=>x.url.includes('/historia/')));noSecrets(r);assert.ok(!JSON.stringify(r).includes('STAFF_NEVER_EXPOSE'));
 assert.ok(!JSON.stringify(r).includes('PRIVATE_NEVER_EXPOSE'));assert.ok(!JSON.stringify(r).includes('OTHER_PERSON_NEVER_EXPOSE'));
 const empty=await mercantilAutoQaOperation(credentials,String(account),'requests',{},state,{fetchImpl:provider()});assert.equal(empty.state.requestStatus.coincidencias.length,0);assert.equal(empty.state.subscription.poliza,'0');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'requests',{},state,{fetchImpl:provider([],url=>url.pathname==='/solicitudes/v1/'?Response.json({unknown:[]}):null)}),e=>e.code==='QA_RESPONSE');
});
test('consulta de tomador usa la identidad guardada, informa REVISAR y no permite cambiarla desde el formulario',async()=>{
 const state={holder:{id:'77',dni:10000001,sexo:'F'},unresolved:{action:'inspection'}},log=[];
 const r=await mercantilAutoQaOperation(credentials,String(account),'clientStatus',{dni:99999999,sexo:'M'},state,{fetchImpl:provider(log)});
 const sent=new URL(log.find(x=>x.url.includes('/clientes/v1/personas')).url);assert.equal(sent.searchParams.get('dni'),'10000001');assert.equal(sent.searchParams.get('sexo'),'F');assert.equal(log.find(x=>x.url.includes('/clientes/v1/personas')).method,'GET');
 assert.equal(r.result.estado,'REVISAR');assert.equal(r.state.unresolved.action,'inspection');assert.ok(!JSON.stringify(r.result).includes('10000001'));assert.ok(!JSON.stringify(r.result).includes('PRIVATE_CONTACT_NEVER_EXPOSE'));
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'clientStatus',{},state,{fetchImpl:provider([],url=>url.pathname==='/clientes/v1/personas'?Response.json({id:78,dni:10000001,sexo:'F',estado:'ACTIVO'}):null)}),e=>e.code==='QA_CLIENT_MISMATCH');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'clientStatus',{}, {},{fetchImpl:provider()}),e=>e.code==='QA_CLIENT');
});
test('API permite consultar el tomador durante una inspección incierta y mantiene bloqueadas las altas',async t=>{
 const f=await fixture(),log=[];t.mock.method(globalThis,'fetch',provider(log,url=>url.pathname==='/cotizaciones/v2/auto'?Response.json({...quote,localidad:{id:111,codigo_postal:1000}}):url.pathname.includes('/suscripciones/v2/inspecciones/')?Response.json({message:'Fallo TEST'},{status:500}):null));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['activities',{}],['quote',quoteInput]])assert.equal((await f.act(a,i)).status,200);
 const input={dni:10000001,cuil:27100000011,sexo:'F',apellido:'Ficticio',nombre:'Cliente',email:'fixture@example.test',telefono1:'1112345678',nacimiento:'1970-01-01',calle:'Calle ficticia',numero:'1',activityId:7,noInscriptoIibb:true};assert.equal((await f.act('client',input)).status,200);
 assert.equal((await f.act('inspection',{codigo_producto:801,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'})).status,422);
 const r=await f.act('clientStatus');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.holderStatus.estado,'REVISAR');assert.equal(r.data.unresolved.action,'inspection');assert.ok(!JSON.stringify(r.data).includes('10000001'));assert.equal((await f.act('subscribe',subscribeInput)).status,409);
 assert.equal(log.filter(x=>x.url.includes('/suscripciones/v2/inspecciones/')).length,1);
});
test('API conserva el ensayo cifrado y separado de clientes y pólizas; emisión requiere póliza y estado E',async t=>{
 const f=await fixture(),log=[];t.mock.method(globalThis,'fetch',provider(log));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['quote',quoteInput],['inspection',{codigo_producto:801,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'}],['subscribe',subscribeInput]]){const r=await f.act(a,i);assert.equal(r.status,200,JSON.stringify(r.data));noSecrets(r.data);}
 const r=await f.state();assert.equal(r.data.subscription.issued,true);assert.equal(r.data.inspection.completed,false);assert.equal(r.data.subscription.poliza,'90001');
 const row=f.DB.db.prepare('SELECT * FROM pilot_connections').get();assert.ok(!row.encrypted_payload.includes('quote-fixture'));const p=await unseal(f.env,row.encrypted_payload,'connection:QA-AUTO:QA-AUTO-PAS:mercantil:'+row.version);assert.equal(p.companyAccess.api.password,credentials.password);assert.equal(p.mercantilAutoQa.quote.id,'quote-fixture');
 for(const table of ['work_clients','work_policies'])assert.equal(f.DB.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 const duplicate=await f.act('subscribe',subscribeInput);assert.equal(duplicate.status,409);assert.equal(log.filter(x=>x.url.includes('/suscripciones/v2/auto/')).length,1);
});
test('permisos, CSRF, versión y confirmación QA se comprueban antes de contactar al proveedor',async t=>{
 const f=await fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('unexpected');});
 const data={expectedVersion:1,authorized:true,environment:'qa',action:'vehicles',input:{query:'FICTICIO',year:2012}};
 for(const as of ['QA-PEER','QA-OTHER'])assert.equal((await f.call(f.path,{as,data})).status,404);
 assert.equal((await f.call(f.path,{as:'QA-ADMIN',data})).status,403);assert.equal((await f.call(f.path,{as:'',data})).status,401);assert.equal((await f.call(f.path,{csrf:false,data})).status,403);
 for(const extra of [{expectedVersion:0},{authorized:false},{environment:'production'}])assert.ok((await f.call(f.path,{data:{...data,...extra}})).status>=400);
 assert.equal(calls,0);
});
test('la validación real de emisión habilita AUTOINSPECCION sin declarar inspección completada',async t=>{
 const f=await fixture(),log=[];t.mock.method(globalThis,'fetch',provider(log,url=>url.pathname.startsWith('/suscripciones/v2/auto/')?Response.json({message:'La autoinspección no fue realizada'},{status:409}):null));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['quote',quoteInput]])assert.equal((await f.act(a,i)).status,200);
 assert.equal((await f.act('subscribe',subscribeInput)).status,422);assert.equal((await f.state()).data.inspectionRequired,true);
 const r=await f.act('inspection',{codigo_producto:800,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.inspection.completed,false);assert.equal(r.data.subscription,null);assert.ok(log.some(x=>x.url.endsWith('/suscripciones/v2/inspecciones/auto/quote-fixture')));
});
test('alta TEST usa la localidad cotizada, no envía banco ni notificaciones y verifica la identidad devuelta',async()=>{
 const log=[],state={activities:[{id:7,nombre:'JUBILADA'}],quote:{...quote,localidad:{id:111,codigo_postal:1000,nombre:'LOCALIDAD FICTICIA',provincia:'PROVINCIA FICTICIA'}}};
 const input={dni:10000001,cuil:27100000011,sexo:'F',apellido:'Ficticio',nombre:'Cliente',email:'fixture@example.test',telefono1:'1112345678',nacimiento:'1970-01-01',calle:'Calle ficticia',numero:'1',activityId:7,noInscriptoIibb:true,localidad:{id:999},cbu:'NEVER_SEND_BANK_DATA'};
 const r=await mercantilAutoQaOperation(credentials,String(account),'client',input,state,{fetchImpl:provider(log)});assert.equal(r.state.holder.dni,10000001);assert.equal(r.result.created,true);
 const sent=JSON.parse(log.find(x=>x.url.endsWith('/clientes/v1/')).body);assert.equal(sent.localidad.id,111);assert.equal(sent.distribucionDigital,false);assert.ok(!('cbu' in sent));assert.equal(sent.cuil,input.cuil);assert.equal(sent.email,input.email);assert.equal(sent.contacto,'Cliente Ficticio');assert.ok(!('cuit' in sent));
 assert.deepEqual(sent.actividad,{id:7,nombre:'JUBILADA'});assert.equal(sent.ingresosBrutos.inscripcion.id,0);
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'client',{...input,activityId:9999},state,{fetchImpl:provider()}),e=>e.code==='QA_ACTIVITY_CATALOG');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'client',{...input,noInscriptoIibb:false},state,{fetchImpl:provider()}),e=>e.code==='QA_FIELD');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'subscribe',{...subscribeInput,tomador:{dni:10000002,sexo:'F'}},r.state,{fetchImpl:provider()}),e=>e.code==='QA_CLIENT_MISMATCH');
});
test('validaciones de campos del proveedor se muestran con mensajes legibles y sin claves',async()=>{
 const state={activities:[{id:7,nombre:'JUBILADA'}],quote:{...quote,localidad:{id:111,codigo_postal:1000,nombre:'LOCALIDAD FICTICIA',provincia:'PROVINCIA FICTICIA'}}},input={dni:10000001,cuil:27100000011,sexo:'F',apellido:'Ficticio',nombre:'Cliente',email:'fixture@example.test',telefono1:'1112345678',nacimiento:'1970-01-01',calle:'Calle ficticia',numero:'1',activityId:7,noInscriptoIibb:true};
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'client',input,state,{fetchImpl:provider([],url=>url.pathname==='/clientes/v1/'?Response.json({Errors:{cuil:['Completá CUIL',credentials.subscriptionKey]}},{status:400}):null)}),e=>{noSecrets({message:e.message});return e.message.includes('Completá CUIL');});
});
test('Superadmin conserva autoría y una respuesta 5xx bloquea reenvíos de altas inciertas sin filtrar secretos',async t=>{
 const f=await fixture();let bad=false;const log=[];t.mock.method(globalThis,'fetch',provider(log,(url)=>bad&&url.pathname==='/cotizaciones/v2/auto'?Response.json({message:credentials.password+' '+token},{status:500}):null));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}]])assert.equal((await f.act(a,i)).status,200);
 bad=true;const st=await f.state();const r=await f.call('/supervision/QA-AUTO-PAS'+f.path,{as:'QA-ADMIN',data:{expectedVersion:st.data.connectionVersion,authorized:true,environment:'qa',action:'quote',input:quoteInput}});assert.equal(r.status,422);assert.equal(r.data.error,'QA_OUTCOME_UNKNOWN');noSecrets(r.data);
 assert.equal((await f.act('quote',quoteInput)).status,409);assert.equal((await f.act('requests')).status,200);assert.equal((await f.act('quote',quoteInput)).status,409);
 assert.equal((await f.act('newCase')).status,409);
 assert.ok(f.DB.db.prepare("SELECT actor_id FROM pilot_audit WHERE action='supervision.connection.mercantil_auto_qa_quote_rejected'").all().some(x=>x.actor_id==='QA-ADMIN'));
});
test('tomador existente se verifica por identidad, se conserva cifrado y no reemplaza uno ya seleccionado',async()=>{
 const log=[],r=await mercantilAutoQaOperation(credentials,String(account),'existingClient',{dni:10000001,sexo:'F'}, {},{fetchImpl:provider(log)});
 assert.equal(r.state.holder.created,false);assert.equal(r.state.holderStatus.estado,'REVISAR');assert.ok(!('dni' in r.result));assert.equal(log.filter(x=>x.url.includes('/clientes/'))[0].method,'GET');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'existingClient',{dni:10000002,sexo:'F'}, {},{fetchImpl:provider()}),e=>e.code==='QA_CLIENT_MISMATCH');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'existingClient',{dni:10000001,sexo:'F'},r.state,{fetchImpl:provider()}),e=>e.code==='QA_CLIENT_EXISTS');
});
test('nuevo ensayo conserva íntegro el anterior y su inspección incierta; emisión usa otra referencia sin crear clientes reales',async t=>{
 const f=await fixture(),log=[];let quoteCount=0;
 t.mock.method(globalThis,'fetch',provider(log,url=>url.pathname==='/cotizaciones/v2/auto'?Response.json({...quote,id:'QA-QUOTE-'+(++quoteCount)}):url.pathname.includes('/suscripciones/v2/inspecciones/')?Response.json({message:'Proveedor TEST no disponible'},{status:500}):url.pathname==='/clientes/v1/personas'?Response.json({id:77,dni:10000001,sexo:'F',nombre:'Cliente',apellido:'Ficticio',estado:'ACTIVO'}):null));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['quote',quoteInput]])assert.equal((await f.act(a,i)).status,200);
 assert.equal((await f.act('inspection',{codigo_producto:801,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'})).status,422);
 const before=f.DB.db.prepare('SELECT * FROM pilot_connections').get(),old=(await unseal(f.env,before.encrypted_payload,'connection:QA-AUTO:QA-AUTO-PAS:mercantil:'+before.version)).mercantilAutoQa,callsBefore=log.length;
 const created=await f.act('newCase',{label:'Segundo ensayo TEST'});assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(log.length,callsBefore);const caseId=created.data.caseId;assert.notEqual(caseId,'legacy');assert.equal(created.data.quote,null);assert.equal(created.data.holder,null);assert.equal(created.data.unresolved,null);assert.equal(created.data.cases.find(c=>c.id==='legacy').unresolved,true);
 assert.equal((await f.act('existingClient',{dni:10000001,sexo:'F'},{caseId})).status,200);assert.equal((await f.act('quote',quoteInput,{caseId})).status,200);
 assert.equal((await f.act('inspection',{codigo_producto:801,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'},{caseId})).status,409);
 const issued=await f.act('subscribe',subscribeInput,{caseId});assert.equal(issued.status,200,JSON.stringify(issued.data));assert.equal(issued.data.subscription.issued,true);assert.ok(!JSON.stringify(issued.data).includes('10000001'));
 const after=f.DB.db.prepare('SELECT * FROM pilot_connections').get(),p=await unseal(f.env,after.encrypted_payload,'connection:QA-AUTO:QA-AUTO-PAS:mercantil:'+after.version);assert.deepEqual(p.mercantilAutoQa,old);assert.equal(p.mercantilAutoQaCases[caseId].quote.id,'QA-QUOTE-2');assert.equal(p.mercantilAutoQaCases[caseId].holder.dni,10000001);
 assert.equal((await f.act('subscribe',subscribeInput)).status,409);assert.equal((await f.state('unknown-case')).status,404);assert.equal(log.filter(x=>x.url.includes('/suscripciones/v2/inspecciones/')).length,1);assert.equal(log.filter(x=>x.url.includes('/suscripciones/v2/auto/'))[0].url.endsWith('QA-QUOTE-2'),true);
 for(const table of ['work_clients','work_policies'])assert.equal(f.DB.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
test('una referencia de cotización repetida entre ensayos se bloquea y no habilita reenvíos',async t=>{
 const f=await fixture();t.mock.method(globalThis,'fetch',provider());
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['quote',quoteInput]])assert.equal((await f.act(a,i)).status,200);
 const created=await f.act('newCase'),caseId=created.data.caseId;
 const r=await f.act('quote',quoteInput,{caseId});assert.equal(r.status,502,JSON.stringify(r.data));assert.equal(r.data.error,'QA_OUTCOME_UNKNOWN');assert.equal(r.data.quote,null);assert.equal(r.data.unresolved.action,'quote');assert.equal((await f.act('subscribe',subscribeInput,{caseId})).status,409);assert.equal((await f.act('newCase')).status,409);
});
test('confirmación revisada conserva el intento incierto exacto y no declara fotos completas ni repite la inspección',async()=>{
 const pending={id:'QA-PENDING',action:'inspection',status:'uncertain'},state={quote,unresolved:pending,subscription:{solicitud:'10001',poliza:'0',issued:false}},input={operationId:'QA-PENDING',quoteId:quote.id,inspectionId:12345,sourceReference:'Correo de Mercantil - confirmación TEST',confirmed:true},log=[];
 const r=await mercantilAutoQaOperation(credentials,String(account),'reconcileInspection',input,state,{fetchImpl:provider(log)});assert.equal(r.state.unresolved,undefined);assert.equal(r.state.inspection,undefined);assert.equal(r.result.completed,false);assert.equal(r.state.inspectionRequired,true);assert.equal(r.state.subscription.poliza,'0');assert.deepEqual(r.state.inspectionReconciliations[0].pendingOperation,pending);assert.equal(state.unresolved.id,'QA-PENDING');assert.ok(!log.some(x=>x.url.includes('/suscripciones/')));
 for(const extra of [{operationId:'OTHER'},{quoteId:'OTHER'},{confirmed:false}])await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'reconcileInspection',{...input,...extra},state,{fetchImpl:provider()}),e=>e.code==='QA_RECONCILE');
 await assert.rejects(mercantilAutoQaOperation(credentials,String(account),'reconcileInspection',input,r.state,{fetchImpl:provider()}),e=>e.code==='QA_RECONCILE');
});
test('API guarda la confirmación con permisos y versión sin borrar la evidencia de la inspección anterior',async t=>{
 const f=await fixture(),log=[];t.mock.method(globalThis,'fetch',provider(log,url=>url.pathname.includes('/suscripciones/v2/inspecciones/')?Response.json({message:'Servicio TEST caído'},{status:500}):null));
 for(const [a,i] of [['vehicles',{query:'FICTICIO',year:2012}],['schemes',{}],['quote',quoteInput]])assert.equal((await f.act(a,i)).status,200);
 await f.act('inspection',{codigo_producto:801,opcion:'AUTOINSPECCION',dominio:'ABC123',apellido:'Ficticio',nombre:'Cliente'});const before=await f.state(),input={operationId:before.data.unresolved.id,quoteId:quote.id,inspectionId:12345,sourceReference:'Correo de Mercantil - confirmación TEST',confirmed:true};
 const denied=await f.call(f.path,{data:{expectedVersion:before.data.connectionVersion-1,authorized:true,environment:'qa',action:'reconcileInspection',input}});assert.equal(denied.status,409);
 const r=await f.act('reconcileInspection',input);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.unresolved,null);assert.equal(r.data.inspection,null);assert.equal(r.data.inspectionEvidence.completed,false);
 const row=f.DB.db.prepare('SELECT * FROM pilot_connections').get(),p=await unseal(f.env,row.encrypted_payload,'connection:QA-AUTO:QA-AUTO-PAS:mercantil:'+row.version);assert.equal(p.mercantilAutoQa.inspectionReconciliations[0].pendingOperation.id,before.data.unresolved.id);assert.equal(p.mercantilAutoQa.quote.id,quote.id);assert.equal(log.filter(x=>x.url.includes('/suscripciones/v2/inspecciones/')).length,1);
});
