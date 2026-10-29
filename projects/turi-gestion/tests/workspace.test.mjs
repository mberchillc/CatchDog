import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
import worker from '../dist/server/index.js';
import {opaque,digest} from '../worker/security.js';
class D1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.db.exec(readFileSync('drizzle/'+file,'utf8'));}
 prepare(sql){const db=this.db;let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}}}
 async batch(stmts){this.db.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(await s.run());this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const DB=new D1(),env={DB,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.from(opaque()).subarray(0,32).toString('base64')};
const people=[['admin','ADMIN','superadmin','TURI'],['dani','DANI','producer','TURI'],['pas2','PAS2','producer','TURI'],['other','OTHER','producer','OTHER']];
const tokens=Object.fromEntries(people.map(([name])=>[name,opaque()]));env.TURI_INVITATIONS=JSON.stringify(people.map(([username,id,role,tenantId])=>({id,username,name:username==='dani'?'Daniel Stern':username,role,tenantId,tokenHash:digest(tokens[username]),expiresAt:Date.now()+3600000})));
const sessions={},password='Una frase ficticia para las pruebas!';let companyId,client,policy,claim,task,quote,offer,connection;
const prefix='/api/pilot';
async function call(path,{method='GET',data,as='dani',origin='https://turi.test',csrf=true}={}){const s=sessions[as];const response=await worker.fetch(new Request('https://turi.test'+prefix+path,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',Origin:origin}),...(s?{Cookie:s.cookie,'X-Turi-CSRF':csrf?s.csrf:'invalid'}:{}),'CF-Connecting-IP':'192.0.2.21'},body:data?JSON.stringify(data):undefined}),env);return {status:response.status,data:await response.json(),response};}
const setSession=(as,r)=>{sessions[as]={cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf}};
async function post(path,data,as='dani'){return call('/work/'+path,{method:'POST',data,as})}
async function create(type,data,as='dani'){const r=await post(type,data,as);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.record}
const clientData={name:'Cliente de prueba <script>no()</script>',phone:'+54 9 11 4444-2222',email:'cliente@example.invalid',source:'Referido',notes:'Contexto privado',marketingConsent:false};
const policyData=()=>({clientId:client.id,companyId,number:'000123-TEST',branch:'Autos',risk:'Auto de prueba · dominio PRIVADO',status:'active',startsOn:'2026-01-01',expiresOn:'2026-11-01',premiumCents:1234500,currency:'ARS',paymentStatus:'unknown',coverage:'Condiciones informadas',notes:''});
const quoteData=()=>({clientId:client.id,branch:'Autos',risk:'Auto de prueba',status:'comparing',notes:'Solicitud privada'});
const offerData=()=>({quoteId:quote.id,companyId,validUntil:'2026-12-31',premiumCents:1700050,currency:'ARS',period:'monthly',coverage:'Terceros completo',deductible:'Sin franquicia',sourceReference:'Portal · COT-100',notes:''});
test('cuentas con permisos distintos y espacio privado vacío, sin importar la demo',async()=>{
 for(const [username] of people){const a=await call('/auth/activate',{method:'POST',data:{username,password,token:tokens[username]},as:''});assert.equal(a.status,201);setSession(username,a);const p=await call('/auth/code/prepare',{method:'POST',as:username,data:{}});const c=await call('/auth/code/confirm',{method:'POST',as:username,data:{code:p.data.code}});assert.equal(c.status,200);setSession(username,c)}
 companyId=(await call('/companies')).data.companies[0].id;
 assert.equal((await call('/work/overview',{as:''})).status,401);
 const overview=(await call('/work/overview',{as:'admin'})).data;assert.equal(overview.source,'private_database');for(const type of ['clients','policies','claims','tasks','quotes','offers'])assert.equal(overview[type].length,0);assert.equal(overview.owners.length,3);
});
test('cliente, póliza, siniestro y tarea persisten con sus relaciones y datos cifrados',async()=>{
 client=await create('clients',clientData);policy=await create('policies',policyData());claim=await create('claims',{policyId:policy.id,title:'Daño parcial',reference:'SIN-TEST',status:'documents',occurredOn:'2026-10-20',nextDue:'2026-10-30',nextAction:'Pedir fotos',notes:'Detalle reservado'});task=await create('tasks',{title:'Pedir fotos del siniestro',category:'claims',priority:'red',status:'open',dueOn:'2026-10-30',clientId:client.id,notes:'Seguimiento'});
 const r=(await call('/work/overview')).data;assert.equal(r.clients[0].name,clientData.name);assert.equal(r.policies[0].client_id,client.id);assert.equal(r.claims[0].policy_id,policy.id);assert.equal(r.tasks[0].client_id,client.id);assert.equal(r.clients[0].marketingConsent,false);
 const dbText=JSON.stringify(DB.db.prepare('SELECT * FROM work_clients').all())+JSON.stringify(DB.db.prepare('SELECT * FROM work_policies').all())+JSON.stringify(DB.db.prepare('SELECT * FROM work_claims').all());for(const secret of [clientData.name,clientData.email,clientData.phone,'000123-TEST','dominio PRIVADO','Detalle reservado'])assert.ok(!dbText.includes(secret),secret);assert.ok(!JSON.stringify(r).includes('payload'));
});
test('aislamiento entre productores incluso de la misma organización, y atribución supervisada',async()=>{
 assert.equal((await call('/work/overview',{as:'pas2'})).data.clients.length,0);assert.equal((await call('/work/overview',{as:'other'})).data.clients.length,0);
 assert.equal((await call('/work/overview?owner=DANI',{as:'pas2'})).status,403);
 assert.equal((await post('clients/'+client.id,{...clientData,expectedVersion:1},'pas2')).status,404);
 assert.equal((await create('clients',{...clientData,name:'Cliente del administrador'},'admin')).owner_id,'ADMIN');
 const assigned=await create('clients',{...clientData,name:'Asignado a Dani',ownerId:'DANI'},'admin');assert.equal(assigned.owner_id,'DANI');
 assert.equal((await post('clients',{...clientData,ownerId:'OTHER'},'admin')).status,400);assert.equal((await post('clients',{...clientData,ownerId:'PAS2'})).status,403);
 const peer=await create('clients',{...clientData,name:'Cartera del segundo productor'},'pas2');assert.equal((await post('policies',{...policyData(),clientId:peer.id})).status,404);
 assert.equal((await call('/work/overview?owner=DANI',{as:'admin'})).data.clients.length,2);
});
test('validaciones de fechas, importes, compañías, versiones y CSRF',async()=>{
 assert.equal((await post('policies',{...policyData(),expiresOn:'2026-02-30'})).status,400);assert.equal((await post('policies',{...policyData(),expiresOn:'2025-12-31'})).status,400);assert.equal((await post('policies',{...policyData(),premiumCents:-1})).status,400);assert.equal((await post('policies',{...policyData(),premiumCents:1.1})).status,400);assert.equal((await post('policies',{...policyData(),companyId:'inventada'})).status,400);
 assert.equal((await post('claims',{policyId:policy.id,title:'Futuro',status:'reported',occurredOn:'2099-01-01'})).status,400);
 const update={...clientData,name:'Cliente actualizado',expectedVersion:1};assert.equal((await post('clients/'+client.id,update)).status,200);assert.equal((await post('clients/'+client.id,update)).status,409);assert.equal((await post('clients/'+client.id,{...update,expectedVersion:2,ownerId:'PAS2'},'admin')).status,400);
 assert.equal((await call('/work/clients',{method:'POST',data:clientData,csrf:false})).status,403);assert.equal((await call('/work/clients',{method:'POST',data:clientData,origin:'https://other.test'})).status,403);
});
test('solicitud y propuestas comparables con fuente obligatoria; sólo el PAS aprueba',async()=>{
 quote=await create('quotes',quoteData());assert.equal((await post('offers',{...offerData(),sourceReference:''})).status,400);offer=await create('offers',offerData());
 const approval={offerId:offer.id,offerVersion:offer.version,expectedVersion:quote.version,confirmed:true};assert.equal((await post('quotes/'+quote.id+'/approve',approval,'admin')).status,403);assert.equal((await post('quotes/'+quote.id+'/approve',approval,'pas2')).status,404);assert.equal((await post('quotes/'+quote.id+'/approve',{...approval,confirmed:false})).status,400);assert.equal((await post('quotes/'+quote.id+'/approve',{...approval,offerVersion:9})).status,409);
 const accepted=await post('quotes/'+quote.id+'/approve',approval);assert.equal(accepted.status,200);assert.match(accepted.data.message,/no otorga cobertura/);const q=(await call('/work/overview')).data.quotes.find(q=>q.id===quote.id);assert.equal(q.status,'approved');assert.equal(q.approved_by,'DANI');assert.equal(q.selected_offer_id,offer.id);
 assert.equal((await post('quotes/'+quote.id,{...quoteData(),expectedVersion:q.version})).status,409);assert.equal((await post('offers/'+offer.id,{...offerData(),expectedVersion:1})).status,409);assert.equal((await post('offers',offerData())).status,409);assert.equal((await post('quotes/'+quote.id+'/approve',approval)).status,409);
});
test('aprobación exige propuesta vigente y contacto del cliente',async()=>{
 const noContact=await create('clients',{name:'Sin contacto',email:'',phone:'',notes:'',source:'Carga manual'});const q=await create('quotes',{...quoteData(),clientId:noContact.id});const o=await create('offers',{...offerData(),quoteId:q.id});const b={offerId:o.id,offerVersion:o.version,expectedVersion:q.version,confirmed:true};assert.equal((await post('quotes/'+q.id+'/approve',b)).data.error,'CONTACT');const expired=await create('offers',{...offerData(),quoteId:q.id,validUntil:'2020-01-01'});assert.equal((await post('quotes/'+q.id+'/approve',{...b,offerId:expired.id})).data.error,'OFFER');
});
test('relevamiento de integración no habilita cotización ni revela el código, y se invalida al cambiarlo',async()=>{
 const c=await call('/connections',{method:'POST',data:{companyId,pasCode:'000SECRETO',method:'pas_only',authorized:true}});assert.equal(c.status,201);connection=c.data.id;
 const data={permission:'confirmed',channel:'api_requested',technical:'documentation',documentation:'https://example.invalid/docs',notes:'Esperamos aprobación del canal',codeVersion:1};assert.equal((await post('integrations/'+connection,{...data,documentation:'javascript:alert(1)'})).status,400);assert.equal((await post('integrations/'+connection,{...data,technical:'connected'})).status,400);assert.equal((await post('integrations/'+connection,data,'other')).status,404);assert.equal((await post('integrations/'+connection,data,'admin')).status,200);
 let reviews=(await call('/work/integrations',{as:'admin'})).data;assert.equal(reviews.integrations[0].stale,false);assert.equal(reviews.integrations[0].automaticQuotes,false);assert.ok(!JSON.stringify(reviews).includes('000SECRETO'));assert.ok(!JSON.stringify(reviews).includes('encrypted_payload'));
 assert.equal((await call('/connections',{method:'POST',data:{companyId,pasCode:'000CAMBIADO',method:'pas_only',authorized:true,expectedVersion:1}})).status,200);reviews=(await call('/work/integrations')).data;assert.equal(reviews.integrations[0].stale,true);assert.equal((await post('integrations/'+connection,{...data,expectedVersion:1})).status,409);
});
test('frontend de superadministración: navegación, alta real, búsqueda, persistencia y tareas',async()=>{
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 w.fetch=async(url,opt={})=>{const r=await worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Cookie:sessions.admin.cookie,Origin:'https://turi.test','CF-Connecting-IP':'192.0.2.23'},body:opt.body}),env);return r};
 const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 vm.runInContext(readFileSync('public/documents.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/quote-explorer.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/workspace.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/pilot.js','utf8'),dom.getInternalVMContext());await wait(()=>w.document.querySelector('.w-sidebar'));assert.equal(w.document.querySelectorAll('.w-stat').length,4);
 for(const dest of ['clients','policies','claims','quotes','tasks','companies','producers','activity']){w.document.querySelector(`[data-work="nav"][data-page="${dest}"]`).click();await wait(()=>w.location.hash==='#view='+dest);assert.ok(w.document.querySelector('h1').textContent)}
 w.document.querySelector('[data-work="nav"][data-page="clients"]').click();w.document.querySelector('[data-work="new"][data-type="clients"]').click();let f=w.document.querySelector('#work-record');f.elements.name.value='Nuevo cliente desde UI';f.elements.email.value='ui@example.invalid';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('.w-dialog'));assert.ok((await call('/work/overview',{as:'admin'})).data.clients.some(c=>c.name==='Nuevo cliente desde UI'));
 const input=w.document.querySelector('#work-search');input.value='Nuevo cliente desde UI';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('.w-table tbody tr').length,1);
 // A fresh boot reads records from the backend, not browser storage.
 assert.equal(w.localStorage.length,0);await w.TuriWorkspace.refresh();assert.ok(w.document.body.textContent.includes('Nuevo cliente desde UI'));assert.ok(!w.document.querySelector('script:not([src])'));assert.ok(!w.document.body.textContent.includes('000CAMBIADO'));
 w.document.querySelector('[data-work="nav"][data-page="tasks"]').click();w.document.querySelector('[data-work="new"][data-type="tasks"]').click();f=w.document.querySelector('#work-record');f.elements.title.value='Conciliar comisiones UI';f.elements.category.value='accounting';f.elements.priority.value='red';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('.w-dialog'));const id=(await call('/work/overview',{as:'admin'})).data.tasks.find(t=>t.title==='Conciliar comisiones UI').id;w.document.querySelector(`[data-work="done"][data-id="${id}"]`).click();await wait(()=>w.document.body.textContent.includes('Tarea resuelta.'));assert.equal((await call('/work/overview',{as:'admin'})).data.tasks.find(t=>t.id===id).status,'done');w.close();
});
test('auditoría atribuye los cambios sin registrar nombres, datos del riesgo ni códigos',async()=>{const audit=(await call('/audit',{as:'admin'})).data.events;assert.ok(audit.some(e=>e.action==='work.quotes.approved_for_processing'&&e.actor_id==='DANI'));const text=JSON.stringify(audit);for(const secret of ['cliente@example.invalid','Contexto privado','dominio PRIVADO','000CAMBIADO','Terceros completo'])assert.ok(!text.includes(secret));});

