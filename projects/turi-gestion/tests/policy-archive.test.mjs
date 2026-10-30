import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {harness} from './support/private-harness.mjs';
import {unseal,digest} from '../worker/security.js';
import '../public/amounts.js';
const parse=globalThis.TuriAmounts.parseCents;
const customer={name:'CLIENTE FICTICIO · archivo',email:'ficticio@example.invalid',phone:'',notes:'NOTAS QUE SE CONSERVAN',marketingConsent:true};
async function fixture(){const h=await harness(),client=await h.create('clients',customer),policyBody={clientId:client.id,companyId:'mercantil',number:'POLIZA-FICTICIA',branch:'Autos',risk:'Auto ficticio',status:'active',startsOn:'2026-01-01',expiresOn:'2027-01-01',premiumCents:5631858,currency:'ARS',paymentStatus:'current',coverage:'DETALLE PREEXISTENTE',notes:'NOTA PREVIA'},policy=await h.create('policies',policyBody);return {h,client,policy,policyBody};}
const post=(h,type,id,data,as='dani')=>h.call('/work/archive/'+type+'/'+id,{method:'POST',data,as});
const marker=(h,type,id)=>h.DB.db.prepare('SELECT * FROM work_record_archives WHERE record_type=? AND record_id=?').get(type,id);
const wait=async(fn,details=()=> '')=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail(details());};

test('importes de planillas: coma, punto, agrupadores y centavos exactos; nunca redondea cifras ambiguas inválidas',()=>{
 for(const value of ['56318,58','56318.58','56.318,58','56,318.58','ARS 56.318,58','$ 56 318,58','USD 56,318.58'])assert.equal(parse(value),5631858,value);
 for(const [value,cents] of [['1.234',123400],['1,234',123400],['1.234.567',123456700],['1,234,567',123456700],['0,01',1],['1.2',120],['0',0],['10000000000',1000000000000]])assert.equal(parse(value),cents);
 for(const value of ['1e3','-1','12.34.567','1,2,3','1234,567','1.234,567','Infinity','NaN','10000000000,01','',{},null])assert.throws(()=>parse(value),value?.toString());
});

test('póliza conserva detalle anterior, nuevos campos, varios endosos, notación pegada y baja administrativa',async()=>{
 const {h,client,policy,policyBody}=await fixture(),before=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id);
 const extra={coverageType:'Terceros completo + granizo',paymentMethod:'cbu',paymentDetails:'CBU terminado en 0001',province:'Buenos Aires',locality:'Villa Ballester',rebilling:'four_monthly',rebillingDetails:'Ajuste según compañía',endorsements:[{reference:'END-FICTICIO-1',date:'2026-10-20',type:'Cambio de domicilio',detail:'Detalle privado del endoso'},{reference:'END-FICTICIO-2',date:'2026-10-21',type:'Accesorio',detail:'Equipo de audio'}],amountText:'56,318.58'};
 const saved=await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,...extra,expectedVersion:1}});assert.equal(saved.status,200,JSON.stringify(saved.data));for(const [k,v]of Object.entries(extra))assert.deepEqual(saved.data.record[k],v,k);assert.equal(saved.data.record.coverage,policyBody.coverage);
 // A tab from before the upgrade may omit all new fields; it must not erase them.
 const older=await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:2,notes:'NOTA DEL PAS'}});assert.equal(older.status,200);for(const [k,v]of Object.entries(extra))assert.deepEqual(older.data.record[k],v,k);
 assert.equal((await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:3,status:'cancelled'}})).status,400);
 const cancelled=await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:3,status:'cancelled',cancelledOn:'2026-10-30',cancellationReason:'Solicitud del cliente'}});assert.equal(cancelled.status,200);assert.equal(cancelled.data.record.endorsements.length,2);assert.equal(cancelled.data.record.cancelledOn,'2026-10-30');assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id),before);
 assert.equal((await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:4,amountText:'56.318,59'}})).status,400);
 const raw=h.DB.db.prepare('SELECT payload FROM work_policies WHERE id=?').get(policy.id).payload;assert.ok(!raw.includes('Detalle privado del endoso'));
});

