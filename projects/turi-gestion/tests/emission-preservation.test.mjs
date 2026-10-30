import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './support/private-harness.mjs';
import {digest} from '../worker/security.js';
const png=new Uint8Array(readFileSync('public/assets/logo.png'));
const form={holder_name:'PRUEBA AISLADA',holder_email:'prueba@example.invalid',owner_same:'yes',vehicle_brand:'Fiat',vehicle_model:'Cronos',vehicle_year:'2024',payment_method:'coupon',payment_coupon:'mp'};
async function create(h,extra={}){const r=await h.call('/work/emission',{method:'POST',data:{branch:'Autos',data:form,...extra}});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.record;}
async function share(h,r){const s=await h.call('/work/emission/'+r.id+'/share',{method:'POST',data:{expectedVersion:r.version}});assert.equal(s.status,200);return {id:r.id,token:new URLSearchParams(new URL(s.data.url).hash.slice(1)).get('token')};}
function frame(meta){const j=new TextEncoder().encode(JSON.stringify(meta)),b=new Uint8Array(4+j.length+png.length);new DataView(b.buffer).setUint32(0,j.length);b.set(j,4);b.set(png,4+j.length);return b;}
function stage(h,link,uploadId=crypto.randomUUID()){const bytes=frame({...link,uploadId,filename:'FOTO-FICTICIA.png',photoType:'front',bytes:png.length,sha256:digest(png)});return {send:()=>h.call('/public/emission/upload',{as:'',method:'POST',bytes}),bytes};}
function upload(h,clientId){return h.call('/documents',{method:'POST',bytes:frame({clientId,filename:'ARCHIVO-FICTICIO.png',title:'PRUEBA',category:'other',bytes:png.length,sha256:digest(png)}),headers:{'X-Turi-Upload-ID':crypto.randomUUID()}});}
test('propuesta aprobada conserva su instantánea y no modifica cotización, oferta ni cliente anteriores',async()=>{
 const h=await harness(),c=await h.create('clients',{name:'CLIENTE EXISTENTE FICTICIO',email:'prueba@example.invalid',phone:'',source:'Manual',notes:'CONSERVAR'}),q=await h.create('quotes',{clientId:c.id,branch:'Autos',risk:'Fiat Cronos 2024',status:'comparing',notes:''}),o=await h.create('offers',{quoteId:q.id,companyId:'mercantil',validUntil:'2099-12-31',premiumCents:9000000,currency:'ARS',period:'monthly',coverage:'Terceros completo',deductible:'Sin franquicia',sourceReference:'PRUEBA OFERTA',notes:''});
 assert.equal((await h.call('/work/quotes/'+q.id+'/approve',{method:'POST',data:{offerId:o.id,offerVersion:o.version,expectedVersion:q.version,confirmed:true}})).status,200);
 const rows=()=>['work_clients','work_quotes','work_offers'].map(t=>h.DB.db.prepare('SELECT * FROM '+t+' ORDER BY id').all()),before=rows();
 const r=await create(h,{quoteId:q.id});assert.equal(r.company_id,'mercantil');assert.equal(r.acceptedOffer.premiumCents,9000000);assert.equal(r.client_id,c.id);assert.deepEqual(rows(),before);
 assert.equal((await h.call('/work/emission',{method:'POST',as:'peer',data:{quoteId:q.id,branch:'Autos'}})).status,404);
 assert.equal((await h.call('/work/emission',{method:'POST',data:{quoteId:q.id,branch:'Hogar'}})).status,400);
});
test('Hogar y titular diferente se conservan; CAS evita sobrescribir cambios del cliente y duplicar incorporaciones',async()=>{
 const h=await harness(),c=await h.create('clients',{name:'HOGAR FICTICIO',email:'previo@example.invalid',phone:'12345678',source:'Manual',notes:'NOTAS PREVIAS'}),d={...form,holder_name:'HOGAR REVISADO',holder_email:'',home_street:'Calle de prueba 123',home_type:'house',home_buildingValue:'100.000.000,50',owner_same:'no',owner_name:'TITULAR FICTICIO',owner_relationship:'Familiar',owner_interest:'Vivienda familiar'};
 // Use an actual schema option, avoiding assumptions about insurer taxonomies.
 const schema=JSON.parse(readFileSync('public/intake-schema.json','utf8'));d.home_type=Object.keys(schema.fields.find(f=>f.key==='home_type').options)[0];
 const r=await create(h,{branch:'Hogar',clientId:c.id,data:d}),before=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(c.id);
 const save=await h.call('/work/clients/'+c.id,{method:'POST',data:{...c,name:'EDICIÓN SIMULTÁNEA',expectedVersion:c.version}});assert.equal(save.status,200);
 const current=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(c.id),body={reviewed:true,expectedVersion:r.version,expectedClientVersion:c.version,data:d};
 const bad=await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:body});assert.equal(bad.status,409);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(c.id),current);assert.equal(h.DB.db.prepare('SELECT version FROM work_emission_cases WHERE id=?').get(r.id).version,1);
 const good=await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:{...body,expectedClientVersion:save.data.record.version}});assert.equal(good.status,200,JSON.stringify(good.data));assert.equal(good.data.record.data.home_buildingValue,'100000000.50');assert.equal(good.data.record.data.owner_name,d.owner_name);assert.equal(good.data.record.data.vehicle_brand,undefined);
 assert.equal((await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:body})).status,409);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,1);const clients=(await h.call('/work/overview')).data.clients;assert.equal(clients[0].notes,'NOTAS PREVIAS');assert.equal(clients[0].email,'previo@example.invalid');assert.notDeepEqual(current,before);
});
test('los documentos y fotos pendientes comparten cuota de cuenta, incluso reservas en curso',async()=>{
 const h=await harness(),r=await create(h),link=await share(h,r),file=await stage(h,link).send();assert.equal(file.status,201);const c=await h.create('clients',{name:'CLIENTE FICTICIO'});
 h.DB.db.prepare('UPDATE work_emission_files SET bytes=? WHERE id=?').run(1073741824,file.data.id);assert.equal((await upload(h,c.id)).data.error,'FILE_QUOTA_OR_BUSY');assert.equal((await h.call('/documents')).data.quota.bytes,1073741824);
 h.DB.db.prepare('UPDATE work_emission_files SET bytes=? WHERE id=?').run(png.length,file.data.id);const doc=await upload(h,c.id);assert.equal(doc.status,201,JSON.stringify(doc.data));h.DB.db.prepare("UPDATE work_documents SET state='uploading',lease_expires_at=?,bytes=? WHERE id=?").run(Date.now()+600000,1073741824-png.length,doc.data.document.id);
 assert.equal((await stage(h,link).send()).data.error,'QUOTA_OR_BUSY');
 assert.equal((await h.call('/public/emission/submit',{as:'',method:'POST',data:{...link,data:form,fileIds:[file.data.id],consent:true}})).status,201);const loaded=(await h.call('/work/emission/'+r.id)).data.record;
 h.DB.db.prepare('UPDATE work_documents SET bytes=bytes+1 WHERE id=?').run(doc.data.document.id);assert.equal((await h.call('/work/emission/'+r.id+'/incorporate',{method:'POST',data:{expectedVersion:loaded.version,reviewed:true,data:form}})).status,409);
 assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients').get().n,1);assert.equal(h.DB.db.prepare('SELECT imported FROM work_emission_files WHERE id=?').get(file.data.id).imported,0);
});
test('fotos: fallo y reintento conservan idempotencia; enlace revocado durante carga no publica archivo',async()=>{
 const h=await harness(),r=await create(h),link=await share(h,r),transfer=stage(h,link);h.BUCKET.failPut=true;assert.equal((await transfer.send()).status,503);assert.equal(h.BUCKET.objects.size,0);h.BUCKET.failPut=false;assert.equal((await transfer.send()).status,201);assert.equal((await transfer.send()).status,200);
 const put=h.BUCKET.put.bind(h.BUCKET),before=h.BUCKET.objects.size;h.BUCKET.put=async(...args)=>{const obj=await put(...args);h.DB.db.prepare('UPDATE work_emission_cases SET token_revoked_at=? WHERE id=?').run(Date.now(),r.id);return obj;};assert.equal((await stage(h,link).send()).status,409);assert.equal(h.BUCKET.objects.size,before);
});
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
test('migración aditiva conserva exactamente todas las filas anteriores y sus claves foráneas',async()=>{
 const h=await harness(),c=await h.create('clients',{name:'CARTERA SINTÉTICA EXISTENTE',email:'synthetic@example.invalid',notes:'CONSERVAR TODO'});await h.create('tasks',{clientId:c.id,title:'TAREA PREEXISTENTE',category:'payments',status:'open',priority:'green',dueOn:'2026-11-01',notes:''});
 const beforeDb=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0007').sort())beforeDb.exec(readFileSync('drizzle/'+f,'utf8'));
 const names=beforeDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 beforeDb.exec('BEGIN; PRAGMA defer_foreign_keys=ON');const before={};for(const table of names){const rows=h.DB.db.prepare('SELECT * FROM '+table).all();before[table]=rows;for(const row of rows){const keys=Object.keys(row);beforeDb.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}}
 beforeDb.exec('COMMIT; PRAGMA foreign_keys=ON');beforeDb.exec(readFileSync('drizzle/0007_emission_cases.sql','utf8'));
 for(const table of names)assert.deepEqual(beforeDb.prepare('SELECT * FROM '+table).all(),before[table],table);
 assert.deepEqual(beforeDb.prepare('PRAGMA foreign_key_check').all(),[]);assert.ok(beforeDb.prepare("SELECT name FROM sqlite_master WHERE name='work_emission_cases'").get());beforeDb.close();
});
test('guardar una vinculación nueva la conserva sin editar la cartera y no permite enlazar otro PAS',async()=>{
 const h=await harness(),client=await h.create('clients',{name:'VINCULACIÓN FICTICIA',email:'ficticio@example.invalid',notes:'PRESERVAR'}),peer=await h.create('clients',{name:'OTRO PAS FICTICIO'},'peer'),r=await create(h),before=h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id);
 const rejected=await h.call('/work/emission/'+r.id,{method:'POST',data:{expectedVersion:r.version,clientId:peer.id,data:form}});assert.equal(rejected.status,404);
 const saved=await h.call('/work/emission/'+r.id,{method:'POST',data:{expectedVersion:r.version,clientId:client.id,data:form}});assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.record.client_id,client.id);assert.deepEqual(h.DB.db.prepare('SELECT * FROM work_clients WHERE id=?').get(client.id),before);
 assert.equal((await h.call('/work/emission/'+r.id)).data.record.client_id,client.id);
});
test('una respuesta parcial no borra identidad previamente guardada al incorporarse al mismo cliente',async()=>{
 const h=await harness(),full={...form,holder_birth:'1980-01-01',holder_street:'DOMICILIO FICTICIO PREVIO',holder_tax:'CF'},first=await create(h,{data:full}),saved=await h.call('/work/emission/'+first.id+'/incorporate',{method:'POST',data:{expectedVersion:first.version,reviewed:true,data:full}});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const client=(await h.call('/work/overview')).data.clients[0],next=await create(h,{clientId:client.id,data:form});
 const result=await h.call('/work/emission/'+next.id+'/incorporate',{method:'POST',data:{expectedVersion:next.version,expectedClientVersion:client.version,reviewed:true,data:form}});assert.equal(result.status,200,JSON.stringify(result.data));
 const after=(await h.call('/work/overview')).data.clients.find(c=>c.id===client.id);assert.equal(after.identity.holder_birth,full.holder_birth);assert.equal(after.identity.holder_street,full.holder_street);assert.equal(after.identity.holder_tax,full.holder_tax);
});
