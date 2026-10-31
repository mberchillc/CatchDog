import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {harness} from './support/private-harness.mjs';
const wait=async(fn,details=()=> '')=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail(details());};
async function receive(h,as,label){const c=await h.create('emission',{branch:'Autos',title:'CASO FICTICIO · '+label,data:{}},as),s=await h.call('/work/emission/'+c.id+'/share',{method:'POST',as,data:{expectedVersion:c.version}});assert.equal(s.status,200);const token=new URLSearchParams(new URL(s.data.url).hash.slice(1)).get('token'),r=await h.call('/public/emission/submit',{method:'POST',as:'',data:{id:c.id,token,data:{holder_name:label,owner_same:'yes'},fileIds:[],consent:true}});assert.equal(r.status,201);return {id:c.id,responseId:r.data.receipt.responseId,label};}
async function fixture(){const h=await harness();h.DB.db.prepare('UPDATE pilot_users SET name=? WHERE id=?').run('PAS ficticio de Mauro','DOC-PEER');const d=await receive(h,'dani','CLIENTE FICTICIO DE DANIEL'),p=await receive(h,'peer','CLIENTE FICTICIO DEL PAS DE MAURO'),p2=await receive(h,'peer','SEGUNDO CLIENTE FICTICIO DE MAURO'),o=await receive(h,'other','OTRA ORGANIZACIÓN');return {h,d,p,p2,o};}
function request(h,as='mauro',paths=[]){return async(path,method='GET',data)=>{paths.push({path,method});const r=await h.call(path,{method,data,as});if(r.status>=400)throw Object.assign(Error(r.data.message),{status:r.status});return r.data;};}
async function ui(h,requestOverride){const dom=new JSDOM('<main id="pilot"></main>',{url:'https://turi.test/privado/#view=policies',runScripts:'outside-only'}),w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['amounts.js','intake-fields.js','emission.js','notifications.js','workspace.js'])w.eval(readFileSync('public/'+file,'utf8'));
 const paths=[];await w.TuriWorkspace.open({root:w.document.querySelector('#pilot'),user:{id:'DOC-ADMIN',name:'SUPERADMIN FICTICIO',username:'mauro',role:'superadmin'},companies:(await h.call('/companies')).data.companies,request:requestOverride||request(h,'mauro',paths),expired:()=>{}});
 function select(owner){const input=w.document.querySelector('#work-owner');assert.ok(input);input.value=owner;input.dispatchEvent(new w.Event('change',{bubbles:true}));}
 const close=()=>{w.TuriWorkspace.leave();dom.window.close();};return {dom,w,paths,select,close};
}

test('campanita del Superadmin respeta la cartera en lista y contador; cada PAS conserva su carril',async()=>{
 const {h,d,p,p2}=await fixture(),before=h.DB.db.prepare('SELECT id,owner_id,payload,response_payload,version FROM work_emission_cases ORDER BY id').all();
 const scoped=async(as,owner)=>(await h.call('/work/emission/notifications'+(owner?'?owner='+owner:''),{as}));
 const a=await scoped('mauro','DOC-DANI');assert.equal(a.status,200);assert.equal(a.data.unread,1);assert.deepEqual(a.data.items.map(r=>r.caseId),[d.id]);assert.equal(a.data.items[0].ownerName,'Daniel Stern');
 const b=await scoped('mauro','DOC-PEER');assert.equal(b.data.unread,2);assert.deepEqual(new Set(b.data.items.map(r=>r.caseId)),new Set([p.id,p2.id]));assert.ok(b.data.items.every(r=>r.ownerId==='DOC-PEER'));
 const all=await scoped('mauro','');assert.equal(all.data.unread,3);assert.equal(all.data.items.length,3);assert.deepEqual(new Set(all.data.items.map(r=>r.ownerId)),new Set(['DOC-DANI','DOC-PEER']));
 assert.equal((await scoped('dani','')).data.unread,1);assert.equal((await scoped('peer','')).data.unread,2);assert.equal((await scoped('dani','DOC-DANI')).data.unread,1);
 assert.equal((await scoped('dani','DOC-PEER')).status,403);assert.equal((await scoped('peer','DOC-DANI')).status,403);assert.equal((await scoped('mauro','DOC-OTHER')).status,404);assert.equal((await scoped('mauro','NO-EXISTE')).status,404);
 assert.deepEqual(h.DB.db.prepare('SELECT id,owner_id,payload,response_payload,version FROM work_emission_cases ORDER BY id').all(),before);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_emission_reads').get().n,0);
});

test('marcar leído valida la cartera seleccionada sin consumir los avisos de otro PAS ni su lectura personal',async()=>{
 const {h,d,p}=await fixture(),read=(id,owner,as='mauro')=>h.call('/work/emission/notifications/'+id+'/read?owner='+owner,{method:'POST',as,data:{}});
 assert.equal((await read(p.responseId,'DOC-DANI')).status,404);assert.equal((await read(d.responseId,'DOC-PEER')).status,404);assert.equal((await read(d.responseId,'DOC-DANI','peer')).status,403);assert.equal((await read(d.responseId,'DOC-OTHER')).status,404);assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_emission_reads').get().n,0);
 assert.equal((await read(d.responseId,'DOC-DANI')).status,200);assert.equal((await h.call('/work/emission/notifications?owner=DOC-DANI',{as:'mauro'})).data.unread,0);assert.equal((await h.call('/work/emission/notifications?owner=DOC-PEER',{as:'mauro'})).data.unread,2);assert.equal((await h.call('/work/emission/notifications',{as:'dani'})).data.unread,1);
 const marker=h.DB.db.prepare('SELECT * FROM work_emission_reads').get();assert.equal(marker.viewer_id,'DOC-ADMIN');assert.equal(marker.case_id,d.id);
});

