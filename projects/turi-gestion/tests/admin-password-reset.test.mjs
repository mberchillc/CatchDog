import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import worker from '../dist/server/index.js';
import {opaque,digest,passwordHash,passwordValid} from '../worker/security.js';
import {harness} from './support/private-harness.mjs';
const nextPassword='Una contraseña propia para administrar Turi!';
function grant(h,changes={}){const token=opaque(),g={id:opaque(24),userId:'DOC-ADMIN',username:'mauro',tenantId:'TURI',tokenHash:digest(token),expectedPasswordHash:h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash,expiresAt:Date.now()+3600000,...changes};h.env.TURI_ADMIN_PASSWORD_RESET_GRANTS=JSON.stringify([g]);return {token,g};}
const reset=(h,p,data={})=>h.call('/auth/admin/owner-reset',{method:'POST',as:'',data:{username:'mauro',token:p.token,password:nextPassword,...data}});
const use=(h,r)=>h.sessions.mauro={cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};

test('permiso del propietario cambia sólo la contraseña y abre administración sin correo confirmado ni código',async()=>{
 const h=await harness(),client=await h.create('clients',{name:'Cartera conservada'},'mauro');
 h.DB.db.prepare('UPDATE pilot_users SET email=?,email_verified=0 WHERE id=?').run('mauro@example.test','DOC-ADMIN');
 const before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),p=grant(h);
 h.DB.db.prepare('INSERT INTO pilot_auth_challenges (id,user_id,kind,value_hash,attempts,expires_at,created_at) VALUES (?,?,?,?,0,?,?)').run(opaque(24),'DOC-ADMIN','recovery','inutil',Date.now()+600000,Date.now());
 const r=await reset(h,p);assert.equal(r.status,200);assert.equal(r.data.requiresCodeSetup,false);assert.equal(r.data.user.role,'superadmin');assert.match(r.response.headers.get('set-cookie'),/__Host-turi_session=admin\..*HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await h.call('/work/overview',{as:'mauro'})).status,401);
 const after=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN');assert.notEqual(after.password_hash,before.password_hash);assert.equal(passwordValid(nextPassword,after.password_hash,h.env.TURI_AUTH_PEPPER),true);assert.deepEqual({...after,password_hash:before.password_hash},{...before});
 assert.equal(h.DB.db.prepare('SELECT id FROM work_clients WHERE id=?').get(client.id).id,client.id);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_auth_challenges WHERE user_id=? AND used_at IS NULL').get('DOC-ADMIN').n,0);
 use(h,r);assert.equal((await h.call('/admin/overview',{as:'mauro'})).status,200);assert.equal((await h.call('/auth/me',{as:'mauro'})).data.requiresCodeSetup,false);
 const login=await h.call('/auth/admin/login',{method:'POST',as:'',data:{username:'mauro',password:nextPassword}});assert.equal(login.status,200);
 const events=h.DB.db.prepare('SELECT * FROM pilot_audit WHERE action=?').all('auth.admin_password_set_by_owner');assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes(p.token));assert.ok(!JSON.stringify(events).includes(nextPassword));assert.ok(!JSON.stringify(r.data).includes(p.token));assert.ok(!JSON.stringify(r.data).includes(after.password_hash));
});

test('permiso incorrecto, vencido o ya usado no cambia la cuenta ni crea sesión',async()=>{
 const h=await harness(),before=h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash;
 let p=grant(h,{expiresAt:Date.now()-1});assert.equal((await reset(h,p)).status,403);
 p=grant(h);assert.equal((await reset(h,{token:opaque()})).status,403);assert.equal((await reset(h,p,{username:'dani'})).status,403);assert.equal(h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash,before);
 assert.equal((await reset(h,p)).status,200);const hash=h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash;
 const reused=await reset(h,p,{password:'Otra frase completamente distinta!'});assert.equal(reused.status,403);assert.equal(reused.response.headers.get('set-cookie'),null);assert.equal(h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash,hash);
});

