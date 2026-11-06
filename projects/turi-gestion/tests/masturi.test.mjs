import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './support/private-harness.mjs';

const lead=(more={})=>({
 requestKey:'masturi-request-00000001',productType:'auto',product:{brand:'Fiat',model:'Cronos',version:'1.3 Drive',year:'2024',locality:'Villa Ballester',province:'Buenos Aires',postalCode:'1653',usage:'particular',coverage:'third_party_full',insuredValue:'22000000',hail:'yes',glass:'yes'},
 notes:'Quiero comparar una cobertura.',contact:{name:'Cliente de prueba',phone:'+54 11 5555 5555',email:'cliente@example.test',preferred:'whatsapp'},consent:true,website:'',tracking:{source:'instagram',medium:'social',campaign:'lanzamiento',landing:'masturi'},...more
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

test('Más Turi exige consentimiento, limita el origen y habilita CORS sólo para Turi',async()=>{
 const h=await harness();
 assert.equal((await h.call('/public/masturi/submit',{method:'POST',as:'',data:lead({consent:false})})).status,400);
 assert.equal((await h.call('/public/masturi/submit',{method:'POST',as:'',origin:'https://sitio-ajeno.test',data:lead()})).status,403);
 const accepted=await h.call('/public/masturi/submit',{method:'POST',as:'',origin:'https://www.turi.com.ar',data:lead({requestKey:'masturi-request-00000003'})});assert.equal(accepted.status,201);assert.equal(accepted.response.headers.get('access-control-allow-origin'),'https://www.turi.com.ar');
});
