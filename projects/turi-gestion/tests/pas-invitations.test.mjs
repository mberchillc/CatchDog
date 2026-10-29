import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {harness} from './support/private-harness.mjs';
import worker from '../dist/server/index.js';
const password='Una frase privada de prueba para el alta!';
const invite=async(h,name='Daniel de prueba')=>{const r=await h.call('/admin/invitations',{method:'POST',as:'mauro',data:{name,role:'superadmin',tenantId:'OTHER'}});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,token:new URL(r.data.activationUrl).hash.split('=')[1]};};
const accept=(h,i,more={})=>h.call('/auth/invitation/accept',{method:'POST',as:'',data:{token:i.token,username:'elegido-por-daniel',password,passwordConfirmation:password,...more}});
const signSession=(h,name,r)=>{h.sessions[name]={cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf}};
test('demo retirada: inicio privado, scripts antiguos inaccesibles y Dani/1234 rechazado',async()=>{
 const h=await harness(),r=await worker.fetch(new Request('https://turi.test/'),h.env),html=await r.text();assert.equal(r.status,200);assert.match(html,/Ingresar como PAS/);assert.ok(!html.includes('data.js')&&!html.includes('Dani / 1234'));
 for(const path of ['/app.js','/data.js','/assets/embedded.js'])assert.equal((await worker.fetch(new Request('https://turi.test'+path),h.env)).status,410);
 assert.equal((await h.call('/auth/login',{method:'POST',as:'',data:{username:'dani',password:'1234'}})).status,401);
});
test('sólo Super Admin invita: token aleatorio sólo en el enlace, hash en DB y permisos conservados',async()=>{
 const h=await harness();
 for(const options of [{as:'dani'},{as:'other'},{as:''},{as:'mauro',csrf:false},{as:'mauro',origin:'https://evil.test'}])assert.ok([401,403].includes((await h.call('/admin/invitations',{method:'POST',data:{name:'Prueba'},...options})).status));
 const i=await invite(h);assert.equal(i.token.length,43);assert.equal(new URL(i.activationUrl).pathname,'/privado/activar/');assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n,4);
 const stored=h.DB.db.prepare('SELECT * FROM pilot_pas_invitations').get();assert.equal(stored.tenant_id,'TURI');assert.ok(!JSON.stringify(stored).includes(i.token));assert.equal(stored.used_at,null);
 const list=await h.call('/admin/invitations',{as:'mauro'});assert.equal(list.data.invitations.length,1);assert.ok(!JSON.stringify(list.data).includes(i.token));assert.ok(!JSON.stringify((await h.call('/audit',{as:'mauro'})).data).includes(i.token));
});
test('invitado elige usuario y contraseña; configura código; cartera propia vacía y sin administración',async()=>{
 const h=await harness();await h.create('clients',{name:'FICTICIO AJENO',email:'',phone:'',source:'Prueba',notes:''});
 const i=await invite(h),prep=await h.call('/auth/invitation/prepare',{method:'POST',as:'',data:{token:i.token}});assert.equal(prep.status,200);assert.equal(prep.data.name,'Daniel de prueba');
 const r=await accept(h,i,{username:'mi-usuario-elegido',email:'dani@example.invalid',role:'superadmin',tenantId:'OTHER',id:'DOC-ADMIN'});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.user.username,'mi-usuario-elegido');assert.equal(r.data.user.role,'producer');assert.equal(r.data.user.tenantId,'TURI');assert.equal(r.data.requiresCodeSetup,true);signSession(h,'nuevo',r);
 assert.equal((await h.call('/work/overview',{as:'nuevo'})).status,403);
 const prepare=await h.call('/auth/code/prepare',{method:'POST',as:'nuevo',data:{}}),confirm=await h.call('/auth/code/confirm',{method:'POST',as:'nuevo',data:{code:prepare.data.code}});assert.equal(confirm.status,200);signSession(h,'nuevo',confirm);
 const overview=await h.call('/work/overview',{as:'nuevo'});for(const key of ['clients','policies','claims','tasks','quotes','offers','quoteIntakes'])assert.equal(overview.data[key].length,0,key);
 assert.equal((await h.call('/admin/overview',{as:'nuevo'})).status,403);assert.equal((await h.call('/connections',{as:'nuevo'})).data.connections.length,0);assert.equal((await h.call('/documents/summary',{as:'nuevo'})).data.counts.length,0);
 const stored=h.DB.db.prepare('SELECT * FROM pilot_users WHERE id=?').get(r.data.user.id);assert.ok(!JSON.stringify(stored).includes(password));assert.equal(stored.email_verified,0);
 assert.equal((await accept(h,i,{username:'otro-usuario'})).status,403);assert.equal((await h.call('/auth/invitation/prepare',{method:'POST',as:'',data:{token:i.token}})).status,403);
});
test('datos inválidos o usuario existente no consumen el enlace ni alteran cuentas',async()=>{
 const h=await harness(),i=await invite(h),before=h.DB.db.prepare('SELECT * FROM pilot_users WHERE username=?').get('mauro');
 for(const more of [{username:'a'},{username:'x'.repeat(41)},{username:'mauro'},{password:'1234',passwordConfirmation:'1234'},{passwordConfirmation:'distinta'},{email:'invalid'}])assert.ok([400,409].includes((await accept(h,i,more)).status));
 assert.equal(h.DB.db.prepare('SELECT used_at FROM pilot_pas_invitations WHERE id=?').get(i.id).used_at,null);assert.deepEqual(h.DB.db.prepare('SELECT * FROM pilot_users WHERE username=?').get('mauro'),before);assert.equal((await accept(h,i)).status,201);
});
test('vencimiento, revocación y administrador suspendido impiden usar la invitación',async()=>{
 const h=await harness(),expired=await invite(h);h.DB.db.prepare('UPDATE pilot_pas_invitations SET expires_at=? WHERE id=?').run(Date.now()-1,expired.id);assert.equal((await accept(h,expired)).status,403);
 const revoked=await invite(h);assert.equal((await h.call('/admin/invitations/'+revoked.id+'/revoke',{method:'POST',as:'other',data:{}})).status,403);assert.equal((await h.call('/admin/invitations/'+revoked.id+'/revoke',{method:'POST',as:'mauro',data:{}})).status,200);assert.equal((await accept(h,revoked)).status,403);
 const disabled=await invite(h);h.DB.db.prepare('UPDATE pilot_users SET disabled=1 WHERE id=?').run('DOC-ADMIN');assert.equal((await accept(h,disabled)).status,403);
});
test('aceptación simultánea consume una sola vez y no crea dos productores',async()=>{
 const h=await harness(),i=await invite(h);let chain=Promise.resolve();const batch=h.DB.batch.bind(h.DB);h.DB.batch=statements=>{const p=chain.then(()=>batch(statements));chain=p.catch(()=>{});return p};
 const results=await Promise.all([accept(h,i,{username:'primero'}),accept(h,i,{username:'segundo'})]);assert.equal(results.filter(r=>r.status===201).length,1);assert.ok(results.some(r=>[403,409].includes(r.status)));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n,5);
});
const wait=async check=>{for(let i=0;i<250;i++){if(check())return;await new Promise(r=>setTimeout(r,8))}assert.fail('La interfaz no llegó al estado esperado')};
test('pantalla de alta real: usuario editable, confirmación y ojo; ignora el perfil ficticio del navegador',async()=>{
 const h=await harness(),i=await invite(h),dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:i.activationUrl,runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};let session=null;w.localStorage.setItem('turi.gestion.demo.v1',JSON.stringify({clients:[{name:'FICTICIO VIEJO'}]}));
 w.fetch=async(url,options={})=>{const r=await worker.fetch(new Request(new URL(url,'https://turi.test'),{method:options.method||'GET',headers:{...options.headers,Origin:'https://turi.test','CF-Connecting-IP':'192.0.2.61',...(session?{Cookie:session}:{})},body:options.body}),h.env);const cookie=r.headers.get('set-cookie');if(cookie)session=cookie.split(';')[0];return r;};
 for(const file of ['multiquote.js','documents.js','quote-explorer.js','workspace.js','pilot.js'])w.eval(readFileSync('public/'+file,'utf8'));
 await wait(()=>w.document.querySelector('#pas-signup'));const f=w.document.querySelector('#pas-signup');assert.equal(w.location.hash,'');assert.equal(f.elements.username.readOnly,false);assert.equal(f.elements.password.autocomplete,'new-password');assert.equal(f.querySelectorAll('[data-password-toggle]').length,2);
 f.elements.username.value='usuario-propio';f.elements.password.value=password;f.elements.passwordConfirmation.value=password;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>w.document.querySelector('#personal-code-form'));const code=w.document.querySelector('#personal-code').textContent,confirm=w.document.querySelector('#personal-code-form');confirm.elements.code.value=code;confirm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('.w-sidebar'));
 assert.ok(!w.document.body.textContent.includes('FICTICIO VIEJO'));w.document.querySelector('[data-work=nav][data-page=clients]').click();assert.ok(w.document.querySelector('#w-body .w-empty'));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_clients WHERE owner_id=(SELECT id FROM pilot_users WHERE username=?)').get('usuario-propio').n,0);dom.window.close();
});
test('Super Admin crea el enlace desde Productores sin elegir contraseña para el invitado',async()=>{
 const h=await harness(),dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/#view=producers',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};
 const request=async(path,method='GET',data)=>{const r=await h.call(path,{method,data,as:'mauro'});if(r.status>=400)throw Error(r.data.message);return r.data;};
 w.eval(readFileSync('public/workspace.js','utf8'));await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user:{id:'DOC-ADMIN',role:'superadmin',name:'Mauro',username:'mauro'},companies:(await h.call('/companies')).data.companies,request,expired:()=>{}});
 assert.match(w.document.body.textContent,/Invitaciones a productores/);w.document.querySelector('[data-work=invite-producer]').click();const f=w.document.querySelector('#work-invite');assert.equal(f.querySelector('[type=password]'),null);f.elements.name.value='Daniel de prueba';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>w.document.querySelector('#pas-invite-link'));assert.match(w.document.querySelector('#pas-invite-link').value,/#invite=/);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM pilot_users').get().n,4);dom.window.close();
});
