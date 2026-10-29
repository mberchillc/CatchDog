import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {harness} from './support/private-harness.mjs';
import {mqEstimate,mqValidateRisk} from '../worker/multiquote.js';
const risk={brand:'Fiat',model:'Chronos',year:'2024',locality:'Caseros',province:'Buenos Aires',coverage:'third_party_full'};
const details={hail:'yes',glass:'yes'};
test('Cronos 2024 Caseros: número inmediato, dos fuentes y adicionales sin tarifa inventada',()=>{
 const r=mqValidateRisk(risk),e=mqEstimate(r,details);
 assert.equal(r.model,'Cronos');assert.equal(e.amountCents,10800000);assert.equal(e.minCents,8500000);assert.equal(e.maxCents,13000000);
 assert.deepEqual(e.sourceIds,['seguros-online','ferri-prices']);assert.equal(e.extrasStatus,'pending');assert.equal(e.insurerQuote,false);assert.equal(e.canApprove,false);assert.equal(e.liveSearch,false);
 assert.ok(e.assumptions.some(s=>s.includes('no discrimina')));assert.ok(e.assumptions.some(s=>s.includes('Versión exacta')));
});
test('otros autos reciben número, coberturas y segmento cambian la referencia sin coeficientes inventados',()=>{
 assert.equal(mqEstimate({}),null);
 const generic=mqEstimate({brand:'Marca',model:'Modelo desconocido'});assert.ok(generic.amountCents>0);assert.ok(generic.assumptions.some(s=>s.includes('escenario inicial')));
 assert.equal(mqEstimate({brand:'Peugeot',model:'208',coverage:'third_party_full'}).amountCents,10500000);
 assert.equal(mqEstimate({brand:'Toyota',model:'Hilux',coverage:'third_party_full'}).amountCents,14500000);
 assert.ok(mqEstimate({...risk,coverage:'liability'}).amountCents<mqEstimate(risk).amountCents);
 const a=mqEstimate({...risk,locality:'Córdoba',province:'Córdoba',usage:'comercial'},details);
 assert.equal(a.amountCents,10800000);assert.ok(a.assumptions.some(s=>s.includes('no representa una tarifa comercial')));
 const high=mqEstimate(risk,{referenceSegment:'high'});assert.equal(high.amountMode,'from');assert.equal(high.amountCents,11000000);assert.equal(high.upperOpen,true);
});
test('importe y fuentes se guardan cifrados; reintento y recuperación conservan la misma fecha; el objetivo no fuerza el precio',async()=>{
 const h=await harness(),b={requestKey:'estimate-cronos-20261029',risk,details,commercial:{targetCents:9000000}};
 const r=await h.call('/work/multiquote/request',{method:'POST',data:b});assert.equal(r.status,201);const {record,orientation}=r.data;
 assert.deepEqual(record.estimate,orientation.estimate);assert.equal(record.risk.model,'Cronos');
 const again=await h.call('/work/multiquote/request',{method:'POST',data:b});assert.equal(again.status,200);assert.deepEqual(again.data.orientation.estimate,record.estimate);
 const get=await h.call('/work/multiquote/requests/'+record.id);assert.deepEqual(get.data.record.estimate,record.estimate);assert.deepEqual(get.data.orientation.estimate,record.estimate);
 const row=h.DB.db.prepare('SELECT payload FROM work_quote_intakes WHERE id=?').get(record.id);assert.ok(!row.payload.includes('10800000'));assert.ok(!row.payload.includes('ferri-prices'));
 const update=await h.call('/work/multiquote/request',{method:'POST',data:{...b,id:record.id,expectedVersion:1,commercial:{targetCents:5000000}}});assert.equal(update.data.record.estimate.amountCents,10800000);assert.equal(update.data.record.version,2);
 assert.equal((await h.call('/work/multiquote/requests/'+record.id,{as:'peer'})).status,404);
 assert.equal((await h.call('/work/multiquote/requests/'+record.id,{as:'other'})).status,404);
});
test('pedido sólo en texto obtiene estimación sin exigir el botón de extracción',async()=>{
 const h=await harness(),r=await h.call('/work/multiquote/request',{method:'POST',data:{requestKey:'text-cronos-only-20261029',description:'Fiat Chronos 2024 en Caseros, terceros completo con granizo y cristales'}});
 assert.equal(r.status,201);assert.equal(r.data.record.risk.model,'Cronos');assert.equal(r.data.record.risk.locality,'Caseros');assert.equal(r.data.record.estimate.amountCents,10800000);
});
test('PDF real tiene logo, importe guardado y dos páginas; el objetivo interno no aparece',async()=>{
 const dom=new JSDOM('',{url:'https://turi.test',runScripts:'outside-only'}),w=dom.window;w.eval(readFileSync('public/vendor/pdf-lib.min.js','utf8'));w.eval(readFileSync('public/quote-pdf.js','utf8'));
 const estimate=mqEstimate(risk,details),record={id:'MUESTRA-CRONOS-20261029',version:1,risk:mqValidateRisk(risk),details,commercial:{targetCents:123456789}};
 const bytes=await w.TuriQuotePDF.create({record,estimate,producerName:'PAS de prueba · Turi',logoBytes:new w.Uint8Array(readFileSync('public/assets/logo.png'))});
 const pdf=await w.PDFLib.PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),2);assert.match(pdf.getTitle(),/Cronos/);
 assert.ok(pdf.getPages().every(p=>p.node.Resources().get(w.PDFLib.PDFName.of('XObject'))));
 const out='C:/Users/mauro/Documents/Codex/2026-10-27/https-chatgpt-com-c-6ae15a26-e690/outputs';
 mkdirSync(out,{recursive:true});writeFileSync(out+'/Turi-cotizacion-modelo-Cronos.pdf',bytes);
 assert.match(w.TuriQuotePDF.filename(record),/^Cotizacion-Turi-Cronos.*v1.pdf$/);
 await assert.rejects(()=>w.TuriQuotePDF.create({record,estimate:{...estimate,insurerQuote:true}}));dom.window.close();
});
test('interfaz PAS muestra importe arriba, invalida PDF al editar y rechaza descarga de una versión reemplazada',async()=>{
 const h=await harness(),dom=new JSDOM('<main id="w-body"></main>',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;
 let created=0,clicked=0;w.URL.createObjectURL=()=>{created++;return 'blob:test'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){clicked++};
 w.TuriQuotePDF={create:async()=>new Uint8Array([1]),filename:()=> 'test.pdf'};
 const request=async(path,method='GET',data)=>{const r=await h.call(path,{method,data});if(r.status>=400)throw Error(r.data.message);return r.data;};
 w.eval(readFileSync('public/multiquote.js','utf8'));w.TuriMultiQuote.configure({user:{id:'DOC-DANI',name:'PAS de prueba'},clients:[],request});
 const root=w.document.querySelector('#w-body');root.innerHTML=w.TuriMultiQuote.render();
 const set=(n,v)=>{const el=root.querySelector('[name='+n+']');el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const wait=async()=>{for(let i=0;i<200&&root.querySelector('#mq-request button[type=submit]')?.disabled;i++)await new Promise(r=>setTimeout(r,5));};
 for(const [n,v] of Object.entries(risk))set(n,v);for(const [n,v] of Object.entries(details))set(n,v);
 root.querySelector('#mq-request').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
 assert.match(root.querySelector('#mq-estimate').textContent,/108.000/);assert.equal(root.querySelector('#mq-estimate').nextElementSibling.id,'mq-request');assert.equal(w.document.activeElement.id,'mq-estimate');
 root.querySelector('[data-mq=pdf]').click();await wait();assert.equal(clicked,1);assert.equal(created,1);
 set('year','2023');assert.equal(root.querySelector('[data-mq=pdf]').disabled,true);assert.equal(root.querySelector('.mq-dirty').hidden,false);
 const rows=(await h.call('/work/overview')).data.quoteIntakes;await w.TuriMultiQuote.resume(rows[0].id);root.innerHTML=w.TuriMultiQuote.render();
 await h.call('/work/multiquote/request',{method:'POST',data:{id:rows[0].id,expectedVersion:1,risk,details}});
 root.querySelector('[data-mq=pdf]').click();await wait();assert.equal(clicked,1);assert.match(root.querySelector('[role=alert]').textContent,/cambió en otra pantalla/);dom.window.close();
});
