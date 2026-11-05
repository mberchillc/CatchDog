import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {fixture,ui as workspaceUi,wait as workspaceWait,PAS,ADMIN} from './support/supervision-fixture.mjs';

const ids=['openai','gemini','claude','copilot','meta'];
const idle=id=>({id,configured:false,apiKeyConfigured:false,status:'not_connected',version:0,model:'',workspaceId:'',region:'global'});
const wait=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,3));}assert.fail('La interfaz no alcanzó el estado esperado.');};
async function app(options={}){
 const dom=new JSDOM('<div id="w-body"></div>',{url:'https://turi.test/privado/#view=assistants',runScripts:'outside-only'}),w=dom.window,calls=[],records=ids.map(idle),opens=[];
 let delay=null,failed=false,loads=0;
 w.eval(readFileSync('public/assistants.js','utf8'));
 const request=async(path,method='GET',data)=>{
  calls.push({path,method,data:data?structuredClone(data):null});
  if(path==='/assistants'){loads++;if(options.loadFailure&&loads===1)throw Error('No pudimos consultar tus conexiones.');return {providers:structuredClone(records)};}
  if(delay)await delay;
  if(failed)throw Object.assign(Error('La configuración cambió.'),{code:'VERSION'});
  const id=path.split('/')[2],previous=records.find(row=>row.id===id);
  const record={...previous,configured:true,apiKeyConfigured:true,version:previous.version+1,status:path.endsWith('/test')?(options.testFailure?'failed':'verified'):'configured',model:data.model??previous.model,workspaceId:data.workspaceId??previous.workspaceId,region:data.region??previous.region};
  records.splice(records.findIndex(row=>row.id===id),1,record);
  return {record:structuredClone(record),message:record.status==='failed'?'La credencial no fue aceptada.':record.status==='verified'?'Acceso validado.':'Conexión guardada.'};
 };
 const paint=()=>{w.document.querySelector('#w-body').innerHTML=w.TuriAssistants.render();};
 const ctx={user:{id:'QA-PAS',role:options.role||'producer',tenantId:'QA'},owners:options.owners||[],request,changed:async()=>{await w.TuriAssistants.load();paint();},viewProducer:(id,page)=>opens.push({id,page})};
 w.TuriAssistants.configure(ctx);await w.TuriAssistants.load();paint();
 return {dom,w,calls,records,opens,ctx,paint,close(){w.TuriAssistants.reset();w.close();},setDelay(value){delay=value;},setFailed(value){failed=value;}};
}
function open(a,id){a.w.document.querySelector(`[data-ai="toggle"][data-provider="${id}"]`).click();return a.w.document.querySelector('#ai-connection-form');}
function submit(a,form,mode='save'){form.dispatchEvent(new a.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector(`button[value="${mode}"]`)}));}

test('las cinco empresas despliegan sus campos reales sin exponer claves guardadas',async()=>{
 const a=await app();try{
  assert.equal(a.w.document.querySelectorAll('.ai-provider').length,5);
  assert.deepEqual([...a.w.document.querySelectorAll('.ai-provider')].map(card=>card.dataset.provider),ids);
  for(const id of ids){const form=open(a,id);assert.equal(form.dataset.provider,id);assert.equal(form.elements.apiKey.type,'password');assert.equal(form.elements.apiKey.value,'');assert.equal(form.elements.apiKey.required,true);assert.ok(form.querySelector('a[href^="https://"]'));}
  const copilot=open(a,'copilot');assert.equal(copilot.elements.region.options.length,3);assert.ok(copilot.textContent.includes('Secreto de Direct Line'));
  const claude=open(a,'claude');assert.ok(claude.elements.workspaceId);assert.ok(a.w.document.body.textContent.includes('clientes y documentos no se comparten automáticamente'));
  assert.equal(a.w.localStorage.length,0);assert.equal(a.w.sessionStorage.length,0);
 }finally{a.close();}
});

test('guardar, volver a abrir y validar mantienen la clave fuera de la pantalla y conservan versiones',async()=>{
 const a=await app();try{
  let form=open(a,'openai');form.elements.apiKey.value='SECRET-TEST-DO-NOT-RENDER';form.elements.model.value='modelo-del-PAS';form.elements.authorized.checked=true;submit(a,form);
  await wait(()=>a.w.document.querySelector('.ai-notice')?.textContent.includes('guardada'));
  let writes=a.calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].data.expectedVersion,0);assert.equal(writes[0].data.apiKey,'SECRET-TEST-DO-NOT-RENDER');assert.equal(writes[0].data.authorized,true);
  assert.ok(!a.w.document.body.innerHTML.includes('SECRET-TEST-DO-NOT-RENDER'));assert.ok(a.w.document.querySelector('.ai-status.configured'));
  a.w.document.querySelector('[data-ai="close"]').click();form=open(a,'openai');assert.equal(form.elements.apiKey.value,'');assert.equal(form.elements.apiKey.required,false);assert.ok(form.elements.apiKey.placeholder.includes('conservarla'));assert.equal(form.elements.model.value,'modelo-del-PAS');
  form.elements.authorized.checked=true;submit(a,form,'test');await wait(()=>a.w.document.querySelector('.ai-status.verified'));
  writes=a.calls.filter(call=>call.method==='POST');assert.deepEqual(writes.map(call=>call.path),['/assistants/openai','/assistants/openai','/assistants/openai/test']);assert.equal(writes[1].data.apiKey,'');assert.equal(writes[1].data.expectedVersion,1);assert.equal(writes[2].data.expectedVersion,2);assert.ok(a.w.document.querySelector('.ai-notice').textContent.includes('Acceso validado'));
  assert.equal(a.w.localStorage.length,0);assert.equal(a.w.sessionStorage.length,0);
 }finally{a.close();}
});

