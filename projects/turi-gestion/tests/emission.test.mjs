import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './support/private-harness.mjs';
import {digest} from '../worker/security.js';
import {normalizeIntakeData} from '../worker/emission.js';
const d={holder_name:'CLIENTE FICTICIO FORMULARIO',holder_documentType:'DNI',holder_document:'12345678',holder_email:'form@example.invalid',holder_phone:'+54 9 11 4444 2222',owner_same:'no',owner_name:'TITULAR FICTICIO',owner_documentType:'DNI',owner_document:'23456789',owner_relationship:'Familiar',owner_interest:'Paga el seguro del vehículo familiar',vehicle_brand:'Fiat',vehicle_model:'Cronos',vehicle_year:'2024',payment_method:'cbu',payment_payer:'PAGADOR FICTICIO',payment_document:'23456789',payment_bank:'Banco de prueba',payment_cbu:'0000000000000000000001',payment_authorization:'Pendiente firma'};
const create=async(h,more={})=>{const r=await h.call('/work/emission',{method:'POST',data:{branch:'Autos',title:'Caso FICTICIO',data:d,...more}});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.record;};
const share=async(h,r)=>{const a=await h.call('/work/emission/'+r.id+'/share',{method:'POST',data:{expectedVersion:r.version}});assert.equal(a.status,200,JSON.stringify(a.data));return {record:a.data.record,...Object.fromEntries(new URLSearchParams(new URL(a.data.url).hash.slice(1))),id:r.id};};
test('schema de emisión: tomador/titular, CBU, tarjeta sin PAN/CVV y validación de datos',()=>{
 assert.equal(normalizeIntakeData(d).errors.length,0);
 assert.ok(normalizeIntakeData({...d,payment_cbu:'1234'}).errors.length);
 assert.ok(normalizeIntakeData({...d,payment_pan:'4111111111111111'}).errors.length);
 assert.ok(normalizeIntakeData({...d,payment_cvv:'123'}).errors.length);
 const card=normalizeIntakeData({...d,payment_method:'card',payment_last4:'1234',payment_expiry:'12/2028'});
 assert.ok(card.missing.some(x=>x.key==='secure_card_registration'));assert.equal(card.data.payment_cbu,'');
 assert.ok(normalizeIntakeData({...d,holder_birth:'2026-02-30'}).errors.length);
});
test('caso privado persistido, cifrado, aislado y con guardado/restauración por versión',async()=>{
 const h=await harness(),r=await create(h);const stored=h.DB.db.prepare('SELECT * FROM work_emission_cases').get();assert.ok(!JSON.stringify(stored).includes(d.holder_name));assert.ok(!stored.payload.includes(d.payment_cbu));
 assert.equal((await h.call('/work/emission/'+r.id,{as:'peer'})).status,404);assert.equal((await h.call('/work/emission/'+r.id,{as:'other'})).status,404);assert.equal((await h.call('/work/emission/'+r.id,{as:''})).status,401);
 const save=await h.call('/work/emission/'+r.id,{method:'POST',data:{expectedVersion:1,data:{...d,vehicle_version:'LT'},title:'Actualizado'}});assert.equal(save.status,200,JSON.stringify(save.data));assert.equal(save.data.record.version,2);
 assert.equal((await h.call('/work/emission/'+r.id,{method:'POST',data:{expectedVersion:1,data:d}})).status,409);
 const restore=await h.call('/work/emission/'+r.id+'/restore',{method:'POST',data:{expectedVersion:2,restoreVersion:1}});assert.equal(restore.status,200);assert.equal(restore.data.record.data.vehicle_version,'');assert.equal(restore.data.record.version,3);
});
test('enlace sin datos personales, recepción cifrada y uso único; PAS incorpora manualmente bajo cliente',async()=>{
 const h=await harness(),r=await create(h),s=await share(h,r);
 const prep=await h.call('/public/emission/prepare',{method:'POST',as:'',data:{id:r.id,token:s.token}});assert.equal(prep.status,200);assert.ok(!JSON.stringify(prep.data).includes(d.holder_name));assert.ok(!JSON.stringify(prep.data).includes(d.payment_cbu));
 const send=await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:s.token,data:d,fileIds:[],consent:true}});assert.equal(send.status,201,JSON.stringify(send.data));const receipt=send.data.receipt;
 assert.ok(!JSON.stringify(send.data).includes(d.payment_cbu));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,0);
 const retry=await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:s.token,data:d,fileIds:[],consent:true}});assert.equal(retry.status,200);assert.equal(retry.data.receipt.responseId,receipt.responseId);
 assert.equal((await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:s.token,data:{...d,holder_name:'Cambiado'},fileIds:[],consent:true}})).status,409);
 const privateR=await h.call('/work/emission/'+r.id);assert.equal(privateR.data.record.response.data.payment_cbu,d.payment_cbu);
 const imported=await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:{expectedVersion:privateR.data.record.version,reviewed:true,data:{...d,holder_name:'CLIENTE REVISADO FICTICIO'}}});assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.emitted,false);assert.equal(imported.data.paymentExecuted,false);
 const clients=(await h.call('/work/overview')).data.clients;assert.equal(clients.length,1);assert.equal(clients[0].name,'CLIENTE REVISADO FICTICIO');assert.equal(clients[0].identity.holder_document,d.holder_document);
 const update=await h.call('/work/clients/'+clients[0].id,{method:'POST',data:{...clients[0],expectedVersion:clients[0].version,name:'Nombre modificado',source:'Carga manual'}});assert.equal(update.status,200);assert.equal(update.data.record.identity.holder_document,d.holder_document);
});
test('foto original del formulario pasa a Documentos del cliente sin alterar bytes y con aislamiento',async()=>{
 const h=await harness(),r=await create(h),s=await share(h,r),bytes=new Uint8Array(readFileSync('public/assets/logo.png')),uploadId=crypto.randomUUID();
 const meta={id:r.id,token:s.token,filename:'Foto-PRUEBA.png',photoType:'front',bytes:bytes.length,sha256:digest(bytes),uploadId},json=new TextEncoder().encode(JSON.stringify(meta)),body=new Uint8Array(4+json.length+bytes.length);new DataView(body.buffer).setUint32(0,json.length,false);body.set(json,4);body.set(bytes,4+json.length);
 const uploaded=await h.call('/public/emission/upload',{method:'POST',as:'',bytes:body});assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));
 const retry=await h.call('/public/emission/upload',{method:'POST',as:'',bytes:body});assert.equal(retry.status,200);assert.equal(retry.data.id,uploaded.data.id);
 const sent=await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:s.token,data:d,consent:true,fileIds:[uploaded.data.id]}});assert.equal(sent.status,201);
 const load=await h.call('/work/emission/'+r.id),imported=await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:{expectedVersion:load.data.record.version,reviewed:true,data:d}});assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.filesImported,1);
 const list=await h.call('/documents');assert.equal(list.data.documents.length,1);assert.equal(list.data.documents[0].client_id,imported.data.clientId);
 const dl=await h.call('/documents/'+uploaded.data.id+'/download');assert.equal(dl.status,200);assert.deepEqual(dl.bytes,bytes);assert.equal((await h.call('/documents/'+uploaded.data.id+'/download',{as:'peer'})).status,404);
});
test('pago informado requiere referencia y distingue confirmación, sin cobrar ni emitir; API pendiente no redirige',async()=>{
 const h=await harness(),r=await create(h,{companyId:'mercantil'});
 const base={amountCents:10000000,currency:'ARS',date:'2026-10-30',collector:'insurer',status:'reported_paid',reference:'PRUEBA · recibo',notes:''};
 assert.equal((await h.call('/work/emission/'+r.id+'/collection',{method:'POST',data:{...base,reference:''}})).status,400);
 assert.equal((await h.call('/work/emission/'+r.id+'/collection',{method:'POST',data:base})).status,201);
 const get=await h.call('/work/emission/'+r.id);assert.equal(get.data.collections[0].status,'reported_paid');assert.equal(get.data.record.status,'draft');
 const stored=h.DB.db.prepare('SELECT payload FROM work_collection_entries').get();assert.ok(!stored.payload.includes('10000000'));assert.ok(!stored.payload.includes(base.reference));
 assert.equal((await h.call('/work/emission/'+r.id+'/dispatch',{method:'POST',data:{}})).data.error,'PAS_CODE_REQUIRED');
 const catalog=(await h.call('/companies')).data.companies;assert.ok(catalog.some(c=>c.id==='mercantil'));const registered=await h.call('/connections',{method:'POST',data:{companyId:'mercantil',method:'pas_only',pasCode:'PAS-FICTICIO',authorized:true}});assert.equal(registered.status,201,JSON.stringify(registered.data));
 assert.equal((await h.call('/work/emission/'+r.id+'/dispatch',{method:'POST',data:{}})).data.error,'API_ACCESS_REQUIRED');
 assert.equal((await h.call('/work/emission/'+r.id+'/collection',{method:'POST',as:'peer',data:base})).status,404);
});
test('consentimiento, origen, revocación y edición posterior impiden usar un formulario desactualizado',async()=>{
 const h=await harness(),r=await create(h),s=await share(h,r);
 assert.equal((await h.call('/public/emission/submit',{method:'POST',as:'',origin:'https://evil.test',data:{id:r.id,token:s.token,data:d,consent:true}})).status,403);
 assert.equal((await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:r.id,token:s.token,data:d,consent:false}})).status,400);
 const saved=await h.call('/work/emission/'+r.id,{method:'POST',data:{expectedVersion:s.record.version,data:d}});assert.equal(saved.status,200);
 assert.equal((await h.call('/public/emission/prepare',{method:'POST',as:'',data:{id:r.id,token:s.token}})).status,403);
 const s2=await share(h,saved.data.record);h.DB.db.prepare('UPDATE work_emission_cases SET token_expires_at=? WHERE id=?').run(Date.now()-1,r.id);assert.equal((await h.call('/public/emission/prepare',{method:'POST',as:'',data:{id:r.id,token:s2.token}})).status,403);
});
