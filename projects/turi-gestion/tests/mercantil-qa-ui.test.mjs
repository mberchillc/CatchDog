import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const catalog=JSON.parse(readFileSync('worker/company-catalog.json','utf8'));
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not reach the expected state');};
const empty=()=>({id:null,version:0,status:'not_registered',pasConfigured:false,pasHint:'',taxId:'',portalConfigured:false,apiConfigured:{username:false,password:false,subscriptionKey:false,clientId:false,clientSecret:false,apiKey:false},qaAuthenticated:false});
async function ui({role='producer',rejectQa=false,delayRead,delaySave}={}){
 const dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/#view=companies',runScripts:'outside-only'}),w=dom.window;
 w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 for(const file of ['company-setup.js','workspace.js'])vm.runInContext(readFileSync('public/'+file,'utf8'),dom.getInternalVMContext());
 const user={id:'QA-MAURO-PAS',name:'Mauro · prueba',username:'qa-mauro',role},calls=[],state={};
 if(role==='superadmin')state.mercantil={...empty(),id:'QA-CON-mercantil',version:1,status:'credentials_saved',pasConfigured:true,pasHint:'••••0007'};
 await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user,companies:catalog,expired:()=>{},request:async(path,method='GET',data)=>{
  calls.push({path,method,data});
  if(path==='/work/overview')return {owners:[user],clients:[],policies:[],claims:[],quotes:[],offers:[],tasks:[],today:'2026-11-04'};
  if(path==='/work/integrations')return {integrations:Object.entries(state).filter(([,r])=>r.id).map(([company_id,r])=>({id:r.id,company_id,producer_id:user.id,code_version:r.version,access_status:r.status,stale:true}))};
  if(path==='/audit')return {events:[]};if(path==='/documents/summary')return {available:true,counts:[]};if(path==='/admin/overview')return {users:[user],connections:[]};
  if(path.startsWith('/company-setup/')){
   const id=path.split('/').pop();state[id]??=empty();
   if(method==='GET'){if(delayRead)await delayRead(id);return {companyId:id,record:structuredClone(state[id])};}
   if(delaySave)await delaySave(id);
   state[id]={...state[id],id:'QA-CON-'+id,version:state[id].version+1,pasConfigured:true,status:'credentials_saved',portalConfigured:!!(data.portalUser&&data.portalPassword)||state[id].portalConfigured,apiConfigured:Object.fromEntries(Object.entries(state[id].apiConfigured).map(([k,old])=>[k,!!data.api[k]||old]))};
   return {record:structuredClone(state[id]),message:'Configuración guardada. Acceso API pendiente de validación.'};
  }
  if(path==='/connections/QA-CON-mercantil/mercantil-qa'){
   if(rejectQa)throw Error('Mercantil no aceptó las credenciales API de test.');
   state.mercantil={...state.mercantil,status:'qa_auth_verified',version:state.mercantil.version+1};return {message:'Autenticación QA confirmada. Cartera pendiente.'};
  }
  throw Error('Unexpected request '+path);
 }});
 return {dom,w,calls,state};
}
async function openCompany(w,id){w.document.querySelector(`[data-work="company-setup"][data-company="${id}"]`).click();await wait(()=>w.document.querySelector('#company-access-form')?.dataset.company===id);return w.document.querySelector('#company-access-form');}
function submit(w,f,value='save'){const button=f.querySelector(`button[type="submit"][value="${value}"]`);f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));}
function fill(f){f.elements.pasCode.value='QA-PAS-0007';f.elements.portalUser.value='QA-PORTAL';f.elements.portalPassword.value='QA-PORTAL-SECRET';f.elements.api_username.value='QA-API';f.elements.api_password.value='QA-API-SECRET';if(f.elements.api_subscriptionKey)f.elements.api_subscriptionKey.value='QA-API-KEY';f.elements.authorized.checked=true;}

