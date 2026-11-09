import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {harness} from './support/private-harness.mjs';

const lead=(more={})=>({
 requestKey:'masturi-request-00000001',productType:'auto',product:{brand:'Fiat',model:'Cronos',version:'1.3 Drive',year:'2024',locality:'Villa Ballester',province:'Buenos Aires',postalCode:'1653',usage:'particular',coverage:'third_party_full',insuredValue:'22000000',hail:'yes',glass:'yes'},
 notes:'Quiero comparar una cobertura.',contact:{name:'Cliente de prueba',phone:'+54 11 5555 5555',email:'cliente@example.test',preferred:'whatsapp'},consent:true,website:'',tracking:{source:'instagram',medium:'social',campaign:'lanzamiento',landing:'masturi'},...more
});

test('Más Turi abre formularios desde las diez cards y desde Busco otra cosa',()=>{
 const dom=new JSDOM(readFileSync('public/masturi/index.html','utf8'),{url:'https://turi.test/masturi/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 vm.runInContext(readFileSync('public/masturi/masturi.js','utf8'),dom.getInternalVMContext());
 assert.equal(w.document.querySelectorAll('[data-product]').length,10);
 assert.equal(w.document.querySelectorAll('#other-product-select option').length,22);
 w.document.querySelector('[data-product="auto"]').click();
 assert.equal(w.document.querySelector('[data-step="1"]').hidden,true);
 assert.equal(w.document.querySelector('[data-step="2"]').hidden,false);
 assert.equal(w.document.querySelector('#risk-title').textContent,'Contanos sobre tu auto.');
 assert.ok(w.document.querySelector('#dynamic-fields [name="brand"]'));
 w.document.querySelector('[data-step="2"] [data-back]').click();
 const other=w.document.querySelector('#other-product-select');other.value='ap_gimnasios';other.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(w.document.querySelector('#risk-title').textContent,'Contanos sobre el gimnasio o la actividad.');
 assert.ok(w.document.querySelector('#dynamic-fields [name="peopleCount"]'));
 w.document.querySelector('[data-step="2"] [data-back]').click();other.value='otro';other.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(w.document.querySelector('#risk-title').textContent,'Contanos qué necesitás.');
 assert.ok(w.document.querySelector('#dynamic-fields [name="description"][required]'));
 assert.equal(w.document.querySelector('#general-notes-field').hidden,true);
 dom.window.close();
});

test('Cancelar cotización limpia los datos y el aviso dura tres segundos, sin enviar una consulta',()=>{
 const dom=new JSDOM(readFileSync('public/masturi/index.html','utf8'),{url:'https://turi.test/masturi/?utm_source=instagram',runScripts:'outside-only'}),w=dom.window,scheduled=[];
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.setTimeout=(callback,delay)=>{scheduled.push({callback,delay});return scheduled.length};
 let sent=0;w.fetch=()=>{sent++;throw Error('Cancelar no debe enviar datos')};
 vm.runInContext(readFileSync('public/masturi/masturi.js','utf8'),dom.getInternalVMContext());
 const q=selector=>w.document.querySelector(selector);
 q('[data-product="auto"]').click();q('[name="brand"]').value='Fiat';q('[name="notes"]').value='Mi consulta';q('[name="contactName"]').value='Prueba local';q('[name="contactPhone"]').value='+541155555555';q('[name="consent"]').checked=true;
 assert.equal(q('.quote-toolbar').hidden,false);
 q('[data-cancel-quote]').click();
 assert.equal(q('[data-step="1"]').hidden,false);assert.equal(q('.quote-toolbar').hidden,true);
 assert.equal(q('#dynamic-fields').children.length,0);assert.equal(q('[name="notes"]').value,'');assert.equal(q('[name="contactName"]').value,'');assert.equal(q('[name="contactPhone"]').value,'');assert.equal(q('[name="consent"]').checked,false);
 assert.equal(q('#other-product-select').value,'');assert.equal(w.document.querySelectorAll('.product-card.selected').length,0);assert.equal(q('#quote-notice').textContent,'cotización cancelada');assert.equal(q('#quote-notice').hidden,false);
 const notice=scheduled.find(timer=>timer.delay===3000);assert.ok(notice);notice.callback();assert.equal(q('#quote-notice').hidden,true);assert.equal(q('#quote-notice').textContent,'');assert.equal(sent,0);
 q('[data-product="casa"]').click();assert.equal(q('#risk-title').textContent,'Contanos sobre tu hogar.');assert.equal(q('[name="locality"]').value,'');
 dom.window.close();
});

test('La flecha flotante vuelve al paso anterior y conserva los datos; el carrusel admite teclado y pausa',t=>{
 const dom=new JSDOM(readFileSync('public/masturi/index.html','utf8'),{url:'https://turi.test/masturi/',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>dom.window.close());
 w.HTMLElement.prototype.scrollIntoView=function(){};
 vm.runInContext(readFileSync('public/masturi/masturi.js','utf8'),dom.getInternalVMContext());
 const q=selector=>w.document.querySelector(selector);
 const other=q('#other-product-select');other.value='otro';other.dispatchEvent(new w.Event('change',{bubbles:true}));q('textarea[name="description"]').value='Instalación artística';q('[data-step="2"] [data-next]').click();
 assert.equal(q('[data-step="3"]').hidden,false);q('[data-page-back]').click();assert.equal(q('[data-step="2"]').hidden,false);assert.equal(q('textarea[name="description"]').value,'Instalación artística');
 assert.equal(w.document.querySelectorAll('.product-icon svg').length,10);
 const track=q('#partners-track');assert.equal(track.querySelectorAll('img[alt]').length,17);
 Object.defineProperty(track,'scrollWidth',{value:2400});Object.defineProperty(track,'clientWidth',{value:600});let target;
 track.scrollTo=value=>{target=value.left;track.scrollLeft=value.left};
 track.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.ok(target>0);assert.equal(q('[data-logos-pause]').getAttribute('aria-pressed'),'true');
 q('[data-logos-pause]').click();assert.equal(q('[data-logos-pause]').getAttribute('aria-pressed'),'false');
 dom.window.close();
});

test('Más Turi guarda la consulta cifrada en la cartera de Mauro y devuelve una referencia honesta',async()=>{
 const h=await harness(),r=await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead()});
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.lead.productType,'auto');assert.equal(r.data.lead.estimate.insurerQuote,false);assert.equal(r.data.lead.estimate.kind,'public_reference_estimate');
 const row=h.DB.db.prepare('SELECT * FROM work_quote_intakes WHERE id=?').get(r.data.lead.id);assert.equal(row.owner_id,'DOC-ADMIN');assert.equal(row.status,'public_estimate');assert.ok(!row.payload.includes('Cliente de prueba'));assert.ok(!row.payload.includes('cliente@example.test'));
 const own=await h.call('/work/overview',{as:'mauro'}),other=await h.call('/work/overview',{as:'dani'}),saved=own.data.quoteIntakes.find(x=>x.id===r.data.lead.id);
 assert.equal(saved.sourceChannel,'masturi');assert.equal(saved.contact.name,'Cliente de prueba');assert.equal(saved.tracking.source,'instagram');assert.equal(other.data.quoteIntakes.some(x=>x.id===r.data.lead.id),false);
 const again=await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead()});assert.equal(again.status,200);assert.equal(again.data.lead.id,r.data.lead.id);
});

