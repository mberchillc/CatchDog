import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './support/private-harness.mjs';
import {mqOrientation,mqCommercial,mqValidateDetails,mqExtract,mqPrepare,MQ_SOURCE_CATALOG} from '../worker/multiquote.js';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
let h;
test('pedido inicial vacío se guarda y recupera sin exigir cliente ni inventar un precio',async()=>{
 h=await harness();const r=await h.call('/work/multiquote/request',{method:'POST',data:{requestKey:'empty-request-20261029'}});assert.equal(r.status,201,JSON.stringify(r.data));
 assert.equal(r.data.record.clientId,'');assert.equal(r.data.record.status,'needs_data');assert.equal(r.data.orientation.insurerQuotes.length,0);assert.equal(r.data.orientation.canApprove,false);assert.equal(r.data.orientation.frame,null);
 assert.equal(r.data.orientation.providerRequests.every(p=>p.sent===false),true);
 const get=await h.call('/work/multiquote/requests/'+r.data.record.id);assert.equal(get.status,200);assert.equal(get.data.record.id,r.data.record.id);
 const list=await h.call('/work/overview');assert.equal(list.data.quoteIntakes.length,1);assert.equal(list.data.offers.length,0);assert.equal(list.data.quotes.length,0);
});
test('datos parciales, idempotencia, persistencia cifrada y actualización posterior con versión',async()=>{
 const b={requestKey:'partial-request-20261029',description:'Vehículo PRIVADO <script>bad()</script>',risk:{brand:'Chevrolet',model:'Celta',year:'2014',locality:'Villa Ballester',coverage:'third_party_full'},details:{hail:'yes',glass:'yes'},commercial:{currentCents:10000000,targetCents:9000000,currentInsurer:'Compañía de prueba'}};
 const r=await h.call('/work/multiquote/request',{method:'POST',data:b});assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.record.id;
 assert.equal(r.data.orientation.frame.match,'partial');assert.equal(r.data.orientation.frame.differences.find(x=>x.key==='year').reference,'2012');assert.equal(r.data.orientation.commercial.savingsPercent,10);
 const again=await h.call('/work/multiquote/request',{method:'POST',data:b});assert.equal(again.status,200);assert.equal(again.data.record.id,id);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:{...b,description:'Changed'}})).status,409);
 const stored=JSON.stringify(h.DB.db.prepare('SELECT * FROM work_quote_intakes WHERE id=?').get(id));assert.ok(!stored.includes('PRIVADO'));assert.ok(!stored.includes('Celta'));assert.ok(!stored.includes('Compañía de prueba'));assert.ok(!stored.includes('9000000'));assert.ok(!JSON.stringify(r.data.record).includes('request_hash'));
 const update={...b,id,expectedVersion:1,risk:{...b.risk,postalCode:'1653',usage:'particular'}};
 const changed=await h.call('/work/multiquote/request',{method:'POST',data:update});assert.equal(changed.status,200);assert.equal(changed.data.record.version,2);assert.equal(changed.data.record.risk.usage,'particular');assert.equal(changed.data.record.details.hail,'yes');assert.equal(changed.data.record.commercial.targetCents,9000000);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:update})).status,409);
 const audit=await h.call('/audit');assert.ok(!JSON.stringify(audit.data).includes('PRIVADO'));assert.ok(!JSON.stringify(audit.data).includes('Celta'));
});
test('aislamiento por PAS/organización, atribución del cliente, CSRF y montos inválidos',async()=>{
 const owned=(await h.call('/work/overview')).data.quoteIntakes[0];
 assert.equal((await h.call('/work/multiquote/requests/'+owned.id,{as:'peer'})).status,404);
 assert.equal((await h.call('/work/multiquote/requests/'+owned.id,{as:'other'})).status,404);
 assert.equal((await h.call('/work/multiquote/requests/'+owned.id,{as:''})).status,401);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',as:'peer',data:{id:owned.id,expectedVersion:1}})).status,404);
 const base={requestKey:'guarded-request-20261029'};
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:base,csrf:false})).status,403);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:base,origin:'https://other.test'})).status,403);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:{...base,ownerId:'DOC-PEER'}})).status,403);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:{...base,commercial:{targetCents:-1}}})).status,400);
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:{...base,risk:{year:'not-a-year'}}})).status,400);
 const peer=await h.create('clients',{name:'Otro PAS',email:'',phone:'',source:'Prueba',notes:''},'peer');
 assert.equal((await h.call('/work/multiquote/request',{method:'POST',data:{...base,clientId:peer.id}})).status,404);
 const admin=await h.call('/work/multiquote/requests/'+owned.id,{as:'mauro'});assert.equal(admin.status,200);
 const foreign=await h.call('/work/overview',{as:'other'});assert.equal(foreign.data.quoteIntakes.length,0);
});
test('referencias conservan procedencia, fecha, diferencias y adicional sin tarifa inventada',async()=>{
 const catalog=await h.call('/work/multiquote/catalog');assert.equal(catalog.status,200);assert.equal(catalog.data.catalog.sources.length,7);
 const s=MQ_SOURCE_CATALOG.sources;assert.equal(new Set(s.map(x=>x.id)).size,7);assert.ok(s.every(x=>new URL(x.url).protocol==='https:'&&x.reviewedAt&&x.limitations));assert.equal(s.filter(x=>x.bands).length,2);
 const a=mqOrientation({brand:'Chevrolet',model:'Celta',year:'2012',version:'1.4 LT',locality:'Villa Ballester',coverage:'third_party_full'},{hail:'yes',glass:'yes'});
 assert.equal(a.frame.bands[0].minCents,7500000);assert.equal(a.frame.bands[0].maxCents,9000000);assert.equal(a.frame.adjusted,false);assert.equal(a.frame.sourceType,'ai_summary');assert.equal(a.canApprove,false);
 assert.equal(mqOrientation({brand:'Ford',model:'Focus',coverage:'third_party_full',locality:'Córdoba'}).frame,null);
 assert.equal(mqOrientation({model:'Celta'}).frame,null);assert.deepEqual(mqCommercial({}),{currentCents:null,targetCents:null,currentInsurer:'',savingsCents:null,savingsPercent:null});
 assert.equal(mqCommercial({currentCents:10000000,targetCents:11000000}).savingsPercent,-10);
 assert.equal(mqValidateDetails({garage:'invented',driverAge:'200',insuredValue:'-10'}).driverAge,'');
});
test('lectura reconoce sin choques sin eliminar la cobertura y mantiene la información opcional',async()=>{
 const s='Chevrolet Celta 1.4 LT 2012 en Villa Ballester, terceros completo con granizo y cristales, sin choques. Uso particular.';
 assert.equal(mqExtract(s).coverage,'third_party_full');const p=await mqPrepare(s);assert.equal(p.details.claimsHistory,'none');assert.equal(p.details.hail,'yes');assert.equal(p.details.glass,'yes');assert.equal(p.risk.usage,'particular');assert.equal(p.risk.postalCode,'');
});
test('interfaz real: solicitar con datos vacíos, retomar y enriquecer sin duplicar ni perder los campos',async()=>{
 const local=await harness(),dom=new JSDOM('<main id="w-body"></main>',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;
 const request=async(path,method='GET',data)=>{const r=await local.call(path,{method,data});if(r.status>=400)throw Error(r.data.message);return r.data;};
 w.eval(readFileSync('public/multiquote.js','utf8'));w.TuriMultiQuote.configure({user:{id:'DOC-DANI'},clients:[],request});await w.TuriMultiQuote.load();
 const host=w.document.querySelector('#w-body');host.innerHTML=w.TuriMultiQuote.render();
 assert.equal(w.document.querySelectorAll('#mq-request [required]').length,0);assert.equal(w.document.querySelector('#mq-request').noValidate,true);
 const submit=async()=>{w.document.querySelector('#mq-request').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<100&&w.document.querySelector('#mq-request button[type=submit]')?.disabled;i++)await new Promise(r=>setTimeout(r,5));};
 await submit();assert.match(host.textContent,/Pedido inicial registrado/);assert.match(host.textContent,/pedido aún no enviado/);assert.equal(host.querySelector('[data-work=approve]'),null);
 let rows=(await local.call('/work/overview')).data.quoteIntakes;assert.equal(rows.length,1);const id=rows[0].id;
 const set=(name,value)=>{const el=w.document.querySelector('[name='+name+']');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 set('brand','Chevrolet');set('model','Celta');set('year','2012');set('version','1.4 LT');set('locality','Villa Ballester');set('coverage','third_party_full');set('hail','yes');set('glass','yes');set('currentAmount','100000');set('targetAmount','90000');
 assert.match(w.document.querySelector('#mq-savings').textContent,/10%/);assert.ok(w.document.querySelector('.mq-request-result').hasAttribute('data-unsaved'));
 await submit();rows=(await local.call('/work/overview')).data.quoteIntakes;assert.equal(rows.length,1);assert.equal(rows[0].version,2);assert.equal(rows[0].commercial.currentCents,10000000);
 w.TuriMultiQuote.reset();await w.TuriMultiQuote.resume(id);host.innerHTML=w.TuriMultiQuote.render();assert.equal(w.document.querySelector('[name=targetAmount]').value,'90000');assert.equal(w.document.querySelector('[name=hail]').value,'yes');
 assert.equal(w.document.querySelector('[name=postalCode]').value,'');assert.match(host.textContent,/75.000/);
 set('description','<img src=x onerror=bad()>');await submit();assert.equal(host.querySelector('img[src=x]'),null);
 dom.window.close();
});

test('una recuperación tardía no expone datos del PAS que acaba de cerrar su sesión',async()=>{
 const dom=new JSDOM('<main id="w-body"></main>',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;let release;const gate=new Promise(resolve=>{release=resolve});
 w.eval(readFileSync('public/multiquote.js','utf8'));w.TuriMultiQuote.configure({user:{id:'OLD'},request:()=>gate});const pending=w.TuriMultiQuote.resume('old-request');w.TuriMultiQuote.reset();w.TuriMultiQuote.configure({user:{id:'NEW'},request:async()=>({})});
 release({record:{id:'old-request',owner_id:'OLD',description:'DATOS PRIVADOS DEL ANTERIOR',risk:{},details:{},commercial:{},clientId:''},orientation:{}});assert.equal(await pending,false);assert.ok(!w.TuriMultiQuote.render().includes('DATOS PRIVADOS DEL ANTERIOR'));dom.window.close();
});

test('navegación PAS: el pedido guardado aparece inmediatamente en Cotizaciones y se retoma',async()=>{
 const local=await harness(),dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 const request=async(path,method='GET',data)=>{const r=await local.call(path,{method,data});if(r.status>=400)throw Error(r.data.message);return r.data;};
 w.eval(readFileSync('public/multiquote.js','utf8'));w.eval(readFileSync('public/workspace.js','utf8'));
 await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user:{id:'DOC-DANI',name:'PAS ficticio',username:'dani',role:'producer'},companies:(await local.call('/companies')).data.companies,request,expired:()=>{}});
 await w.TuriWorkspace.go('multiquote');const input=w.document.querySelector('[name=model]');input.value='Celta';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('#mq-request').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let i=0;i<200&&w.document.querySelector('#mq-request button[type=submit]')?.disabled;i++)await new Promise(r=>setTimeout(r,5));
 await w.TuriWorkspace.go('quotes');assert.match(w.document.querySelector('#w-body').textContent,/Celta/);const resume=w.document.querySelector('[data-work=quote-continue]');assert.ok(resume);resume.click();
 for(let i=0;i<200&&!w.document.querySelector('[name=model]');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(w.document.querySelector('[name=model]').value,'Celta');assert.equal(w.document.querySelector('[name=postalCode]').value,'');assert.equal((await local.call('/work/overview')).data.quoteIntakes.length,1);dom.window.close();
});
