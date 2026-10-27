// Read-only visual fixtures. These files and records never enter the hosted build.
import {JSDOM} from 'jsdom';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const owners=[{id:'QA-ADMIN',name:'Mauro Berchi',role:'superadmin',username:'qa-admin',code_configured:1},{id:'QA-PAS',name:'Daniel Stern',role:'producer',username:'qa-pas',code_configured:1}];
const base={owner_id:'QA-PAS',version:1,created_at:Date.now(),updated_at:Date.now()};
const sandbox={window:{}};vm.runInNewContext(readFileSync('public/data.js','utf8'),sandbox);const companies=sandbox.window.TURI_SEED.companies;
const data={owners,today:'2026-10-27',source:'visual_fixture',clients:[{...base,id:'QA-C1',name:'María López · prueba',phone:'',email:'prueba@example.invalid',source:'Referido',archived:0,marketingConsent:false},{...base,id:'QA-C2',name:'Carlos Fernández · prueba',phone:'',email:'',source:'Web',archived:0,marketingConsent:false}],policies:[{...base,id:'QA-P1',client_id:'QA-C1',number:'000045 · muestra',risk:'Toyota Corolla · muestra',branch:'Autos',company_id:'segunda',premiumCents:7850000,currency:'ARS',paymentStatus:'pending',status:'renewal',starts_on:'2025-11-01',expires_on:'2026-11-01'},{...base,id:'QA-P2',client_id:'QA-C2',number:'000046 · muestra',risk:'Vivienda · muestra',branch:'Hogar',company_id:'rivadavia',premiumCents:2450000,currency:'ARS',paymentStatus:'current',status:'active',starts_on:'2026-05-01',expires_on:'2027-05-01'}],claims:[{...base,id:'QA-S1',policy_id:'QA-P1',reference:'SIN-MUESTRA',title:'Daño parcial · muestra',nextAction:'Pedir presupuesto',status:'documents',occurred_on:'2026-10-20',next_due:'2026-10-28'}],tasks:[{...base,id:'QA-T1',title:'Revisar renovación con María · prueba',category:'renewals',priority:'red',due_on:'2026-10-27',status:'open',client_id:'QA-C1'},{...base,id:'QA-T2',title:'Conciliar liquidaciones · prueba',category:'accounting',priority:'amber',due_on:'2026-10-29',status:'open'},{...base,id:'QA-T3',title:'Preparar seguimiento comercial · prueba',category:'marketing',priority:'green',due_on:'2026-10-30',status:'open'}],quotes:[{...base,id:'QA-Q1',client_id:'QA-C1',branch:'Autos',risk:'Toyota Corolla · prueba',status:'comparing'}],offers:[],automaticQuotes:false};
const connections=[{id:'QA-CON1',producer_id:'QA-PAS',company_id:'segunda',code_version:1,connection_version:1,permission:'pending',channel:'assisted',technical:'pending',version:1,automaticQuotes:false,stale:false},{id:'QA-CON2',producer_id:'QA-PAS',company_id:'rivadavia',code_version:1,connection_version:1,permission:'confirmed',channel:'api_requested',technical:'documentation',version:1,automaticQuotes:false,stale:false}];
mkdirSync('qa/visual',{recursive:true});
for(const page of ['home','clients','policies','claims','quotes','tasks','companies','producers','activity']){
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'http://terminal.local:4173/_visual/'+page+'#view='+page,runScripts:'outside-only'});dom.window.scrollTo=()=>{};
 vm.runInContext(readFileSync('public/workspace.js','utf8'),dom.getInternalVMContext());
 await dom.window.TuriWorkspace.open({root:dom.window.document.querySelector('#pilot'),user:owners[0],companies,request:async path=>path==='/work/overview'?data:path==='/work/integrations'?{integrations:connections}:path==='/admin/overview'?{users:owners,connections}:path==='/audit'?{events:[]}:null});
 for(const script of dom.window.document.querySelectorAll('script'))script.remove();
 dom.window.document.querySelector('.w-footer span:last-child').textContent='QA visual · datos ficticios · vista estática';
 writeFileSync('qa/visual/'+page+'.html',dom.serialize());dom.window.close();
}
console.log('9 vistas de QA generadas; no se publican ni escriben en la base.');