test('cuenta, organización, rol, estado y contraseña actual delimitan el permiso',async()=>{
 const h=await harness();let p=grant(h,{tenantId:'OTHER'});assert.equal((await reset(h,p)).status,403);
 p=grant(h,{userId:'DOC-DANI',username:'dani',expectedPasswordHash:h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-DANI').password_hash});assert.equal((await reset(h,p,{username:'dani',role:'superadmin'})).status,403);
 p=grant(h);h.DB.db.prepare('UPDATE pilot_users SET disabled=1 WHERE id=?').run('DOC-ADMIN');assert.equal((await reset(h,p)).status,403);h.DB.db.prepare('UPDATE pilot_users SET disabled=0 WHERE id=?').run('DOC-ADMIN');
 h.DB.db.prepare('UPDATE pilot_users SET password_hash=? WHERE id=?').run(passwordHash('Otra credencial ficticia diferente!',h.env.TURI_AUTH_PEPPER),'DOC-ADMIN');assert.equal((await reset(h,p)).status,403);
});

test('origen ajeno o contraseña corta no consume el permiso; no hay emisión pública',async()=>{
 const h=await harness(),p=grant(h);assert.equal((await h.call('/auth/admin/owner-reset',{method:'POST',as:'',origin:'https://evil.test',data:{username:'mauro',token:p.token,password:nextPassword}})).status,403);
 assert.equal((await reset(h,p,{password:'corta'})).data.error,'PASSWORD_LENGTH');assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_auth_challenges WHERE kind=?').get('owner_admin_password_reset').n,0);assert.equal((await h.call('/auth/admin/owner-reset/issue',{method:'POST',as:'',data:{username:'mauro'}})).status,401);assert.equal((await reset(h,p)).status,200);
});

test('la transacción rechaza un rol cambiado entre la validación y la escritura',async()=>{
 const h=await harness(),p=grant(h),batch=h.DB.batch.bind(h.DB),before=h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash;
 h.DB.batch=async statements=>{h.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('producer','DOC-ADMIN');return batch(statements)};
 assert.equal((await reset(h,p)).status,403);assert.equal(h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash,before);
 assert.equal(h.DB.db.prepare('SELECT used_at FROM pilot_auth_challenges WHERE id=?').get(p.g.id).used_at,null);
});

test('dos envíos simultáneos guardan una sola contraseña y crean una sola sesión',async()=>{
 const h=await harness(),p=grant(h),batch=h.DB.batch.bind(h.DB);let pending=Promise.resolve();h.DB.batch=stmts=>{const r=pending.then(()=>batch(stmts));pending=r.catch(()=>{});return r};
 const responses=await Promise.all([reset(h,p),reset(h,p,{password:'Una segunda contraseña ficticia! '})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_sessions WHERE user_id=?').get('DOC-ADMIN').n,1);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_audit WHERE action=?').get('auth.admin_password_set_by_owner').n,1);
});

test('intentos repetidos se limitan aunque no exista cuenta y secreto malformado falla cerrado',async()=>{
 const h=await harness();h.env.TURI_ADMIN_PASSWORD_RESET_GRANTS='{invalido';for(let i=0;i<8;i++)assert.equal((await reset(h,{token:opaque()})).status,403);assert.equal((await reset(h,{token:opaque()})).status,429);
});

test('interfaz permite elegir y repetir contraseña propia, borra el fragmento e ingresa al tablero',async()=>{
 const h=await harness(),p=grant(h),dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'https://turi.test/admin/#set-password='+p.token+'&user=mauro',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};let cookie='';
 w.fetch=async(url,opt={})=>{const r=await worker.fetch(new Request(new URL(url,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test',Cookie:cookie,'CF-Connecting-IP':'192.0.2.73'},body:opt.body}),h.env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 try{for(const path of ['public/documents.js','public/workspace.js','public/pilot.js'])vm.runInContext(readFileSync(path,'utf8'),dom.getInternalVMContext());await wait(()=>w.document.querySelector('#admin-password-setup'));
 assert.equal(w.location.hash,'');assert.ok(!w.document.body.textContent.includes(p.token));let form=w.document.querySelector('#admin-password-setup');assert.equal(form.elements.username.value,'mauro');assert.equal(form.elements.username.readOnly,true);assert.equal(form.elements.password.autocomplete,'new-password');assert.equal(form.querySelectorAll('[autocomplete="current-password"]').length,0);assert.equal(form.elements.code,undefined);assert.equal(form.elements.email,undefined);
 form.elements.password.value=nextPassword;form.elements.passwordConfirmation.value='Las dos frases no coinciden';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('#error').textContent.includes('no coinciden'));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_auth_challenges WHERE kind=?').get('owner_admin_password_reset').n,0);
 form.elements.passwordConfirmation.value=nextPassword;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('.w-sidebar'));assert.match(w.document.body.textContent,/Superadministrador/);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
 }finally{w.close();}
});
