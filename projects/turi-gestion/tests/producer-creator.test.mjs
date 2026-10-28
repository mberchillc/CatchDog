import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import worker from '../dist/server/index.js';
import {harness} from './support/private-harness.mjs';
const password='Contraseña ficticia para probar un PAS!';
const data={name:'PAS ficticio elegido',username:'elegido-por-mauro',password,passwordConfirmation:password};
const create=(h,more={},options={})=>h.call('/admin/producers',{method:'POST',as:'mauro',data:{...data,...more},...options});

test('el administrador elige usuario y contraseña; se crea un productor regular y conserva su sesión',async()=>{
 const h=await harness(),before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),r=await create(h,{role:'superadmin',tenantId:'OTHER',id:'DOC-ADMIN'});assert.equal(r.status,201);assert.equal(r.data.user.username,data.username);assert.equal(r.data.user.role,'producer');assert.equal(r.data.user.tenantId,'TURI');assert.equal(r.data.user.codeConfigured,true);assert.match(r.data.accessCode,/^\d{4}-\d{4}$/);assert.equal(r.response.headers.get('set-cookie'),null);assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),before);assert.equal((await h.call('/admin/overview',{as:'mauro'})).status,200);
 const signed=await h.call('/auth/login',{method:'POST',as:'',data:{username:data.username,password,code:r.data.accessCode}});assert.equal(signed.status,200);assert.equal(signed.data.requiresCodeSetup,false);h.sessions.nuevo={cookie:signed.response.headers.get('set-cookie').split(';')[0],csrf:signed.data.csrf};assert.equal((await h.call('/work/overview',{as:'nuevo'})).status,200);assert.equal((await h.call('/admin/overview',{as:'nuevo'})).status,403);assert.equal((await h.call('/auth/admin/login',{method:'POST',as:'',data:{username:data.username,password}})).status,401);assert.equal((await h.call('/auth/login',{method:'POST',as:'',data:{username:data.username,password}})).data.error,'CODE_REQUIRED');
 const audit=h.DB.db.prepare('SELECT * FROM pilot_audit WHERE action=?').all('admin.producer_created');assert.equal(audit.length,1);assert.ok(!JSON.stringify(audit).includes(password));assert.ok(!JSON.stringify(audit).includes(r.data.accessCode));assert.ok(!JSON.stringify(r.data).includes('password_hash'));
});

test('productor, cuenta ajena, origen ajeno y CSRF inválido no crean usuarios',async()=>{
 const h=await harness();for(const options of [{as:'dani'},{as:'other'},{as:''},{origin:'https://evil.test'},{csrf:false}])assert.ok([401,403].includes((await create(h,{},options)).status));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n,4);
});

test('validación y duplicados no sobrescriben credenciales existentes',async()=>{
 const h=await harness();for(const more of [{username:'a'},{username:'bad user'},{username:'x'.repeat(41)},{passwordConfirmation:'no coincide'},{password:'corta',passwordConfirmation:'corta'}])assert.equal((await create(h,more)).status,400);
 const r=await create(h);assert.equal(r.status,201);const before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE username=?').get(data.username);assert.equal((await create(h)).status,409);assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE username=?').get(data.username),before);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_audit WHERE action=?').get('admin.producer_created').n,1);
});

test('una revocación de rol durante la creación impide el alta y la auditoría',async()=>{
 const h=await harness(),batch=h.DB.batch.bind(h.DB);h.DB.batch=async statements=>{h.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('producer','DOC-ADMIN');return batch(statements)};assert.equal((await create(h)).status,409);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n,4);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_audit WHERE action=?').get('admin.producer_created').n,0);
});

test('interfaz: elegir usuario y contraseña, guardar código y entrar con permisos de PAS',async()=>{
 const h=await harness(),dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/admin/#view=producers',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};let cookie=h.sessions.mauro.cookie;
 w.fetch=async(url,opt={})=>{const r=await worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test',Cookie:cookie,'CF-Connecting-IP':'192.0.2.80'},body:opt.body}),h.env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 try{for(const path of ['public/documents.js','public/workspace.js','public/pilot.js'])vm.runInContext(readFileSync(path,'utf8'),dom.getInternalVMContext());await wait(()=>w.document.querySelector('[data-work="new-producer"]'));w.document.querySelector('[data-work="new-producer"]').click();await wait(()=>w.document.querySelector('#work-producer'));const f=w.document.querySelector('#work-producer');f.elements.username.value=data.username;f.elements.password.value=password;f.elements.passwordConfirmation.value=password;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('#created-pas-code'));assert.match(w.document.querySelector('#created-pas-code').textContent,/^\d{4}-\d{4}$/);assert.ok(!w.document.body.textContent.includes(password));w.document.querySelector('[data-work="pas-enter"]').click();await wait(()=>w.document.querySelector('.w-profile small')?.textContent==='Productor asesor');assert.equal(w.location.pathname,'/privado/');assert.equal(w.document.querySelector('[data-page="producers"]'),null);w.document.querySelector('[data-work="new"][data-type="clients"]').click();await wait(()=>w.document.querySelector('#work-record'));const client=w.document.querySelector('#work-record');client.elements.name.value='PRUEBA - Cliente creado como PAS';client.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!w.document.querySelector('#work-record'));assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);const owner=h.DB.db.prepare('SELECT id FROM pilot_users WHERE username=?').get(data.username).id;assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients WHERE owner_id=?').get(owner).n,1);
 }finally{w.close();}
});
