import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import worker from '../dist/server/index.js';
import {opaque,digest,passwordHash} from '../worker/security.js';
import {harness} from './support/private-harness.mjs';
function grant(h){const token=opaque(),g={id:opaque(24),userId:'DOC-ADMIN',username:'mauro',tenantId:'TURI',tokenHash:digest(token),expectedPasswordHash:h.DB.db.prepare('SELECT password_hash FROM pilot_users WHERE id=?').get('DOC-ADMIN').password_hash,expiresAt:Date.now()+3600000};h.env.TURI_ADMIN_PASSWORD_RESET_GRANTS=JSON.stringify([g]);return {token,g};}
const prepare=(h,p,origin='https://turi.test')=>h.call('/auth/admin/owner-reset/prepare',{method:'POST',as:'',origin,data:{username:'mauro',token:p.token}});
const state=(h,cookie)=>h.call('/auth/admin/owner-reset/state',{as:'',headers:{Cookie:cookie}});
const change=(h,cookie)=>h.call('/auth/admin/owner-reset',{method:'POST',as:'',headers:{Cookie:cookie},data:{username:'mauro',password:'Una frase elegida por el titular!'}});
const getCookie=r=>r.response.headers.get('set-cookie').split(';')[0];

test('el enlace prepara una cookie privada y permite retomar al recargar sin cambiar credenciales',async()=>{
 const h=await harness(),p=grant(h),before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN');
 const r=await prepare(h,p);assert.equal(r.status,200);assert.match(r.response.headers.get('set-cookie'),/__Host-turi_admin_reset=.*HttpOnly; Secure; SameSite=Strict; Path=\//);assert.equal(r.data.username,'mauro');assert.ok(!JSON.stringify(r.data).includes(p.token));
 for(let i=0;i<3;i++)assert.equal((await state(h,getCookie(r))).status,200);assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get('DOC-ADMIN'),before);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_auth_challenges WHERE kind=?').get('owner_admin_password_reset').n,0);
 assert.equal((await change(h,getCookie(r))).status,200);assert.equal((await state(h,getCookie(r))).status,403);assert.equal((await prepare(h,p)).status,403);assert.equal((await change(h,getCookie(r))).status,403);
});

test('otro navegador puede abrir el enlace original, pero sólo uno puede consumirlo',async()=>{
 const h=await harness(),p=grant(h),a=await prepare(h,p),b=await prepare(h,p);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal((await change(h,getCookie(b))).status,200);assert.equal((await change(h,getCookie(a))).status,403);
});

test('cookie ausente o alterada y preparación desde otro origen no abren el formulario',async()=>{
 const h=await harness(),p=grant(h);assert.equal((await state(h,'')).status,403);assert.equal((await prepare(h,p,'https://otro.test')).status,403);const r=await prepare(h,p);assert.equal((await state(h,getCookie(r)+'alterada')).status,403);assert.equal((await change(h,getCookie(r)+'alterada')).status,403);
});

test('la cookie deja de servir con vencimiento, cambio de contraseña o de rol',async()=>{
 const h=await harness(),p=grant(h),r=await prepare(h,p),cookie=getCookie(r);h.env.TURI_ADMIN_PASSWORD_RESET_GRANTS=JSON.stringify([{...p.g,expiresAt:Date.now()-1}]);assert.equal((await state(h,cookie)).status,403);h.env.TURI_ADMIN_PASSWORD_RESET_GRANTS=JSON.stringify([p.g]);
 h.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('producer','DOC-ADMIN');assert.equal((await state(h,cookie)).status,403);h.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('superadmin','DOC-ADMIN');
 h.DB.db.prepare('UPDATE pilot_users SET password_hash=? WHERE id=?').run(passwordHash('Una contraseña ficticia diferente!',h.env.TURI_AUTH_PEPPER),'DOC-ADMIN');assert.equal((await state(h,cookie)).status,403);
});

