import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import worker from '../dist/server/index.js';
import {harness} from './support/private-harness.mjs';
const password='Credencial ficticia para las pruebas!';
const login=(h,data={},path='/auth/admin/login')=>h.call(path,{method:'POST',as:'',data:{username:'mauro',password,...data}});
const session=r=>({cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf});

test('superadministrador ingresa sin código ni correo confirmado y conserva sus credenciales y datos',async()=>{
 const h=await harness(),record=await h.create('clients',{name:'Cliente intacto'},'mauro');
 h.DB.db.prepare('UPDATE pilot_users SET access_code_hash=NULL,email_verified=0 WHERE id=?').run('DOC-ADMIN');
 const before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN');
 const r=await login(h);assert.equal(r.status,200);assert.equal(r.data.requiresCodeSetup,false);assert.equal(r.data.user.role,'superadmin');
 assert.match(r.response.headers.get('set-cookie'),/__Host-turi_session=admin\./);assert.match(r.response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 h.sessions.mauro=session(r);assert.equal((await h.call('/admin/overview',{as:'mauro'})).status,200);assert.equal((await h.call('/work/overview',{as:'mauro'})).status,200);assert.equal((await h.call('/auth/me',{as:'mauro'})).data.requiresCodeSetup,false);
 assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),before);assert.equal(h.DB.db.prepare('SELECT id FROM work_clients WHERE id=?').get(record.id).id,record.id);
});

test('la entrada estándar admite al superadministrador existente sin modificar el código guardado',async()=>{
 const h=await harness(),before=h.DB.db.prepare('SELECT access_code_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').access_code_hash;
 const r=await login(h,{code:''},'/auth/login');assert.equal(r.status,200);assert.equal(r.data.requiresCodeSetup,false);assert.equal(h.DB.db.prepare('SELECT access_code_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').access_code_hash,before);
});

test('el formulario o el endpoint de administración no convierten un productor en administrador',async()=>{
 const h=await harness();const r=await login(h,{username:'dani',role:'superadmin',admin:true});assert.equal(r.status,401);assert.equal(r.response.headers.get('set-cookie'),null);
 const normal=await login(h,{username:'dani',role:'superadmin'},'/auth/login');assert.equal(normal.status,401);assert.equal(normal.data.error,'CODE_REQUIRED');assert.equal((await h.call('/admin/overview')).status,403);
});

test('contraseña incorrecta, cuenta suspendida, otro origen y cambio de rol no habilitan administración',async()=>{
 const h=await harness();assert.equal((await login(h,{password:'Contraseña equivocada'})).status,401);
 h.DB.db.prepare('UPDATE pilot_users SET disabled=1 WHERE id=?').run('DOC-ADMIN');assert.equal((await login(h)).status,401);h.DB.db.prepare('UPDATE pilot_users SET disabled=0 WHERE id=?').run('DOC-ADMIN');
 assert.equal((await h.call('/auth/admin/login',{method:'POST',as:'',origin:'https://otro.test',data:{username:'mauro',password}})).status,403);
 const r=await login(h);h.sessions.mauro=session(r);h.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('producer','DOC-ADMIN');assert.equal((await h.call('/work/overview',{as:'mauro'})).status,401);
});

test('las dos entradas comparten el límite de intentos y una sesión revocada no vuelve a entrar',async()=>{
 const h=await harness();for(let i=0;i<8;i++)assert.equal((await login(h,{username:'inexistente'},i%2?'/auth/login':'/auth/admin/login')).status,401);assert.equal((await login(h,{username:'inexistente'})).status,429);
 const r=await login(h);h.sessions.mauro=session(r);h.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run('DOC-ADMIN');assert.equal((await h.call('/work/overview',{as:'mauro'})).status,401);
});

test('interfaz de administración: una contraseña autocompletable y entrada real al tablero',async()=>{
 const h=await harness();h.DB.db.prepare('UPDATE pilot_users SET access_code_hash=NULL WHERE id=?').run('DOC-ADMIN');
 for(const path of ['/admin','/admin/'])assert.equal((await worker.fetch(new Request('https://turi.test'+path),h.env)).status,200);
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/admin/',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};let cookie='';
 w.fetch=async(url,opt={})=>{const r=await worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test',Cookie:cookie,'CF-Connecting-IP':'192.0.2.71'},body:opt.body}),h.env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 try{for(const path of ['public/documents.js','public/workspace.js','public/pilot.js'])vm.runInContext(readFileSync(path,'utf8'),dom.getInternalVMContext());await wait(()=>w.document.querySelector('#admin-login'));
 const form=w.document.querySelector('#admin-login');assert.equal(form.elements.code,undefined);assert.equal(form.elements.username.autocomplete,'username');assert.equal(form.elements.password.autocomplete,'current-password');assert.equal(form.querySelectorAll('input[type=password]').length,1);assert.equal(form.method,'post');assert.equal(new URL(form.action).pathname,'/api/pilot/auth/admin/login');
 form.elements.username.value='mauro';form.elements.password.value=password;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('.w-sidebar'));assert.match(w.document.body.textContent,/Superadministrador/);assert.equal(w.localStorage.length,0);
 }finally{w.close();}
});

test('una sesión de productor ya abierta no entra al entorno de administración',async()=>{
 const h=await harness(),dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/admin/',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 w.fetch=(url,opt={})=>worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test',Cookie:h.sessions.dani.cookie,'CF-Connecting-IP':'192.0.2.72'},body:opt.body}),h.env);
 try{vm.runInContext(readFileSync('public/pilot.js','utf8'),dom.getInternalVMContext());for(let i=0;i<200&&!w.document.querySelector('#admin-login');i++)await new Promise(r=>setTimeout(r,10));assert.ok(w.document.querySelector('#admin-login'));assert.match(w.document.querySelector('#error').textContent,/exclusivo de superadministradores/);assert.equal(w.document.querySelector('.w-sidebar'),null);}finally{w.close();}
});