test('frontend del PAS: nueva solicitud, propuesta y aprobación con el backend real',async()=>{
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/privado/#view=quotes',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 w.fetch=async(url,opt={})=>worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Cookie:sessions.dani.cookie,Origin:'https://turi.test','CF-Connecting-IP':'192.0.2.26'},body:opt.body}),env);
 const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 vm.runInContext(readFileSync('public/documents.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/quote-explorer.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/workspace.js','utf8'),dom.getInternalVMContext());vm.runInContext(readFileSync('public/pilot.js','utf8'),dom.getInternalVMContext());await wait(()=>w.document.querySelector('.w-sidebar'));
 w.document.querySelector('[data-work="new"][data-type="quotes"]').click();let f=w.document.querySelector('#work-record');f.elements.clientId.value=client.id;f.elements.branch.value='Autos';f.elements.risk.value='Nuevo pedido desde UI del PAS';f.elements.status.value='comparing';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('.w-dialog'));const q=(await call('/work/overview')).data.quotes.find(q=>q.risk==='Nuevo pedido desde UI del PAS');assert.ok(q);
 w.document.querySelector(`[data-work="quote-detail"][data-id="${q.id}"]`).click();w.document.querySelector('[data-work="offer"]').click();f=w.document.querySelector('#work-offer');f.elements.amount.value='18123.45';f.elements.sourceReference.value='Portal de prueba · COT-UI-23';f.elements.coverage.value='Plan transcripto de la propuesta';f.elements.deductible.value='Sin franquicia';f.elements.validUntil.value='2026-12-31';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('[data-work="approve"]'));w.document.querySelector('[data-work="approve"]').click();f=w.document.querySelector('#work-approve');f.elements.confirmed.checked=true;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.body.textContent.includes('Revisión PAS registrada.'));const saved=(await call('/work/overview')).data;assert.equal(saved.quotes.find(v=>v.id===q.id).status,'approved');assert.equal(saved.offers.find(v=>v.quote_id===q.id).premiumCents,1812345);assert.ok(w.document.body.textContent.includes('Este expediente no otorga cobertura'));assert.equal(w.localStorage.length,0);w.close();
});