async function ui(h,url,jar=new Map()){
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url,runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};let posts=0;
 w.fetch=async(path,opt={})=>{if(opt.method==='POST')posts++;const r=await worker.fetch(new Request(new URL(path,'https://turi.test'),{method:opt.method||'GET',headers:{...opt.headers,Origin:'https://turi.test',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'CF-Connecting-IP':'192.0.2.74'},body:opt.body}),h.env);for(const value of r.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}return r};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail(w.document.body.textContent)};
 for(const path of ['public/documents.js','public/workspace.js','public/pilot.js'])vm.runInContext(readFileSync(path,'utf8'),dom.getInternalVMContext());
 return {dom,w,jar,wait,posts:()=>posts};
}

test('interfaz abre la URL personal, retoma la pantalla al actualizar y permite ingresar tras crear contraseña',async()=>{
 const h=await harness(),p=grant(h);for(const path of ['/admin/crear-contrasena','/admin/crear-contrasena/'])assert.equal((await worker.fetch(new Request('https://turi.test'+path),h.env)).status,200);
 const a=await ui(h,'https://turi.test/admin/crear-contrasena/#set-password='+p.token+'&user=mauro');await a.wait(()=>a.w.document.querySelector('#admin-password-setup'));assert.equal(a.w.location.hash,'');assert.equal(a.w.localStorage.length,0);assert.equal(a.w.sessionStorage.length,0);assert.ok(!a.w.document.body.textContent.includes(p.token));const jar=a.jar;a.w.close();
 const b=await ui(h,'https://turi.test/admin/crear-contrasena/',jar);try{await b.wait(()=>b.w.document.querySelector('#admin-password-setup'));const form=b.w.document.querySelector('#admin-password-setup');assert.equal(form.elements.username.value,'mauro');assert.equal(form.elements.password.value,'');form.elements.password.value='Una frase propia elegida en la prueba!';form.elements.passwordConfirmation.value=form.elements.password.value;form.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await b.wait(()=>b.w.document.querySelector('.w-sidebar'));assert.match(b.w.document.body.textContent,/Superadministrador/);}finally{b.w.close();}
 const c=await ui(h,'https://turi.test/admin/crear-contrasena/',jar);try{await c.wait(()=>c.w.document.querySelector('.w-sidebar'));assert.equal(c.w.document.querySelector('#admin-password-setup'),null);}finally{c.w.close();}
});

test('el ojo muestra y oculta cada contraseña, conserva su valor y no envía el formulario',async()=>{
 const h=await harness(),p=grant(h),a=await ui(h,'https://turi.test/admin/crear-contrasena/#set-password='+p.token+'&user=mauro');try{await a.wait(()=>a.w.document.querySelectorAll('[data-password-toggle]').length===2);const form=a.w.document.querySelector('#admin-password-setup'),input=form.elements.password,confirmation=form.elements.passwordConfirmation,toggles=form.querySelectorAll('[data-password-toggle]');input.value='Frase sintética para probar el ojo!';confirmation.value='Otra frase sintética';const posts=a.posts();
 assert.equal(toggles[0].type,'button');assert.equal(toggles[0].getAttribute('aria-controls'),input.id);assert.equal(a.w.document.querySelector('label[for="'+input.id+'"]').textContent.trim(),'Nueva contraseña');
 toggles[0].click();assert.equal(input.type,'text');assert.equal(toggles[0].getAttribute('aria-label'),'Ocultar contraseña');assert.equal(toggles[0].getAttribute('aria-pressed'),'true');assert.equal(confirmation.type,'password');assert.equal(a.posts(),posts);
 toggles[0].click();assert.equal(input.type,'password');assert.equal(input.value,'Frase sintética para probar el ojo!');assert.equal(toggles[0].getAttribute('aria-pressed'),'false');toggles[1].click();assert.equal(confirmation.type,'text');assert.equal(a.posts(),posts);
 }finally{a.w.close();}
 for(const path of ['/admin/','/privado/']){const b=await ui(h,'https://turi.test'+path);try{await b.wait(()=>b.w.document.querySelector('[data-password-toggle]'));const form=b.w.document.querySelector('form'),input=form.elements.password,toggle=form.querySelector('[data-password-toggle]');input.value='Autocompletado de prueba!';const posts=b.posts();toggle.click();assert.equal(input.type,'text');assert.equal(input.value,'Autocompletado de prueba!');assert.equal(b.posts(),posts);toggle.click();assert.equal(input.type,'password');}finally{b.w.close();}}
});
