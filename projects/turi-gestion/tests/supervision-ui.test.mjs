import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ui,wait,PAS,PEER,ADMIN} from './support/supervision-fixture.mjs';

async function company(w,id='mercantil'){
 w.document.querySelector(`[data-work="company-setup"][data-company="${id}"]`).click();await wait(()=>w.document.querySelector('#company-access-form')?.dataset.company===id);return w.document.querySelector('#company-access-form');
}
const buttons=w=>[...w.document.querySelectorAll('[data-work="company-setup"]')].map(b=>[b.dataset.company,b.textContent,b.disabled]);

test('Superadmin en vista PAS muestra exactamente la misma pantalla Compañías y las diez configuraciones',async()=>{
 const f=await fixture(),pas=await ui(f),admin=await ui(f,{as:ADMIN,producerId:PAS});
 try{
  assert.equal(admin.w.document.querySelectorAll('[data-work="company-setup"]').length,10);assert.deepEqual(buttons(admin.w),buttons(pas.w));
  assert.equal(admin.w.document.querySelector('#pilot').innerHTML,pas.w.document.querySelector('#pilot').innerHTML);
  assert.ok(admin.w.document.querySelector('#supervision-strip').textContent.includes('Solo lectura'));assert.equal(admin.w.document.querySelector('#supervision-producer').value,PAS);assert.equal(admin.w.document.querySelectorAll('#supervision-producer option').length,2);
  assert.equal(admin.w.document.querySelector('[data-page="producers"]'),null);assert.ok(admin.w.document.querySelector('.w-profile').textContent.includes('PAS ficticio de Mauro'));
  for(const id of ['mercantil','experta','cristobal','federacion','provincia','allianz','zurich','segunda','rivadavia','sancor']){
   const normal=await company(pas.w,id),mirror=await company(admin.w,id);assert.equal(mirror.outerHTML,normal.outerHTML,id);assert.equal(mirror.elements.portalPassword.type,'password');admin.w.document.querySelector('[data-work="close"]').click();pas.w.document.querySelector('[data-work="close"]').click();
  }
 }finally{pas.close();admin.close();}
});
test('elegir un productor en Cartera o Ver como PAS abre su vista completa conservando la sección',async()=>{
 const f=await fixture(),admin=await ui(f,{as:ADMIN});try{
  const opened=[];admin.w.TuriSupervision.open=(id,page)=>opened.push({id,page});
  const select=admin.w.document.querySelector('#work-owner');select.value=PAS;select.dispatchEvent(new admin.w.Event('change',{bubbles:true}));assert.deepEqual(opened,[{id:PAS,page:'companies'}]);
  await admin.w.TuriWorkspace.go('producers');const button=admin.w.document.querySelector(`[data-work="owner"][data-id="${PEER}"]`);assert.equal(button.textContent,'Ver como PAS');button.click();await wait(()=>opened.length===2);assert.deepEqual(opened[1],{id:PEER,page:'policies'});
 }finally{admin.close();}
});
test('se puede abrir y recorrer el formulario real de API; guardar o probar en supervisión no modifica accesos',async()=>{
 const f=await fixture(),admin=await ui(f,{as:ADMIN,producerId:PAS});try{
  const form=await company(admin.w);form.elements.pasCode.value='QA-INSPECCION';form.elements.portalUser.value='QA-USUARIO';form.elements.portalPassword.value='QA-CLAVE';form.elements.authorized.checked=true;
  const testButton=form.querySelector('button[value="test"]');assert.equal(testButton.disabled,false);form.dispatchEvent(new admin.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:testButton}));
  await wait(()=>form.querySelector('#dialog-error').textContent.includes('supervisando'));assert.equal(testButton.disabled,false);assert.equal(form.elements.portalPassword.value,'');assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_connections').get().n,0);assert.equal(admin.calls.some(c=>c.method!=='GET'),false);assert.equal(admin.w.localStorage.length,0);assert.equal(admin.w.sessionStorage.length,0);
 }finally{admin.close();}
});
test('Mi correo y los formularios de código muestran la cuenta PAS seleccionada y bloquean cambios',async()=>{
 const f=await fixture(),admin=await ui(f,{as:ADMIN,producerId:PAS});try{
  admin.w.document.querySelector('[data-action="email-settings"]').click();const email=admin.w.document.querySelector('#email-start');assert.equal(email.elements.email.value,'qa-'+PAS.toLowerCase()+'@example.invalid');assert.ok(!email.innerHTML.includes(ADMIN.toLowerCase()));
  email.dispatchEvent(new admin.w.SubmitEvent('submit',{bubbles:true,cancelable:true}));await wait(()=>email.querySelector('#error').textContent.includes('supervisando'));assert.equal(admin.calls.some(c=>c.method!=='GET'),false);
  admin.w.document.querySelector('[data-action="continue"]').click();await wait(()=>admin.w.document.querySelector('[data-action="add"]'));admin.w.document.querySelector('[data-action="add"]').click();const code=admin.w.document.querySelector('#connection');assert.ok(code);assert.equal(code.querySelectorAll('select option').length,16);assert.equal(code.elements.pasCode.required,true);
 }finally{admin.close();}
});
test('la navegación completa utiliza datos PAS, incluidas las fotos, sin mezclar otra cartera',async()=>{
 const f=await fixture(),client=await f.create('clients',{name:'CLIENTE VISIBLE DEL PAS FICTICIO'});await f.create('clients',{name:'CLIENTE AJENO QUE NO DEBE APARECER'},PEER);const file=await f.upload(client.id),admin=await ui(f,{as:ADMIN,producerId:PAS});try{
  for(const page of ['clients','policies','claims','quotes','tasks','documents','archive','activity','emission','multiquote','companies']){
   await admin.w.TuriWorkspace.go(page);assert.ok(!admin.w.document.querySelector('#pilot').textContent.includes('CLIENTE AJENO QUE NO DEBE APARECER'),page);assert.ok(admin.w.document.querySelector('#supervision-strip'),page);
   if(page==='clients'){assert.ok(admin.w.document.body.textContent.includes(client.name));admin.w.document.querySelector('[data-work="new"]').click();assert.ok(admin.w.document.querySelector('#work-record'));admin.w.document.querySelector('[data-work="close"]').click();}
   if(page==='documents'){const img=admin.w.document.querySelector('.d-card-photo');assert.ok(img);assert.equal(img.getAttribute('src'),'/api/pilot/supervision/'+PAS+'/documents/'+file.document.id+'/preview');admin.w.document.querySelector('[data-doc="preview"]').click();await wait(()=>admin.w.document.querySelector('#document-photo')?.src.startsWith('blob:'),()=>admin.w.document.body.textContent);assert.deepEqual(new Uint8Array(await admin.blobs.at(-1).arrayBuffer()),file.bytes);admin.w.document.querySelector('#document-dialog [data-doc="close"]').click();}
  }
  const business=admin.calls.filter(c=>c.path!=='/api/pilot/admin/overview');for(const path of ['/documents','/work/archive','/work/emission','/work/multiquote/catalog'])assert.ok(business.some(c=>c.path.split('?')[0]==='/api/pilot/supervision/'+PAS+path),path);assert.ok(business.every(c=>c.path.startsWith('/api/pilot/supervision/'+PAS+'/')));assert.equal(admin.calls.some(c=>c.method!=='GET'),false);
 }finally{admin.close();}
});
test('la campanita abre la respuesta real sin marcarla leída para el PAS ni cambiar sus expedientes',async()=>{
 const f=await fixture(),received=await f.receive(),before=f.DB.db.prepare('SELECT * FROM work_emission_cases').all(),admin=await ui(f,{as:ADMIN,producerId:PAS});try{
  admin.w.document.querySelector('[data-notification="toggle"]').click();await wait(()=>admin.w.document.querySelector(`[data-notification="open"][data-response="${received.responseId}"]`));admin.w.document.querySelector('[data-notification="open"]').click();await wait(()=>admin.w.document.querySelector('[data-page="emission"][aria-current="page"]'));
  assert.equal(f.DB.db.prepare('SELECT count(*) n FROM work_emission_reads').get().n,0);assert.deepEqual(f.DB.db.prepare('SELECT * FROM work_emission_cases').all(),before);assert.equal(admin.calls.some(c=>c.method!=='GET'),false);
 }finally{admin.close();}
});
test('cada perfil usa su propio ámbito y las denegaciones no muestran datos ni formularios de ingreso del PAS',async()=>{
 const f=await fixture();await f.create('clients',{name:'DATOS ÚNICOS PRIMER PAS'});await f.create('clients',{name:'DATOS ÚNICOS SEGUNDO PAS'},PEER);
 const first=await ui(f,{as:ADMIN,producerId:PAS,page:'clients'}),second=await ui(f,{as:ADMIN,producerId:PEER,page:'clients'}),denied=await ui(f,{as:PEER,producerId:PAS});try{
  assert.ok(first.w.document.body.textContent.includes('DATOS ÚNICOS PRIMER PAS'));assert.ok(!first.w.document.body.textContent.includes('DATOS ÚNICOS SEGUNDO PAS'));assert.ok(second.w.document.body.textContent.includes('DATOS ÚNICOS SEGUNDO PAS'));assert.ok(!second.w.document.body.textContent.includes('DATOS ÚNICOS PRIMER PAS'));
  assert.equal(denied.w.document.querySelector('.w-sidebar'),null);assert.equal(denied.w.document.querySelector('form'),null);assert.ok(denied.w.document.body.textContent.includes('superadministrador'));assert.equal(denied.w.document.querySelector('a').getAttribute('href'),'/admin/');
 }finally{first.close();second.close();denied.close();}
});


test('guardar desde la cuenta PAS normal conserva su funcionamiento y su atribución',async()=>{
 const f=await fixture(),pas=await ui(f);try{
  const form=await company(pas.w);form.elements.pasCode.value='QA-PAS-NORMAL';form.elements.authorized.checked=true;form.dispatchEvent(new pas.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button[value="save"]')}));
  await wait(()=>!pas.w.document.querySelector('#company-access-form'),()=>pas.w.document.body.textContent);const row=f.DB.db.prepare('SELECT producer_id,version FROM pilot_connections').get();assert.equal(row.producer_id,PAS);assert.equal(row.version,1);assert.ok(pas.calls.some(c=>c.path==='/api/pilot/company-setup/mercantil'&&c.method==='POST'));assert.equal(pas.w.document.querySelector('#supervision-strip'),null);
 }finally{pas.close();}
});
