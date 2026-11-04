import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,preview,PAS,PEER,ADMIN,OTHER} from './support/supervision-fixture.mjs';

const setup={expectedVersion:0,pasCode:'QA-0007',taxId:'20123456786',authorized:true,portalUser:'QA-PORTAL-USER',portalPassword:'QA-PORTAL-SECRET',api:{username:'QA-API-USER',password:'QA-API-SECRET',subscriptionKey:'QA-SUBSCRIPTION-SECRET'}};
const noSecrets=data=>{const text=JSON.stringify(data);for(const value of [setup.pasCode,setup.portalUser,setup.portalPassword,...Object.values(setup.api),'fixture-code-hash','fixture-no-login'])assert.ok(!text.includes(value));};
const workSnapshot=f=>f.DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'work_%' OR name IN ('pilot_users','pilot_connections')) ORDER BY name").all().map(({name})=>[name,f.DB.db.prepare('SELECT * FROM '+name).all()]);

test('la ruta de vista PAS sirve la misma aplicación y exige una sesión de Superadmin para sus datos',async()=>{
 const f=await fixture(),r=await f.response('/admin/vista-pas/'+PAS+'/',{as:''});assert.equal(r.status,200);const html=new TextDecoder().decode(await r.arrayBuffer());assert.ok(html.includes('/supervision.js?v=20261104'));assert.ok(html.includes('/pilot.js?v=supervision-20261104'));assert.ok(!html.includes('PAS ficticio'));
 assert.equal((await f.call(preview('/auth/me'),{as:''})).status,401);
});
test('la supervisión entrega el perfil PAS con actor administrador sin crear ni renovar sesiones del productor',async()=>{
 const f=await fixture(),before=f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS),count=f.DB.db.prepare('SELECT count(*) n FROM pilot_sessions').get().n;
 const r=await f.call(preview('/auth/me'),{as:ADMIN});assert.equal(r.status,200);assert.equal(r.data.user.id,PAS);assert.equal(r.data.user.role,'producer');assert.equal(r.data.supervision.actor.id,ADMIN);assert.equal(r.data.supervision.readOnly,true);assert.equal(r.data.csrf,f.sessions[ADMIN].csrf);assert.equal(r.response.headers.get('set-cookie'),null);noSecrets(r.data);
 assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS),before);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_sessions').get().n,count);
 const log=f.DB.db.prepare("SELECT actor_id,record_id FROM pilot_audit WHERE action='supervision.opened'").get();assert.equal(log.actor_id,ADMIN);assert.equal(log.record_id,PAS);
});
test('las mismas consultas PAS producen los mismos datos de cartera, compañías y configuración resguardada',async()=>{
 const f=await fixture();await f.create('clients',{name:'Cliente del PAS ficticio'});await f.create('clients',{name:'Cliente que no debe verse'},PEER);await f.call('/company-setup/mercantil',{method:'POST',data:setup});
 const paths=['/work/overview','/work/integrations','/connections','/company-setup/mercantil','/company-setup/segunda','/companies','/audit','/documents/summary','/documents','/work/emission','/work/archive','/work/multiquote/catalog'];
 for(const path of paths){const expected=await f.call(path),actual=await f.call(preview(path),{as:ADMIN});assert.equal(actual.status,200,path+': '+JSON.stringify(actual.data));assert.deepEqual(actual.data,expected.data,path);noSecrets(actual.data);}
});
test('no se pueden ampliar las lecturas hacia otro PAS mediante IDs o filtros',async()=>{
 const f=await fixture(),foreign=await f.create('emission',{branch:'Autos',title:'Ajeno',data:{}},PEER);
 for(const [path,status] of [['/work/overview?owner='+PEER,403],['/documents?ownerId='+PEER,403],['/work/emission/notifications?owner='+PEER,403],['/work/emission/'+foreign.id,404]])assert.equal((await f.call(preview(path),{as:ADMIN})).status,status,path);
});
test('sólo Superadmin supervisa productores activos de su organización',async()=>{
 const f=await fixture();for(const as of [PAS,PEER,OTHER])assert.equal((await f.call(preview('/auth/me'),{as})).status,403);
 for(const id of [OTHER,ADMIN,'INEXISTENTE'])assert.equal((await f.call(preview('/auth/me',id),{as:ADMIN})).status,404);
 f.DB.db.prepare('UPDATE pilot_users SET disabled=1 WHERE id=?').run(PAS);assert.equal((await f.call(preview('/auth/me'),{as:ADMIN})).status,404);
});
test('todos los cambios, pruebas de conexión y acciones de cuenta quedan bloqueados en el servidor',async t=>{
 const f=await fixture();const before=workSnapshot(f),sessions=f.DB.db.prepare('SELECT id,user_id FROM pilot_sessions ORDER BY id').all();t.mock.method(globalThis,'fetch',async()=>{assert.fail('Supervision must not contact insurers');});
 for(const path of ['/company-setup/mercantil','/connections','/connections/QA-ID/mercantil-qa','/work/clients','/work/emission/notifications/QA-ID/read','/auth/logout','/auth/email/start','/auth/code/prepare','/admin/producers','/documents']){
  const r=await f.call(preview(path),{as:ADMIN,method:'POST',data:setup});assert.equal(r.status,403,path);assert.equal(r.data.error,'SUPERVISION_READ_ONLY');
 }
 assert.equal((await f.call(preview('/connections/QA-ID'),{as:ADMIN,method:'DELETE'})).status,403);assert.deepEqual(workSnapshot(f),before);assert.deepEqual(f.DB.db.prepare('SELECT id,user_id FROM pilot_sessions ORDER BY id').all(),sessions);
});
test('la ruta de supervisión no reenvía autenticación, administración ni rutas anidadas',async()=>{
 const f=await fixture();for(const path of ['/auth/login','/auth/recovery/state','/admin/overview','/status','/public/emission/prepare','/supervision/'+PEER+'/auth/me','/company-setup/%2fmercantil'])assert.equal((await f.call(preview(path),{as:ADMIN})).status,404,path);
});
test('las notificaciones reflejan las lecturas del PAS sin consumirlas ni mantener viva la sesión del administrador',async()=>{
 const f=await fixture();await f.receive();await f.receive(PEER,'Cliente de otro PAS');
 const adminBefore=f.DB.db.prepare('SELECT last_seen FROM pilot_sessions WHERE user_id=?').get(ADMIN),producerBefore=f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').get(PAS);
 const actual=await f.call(preview('/work/emission/notifications'),{as:ADMIN});assert.equal(actual.status,200);assert.equal(actual.data.unread,1);assert.ok(actual.data.items.every(i=>i.ownerId===PAS));
 assert.deepEqual(f.DB.db.prepare('SELECT last_seen FROM pilot_sessions WHERE user_id=?').get(ADMIN),adminBefore);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').get(PAS),producerBefore);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM work_emission_reads').get().n,0);
});
test('originales y vistas previas mantienen el ámbito PAS y la auditoría atribuye la consulta al Superadmin',async()=>{
 const f=await fixture(),client=await f.create('clients',{name:'Cliente documental de prueba'}),file=await f.upload(client.id),before=workSnapshot(f);
 for(const action of ['preview','download']){const r=await f.call(preview('/documents/'+file.document.id+'/'+action),{as:ADMIN});assert.equal(r.status,200);assert.deepEqual(r.bytes,file.bytes);}
 assert.equal((await f.call(preview('/documents/'+file.document.id+'/download',PEER),{as:ADMIN})).status,404);assert.deepEqual(workSnapshot(f),before);
 const events=f.DB.db.prepare("SELECT actor_id,action,record_id FROM pilot_audit WHERE action LIKE 'supervision.document.%' ORDER BY action").all();assert.equal(events.length,2);assert.ok(events.every(e=>e.actor_id===ADMIN&&e.record_id===file.document.id));
});
test('cada lectura vuelve a comprobar los permisos actuales y las sesiones revocadas no conservan acceso',async()=>{
 const f=await fixture();assert.equal((await f.call(preview('/companies'),{as:ADMIN})).status,200);f.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('producer',ADMIN);assert.equal((await f.call(preview('/companies'),{as:ADMIN})).status,403);f.DB.db.prepare('UPDATE pilot_users SET role=? WHERE id=?').run('superadmin',ADMIN);f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(ADMIN);assert.equal((await f.call(preview('/companies'),{as:ADMIN})).status,401);
});