test('archivar y restaurar conserva el original completo, sin cancelar la póliza ni tocar clientes, vínculos o archivos',async()=>{
 const {h,client,policy,policyBody}=await fixture(),before=h.DB.db.prepare('SELECT * FROM work_policies WHERE id=?').get(policy.id),clientBefore=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id);
 assert.equal((await post(h,'policies',policy.id,{action:'archive',expectedVersion:9,note:'No archivar con versión vieja'})).status,409);
 assert.equal((await post(h,'policies',policy.id,{action:'archive',expectedVersion:1,note:'Histórico para revisión'})).status,201);
 assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_policies WHERE id=?').get(policy.id),before);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id),clientBefore);assert.equal(h.BUCKET.objects.size,0);
 const m=marker(h,'policies',policy.id),backup=await unseal(h.env,m.payload,'record-archive:TURI:policies:'+policy.id);assert.deepEqual(backup.snapshot,JSON.parse(JSON.stringify(before)));assert.equal(backup.note,'Histórico para revisión');assert.ok(!m.payload.includes(backup.note));
 const overview=(await h.call('/work/overview')).data;assert.ok(overview.policies.find(r=>r.id===policy.id).archive);assert.equal(overview.policies.find(r=>r.id===policy.id).status,'active');
 assert.equal((await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:1}})).status,409);
 const history=(await h.call('/work/archive')).data;assert.equal(history.records[0].note,backup.note);assert.equal(history.records[0].payload,undefined);assert.equal(history.records[0].snapshot,undefined);assert.equal(history.automaticCleanup,false);
 assert.equal((await post(h,'policies',policy.id,{action:'restore',expectedVersion:2})).status,409);assert.equal((await post(h,'policies',policy.id,{action:'restore',expectedVersion:1})).status,200);
 assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_policies WHERE id=?').get(policy.id),before);assert.equal((await h.call('/work/archive')).data.records.length,0);assert.ok(!(await h.call('/work/overview')).data.policies[0].archive);
 assert.equal((await post(h,'policies',policy.id,{action:'archive',expectedVersion:1,note:'Segundo ciclo'})).status,201);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_record_archive_events WHERE record_id=?').get(policy.id).n,3);assert.equal(marker(h,'policies',policy.id).version,3);
});