test('multicotizador privado conserva auth/CSRF y nunca sustituye consulta real por demo',async()=>{
 assert.equal((await call('/work/multiquote/prepare',{as:'',method:'POST',data:{text:'Celta'}})).status,401);
 assert.equal((await call('/work/multiquote/prepare',{method:'POST',csrf:false,data:{text:'Celta'}})).status,403);
 const r=await post('multiquote/prepare',{text:'Chevrolet Celta 1.4 LT 2014 en Villa Ballester, terceros completo'});assert.equal(r.status,200);assert.equal(r.data.liveAvailable,false);
 assert.equal((await post('multiquote/prepare',{text:'a'.repeat(2001)})).status,400);
 assert.equal((await post('multiquote/run',{mode:'live',confirmedDemo:true,risk:r.data.risk})).data.error,'API_ACCESS_REQUIRED');
 assert.equal((await post('multiquote/run',{mode:'demo',risk:r.data.risk})).status,400);
 const before=(await call('/work/overview')).data;
 const d=await post('multiquote/run',{mode:'demo',confirmedDemo:true,risk:r.data.risk});assert.equal(d.status,200);assert.equal(d.data.results.length,2);assert.ok(d.data.results.every(x=>x.sourceType==='simulation'));
 const after=(await call('/work/overview')).data;assert.equal(before.quotes.length,after.quotes.length);assert.equal(before.offers.length,after.offers.length);
});
