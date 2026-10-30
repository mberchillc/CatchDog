import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import worker from '../dist/server/index.js';
import {harness} from './support/private-harness.mjs';
const wait=async(fn,detail=()=> '')=>{for(let i=0;i<350;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}assert.fail('La pantalla no llegó al estado esperado: '+detail());};
const data={holder_name:'CLIENTE FICTICIO · recepción manual',holder_documentType:'DNI',holder_document:'12345678',holder_email:'ficticio@example.invalid',owner_same:'no',owner_name:'TITULAR FICTICIO',owner_relationship:'Familiar',owner_interest:'Bien familiar',vehicle_brand:'Fiat',vehicle_model:'Cronos',vehicle_year:'2024',payment_method:'cbu',payment_bank:'Banco FICTICIO',payment_payer:'PAGADOR FICTICIO',payment_cbu:'0000000000000000000001'};
const request=(h,as='dani')=>async(path,method='GET',body)=>{const r=await h.call(path,{method,data:body,as});if(r.status>=400)throw Object.assign(Error(r.data.message),{status:r.status,code:r.data.error});return r.data;};
test('interfaz PAS: caso editable, enlace, recepción, revisión e incorporación explícita sin modificar otro cliente',async()=>{
 const h=await harness(),old=await h.create('clients',{name:'CLIENTE PREVIO FICTICIO',email:'previo@example.invalid',phone:'',source:'Carga manual',notes:'NOTA A CONSERVAR'});
 const before=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(old.id),dom=new JSDOM('<main id="w-body"></main><div id="w-dialog-slot"></div>',{url:'https://turi.test/privado/#view=emission',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 for(const f of ['intake-fields.js','emission.js'])w.eval(readFileSync('public/'+f,'utf8'));
 const req=request(h);w.TuriEmission.configure({user:{id:'DOC-DANI',role:'producer',name:'PAS FICTICIO DE PRUEBA'},clients:[old],owners:[],companies:(await h.call('/companies')).data.companies,request:req,rawRequest:async()=>{},changed:async()=>{}});
 await w.TuriEmission.load();await w.TuriEmission.start({});const host=w.document.querySelector('#w-body');host.innerHTML=w.TuriEmission.render();
 const set=(key,value)=>{const el=host.querySelector('[name="data.'+key+'"]');assert.ok(el,key);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 for(const [k,v]of Object.entries(data))set(k,v);
 host.querySelector('#emission-record').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>host.textContent.includes('Borrador guardado'),()=>host.textContent);
 const r=h.DB.db.prepare('SELECT * FROM work_emission_cases').get();assert.ok(r);
 host.querySelector('[data-emission=share]').click();await wait(()=>host.querySelector('#emission-share-url'),()=>host.textContent);
 const url=new URL(host.querySelector('#emission-share-url').value),params=new URLSearchParams(url.hash.slice(1)),sent=await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:params.get('token'),data:{...data,holder_name:'CLIENTE NUEVO FICTICIO'},consent:true,fileIds:[]}});assert.equal(sent.status,201);
 await w.TuriEmission.load();host.innerHTML=w.TuriEmission.render();assert.ok(host.textContent.includes('Respuesta del cliente recibida.'));host.querySelector('[data-emission=use-response]').click();await wait(()=>host.querySelector('[name="data.holder_name"]').value==='CLIENTE NUEVO FICTICIO');
 assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,1,'La recepción no incorpora sola');
 host.querySelector('#emission-reviewed').checked=true;host.querySelector('[data-emission=incorporate]').click();await wait(()=>host.textContent.includes('Datos revisados incorporados'),()=>host.textContent);
 assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,2);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(old.id),before);
 assert.equal(w.localStorage.length,0);dom.window.close();
});
test('formulario cliente por pasos: recibe datos, conserva titular distinto y no crea cartera automáticamente',async()=>{
 const h=await harness(),created=await h.call('/work/emission',{method:'POST',data:{branch:'Autos',data:{},title:'PRUEBA DE FORMULARIO'}}),id=created.data.record.id,share=await h.call('/work/emission/'+id+'/share',{method:'POST',data:{expectedVersion:1}}),dom=new JSDOM(readFileSync('public/intake.html','utf8'),{url:share.data.url,runScripts:'outside-only'}),w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=async(url,opt={})=>worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test','CF-Connecting-IP':'192.0.2.70'},body:opt.body}),h.env);
 w.eval(readFileSync('public/intake-fields.js','utf8'));w.eval(readFileSync('public/intake.js','utf8'));await wait(()=>w.document.querySelector('#intake-form'),()=>w.document.body.textContent);
 assert.equal(w.location.hash,'');assert.equal(w.document.querySelector('#intake-files').multiple,true);
 for(const [k,v]of Object.entries(data)){const el=w.document.querySelector('[name="data.'+k+'"]');assert.ok(el,k);el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));}
 w.document.querySelector('[data-intake=step][data-step="3"]').click();assert.ok(!w.document.querySelector('[data-intake-review]').hidden);w.document.querySelector('[name=sendConsent]').checked=true;
 w.document.querySelector('#intake-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('#intake-return'),()=>w.document.body.textContent);
 assert.match(w.document.querySelector('#intake-return').value,/#view=emission&case=/);assert.equal(w.document.querySelector('[name="data.payment_cbu"]'),null);
 const r=await h.call('/work/emission/'+id);assert.equal(r.data.record.response.data.owner_name,data.owner_name);assert.equal(r.data.record.response.data.payment_cbu,data.payment_cbu);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,0);dom.window.close();
});
test('constancia PDF identificable, sin CBU completo, con campos canónicos y apariencia; texto largo no corta referencias',async()=>{
 const dom=new JSDOM('',{url:'https://turi.test',runScripts:'outside-only'}),w=dom.window;w.eval(readFileSync('public/vendor/pdf-lib.min.js','utf8'));w.eval(readFileSync('public/intake-pdf.js','utf8'));
 const receipt={caseId:'CASO-FICTICIO-20261030',responseId:'RESPUESTA-FICTICIA-20261030',branch:'Autos',returnUrl:'https://turi-gestion-dev.pages.dev/privado/#view=emission&case=CASO-FICTICIO-20261030&response=RESPUESTA-FICTICIA-20261030'};
 const bytes=await w.TuriIntakePDF.create({receipt,summary:{name:'CLIENTE FICTICIO · ejemplo de formulario',risk:'Fiat Cronos 2024',company:'Compañía de prueba',payment:'Débito CBU terminado en 0001'},logoBytes:new w.Uint8Array(readFileSync('public/assets/logo.png'))});
 const pdf=await w.PDFLib.PDFDocument.load(bytes),fields=pdf.getForm().getFields();assert.equal(fields.length,2);assert.equal(pdf.getForm().getTextField('turi_case_id').getText(),receipt.caseId);assert.equal(pdf.getForm().getTextField('turi_response_id').getText(),receipt.responseId);assert.ok(fields.every(f=>f.isReadOnly()&&f.acroField.getWidgets().every(widget=>widget.getAppearances().normal)));
 assert.ok(pdf.getPageCount()<=2);writeFileSync('C:/Users/mauro/Documents/Codex/2026-10-27/https-chatgpt-com-c-6ae15a26-e690/outputs/Turi-formulario-constancia-ejemplo.pdf',bytes);
 const identified=await w.TuriIntakePDF.identify({size:bytes.length,arrayBuffer:async()=>bytes});assert.equal(identified.caseId,receipt.caseId);assert.equal(identified.responseId,receipt.responseId);
 await assert.rejects(()=>w.TuriIntakePDF.identify({size:11*1024*1024}),/10 MB/);dom.window.close();
});
test('respuesta tardía no muestra el CBU de una cuenta al cambiar de PAS',async()=>{
 const dom=new JSDOM('<main id="w-body"></main>',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;let resolve;const delayed=new Promise(r=>resolve=r);
 w.eval(readFileSync('public/intake-fields.js','utf8'));w.eval(readFileSync('public/emission.js','utf8'));
 w.TuriEmission.configure({user:{id:'ANTES'},request:()=>delayed});const pending=w.TuriEmission.open('CASO-ANTERIOR-PRUEBA');w.TuriEmission.reset();w.TuriEmission.configure({user:{id:'NUEVO'},request:async()=>({})});resolve({record:{data:{payment_cbu:data.payment_cbu},branch:'Autos',id:'CASO-ANTERIOR-PRUEBA'},collections:[],history:[]});assert.equal(await pending,false);assert.ok(!w.TuriEmission.render().includes(data.payment_cbu));dom.window.close();
});