test('PAS ve diez fichas aunque no haya códigos, con código obligatorio y acceso al portal en cada una',async()=>{
 const {dom,w}=await ui();assert.equal(w.document.querySelectorAll('[data-work="company-setup"]').length,10);
 for(const id of ['mercantil','segunda','cristobal','experta']){const f=await openCompany(w,id);assert.equal(f.elements.pasCode.required,true);assert.equal(f.elements.pasCode.maxLength,120);assert.equal(f.elements.portalPassword.type,'password');assert.ok(f.textContent.includes('Cómo obtener el acceso'));assert.equal(f.querySelectorAll('a[href^="https://"]').length>=1,true);w.document.querySelector('[data-work="close"]').click();}
 dom.window.close();
});
test('Mercantil guarda configuración y prueba desde el servidor sin devolver ni conservar claves en pantalla',async()=>{
 const {dom,w,calls}=await ui(),f=await openCompany(w,'mercantil');fill(f);submit(w,f,'test');await wait(()=>!w.document.querySelector('#company-access-form'));
 const saved=calls.find(c=>c.path==='/company-setup/mercantil'&&c.method==='POST');assert.equal(saved.data.pasCode,'QA-PAS-0007');assert.equal(saved.data.portalPassword,'QA-PORTAL-SECRET');assert.equal(saved.data.api.subscriptionKey,'QA-API-KEY');
 const checked=calls.find(c=>c.path.endsWith('/mercantil-qa'));assert.deepEqual({...checked.data},{expectedVersion:1,useSaved:true,authorized:true});assert.equal(f.elements.portalPassword.value,'');assert.equal(f.elements.api_password.value,'');assert.equal(f.elements.api_subscriptionKey.value,'');assert.ok(w.document.body.textContent.includes('Ingreso QA validado'));assert.ok(w.document.body.textContent.includes('Pendientes de habilitación'));assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);dom.window.close();
});
test('rechazo QA conserva el guardado, informa el problema, limpia claves y permite reintentar con la versión nueva',async()=>{
 const {dom,w,state}=await ui({rejectQa:true}),f=await openCompany(w,'mercantil');fill(f);submit(w,f,'test');await wait(()=>f.querySelector('#dialog-error').textContent.includes('no aceptó'));
 assert.equal(state.mercantil.version,1);assert.equal(f.dataset.version,'1');assert.ok(f.querySelector('#dialog-error').textContent.includes('quedó guardada'));assert.equal(f.elements.portalPassword.value,'');assert.equal(f.elements.api_password.value,'');assert.ok(w.document.querySelector('.w-sidebar'));dom.window.close();
});
test('otra compañía guarda sin llamar al validador de Mercantil y su ficha no ofrece una prueba automática inexistente',async()=>{
 const {dom,w,calls}=await ui(),f=await openCompany(w,'segunda');assert.equal(f.querySelector('button[value="test"]'),null);fill(f);submit(w,f);await wait(()=>!w.document.querySelector('#company-access-form'));assert.ok(calls.some(c=>c.path==='/company-setup/segunda'&&c.method==='POST'));assert.equal(calls.some(c=>c.path.endsWith('/mercantil-qa')),false);dom.window.close();
});
test('el administrador supervisa estados sin formulario de acceso del PAS',async()=>{
 const {dom,w}=await ui({role:'superadmin'});assert.equal(w.document.querySelector('[data-work="company-setup"]'),null);assert.ok(w.document.body.textContent.includes('Mercantil'));dom.window.close();
});
test('una lectura tardía después de salir no vuelve a abrir datos privados',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),{dom,w}=await ui({delayRead:()=>pending});const opening=w.TuriCompanySetup.open('mercantil');w.TuriWorkspace.leave();release();await opening;assert.equal(w.document.querySelector('#company-access-form'),null);dom.window.close();
});
test('un guardado tardío no cierra otro formulario ni inicia su prueba de API',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),{dom,w,calls}=await ui({delaySave:id=>id==='mercantil'?pending:undefined});const first=await openCompany(w,'mercantil');fill(first);submit(w,first,'test');await wait(()=>calls.some(c=>c.path==='/company-setup/mercantil'&&c.method==='POST'));w.document.querySelector('[data-work="close"]').click();const second=await openCompany(w,'segunda');release();await new Promise(r=>setTimeout(r,20));assert.equal(w.document.querySelector('#company-access-form'),second);assert.equal(calls.some(c=>c.path.endsWith('/mercantil-qa')),false);dom.window.close();
});
