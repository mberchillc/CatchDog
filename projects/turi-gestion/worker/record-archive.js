import {seal,unseal,NOW} from './security.js';
export const ARCHIVE_TYPES={clients:'work_clients',policies:'work_policies',claims:'work_claims',tasks:'work_tasks',quotes:'work_quotes',offers:'work_offers',emission:'work_emission_cases',quoteIntakes:'work_quote_intakes'};
export const archiveActiveSQL=(type,table)=>`NOT EXISTS (SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=${table}.tenant_id AND ra.record_type='${type}' AND ra.record_id=${table}.id AND ra.state='archived')`;
export async function archiveMarker(env,tenant,type,id){return env.DB.prepare("SELECT * FROM work_record_archives WHERE tenant_id=? AND record_type=? AND record_id=? AND state='archived'").bind(tenant,type,id).first();}
export async function requireUnarchived(env,row,type,fail){if(await archiveMarker(env,row.tenant_id,type,row.id))fail(409,'ARCHIVED','Este registro está en Históricos. Restauralo antes de modificarlo.');}
export async function recordArchiveApi(req,env,u,H){
 const {json,fail,first,all,stmt,run,audit,body,rate}=H,url=new URL(req.url),parts=url.pathname.slice('/api/pilot/work/archive'.length).split('/').filter(Boolean),admin=u.role==='superadmin';
 const scope=admin?'tenant_id=?':'tenant_id=? AND owner_id=?',args=[u.tenant_id,...(admin?[]:[u.id])];
 const aad=(type,id)=>`record-archive:${u.tenant_id}:${type}:${id}`;
 if(!parts.length&&req.method==='GET'){
  const marks=await all(env,'SELECT * FROM work_record_archives WHERE '+scope+" AND state='archived' ORDER BY archived_at DESC LIMIT 2000",...args);
  const records=await Promise.all(marks.map(async r=>{const p=await unseal(env,r.payload,aad(r.record_type,r.record_id));return {type:r.record_type,id:r.record_id,owner_id:r.owner_id,version:r.version,recordVersion:p.snapshot.version,label:p.label,note:p.note,archivedAt:r.archived_at,actorId:r.actor_id,marketingConsent:p.marketingConsent===true};}));
  return json({records,automaticCleanup:false,retention:'Hasta revisión y limpieza autorizada; sin borrado automático.'});
 }
 if(parts.length!==2||!Object.hasOwn(ARCHIVE_TYPES,parts[0])||req.method!=='POST')fail(404,'NOT_FOUND','La operación no está disponible.');
 await rate(env,'archive-write:'+u.id,60);const [type,id]=parts;if(!/^[\w-]{1,100}$/.test(id))fail(404,'NOT_FOUND','No encontramos el registro.');const row=await first(env,'SELECT * FROM '+ARCHIVE_TYPES[type]+' WHERE id=? AND '+scope,id,...args);if(!row)fail(404,'NOT_FOUND','No encontramos el registro.');
 const b=await body(req);if(!b||!['archive','restore'].includes(b.action)||!Number.isSafeInteger(b.expectedVersion))fail(400,'FIELD','Revisá la acción y la versión del registro.');
 const mark=await first(env,'SELECT * FROM work_record_archives WHERE tenant_id=? AND record_type=? AND record_id=?',u.tenant_id,type,id),stamp=NOW();
 if(b.action==='restore'){
  if(!mark||mark.state!=='archived'||mark.version!==b.expectedVersion)fail(409,'VERSION','El registro de Históricos cambió. Actualizá antes de restaurar.');
  const result=await env.DB.batch([
   stmt(env,"UPDATE work_record_archives SET state='restored',version=version+1,restored_at=? WHERE tenant_id=? AND record_type=? AND record_id=? AND state='archived' AND version=?",stamp,u.tenant_id,type,id,b.expectedVersion),
   stmt(env,"INSERT OR IGNORE INTO work_record_archive_events(tenant_id,owner_id,record_type,record_id,version,action,payload,actor_id,created_at) SELECT tenant_id,owner_id,record_type,record_id,version,'restored',payload,?,? FROM work_record_archives WHERE tenant_id=? AND record_type=? AND record_id=? AND state='restored' AND version=? AND restored_at=?",u.id,stamp,u.tenant_id,type,id,b.expectedVersion+1,stamp)
  ]);if(result[0].meta.changes!==1)fail(409,'VERSION','El registro cambió. Actualizá antes de restaurar.');await audit(env,u,'work.archive.restored',id);return json({ok:true,state:'restored',dataDeleted:false});
 }
 if(row.version!==b.expectedVersion||mark?.state==='archived')fail(409,'VERSION','El registro cambió o ya está en Históricos. Actualizá para continuar.');
 if(typeof b.note!=='string'||b.note.length>1500)fail(400,'FIELD','La nota admite hasta 1500 caracteres.');
 const p=await unseal(env,row.payload,type==='emission'?`emission:${row.tenant_id}:${row.owner_id}:${row.id}`:type==='quoteIntakes'?`mq:${row.tenant_id}:${row.owner_id}:${row.id}`:`work:${row.tenant_id}:${row.owner_id}:${type}:${row.id}`);
 const label=String(p.name||p.number||p.title||(typeof p.risk==='string'?p.risk:'')||p.description||(type==='quoteIntakes'?[p.risk?.brand,p.risk?.model,p.risk?.year].filter(Boolean).join(' '):'')||'Registro').slice(0,300),payload=await seal(env,{label,note:b.note.trim(),snapshot:row,marketingConsent:type==='clients'&&p.marketingConsent===true},aad(type,id)),v=(mark?.version||0)+1;
 const gate='EXISTS (SELECT 1 FROM '+ARCHIVE_TYPES[type]+' WHERE id=? AND tenant_id=? AND owner_id=? AND version=?)',gateArgs=[id,u.tenant_id,row.owner_id,b.expectedVersion];
 const write=mark?stmt(env,"UPDATE work_record_archives SET state='archived',payload=?,actor_id=?,archived_at=?,restored_at=NULL,version=version+1 WHERE tenant_id=? AND record_type=? AND record_id=? AND state='restored' AND version=? AND "+gate,payload,u.id,stamp,u.tenant_id,type,id,mark.version,...gateArgs):stmt(env,"INSERT OR IGNORE INTO work_record_archives(tenant_id,owner_id,record_type,record_id,state,payload,actor_id,archived_at,version) SELECT ?,?,?,?,'archived',?,?,?,1 WHERE "+gate+' AND NOT EXISTS(SELECT 1 FROM work_record_archives WHERE tenant_id=? AND record_type=? AND record_id=?)',u.tenant_id,row.owner_id,type,id,payload,u.id,stamp,...gateArgs,u.tenant_id,type,id);
 const result=await env.DB.batch([write,stmt(env,"INSERT OR IGNORE INTO work_record_archive_events(tenant_id,owner_id,record_type,record_id,version,action,payload,actor_id,created_at) SELECT tenant_id,owner_id,record_type,record_id,version,'archived',payload,?,? FROM work_record_archives WHERE tenant_id=? AND record_type=? AND record_id=? AND state='archived' AND version=? AND archived_at=?",u.id,stamp,u.tenant_id,type,id,v,stamp)]);if(result[0].meta.changes!==1)fail(409,'VERSION','El registro cambió. Actualizá antes de archivarlo.');
 await audit(env,u,'work.archive.created',id);return json({ok:true,state:'archived',dataDeleted:false,relatedRecordsArchived:false},201);
}