test('selector real de cartera cambia la campanita y el contador sin mezclar formularios ficticios',async()=>{
 const {h,d,p}=await fixture(),t=await ui(h),{w,select}=t;try{
 await w.TuriNotifications.refresh(true);w.document.querySelector('[data-notification=toggle]').click();await wait(()=>w.document.querySelector('.w-notifications'));assert.match(w.document.querySelector('.w-notifications').textContent,/Toda la organización/);assert.match(w.document.querySelector('.w-notifications').textContent,/Daniel Stern/);assert.match(w.document.querySelector('.w-notifications').textContent,/PAS ficticio de Mauro/);
 select('DOC-DANI');assert.equal(w.document.querySelector('.w-notifications'),null);await w.TuriNotifications.refresh(true);assert.equal(w.document.querySelector('.w-bell-dot').textContent,'1');w.document.querySelector('[data-notification=toggle]').click();await wait(()=>w.document.querySelector('[data-response="'+d.responseId+'"]'));assert.match(w.document.querySelector('.w-notifications').textContent,/Vista: Daniel Stern/);assert.ok(!w.document.querySelector('.w-notifications').textContent.includes(p.label));
 select('DOC-PEER');assert.equal(w.document.querySelector('.w-notifications'),null);await w.TuriNotifications.refresh(true);assert.equal(w.document.querySelector('.w-bell-dot').textContent,'2');w.document.querySelector('[data-notification=toggle]').click();await wait(()=>w.document.querySelector('[data-response="'+p.responseId+'"]'));assert.match(w.document.querySelector('.w-notifications').textContent,/Vista: PAS ficticio de Mauro/);assert.ok(!w.document.querySelector('.w-notifications').textContent.includes(d.label));
 assert.ok(t.paths.some(r=>r.path==='/work/emission/notifications?owner=DOC-DANI'));assert.ok(t.paths.some(r=>r.path==='/work/emission/notifications?owner=DOC-PEER'));assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_emission_reads').get().n,0);
 }finally{t.close();}
});

test('una respuesta tardía de la cartera anterior no repone sus avisos ni toca otros campos',async()=>{
 const dom=new JSDOM('<div id="w-notification-slot"></div><input id="draft" value="DATOS SIN GUARDAR">',{url:'https://turi.test/privado/',runScripts:'outside-only'}),w=dom.window;w.eval(readFileSync('public/notifications.js','utf8'));let release;const paths=[],user={id:'ADMIN-FICTICIO',role:'superadmin'},first={user,ownerId:'DANI-FICTICIO',ownerLabel:'Daniel ficticio',request:async path=>{paths.push(path);return new Promise(r=>release=r);},openCase:async()=>true};
 try{w.TuriNotifications.configure(first);const old=w.TuriNotifications.refresh(true);await wait(()=>release);w.TuriNotifications.configure({user,ownerId:'PAS-MAURO-FICTICIO',ownerLabel:'Mauro ficticio',request:async path=>{paths.push(path);return {unread:2,items:[{name:'SOLO PAS MAURO',caseId:'CASO-B',responseId:'RESP-B',ownerId:'PAS-MAURO-FICTICIO',receivedAt:Date.now(),branch:'Autos'}]};},openCase:async()=>true});await w.TuriNotifications.refresh(true);release({unread:7,items:[{name:'NO VOLVER A MOSTRAR DANIEL',caseId:'CASO-A',responseId:'RESP-A',receivedAt:Date.now(),branch:'Autos'}]});await old;
 w.document.querySelector('[data-notification=toggle]').click();await wait(()=>w.document.querySelector('.w-notifications'));assert.equal(w.document.querySelector('.w-bell-dot').textContent,'2');assert.match(w.document.querySelector('.w-notifications').textContent,/SOLO PAS MAURO/);assert.ok(!w.document.querySelector('.w-notifications').textContent.includes('NO VOLVER'));assert.equal(w.document.querySelector('#draft').value,'DATOS SIN GUARDAR');assert.ok(paths.includes('/work/emission/notifications?owner=PAS-MAURO-FICTICIO'));
 }finally{w.TuriNotifications.reset();dom.window.close();}
});

test('cambiar de cartera durante la apertura de un aviso impide navegar al caso anterior o marcarlo leído',async()=>{
 const {h,d}=await fixture(),base=request(h);let release;const req=async(path,method='GET',data)=>{const result=await base(path,method,data);if(path==='/work/emission/'+d.id)await new Promise(r=>release=r);return result;},t=await ui(h,req),{w,select}=t;
 try{select('DOC-DANI');await w.TuriNotifications.refresh(true);w.document.querySelector('[data-notification=toggle]').click();await wait(()=>w.document.querySelector('[data-response="'+d.responseId+'"]'));w.document.querySelector('[data-response="'+d.responseId+'"]').click();await wait(()=>release);select('DOC-PEER');await w.TuriNotifications.refresh(true);release();await new Promise(r=>setTimeout(r,20));assert.equal(w.location.hash,'#view=policies');assert.equal(w.document.querySelector('#emission-record'),null);assert.equal(w.document.querySelector('.w-bell-dot').textContent,'2');assert.equal(h.DB.db.prepare('SELECT count(*) AS n FROM work_emission_reads').get().n,0);
 }finally{if(release)release();t.close();}
});