test('históricos exige dueño, tenant, CSRF y versión; archivar cliente no cambia consentimiento ni relaciones activas',async()=>{
 const {h,client,policy,policyBody}=await fixture(),body={action:'archive',expectedVersion:1,note:'Cliente fuera de cartera'};
 for(const as of ['peer','other'])assert.equal((await post(h,'clients',client.id,body,as)).status,404);
 assert.equal((await h.call('/work/archive/clients/'+client.id,{method:'POST',csrf:false,data:body})).status,403);assert.equal((await h.call('/work/archive/clients/'+client.id,{method:'DELETE',data:body})).status,404);
 assert.equal((await post(h,'clients',client.id,body)).status,201);assert.equal((await h.call('/work/archive',{as:'peer'})).data.records.length,0);assert.equal((await h.call('/work/archive',{as:'other'})).data.records.length,0);assert.equal((await h.call('/work/archive',{as:'mauro'})).data.records[0].marketingConsent,true);
 assert.equal((await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:1,notes:'Seguimiento de póliza relacionada'}})).status,200);
 assert.equal((await h.call('/work/policies',{method:'POST',data:policyBody})).status,409);
 assert.equal((await h.call('/work/clients/'+client.id,{method:'POST',data:{...customer,expectedVersion:1}})).status,409);
 assert.equal((await post(h,'clients',client.id,{action:'restore',expectedVersion:1},'mauro')).status,200);assert.equal((await h.call('/work/overview')).data.clients[0].marketingConsent,true);
 assert.equal(h.DB.db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('archivar un caso pausa el enlace y sus avisos; restaurar recupera la misma respuesta, archivos e historial',async()=>{
 const h=await harness(),c=await h.create('emission',{branch:'Autos',title:'CASO FICTICIO ARCHIVABLE',data:{}}),share=await h.call('/work/emission/'+c.id+'/share',{method:'POST',data:{expectedVersion:1}}),grant={id:c.id,token:new URLSearchParams(new URL(share.data.url).hash.slice(1)).get('token')};
 const before=h.DB.db.prepare('SELECT * FROM work_emission_cases WHERE id=?').get(c.id);assert.equal((await post(h,'emission',c.id,{action:'archive',expectedVersion:2,note:'Pausar seguimiento'})).status,201);assert.equal((await h.call('/public/emission/prepare',{method:'POST',as:'',data:grant})).status,403);assert.equal((await h.call('/work/emission')).data.cases.length,0);assert.equal((await h.call('/work/emission/'+c.id)).status,409);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_emission_cases WHERE id=?').get(c.id),before);
 assert.equal((await post(h,'emission',c.id,{action:'restore',expectedVersion:1})).status,200);assert.equal((await h.call('/public/emission/prepare',{method:'POST',as:'',data:grant})).status,200);
 const original=readFileSync('public/assets/logo.png'),meta=Buffer.from(JSON.stringify({...grant,filename:'Foto-ficticia.png',photoType:'front',bytes:original.length,sha256:digest(original),uploadId:crypto.randomUUID()})),frame=Buffer.alloc(4+meta.length+original.length);frame.writeUInt32BE(meta.length);meta.copy(frame,4);original.copy(frame,4+meta.length);const uploaded=await h.call('/public/emission/upload',{method:'POST',as:'',bytes:frame});assert.equal(uploaded.status,201);const objectsBefore=[...h.BUCKET.objects.entries()].map(([k,v])=>[k,digest(v.bytes)]);
 const sent=await h.call('/public/emission/submit',{method:'POST',as:'',data:{...grant,data:{holder_name:'CLIENTE FICTICIO RECIBIDO',owner_same:'yes'},fileIds:[uploaded.data.id],consent:true}});assert.equal(sent.status,201);const received=h.DB.db.prepare('SELECT * FROM work_emission_cases WHERE id=?').get(c.id);assert.equal((await h.call('/work/emission/notifications')).data.unread,1);assert.equal((await post(h,'emission',c.id,{action:'archive',expectedVersion:received.version,note:'Conservar respuesta'})).status,201);assert.equal((await h.call('/work/emission/notifications')).data.unread,0);assert.equal((await post(h,'emission',c.id,{action:'restore',expectedVersion:3})).status,200);assert.equal((await h.call('/work/emission/notifications')).data.unread,1);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_emission_cases WHERE id=?').get(c.id),received);assert.equal((await h.call('/work/emission/'+c.id)).data.record.response.data.holder_name,'CLIENTE FICTICIO RECIBIDO');assert.deepEqual([...h.BUCKET.objects.entries()].map(([k,v])=>[k,digest(v.bytes)]),objectsBefore);const download=await h.call('/work/emission/'+c.id+'/file/'+uploaded.data.id);assert.equal(download.status,200);assert.equal(digest(download.bytes),digest(original));
});

test('UI PAS: edita póliza con coma, endosos y baja; tacho con nota, Histórico y restauración sin duplicar',async()=>{
 const {h,client,policy}=await fixture(),dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/#view=policies',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const request=async(path,method='GET',data)=>{const r=await h.call(path,{method,data});if(r.status>=400)throw Object.assign(Error(r.data.message),{status:r.status,code:r.data.error});return r.data;};
 for(const f of ['amounts.js','workspace.js'])w.eval(readFileSync('public/'+f,'utf8'));
 try{await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user:{id:'DOC-DANI',name:'PAS FICTICIO',username:'ficticio',role:'producer'},companies:(await h.call('/companies')).data.companies,request,expired:()=>{}});
 w.document.querySelector('[data-work=edit][data-id="'+policy.id+'"]').click();let form=w.document.querySelector('#work-record');for(const key of ['coverageType','paymentMethod','locality','province','rebilling','cancelledOn','cancellationReason'])assert.ok(form.elements[key],key);
 assert.equal(form.elements.amount.type,'text');form.elements.amount.value='56.318,58';form.elements.amount.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(form.querySelector('#amount-preview').textContent,/56\.318,58/);form.elements.coverageType.value='Terceros completo';form.elements.paymentMethod.value='cbu';form.elements.locality.value='Villa Ballester';form.elements.province.value='Buenos Aires';form.elements.rebilling.value='quarterly';form.querySelector('[data-work=add-endorsement]').click();const end=form.querySelector('[data-endorsement-row]');end.querySelector('[data-endorsement-field=reference]').value='END-UI';end.querySelector('[data-endorsement-field=date]').value='2026-10-30';end.querySelector('[data-endorsement-field=detail]').value='Cambio ficticio';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('#work-record'),()=>w.document.body.textContent);
 const saved=(await h.call('/work/overview')).data.policies[0];assert.equal(saved.premiumCents,5631858);assert.equal(saved.amountText,'56.318,58');assert.equal(saved.endorsements[0].reference,'END-UI');assert.equal(saved.coverage,'DETALLE PREEXISTENTE');
 w.document.querySelector('[data-work=edit][data-id="'+policy.id+'"]').click();form=w.document.querySelector('#work-record');assert.equal(form.elements.amount.value,'56.318,58');assert.equal(form.querySelectorAll('[data-endorsement-row]').length,1);form.elements.status.value='cancelled';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));assert.ok(form.querySelector('#policy-cancellation').open);form.elements.cancelledOn.value='2026-10-30';form.elements.cancellationReason.value='Baja administrativa de prueba';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('#work-record'));
 await w.TuriWorkspace.go('clients');w.document.querySelector('[data-work=archive][data-id="'+client.id+'"]').click();const archive=w.document.querySelector('#work-archive');archive.elements.note.value='Futuro seguimiento comercial';archive.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('#work-archive')&&!w.document.querySelector('[data-work=edit][data-id="'+client.id+'"]'),()=>w.document.body.textContent);assert.equal(w.document.querySelector('[data-work=edit][data-id="'+client.id+'"]'),null);
 await w.TuriWorkspace.go('archive');assert.match(w.document.querySelector('#w-body').textContent,/Futuro seguimiento comercial/);w.document.querySelector('[data-work=restore-record]').click();await wait(()=>!w.document.querySelector('[data-work=restore-record]'));await w.TuriWorkspace.go('clients');assert.ok(w.document.querySelector('[data-work=edit][data-id="'+client.id+'"]'));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,1);
 }finally{w.TuriWorkspace.leave();dom.window.close();}
});