test('Más Turi recibe otros ramos sin inventar un precio',async()=>{
 const h=await harness(),r=await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead({requestKey:'masturi-request-00000002',productType:'casa',product:{propertyType:'casa',relationship:'propietario',locality:'San Isidro',province:'Buenos Aires',postalCode:'1642',surface:'120',insuredValue:'90000000',protections:'alarma'}})});
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.lead.estimate,null);assert.equal(h.DB.db.prepare('SELECT status FROM work_quote_intakes WHERE id=?').get(r.data.lead.id).status,'public_request');
 const saved=(await h.call('/work/overview',{as:'mauro'})).data.quoteIntakes.find(x=>x.id===r.data.lead.id);assert.equal(saved.productType,'casa');assert.equal(saved.productData.surface,'120');
});

test('Más Turi recibe coberturas especiales y pedidos abiertos sin inventar precios',async()=>{
 const h=await harness();
 const gym=await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead({requestKey:'masturi-request-00000004',productType:'ap_gimnasios',product:{activity:'Gimnasio y musculación',peopleCount:'80',ageRange:'18 a 70 años',frequency:'Lunes a sábado',locality:'San Martín',province:'Buenos Aires',sumInsured:'25000000'}})});
 assert.equal(gym.status,201,JSON.stringify(gym.data));assert.equal(gym.data.lead.productType,'ap_gimnasios');assert.equal(gym.data.lead.estimate,null);
 const other=await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead({requestKey:'masturi-request-00000005',productType:'otro',product:{description:'Necesito cubrir una instalación artística itinerante.'}})});
 assert.equal(other.status,201,JSON.stringify(other.data));assert.equal(other.data.lead.productType,'otro');assert.equal(other.data.lead.estimate,null);
 const overview=(await h.call('/work/overview',{as:'mauro'})).data.quoteIntakes;
 assert.equal(overview.find(x=>x.id===gym.data.lead.id).productData.peopleCount,'80');
 assert.equal(overview.find(x=>x.id===other.data.lead.id).productData.description,'Necesito cubrir una instalación artística itinerante.');
});

test('Más Turi exige consentimiento, limita el origen y habilita CORS sólo para Turi',async()=>{
 const h=await harness();
 assert.equal((await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead({consent:false})})).status,400);
 assert.equal((await h.call('/public/masturi/submit',{method:'POST',as:'',origin:'https://sitio-ajeno.test',data:lead()})).status,403);
 const accepted=await h.call('/public/masturi/submit',{method:'POST',as:'',origin:'https://www.turi.com.ar',data:lead({requestKey:'masturi-request-00000003'})});assert.equal(accepted.status,201);assert.equal(accepted.response.headers.get('access-control-allow-origin'),'https://www.turi.com.ar');
});