test('una prueba rechazada no se presenta como conexión validada',async()=>{
 const a=await app({testFailure:true});try{
  const form=open(a,'meta');form.elements.apiKey.value='SYNTHETIC-META-KEY';form.elements.authorized.checked=true;submit(a,form,'test');await wait(()=>a.w.document.querySelector('.ai-notice.failed'));
  assert.ok(a.w.document.querySelector('.ai-notice.failed').textContent.includes('no fue aceptada'));assert.equal(a.w.document.querySelector('.ai-status.verified'),null);assert.ok(a.w.document.querySelector('.ai-status.failed'));assert.ok(!a.w.document.body.innerHTML.includes('SYNTHETIC-META-KEY'));
 }finally{a.close();}
});

test('cambiar de proveedor elimina la clave pendiente y no envía solicitudes',async()=>{
 const a=await app();try{
  const form=open(a,'gemini');form.elements.apiKey.value='UNSAVED-KEY';open(a,'claude');open(a,'gemini');assert.equal(a.w.document.querySelector('#ai-connection-form').elements.apiKey.value,'');assert.equal(a.calls.filter(call=>call.method==='POST').length,0);assert.ok(!a.w.document.body.innerHTML.includes('UNSAVED-KEY'));
 }finally{a.close();}
});

test('el Superadmin elige la vista del PAS y no guarda conexiones en otra cuenta por defecto',async()=>{
 const a=await app({role:'superadmin',owners:[{id:'QA-PAS',name:'Productor de prueba',role:'producer'},{id:'QA-OFF',name:'Cuenta inactiva',role:'producer',disabled:true},{id:'QA-ADMIN',name:'Administrador',role:'superadmin'}]});try{
  assert.equal(a.calls.length,0);assert.equal(a.w.document.querySelector('#ai-connection-form'),null);const select=a.w.document.querySelector('[data-ai="owner"]');assert.equal(select.options.length,2);select.value='QA-PAS';select.dispatchEvent(new a.w.Event('change',{bubbles:true}));assert.deepEqual(a.opens,[{id:'QA-PAS',page:'assistants'}]);
 }finally{a.close();}
});

test('una respuesta tardía no cruza de cuenta ni repone claves en el nuevo perfil',async()=>{
 const a=await app();try{
  let release;a.setDelay(new Promise(resolve=>{release=resolve;}));const form=open(a,'openai');form.elements.apiKey.value='OLD-ACCOUNT-KEY';form.elements.authorized.checked=true;submit(a,form);
  a.w.TuriAssistants.configure({...a.ctx,user:{id:'QA-OTHER',role:'producer',tenantId:'QA'}});await a.w.TuriAssistants.load();a.paint();release();await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(a.w.document.querySelector('#ai-connection-form'),null);assert.equal(a.w.document.querySelector('.ai-notice'),null);assert.ok(!a.w.document.body.innerHTML.includes('OLD-ACCOUNT-KEY'));
 }finally{a.close();}
});

test('se puede reintentar una carga fallida sin perder la página de asistentes',async()=>{
 const a=await app({loadFailure:true});try{
  assert.ok(a.w.document.querySelector('[role="alert"]').textContent.includes('consultar'));a.w.document.querySelector('[data-ai="retry"]').click();await wait(()=>a.w.document.querySelectorAll('.ai-provider').length===5);assert.equal(a.calls.filter(call=>call.path==='/assistants').length,2);
 }finally{a.close();}
});

test('la vista del PAS permite al Superadmin guardar la conexión real sin cambiar su titular',async()=>{
 const f=await fixture(),a=await workspaceUi(f,{as:ADMIN,producerId:PAS,page:'assistants'});try{
  assert.ok(a.w.document.querySelector('#supervision-strip').textContent.includes('Acceso completo'));
  assert.equal(a.w.document.querySelectorAll('.ai-provider').length,5);
  a.w.document.querySelector('[data-ai="toggle"][data-provider="gemini"]').click();const form=a.w.document.querySelector('#ai-connection-form');
  form.elements.apiKey.value='SYNTHETIC-UI-GEMINI-KEY';form.elements.authorized.checked=true;
  form.dispatchEvent(new a.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button[value="save"]')}));
  await workspaceWait(()=>a.w.document.querySelector('.ai-notice')?.textContent,()=>a.w.document.body.textContent);
  const row=f.DB.db.prepare("SELECT owner_id,provider,version,encrypted_payload FROM pilot_ai_connections WHERE provider='gemini'").get();assert.ok(row);assert.equal(row.owner_id,PAS);assert.equal(row.version,1);assert.ok(!row.encrypted_payload.includes('SYNTHETIC-UI-GEMINI-KEY'));
  assert.ok(a.calls.some(call=>call.path==='/api/pilot/supervision/'+PAS+'/assistants/gemini'&&call.method==='POST'));
  assert.equal(a.w.document.querySelector('#ai-connection-form').elements.apiKey.value,'');assert.equal(a.w.localStorage.length,0);assert.equal(a.w.sessionStorage.length,0);
  const events=f.DB.db.prepare("SELECT actor_id FROM pilot_audit WHERE action LIKE 'supervision.assistant.%'").all();assert.ok(events.length);assert.ok(events.every(event=>event.actor_id===ADMIN));
 }finally{a.close();}
});
