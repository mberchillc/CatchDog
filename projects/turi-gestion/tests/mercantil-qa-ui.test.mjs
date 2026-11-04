import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';

async function ui({role='producer',reject=false}={}){
 const dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/#view=companies',runScripts:'outside-only'}),w=dom.window;
 w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 vm.runInContext(readFileSync('public/workspace.js','utf8'),dom.getInternalVMContext());
 const user={id:'QA-MAURO-PAS',name:'Mauro · prueba',username:'qa-mauro',role},calls=[];
 const company={id:'mercantil',name:'Mercantil Andina',api:{label:'Acceso QA pendiente'}};
 let integration={id:'QA-CONNECTION',producer_id:user.id,company_id:company.id,code_version:1,access_status:'registered',stale:true};
 await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user,companies:[company],request:async(path,method='GET',data)=>{
  calls.push({path,method,data});
  if(path==='/work/overview')return {owners:[user],clients:[],policies:[],claims:[],quotes:[],offers:[],tasks:[],today:'2026-11-04'};
  if(path==='/work/integrations')return {integrations:[integration]};
  if(path==='/audit')return {events:[]};
  if(path==='/documents/summary')return {available:true,counts:[]};
  if(path==='/admin/overview')return {users:[user],connections:[]};
  if(path==='/connections/QA-CONNECTION/mercantil-qa'){
   if(reject)throw Error('Mercantil no aceptó las credenciales API de test.');
   integration={...integration,code_version:2,access_status:'qa_auth_verified'};
   return {message:'Autenticación QA confirmada. Cartera pendiente.'};
  }
  throw Error('Unexpected request '+path);
 }});
 return {dom,w,calls};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('el PAS valida desde Compañías; las claves no se precargan, se envían sólo a su servidor y se limpian',async()=>{
 const {dom,w,calls}=await ui();
 w.document.querySelector('[data-work="mercantil-qa"]').click();await settle();
 const f=w.document.querySelector('#work-mercantil-qa');assert.ok(f);assert.equal(f.elements.apiPassword.type,'password');assert.equal(f.elements.subscriptionKey.type,'password');assert.equal(f.elements.apiPassword.value,'');
 f.elements.apiUsername.value='QA-USER';f.elements.apiPassword.value='QA-PASSWORD';f.elements.subscriptionKey.value='QA-KEY';f.elements.authorized.checked=true;
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
 const sent=calls.find(c=>c.path.endsWith('/mercantil-qa'));assert.deepEqual({...sent.data},{apiUsername:'QA-USER',apiPassword:'QA-PASSWORD',subscriptionKey:'QA-KEY',authorized:true,expectedVersion:1});
 assert.equal(f.elements.apiPassword.value,'');assert.equal(f.elements.subscriptionKey.value,'');assert.ok(w.document.body.textContent.includes('Ingreso QA validado'));assert.ok(w.document.body.textContent.includes('No habilitada'));
 assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);dom.window.close();
});
test('un rechazo deja el error visible y limpia las claves sin abandonar el entorno privado',async()=>{
 const {dom,w}=await ui({reject:true});w.document.querySelector('[data-work="mercantil-qa"]').click();await settle();const f=w.document.querySelector('#work-mercantil-qa');
 f.elements.apiUsername.value='QA-USER';f.elements.apiPassword.value='QA-PASSWORD';f.elements.subscriptionKey.value='QA-KEY';f.elements.authorized.checked=true;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
 assert.ok(w.document.querySelector('#dialog-error').textContent.includes('no aceptó'));assert.equal(f.elements.apiPassword.value,'');assert.equal(f.elements.subscriptionKey.value,'');assert.ok(w.document.querySelector('.w-sidebar'));dom.window.close();
});
test('el administrador sólo supervisa el estado y no recibe el formulario de credenciales del PAS',async()=>{
 const {dom,w}=await ui({role:'superadmin'});assert.equal(w.document.querySelector('[data-work="mercantil-qa"]'),null);assert.ok(w.document.body.textContent.includes('Autenticación API de prueba'));dom.window.close();
});
