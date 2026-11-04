import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,preview,PAS,PEER,ADMIN,OTHER} from './support/supervision-fixture.mjs';

const setup={expectedVersion:0,pasCode:'QA-0007',taxId:'20123456786',authorized:true,portalUser:'QA-PORTAL-USER',portalPassword:'QA-PORTAL-SECRET',api:{username:'QA-API-USER',password:'QA-API-SECRET',subscriptionKey:'QA-SUBSCRIPTION-SECRET'}};
const noSecrets=data=>{const text=JSON.stringify(data);for(const value of [setup.pasCode,setup.portalUser,setup.portalPassword,...Object.values(setup.api),'fixture-code-hash','fixture-no-login'])assert.ok(!text.includes(value));};
const workSnapshot=f=>f.DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'work_%' OR name IN ('pilot_users','pilot_connections')) ORDER BY name").all().map(({name})=>[name,f.DB.db.prepare('SELECT * FROM '+name).all()]);

test('la ruta de vista PAS sirve la misma aplicación y exige una sesión de Superadmin para sus datos',async()=>{
 const f=await fixture(),r=await f.response('/admin/vista-pas/'+PAS+'/',{as:''});assert.equal(r.status,200);const html=new TextDecoder().decode(await r.arrayBuffer());assert.ok(html.includes('/supervision.js?v=superadmin-full-20261104'));assert.ok(html.includes('/pilot.js?v=superadmin-full-20261104'));assert.ok(!html.includes('PAS ficticio'));
 assert.equal((await f.call(preview('/auth/me'),{as:''})).status,401);
});
test('la supervisión entrega el perfil PAS con actor administrador sin crear ni renovar sesiones del productor',async()=>{
 const f=await fixture(),before=f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS),count=f.DB.db.prepare('SELECT count(*) n FROM pilot_sessions').get().n;
 const r=await f.call(preview('/auth/me'),{as:ADMIN});assert.equal(r.status,200);assert.equal(r.data.user.id,PAS);assert.equal(r.data.user.role,'producer');assert.equal(r.data.supervision.actor.id,ADMIN);assert.equal(r.data.supervision.readOnly,false);assert.equal(r.data.csrf,f.sessions[ADMIN].csrf);assert.equal(r.response.headers.get('set-cookie'),null);noSecrets(r.data);
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
test('Superadmin guarda accesos del PAS cifrados, conserva versiones y registra al actor real',async()=>{
 const f=await fixture(),sessions=f.DB.db.prepare('SELECT * FROM pilot_sessions WHERE user_id=?').all(PAS);
 const saved=await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:{...setup,ownerId:PEER,producerId:PEER}});assert.equal(saved.status,201,JSON.stringify(saved.data));noSecrets(saved.data);
 const row=f.DB.db.prepare('SELECT * FROM pilot_connections').get();assert.equal(row.producer_id,PAS);assert.equal(row.version,1);noSecrets(row);
 const own=await f.call('/company-setup/mercantil');assert.deepEqual(own.data,saved.data.companyId?{companyId:saved.data.companyId,record:saved.data.record}:null);
 const event=f.DB.db.prepare("SELECT actor_id,record_id FROM pilot_audit WHERE action='supervision.connection.setup_created'").get();assert.equal(event.actor_id,ADMIN);assert.equal(event.record_id,row.id);
 const replaced=await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:{expectedVersion:1,authorized:true}});assert.equal(replaced.status,200);assert.equal(replaced.data.record.version,2);assert.equal(replaced.data.record.portalConfigured,true);assert.equal(replaced.data.record.apiConfigured.subscriptionKey,true);
 assert.equal((await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:setup})).status,409);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM pilot_sessions WHERE user_id=?').get(PAS).n,sessions.length);
});
test('Superadmin crea, edita, archiva y restaura registros con titular PAS y actor administrador',async()=>{
 const f=await fixture(),created=await f.call(preview('/work/clients'),{as:ADMIN,method:'POST',data:{name:'Cliente administrado de prueba'}});assert.equal(created.status,201,JSON.stringify(created.data));const c=created.data.record;assert.equal(c.owner_id,PAS);
 const update=await f.call(preview('/work/clients/'+c.id),{as:ADMIN,method:'POST',data:{...c,name:'Cliente actualizado',expectedVersion:1}});assert.equal(update.status,200);assert.equal(update.data.record.version,2);
 const archive=await f.call(preview('/work/archive/clients/'+c.id),{as:ADMIN,method:'POST',data:{action:'archive',expectedVersion:2,note:'Prueba aislada'}});assert.equal(archive.status,201);const mark=f.DB.db.prepare('SELECT * FROM work_record_archives').get();assert.equal(mark.owner_id,PAS);assert.equal(mark.actor_id,ADMIN);
 assert.equal((await f.call(preview('/work/archive/clients/'+c.id),{as:ADMIN,method:'POST',data:{action:'restore',expectedVersion:1}})).status,200);assert.ok(f.DB.db.prepare('SELECT actor_id FROM work_record_archive_events').all().every(e=>e.actor_id===ADMIN));
 const bad=await f.call(preview('/work/clients'),{as:ADMIN,method:'POST',data:{name:'No cambiar titular',ownerId:PEER}});assert.equal(bad.status,403);
});
test('CSRF, origen, roles y organización siguen protegiendo cada escritura delegada',async()=>{
 const f=await fixture(),before=workSnapshot(f);
 for(const headers of [{'X-Turi-CSRF':'invalid'},{Origin:'https://otro.test'}])assert.equal((await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:setup,headers})).status,403);
 for(const as of [PAS,PEER,OTHER])assert.equal((await f.call(preview('/company-setup/mercantil'),{as,method:'POST',data:setup})).status,403);
 for(const id of [OTHER,ADMIN,'NO-EXISTE'])assert.equal((await f.call(preview('/company-setup/mercantil',id),{as:ADMIN,method:'POST',data:setup})).status,404);
 for(const path of ['/auth/logout','/auth/email/start','/auth/code/prepare','/admin/producers'])assert.equal((await f.call(preview(path),{as:ADMIN,method:'POST',data:{}})).status,404);
 assert.deepEqual(workSnapshot(f),before);
});
test('Superadmin prueba QA con credenciales API guardadas sin exponer tokens ni atribuirle la operación al PAS',async t=>{
 const f=await fixture(),saved=await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:setup});assert.equal(saved.status,201);
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://apidev.mercantilandina.com.ar/credenciales/v2/');assert.equal(new URLSearchParams(options.body).get('username'),setup.api.username);return Response.json({access_token:'QA-NEVER-EXPOSE-TOKEN',token_type:'Bearer'});});
 const result=await f.call(preview('/connections/'+saved.data.record.id+'/mercantil-qa'),{as:ADMIN,method:'POST',data:{expectedVersion:1,useSaved:true,authorized:true}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.status,'qa_auth_verified');assert.equal(result.data.portfolioAvailable,false);assert.ok(!JSON.stringify(result.data).includes('QA-NEVER-EXPOSE-TOKEN'));noSecrets(result.data);
 const row=f.DB.db.prepare('SELECT * FROM pilot_connections').get();assert.equal(row.producer_id,PAS);assert.equal(row.version,2);assert.ok(!JSON.stringify(row).includes('QA-NEVER-EXPOSE-TOKEN'));assert.equal(f.DB.db.prepare("SELECT actor_id FROM pilot_audit WHERE action='supervision.connection.mercantil_qa_authenticated'").get().actor_id,ADMIN);
});
test('revocar al Superadmin o desactivar al PAS durante QA impide confirmar el acceso',async t=>{
 for(const change of ['revoke','disable']){
  const f=await fixture(),saved=await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:setup}),before=f.DB.db.prepare('SELECT * FROM pilot_connections').get();
  t.mock.method(globalThis,'fetch',async()=>{if(change==='revoke')f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(ADMIN);else f.DB.db.prepare('UPDATE pilot_users SET disabled=1 WHERE id=?').run(PAS);return Response.json({access_token:'QA-TOKEN',token_type:'Bearer'});});
  const r=await f.call(preview('/connections/'+saved.data.record.id+'/mercantil-qa'),{as:ADMIN,method:'POST',data:{expectedVersion:1,useSaved:true,authorized:true}});assert.equal(r.status,change==='revoke'?401:404);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_connections').get(),before);t.mock.restoreAll();
 }
});
test('revocación justo antes del SQL bloquea el guardado de configuración delegado',async()=>{
 const f=await fixture();await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:setup});const before=f.DB.db.prepare('SELECT * FROM pilot_connections').get(),prepare=f.DB.prepare.bind(f.DB);
 f.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('UPDATE pilot_connections SET method=')){const run=stmt.run.bind(stmt);stmt.run=async()=>{f.DB.db.prepare('DELETE FROM pilot_sessions WHERE user_id=?').run(ADMIN);return run();};}return stmt;};
 const r=await f.call(preview('/company-setup/mercantil'),{as:ADMIN,method:'POST',data:{expectedVersion:1,authorized:true,portalUser:'Nuevo',portalPassword:'QA-SECRET'}});assert.equal(r.status,409);assert.deepEqual(f.DB.db.prepare('SELECT * FROM pilot_connections').get(),before);
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


test('la lectura de notificaciones del administrador no consume las lecturas personales del PAS',async()=>{
 const f=await fixture(),c=await f.receive();const r=await f.call(preview('/work/emission/notifications/'+c.responseId+'/read'),{as:ADMIN,method:'POST',data:{}});assert.equal(r.status,200);assert.equal(f.DB.db.prepare('SELECT viewer_id FROM work_emission_reads').get().viewer_id,ADMIN);assert.equal((await f.call('/work/emission/notifications')).data.unread,1);assert.equal((await f.call(preview('/work/emission/notifications'),{as:ADMIN})).data.unread,0);
});
