import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness} from './support/private-harness.mjs';
import {opaque,digest} from '../worker/security.js';
const password='Una contraseña ficticia para el PAS de prueba!';
function invitation(h,overrides={}){const token=opaque(),grant={id:'PAS-TEST-MAURO',username:'pas-prueba-mauro',name:'PAS de prueba · Mauro',role:'producer',tenantId:'TURI',tokenHash:digest(token),expiresAt:Date.now()+3600000,...overrides};h.env.TURI_PAS_INVITATIONS=JSON.stringify([grant]);return {token,grant};}
const activate=(h,p,extra={})=>h.call('/auth/activate',{method:'POST',as:'',data:{username:p.grant.username,password,token:p.token,...extra}});
function use(h,r){h.sessions.prueba={cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};}
async function ready(h,p){const a=await activate(h,p);assert.equal(a.status,201);use(h,a);const code=await h.call('/auth/code/prepare',{method:'POST',as:'prueba',data:{}});const confirmed=await h.call('/auth/code/confirm',{method:'POST',as:'prueba',data:{code:code.data.code}});assert.equal(confirmed.status,200);use(h,confirmed);return code.data.code;}
function envelope(bytes,meta){const json=new TextEncoder().encode(JSON.stringify(meta)),out=new Uint8Array(4+json.length+bytes.length);new DataView(out.buffer).setUint32(0,json.length,false);out.set(json,4);out.set(bytes,4+json.length);return out;}

test('PAS adicional conserva la cuenta administradora y exige la activación normal con código personal',async()=>{
 const h=await harness(),before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),p=invitation(h),r=await activate(h,p,{role:'superadmin',tenantId:'OTHER'});assert.equal(r.status,201);assert.equal(r.data.user.role,'producer');assert.equal(r.data.user.tenantId,'TURI');assert.equal(r.data.requiresCodeSetup,true);use(h,r);
 assert.equal((await h.call('/work/overview',{as:'prueba'})).status,403);const generated=await h.call('/auth/code/prepare',{method:'POST',as:'prueba',data:{}});const confirmed=await h.call('/auth/code/confirm',{method:'POST',as:'prueba',data:{code:generated.data.code}});assert.equal(confirmed.status,200);use(h,confirmed);
 assert.equal((await h.call('/work/overview',{as:'prueba'})).status,200);assert.equal((await h.call('/admin/overview',{as:'prueba'})).status,403);assert.equal((await activate(h,p)).status,409);assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),before);
 assert.equal((await h.call('/auth/login',{method:'POST',as:'',data:{username:p.grant.username,password}})).data.error,'CODE_REQUIRED');assert.equal((await h.call('/auth/login',{method:'POST',as:'',data:{username:p.grant.username,password,code:generated.data.code}})).status,200);
});

test('el PAS recién activado crea un cliente, carga un PDF y recupera el original; otro PAS no accede',async()=>{
 const h=await harness(),p=invitation(h);await ready(h,p);const r=await h.call('/work/clients',{method:'POST',as:'prueba',data:{name:'PRUEBA · Cliente nuevo',email:'cliente@example.invalid',notes:'Datos ficticios',source:'Prueba funcional'}});assert.equal(r.status,201,JSON.stringify(r.data));const client=r.data.record;assert.equal(client.owner_id,p.grant.id);
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),meta={ownerId:p.grant.id,clientId:client.id,filename:'PRUEBA-documento.pdf',category:'other',title:'PRUEBA · Documento',notes:'Sin datos reales',bytes:bytes.length,sha256:digest(bytes)};
 const uploaded=await h.call('/documents',{method:'POST',as:'prueba',bytes:envelope(bytes,meta),headers:{'X-Turi-Upload-ID':randomUUID()}});assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));const document=uploaded.data.document;assert.equal(document.owner_id,p.grant.id);assert.equal(document.client_id,client.id);assert.deepEqual((await h.call('/documents/'+document.id+'/download',{as:'prueba'})).bytes,bytes);
 assert.equal((await h.call('/work/clients/'+client.id,{as:'dani'})).status,404);assert.equal((await h.call('/documents/'+document.id+'/download',{as:'dani'})).status,404);assert.equal((await h.call('/documents?ownerId=DOC-DANI',{as:'prueba'})).status,403);assert.equal((await h.call('/work/clients',{method:'POST',as:'prueba',data:{name:'No autorizado',ownerId:'DOC-ADMIN'}})).status,403);assert.deepEqual((await h.call('/documents/'+document.id+'/download',{as:'mauro'})).bytes,bytes);
});

test('invitaciones de PAS no elevan roles y un valor opcional inválido no reemplaza las invitaciones originales',async()=>{
 const h=await harness();let p=invitation(h,{role:'superadmin'});assert.equal((await activate(h,p)).status,403);p=invitation(h,{expiresAt:Date.now()-1});assert.equal((await activate(h,p)).status,403);
 const token=opaque(),legacy={id:'LEGACY-PAS',username:'legacy',name:'Productor original',role:'producer',tenantId:'TURI',tokenHash:digest(token),expiresAt:Date.now()+3600000};const primary=JSON.parse(h.env.TURI_INVITATIONS);primary.push(legacy);h.env.TURI_INVITATIONS=JSON.stringify(primary);h.env.TURI_PAS_INVITATIONS='{malformado';const a=await h.call('/auth/activate',{method:'POST',as:'',data:{username:'legacy',password,token}});assert.equal(a.status,201);assert.equal(a.data.user.role,'producer');assert.equal(JSON.parse(h.env.TURI_INVITATIONS).length,primary.length);
});