test('una edición que compite con el archivo no revive ni sobrescribe la póliza archivada',async()=>{
 const {h,policy,policyBody}=await fixture(),before=h.DB.db.prepare('SELECT * FROM work_policies WHERE id=?').get(policy.id),prepare=h.DB.prepare.bind(h.DB);let injected=false;
 h.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE work_policies SET ')){const run=statement.run.bind(statement);statement.run=async()=>{if(!injected){injected=true;assert.equal((await post(h,'policies',policy.id,{action:'archive',expectedVersion:1,note:'Archivo mientras otra pestaña guardaba'})).status,201);}return run();};}return statement;};
 const save=await h.call('/work/policies/'+policy.id,{method:'POST',data:{...policyBody,expectedVersion:1,notes:'NO SOBRESCRIBIR ARCHIVO'}});assert.equal(save.status,409);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_policies WHERE id=?').get(policy.id),before);assert.equal(marker(h,'policies',policy.id).state,'archived');
});

test('pedidos iniciales se archivan y restauran con su estimación y clave de reintento original',async()=>{
 const h=await harness(),body={requestKey:crypto.randomUUID(),description:'Fiat Cronos 2024',risk:{brand:'Fiat',model:'Cronos',year:'2024'},details:{},commercial:{},clientId:''},created=await h.call('/work/multiquote/request',{method:'POST',data:body});assert.equal(created.status,201);const c=created.data.record,before=h.DB.db.prepare('SELECT * FROM work_quote_intakes WHERE id=?').get(c.id);
 assert.equal((await post(h,'quoteIntakes',c.id,{action:'archive',expectedVersion:c.version,note:'Pedido de muestra'})).status,201);assert.equal((await h.call('/work/multiquote/requests/'+c.id)).status,409);assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:body})).status,409);assert.equal((await post(h,'quoteIntakes',c.id,{action:'restore',expectedVersion:1})).status,200);const restored=await h.call('/work/multiquote/requests/'+c.id);assert.equal(restored.status,200);assert.deepEqual(restored.data.record.estimate,c.estimate);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_quote_intakes WHERE id=?').get(c.id),before);
});
