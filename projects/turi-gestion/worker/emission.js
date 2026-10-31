import '../public/amounts.js';
import {archiveActiveSQL,requireUnarchived} from './record-archive.js';
import {opaque,digest,equal,seal,unseal,sealFile,unsealFile,NOW} from './security.js';
import {documentType,documentUsageSQL,documentUsageArgs} from './documents.js';
import IS_SCHEMA from '../public/intake-schema.json' with {type:'json'};
const IS_ID=/^[A-Za-z0-9_-]{10,80}$/,IS_MAX_FILE=10*1024*1024;
const isAAD=r=>'emission:'+r.tenant_id+':'+r.owner_id+':'+r.id;
const isFileAAD=r=>'document:'+r.tenant_id+':'+r.owner_id+':'+r.id;
export function normalizeIntakeData(input={},branch='Autos'){
 const errors=[],data={};if(!input||typeof input!=='object'||Array.isArray(input))return {data,errors:['Revisá los datos del formulario.'],missing:[]};
 const allowed=new Set(IS_SCHEMA.fields.map(f=>f.key));for(const k of Object.keys(input))if(!allowed.has(k))errors.push('Campo no admitido: '+k);
 for(const f of IS_SCHEMA.fields){
  if(f.branches&&!f.branches.includes(branch))continue;
  let v=input[f.key]??'';if(typeof v!=='string'){errors.push('Revisá '+f.label);v='';}v=v.trim();if(v.length>(f.max||180)){errors.push(f.label+': texto demasiado extenso');v=v.slice(0,f.max||180);}
  if(f.type==='cbu')v=v.replace(/[\s-]/g,'');
  if(f.type==='money'&&v){try{v=globalThis.TuriAmounts.normalizeDecimal(v);}catch{errors.push('Revisá '+f.label);v='';}}
  if(v&&f.options&&!Object.hasOwn(f.options,v))errors.push('Elegí una opción válida en '+f.label);
  if(v&&f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))errors.push('Revisá '+f.label);
  if(v&&f.type==='tel'&&!/^[+\d\s().-]{6,40}$/.test(v))errors.push('Revisá '+f.label);
  if(v&&f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v))errors.push('Revisá '+f.label);
  if(v&&f.type==='cbu'&&!/^\d{22}$/.test(v))errors.push('El CBU debe tener 22 dígitos.');
  if(v&&f.type==='last4'&&!/^\d{4}$/.test(v))errors.push('Ingresá sólo los últimos cuatro dígitos de la tarjeta.');
  if(v&&f.type==='expiry'&&!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(v))errors.push('Revisá el vencimiento: MM/AAAA.');
  if(v&&f.type==='year'&&(!/^(19|20)\d{2}$/.test(v)||+v>new Date().getUTCFullYear()+1))errors.push('Revisá el año.');
  if(v&&['money','number'].includes(f.type)&&(!/^\d{1,12}(?:\.\d{1,2})?$/.test(v)||!Number.isFinite(+v)))errors.push('Revisá '+f.label);
  if(['text','textarea'].includes(f.type)&&!['holder_document','owner_document','payment_document'].includes(f.key)&&[...v.matchAll(/\b(?:\d[ -]?){13,19}\b/g)].some(m=>{const d=m[0].replace(/\D/g,'');let sum=0,twice=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(twice){n*=2;if(n>9)n-=9;}sum+=n;twice=!twice;}return d.length>=13&&d.length<=19&&sum%10===0;}))errors.push('No ingreses números completos de tarjetas en '+f.label+'.');
  data[f.key]=v;
 }
 data.owner_same=data.owner_same||'yes';
 for(const f of IS_SCHEMA.fields)if(f.when&&Object.entries(f.when).some(([k,v])=>data[k]!==v))data[f.key]='';
 const need=['holder_name','holder_documentType','holder_document','holder_tax','holder_street','holder_locality','holder_province','holder_postal','payment_method','payment_payer','payment_document'];
 if(data.holder_kind!=='company')need.push('holder_birth','holder_civil');
 if(!data.holder_email&&!data.holder_phone)need.push('holder_email');
 if(data.owner_same==='no')need.push('owner_name','owner_documentType','owner_document','owner_relationship','owner_interest');
 if(branch==='Autos')need.push('vehicle_brand','vehicle_model','vehicle_year','vehicle_version','vehicle_plate','vehicle_locality','vehicle_province','vehicle_postal','vehicle_coverage');
 if(branch==='Hogar')need.push('home_street','home_locality','home_province','home_postal','home_type','home_occupancy','home_construction','home_roof','home_coverage');
 if(branch==='Otros')need.push('other_description');
 if(data.payment_method==='cbu')need.push('payment_bank','payment_cbu','payment_authorization');
 if(data.payment_method==='card')need.push('payment_bank','payment_brand','payment_last4','payment_expiry');
 const missing=[...new Set(need)].filter(k=>!data[k]).map(key=>({key,label:IS_SCHEMA.fields.find(f=>f.key===key)?.label||key}));
 if(data.payment_method==='card')missing.push({key:'secure_card_registration',label:'Registro seguro de tarjeta en la compañía, pendiente de conexión'});
 return {data,errors,missing};
}
export async function emissionApi(req,env,u,companies,H){
 const {json,fail,stmt,first,all,run,audit,body,rate}=H,url=new URL(req.url),pub=url.pathname.startsWith('/api/pilot/public/'),base=pub?'/api/pilot/public/emission':'/api/pilot/work/emission',parts=url.pathname.slice(base.length).split('/').filter(Boolean);
 const text=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
 const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(409,'VERSION','Actualizá el caso antes de guardar.');return v};
 const dataFor=(v,branch)=>{const n=normalizeIntakeData(v,branch);if(n.errors.length)fail(400,'FORM_FIELDS',n.errors.join(' '));return n;};
 const get=async id=>{if(!IS_ID.test(id||''))fail(404,'NOT_FOUND','No encontramos el caso.');const r=await first(env,'SELECT * FROM work_emission_cases WHERE id=? AND tenant_id=?'+(u.role==='superadmin'?'':' AND owner_id=?'),id,u.tenant_id,...(u.role==='superadmin'?[]:[u.id]));if(!r)fail(404,'NOT_FOUND','No encontramos el caso.');await requireUnarchived(env,r,'emission',fail);return r;};
 const decode=r=>unseal(env,r.payload,isAAD(r));
 const files=async r=>(await Promise.all((await all(env,"SELECT * FROM work_emission_files WHERE case_id=? AND state='ready'",r.id)).map(async f=>{const p=await unseal(env,f.payload,'meta:'+isFileAAD(f));return {id:f.id,mime:f.mime,bytes:f.bytes,imported:!!f.imported,...p};})));
 const full=async r=>{const {payload,response_payload,token_hash,response_hash,claim_token,...meta}=r,p=await decode(r);return {...meta,...p,response:response_payload?await unseal(env,response_payload,'response:'+isAAD(r)):null,files:await files(r),missing:dataFor(p.data||{},r.branch).missing};};
 async function publicCase(b){
  if(!IS_ID.test(b?.id||'')||typeof b.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.token))fail(403,'FORM_LINK','El enlace no está disponible. Pedí un enlace nuevo a tu productor.');
  const r=await first(env,"SELECT c.* FROM work_emission_cases c JOIN pilot_users u ON u.id=c.owner_id AND u.tenant_id=c.tenant_id WHERE c.id=? AND c.token_hash=? AND c.token_expires_at>? AND c.token_revoked_at IS NULL AND u.disabled=0 AND "+archiveActiveSQL('emission','c'),b.id,digest(b.token),NOW());if(!r)fail(403,'FORM_LINK','El enlace venció o fue revocado. Pedí otro a tu productor.');return r;
 }
 const receipt=r=>({caseId:r.id,responseId:r.response_id,branch:r.branch,status:'received',returnUrl:new URL(req.url).origin+'/privado/#view=emission&case='+r.id+'&response='+r.response_id,message:'Tu información quedó recibida para revisión del productor. Todavía no se emitió cobertura ni se realizó un cobro.'});
 if(pub){
  if(req.method!=='POST')fail(405,'METHOD','Usá el formulario.');const action=parts[0];await rate(env,'public-emission:'+((req.headers.get('cf-connecting-ip'))||'unknown'),120,3600000);
  if(action==='upload')return uploadPublic();
  const b=await body(req,65536),r=await publicCase(b);
  if(action==='prepare'){
   if(r.token_used_at)return json({completed:true,receipt:receipt(r)});
   const p=await decode(r),producer=await first(env,'SELECT name FROM pilot_users WHERE id=?',r.owner_id),prefill={};for(const k of ['vehicle_brand','vehicle_model','vehicle_year','vehicle_version','vehicle_fuel','vehicle_usage','vehicle_locality','vehicle_province','vehicle_postal','vehicle_coverage','home_type','home_occupancy','home_construction','home_roof','home_area','home_age','home_security','home_coverage'])if(p.data?.[k])prefill[k]=p.data[k];
   return json({id:r.id,branch:r.branch,producer:producer?.name||'Turi',company:companies.find(c=>c.id===r.company_id)?.name||'',schema:IS_SCHEMA,prefill,expiresAt:r.token_expires_at,maxFiles:20,maxFileBytes:IS_MAX_FILE});
  }
  if(action==='submit'){
   const managed=IS_SCHEMA.fields.filter(f=>f.clientManagedByPAS).map(f=>f.key),prior=r.response_payload?await unseal(env,r.response_payload,'response:'+isAAD(r)):null,draft=prior?{data:prior.data}:await decode(r),input={...b.data};for(const key of managed)input[key]=draft.data?.[key]||'';
   const n=dataFor(input,r.branch);if(!n.data.holder_name||b.consent!==true)fail(400,'CONSENT','Ingresá el nombre del tomador y confirmá el envío al productor.');
   const selected=b.fileIds||[];if(!Array.isArray(selected)||selected.length>20||new Set(selected).size!==selected.length)fail(400,'FILES','Revisá los archivos.');
   const ready=await all(env,"SELECT id FROM work_emission_files WHERE case_id=? AND state='ready'",r.id);if(selected.some(id=>!ready.some(f=>f.id===id)))fail(400,'FILES','Esperá a que terminen de cargarse los archivos.');
   const clientOnly={...b.data};for(const key of managed)clientOnly[key]='';const clientRequestHash=digest(JSON.stringify({data:dataFor(clientOnly,r.branch).data,fileIds:selected,consent:true})),legacy=normalizeIntakeData(b.data,r.branch),legacyHash=legacy.errors.length?'':digest(JSON.stringify({data:legacy.data,fileIds:selected,consent:true}));
   const clientPreviousValues=Object.fromEntries(managed.flatMap(k=>{const raw=b.data?.[k];if(!raw)return [];const old=normalizeIntakeData({[k]:raw},r.branch);return !old.errors.length&&old.data[k]&&old.data[k]!==n.data[k]?[[k,old.data[k]]]:[];}));
   const payload={data:n.data,fileIds:selected,consent:true,receivedAt:NOW(),missing:n.missing,clientRequestHash,pasProvidedFields:managed.filter(k=>n.data[k]),clientPreviousValues},hash=digest(JSON.stringify({data:n.data,fileIds:selected,consent:true}));
   if(r.token_used_at){if(r.response_hash===hash||r.response_hash===legacyHash||prior?.clientRequestHash===clientRequestHash)return json({receipt:receipt(r),reused:true});fail(409,'FORM_USED','La respuesta ya fue enviada. Los cambios posteriores los revisa tu productor.');}
   const responseId=opaque(24),cipher=await seal(env,payload,'response:'+isAAD(r));
   const result=await run(env,"UPDATE work_emission_cases SET response_payload=?,response_id=?,response_hash=?,token_used_at=?,status='received',version=version+1,updated_at=? WHERE id=? AND token_hash=? AND token_used_at IS NULL AND token_revoked_at IS NULL AND token_expires_at>? AND NOT EXISTS(SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=work_emission_cases.tenant_id AND ra.record_type='emission' AND ra.record_id=work_emission_cases.id AND ra.state='archived')",cipher,responseId,hash,NOW(),NOW(),r.id,digest(b.token),NOW());
   if(result.meta.changes!==1){const latest=await publicCase(b);if(latest.response_hash===hash)return json({receipt:receipt(latest),reused:true});fail(409,'FORM_USED','El formulario cambió. Consultá al productor.');}
   await audit(env,{id:r.owner_id,tenant_id:r.tenant_id},'form.response_received',r.id);return json({receipt:receipt({...r,response_id:responseId})},201);
  }
  fail(404,'NOT_FOUND','No encontramos esa operación.');
 }
 if(parts[0]==='notifications'){
  const requested=url.searchParams.get('owner')||'';if(requested.length>100)fail(400,'OWNER','Revisá la cartera seleccionada.');if(u.role!=='superadmin'&&requested&&requested!==u.id)fail(403,'OWNER','Sólo podés ver avisos de tu cartera.');if(u.role==='superadmin'&&requested&&!await first(env,'SELECT id FROM pilot_users WHERE id=? AND tenant_id=?',requested,u.tenant_id))fail(404,'OWNER','No encontramos esa cartera.');
  const selected=u.role==='superadmin'?requested:u.id,scope="c.tenant_id=?"+(selected?' AND c.owner_id=?':'')+' AND '+archiveActiveSQL('emission','c'),args=[u.tenant_id,...(selected?[selected]:[])];
  if(req.method==='GET'&&parts.length===1){
   const count=await first(env,"SELECT count(*) AS n FROM work_emission_cases c LEFT JOIN work_emission_reads v ON v.case_id=c.id AND v.response_id=c.response_id AND v.viewer_id=? WHERE "+scope+" AND c.response_id IS NOT NULL AND c.status='received' AND v.read_at IS NULL",u.id,...args);
   const rows=await all(env,"SELECT c.*,v.read_at,o.name AS owner_name FROM work_emission_cases c LEFT JOIN work_emission_reads v ON v.case_id=c.id AND v.response_id=c.response_id AND v.viewer_id=? LEFT JOIN pilot_users o ON o.id=c.owner_id AND o.tenant_id=c.tenant_id WHERE "+scope+" AND c.response_id IS NOT NULL ORDER BY CASE WHEN c.status='received' AND v.read_at IS NULL THEN 0 ELSE 1 END,c.token_used_at DESC LIMIT 30",u.id,...args);
   const items=await Promise.all(rows.map(async row=>{const response=await unseal(env,row.response_payload,'response:'+isAAD(row));return {caseId:row.id,responseId:row.response_id,clientId:row.client_id,ownerId:row.owner_id,ownerName:row.owner_name||'Cuenta',name:response.data?.holder_name||'Un cliente',branch:row.branch,receivedAt:row.token_used_at,unread:row.status==='received'&&!row.read_at};}));return json({items,unread:count.n});
  }
  if(req.method==='POST'&&parts.length===3&&parts[2]==='read'){
   if(!IS_ID.test(parts[1]))fail(404,'NOT_FOUND','No encontramos esa notificación.');const row=await first(env,'SELECT c.id FROM work_emission_cases c WHERE '+scope+' AND c.response_id=?',...args,parts[1]);if(!row)fail(404,'NOT_FOUND','No encontramos esa notificación.');await body(req);await run(env,'INSERT OR IGNORE INTO work_emission_reads(case_id,response_id,viewer_id,tenant_id,read_at) VALUES(?,?,?,?,?)',row.id,parts[1],u.id,u.tenant_id,NOW());return json({ok:true});
  }
  fail(404,'NOT_FOUND','No encontramos esa operación.');
 }
 if(parts.length===0&&req.method==='GET'){
  const rows=await all(env,'SELECT * FROM work_emission_cases WHERE tenant_id=?'+(u.role==='superadmin'?'':' AND owner_id=?')+' AND '+archiveActiveSQL('emission','work_emission_cases')+' ORDER BY updated_at DESC LIMIT 500',u.tenant_id,...(u.role==='superadmin'?[]:[u.id]));
  return json({cases:await Promise.all(rows.map(async r=>{const p=await decode(r);return {id:r.id,owner_id:r.owner_id,client_id:r.client_id,branch:r.branch,company_id:r.company_id,status:r.status,version:r.version,updated_at:r.updated_at,title:p.title,holder:p.data?.holder_name||'',responseReceived:!!r.response_id};})),schema:IS_SCHEMA,apiAvailable:false,secureCardCaptureAvailable:false});
 }
 const r=parts[0]?await get(parts[0]):null;
 if(req.method==='GET'&&r){
  if(parts[1]==='file'){
   const f=await first(env,"SELECT * FROM work_emission_files WHERE id=? AND case_id=? AND state='ready'",parts[2],r.id);if(!f)fail(404,'FILE','No encontramos el archivo.');
   const obj=await env.BUCKET?.get(f.object_key);if(!obj)fail(503,'FILE','No pudimos recuperar el original.');let bytes;try{bytes=await unsealFile(env,await obj.arrayBuffer(),isFileAAD(f));const p=await unseal(env,f.payload,'meta:'+isFileAAD(f));if(bytes.length!==f.bytes||digest(bytes)!==p.sha256)throw Error('integrity');}catch{fail(503,'FILE','No pudimos verificar el archivo.');}
   await audit(env,u,'form.file_downloaded',f.id);return new Response(bytes,{headers:{'Content-Type':f.mime,'Content-Disposition':'attachment; filename="Documento-Turi"','Cache-Control':'no-store'}});
  }
  const entries=await all(env,'SELECT * FROM work_collection_entries WHERE case_id=? ORDER BY created_at DESC',r.id),collections=await Promise.all(entries.map(async e=>({id:e.id,version:e.version,status:e.status,...await unseal(env,e.payload,'collection:'+r.tenant_id+':'+r.owner_id+':'+e.id)})));
  const history=await all(env,'SELECT version,created_at FROM work_emission_history WHERE case_id=? ORDER BY version DESC',r.id);return json({record:await full(r),collections,history,schema:IS_SCHEMA});
 }
 if(req.method!=='POST')fail(405,'METHOD','Operación no disponible.');await rate(env,'emission-write:'+u.id,100,3600000);const b=await body(req,65536);
 if(!r){
  const branch=['Autos','Hogar','Otros'].includes(b.branch)?b.branch:'Autos',owner=u.role==='superadmin'?(b.ownerId||u.id):u.id;if(b.ownerId&&u.role!=='superadmin'&&b.ownerId!==u.id)fail(403,'OWNER','Elegí tu propia cuenta.');
  if(!await first(env,'SELECT id FROM pilot_users WHERE id=? AND tenant_id=? AND disabled=0',owner,u.tenant_id))fail(404,'OWNER','Cuenta no disponible.');
  let acceptedOffer=null;if(b.quoteId){const q=await first(env,"SELECT * FROM work_quotes WHERE id=? AND tenant_id=? AND owner_id=? AND status='approved'",b.quoteId,u.tenant_id,owner);if(!q)fail(404,'QUOTE','Elegí una solicitud aprobada de este productor.');if(['Autos','Hogar'].includes(q.branch)&&q.branch!==branch)fail(400,'BRANCH','El ramo debe coincidir con la propuesta aprobada.');const offer=await first(env,'SELECT * FROM work_offers WHERE id=? AND quote_id=? AND tenant_id=? AND owner_id=?',q.selected_offer_id,q.id,u.tenant_id,owner);if(!offer)fail(404,'OFFER','No encontramos la propuesta aprobada.');const op=await unseal(env,offer.payload,'work:'+u.tenant_id+':'+owner+':offers:'+offer.id);if(b.companyId&&b.companyId!==offer.company_id)fail(400,'COMPANY','La compañía debe coincidir con la propuesta aprobada.');b.companyId=offer.company_id;b.clientId=q.client_id;acceptedOffer={quoteId:q.id,offerId:offer.id,companyId:offer.company_id,sourceReference:op.sourceReference,premiumCents:op.premiumCents,currency:op.currency,period:op.period,coverage:op.coverage,deductible:op.deductible,validUntil:offer.valid_until,origin:'Propuesta registrada y revisada por el PAS'};}
  const client=b.clientId?await first(env,'SELECT * FROM work_clients WHERE id=? AND tenant_id=? AND owner_id=?',b.clientId,u.tenant_id,owner):null;if(b.clientId&&!client)fail(404,'CLIENT','El cliente no pertenece al titular.');if(client)await requireUnarchived(env,client,'clients',fail);
  if(b.companyId&&!companies.some(c=>c.id===b.companyId))fail(400,'COMPANY','Elegí una compañía del catálogo.');
  const id=opaque(16),shell={id,tenant_id:u.tenant_id,owner_id:owner},n=dataFor(b.data||{},branch),p={title:text(b.title)||'Solicitud de '+branch,data:n.data,proposal:text(b.proposal,3000),notes:text(b.notes,3000),...(acceptedOffer?{acceptedOffer}:{})},cipher=await seal(env,p,isAAD(shell)),stamp=NOW();
  const saved=await run(env,"INSERT INTO work_emission_cases(id,tenant_id,owner_id,client_id,company_id,branch,payload,status,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'draft',1,?,? WHERE (SELECT count(*) FROM work_emission_cases WHERE tenant_id=? AND owner_id=?)<1000",id,u.tenant_id,owner,client?.id||null,b.companyId||null,branch,cipher,stamp,stamp,u.tenant_id,owner);if(saved.meta.changes!==1)fail(409,'CAPACITY','Alcanzaste el límite de casos del piloto.');
  await run(env,'INSERT INTO work_emission_history(case_id,version,payload,created_at) VALUES(?,1,?,?)',id,cipher,stamp);await audit(env,u,'emission.created',id);return json({record:await full(await get(id))},201);
 }
 const p=await decode(r),action=parts[1]||'save';
 if(action==='share'){
  version(b.expectedVersion);if(p.acceptedOffer&&p.acceptedOffer.companyId!==r.company_id)fail(409,'QUOTE_COMPANY','La compañía del caso difiere de la propuesta aceptada. Revisá la propuesta antes de compartir.');if(r.response_id)fail(409,'RESPONSE_EXISTS','Este caso ya tiene una respuesta. Revisala o creá otra solicitud para pedir datos nuevos.');
  const token=opaque(),result=await run(env,"UPDATE work_emission_cases SET token_hash=?,token_expires_at=?,token_used_at=NULL,token_revoked_at=NULL,status='awaiting_client',version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=work_emission_cases.tenant_id AND ra.record_type='emission' AND ra.record_id=work_emission_cases.id AND ra.state='archived')",digest(token),NOW()+7*86400000,NOW(),r.id,b.expectedVersion);if(result.meta.changes!==1)fail(409,'VERSION','El caso cambió. Actualizalo.');
  await audit(env,u,'emission.link_created',r.id);return json({url:new URL(req.url).origin+'/formularios/emision/#case='+r.id+'&token='+token,expiresAt:NOW()+7*86400000,record:await full(await get(r.id))});
 }
 if(action==='revoke'){const result=await run(env,"UPDATE work_emission_cases SET token_revoked_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=work_emission_cases.tenant_id AND ra.record_type='emission' AND ra.record_id=work_emission_cases.id AND ra.state='archived')",NOW(),NOW(),r.id,version(b.expectedVersion));if(result.meta.changes!==1)fail(409,'VERSION','El caso cambió.');await audit(env,u,'emission.link_revoked',r.id);return json({record:await full(await get(r.id))});}
 if(action==='dispatch'){
  if(!r.company_id)fail(409,'COMPANY_REQUIRED','Elegí la compañía prevista para revisar el acceso.');
  const code=await first(env,'SELECT id FROM pilot_connections WHERE tenant_id=? AND producer_id=? AND company_id=? AND authorized=1',r.tenant_id,r.owner_id,r.company_id);
  if(!code)fail(409,'PAS_CODE_REQUIRED','Falta registrar el código PAS de esta compañía en Compañías. No se envió ni emitió una póliza.');
  fail(409,'API_ACCESS_REQUIRED','El código PAS está resguardado, pero esta compañía aún requiere credenciales API y validación del conector. El caso permanece en Turi; no se envió ni emitió una póliza.');
 }
 if(action==='collection'){
  const allowed=['pending','reported_paid','insurer_confirmed','rejected'];if(!allowed.includes(b.status)||!Number.isSafeInteger(b.amountCents)||b.amountCents<=0||b.amountCents>1000000000000||!['ARS','USD'].includes(b.currency))fail(400,'PAYMENT','Revisá el estado, importe y moneda.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!Number.isFinite(Date.parse(b.date+'T12:00:00Z'))||new Date(b.date+'T12:00:00Z').toISOString().slice(0,10)!==b.date)fail(400,'DATE','Revisá la fecha del movimiento.');
  if(['reported_paid','insurer_confirmed','rejected'].includes(b.status)&&!text(b.reference,300))fail(400,'REFERENCE','Agregá la referencia o evidencia del movimiento.');
  if(!['insurer','pas','other'].includes(b.collector))fail(400,'COLLECTOR','Indicá quién recibe el pago.');const id=opaque(16),payload={amountCents:b.amountCents,currency:b.currency,date:b.date,collector:b.collector,reference:text(b.reference,300),notes:text(b.notes,1500),source:'Registro manual del PAS; sin transacción de fondos'},cipher=await seal(env,payload,'collection:'+r.tenant_id+':'+r.owner_id+':'+id);
  await run(env,'INSERT INTO work_collection_entries(id,case_id,tenant_id,owner_id,payload,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',id,r.id,r.tenant_id,r.owner_id,cipher,b.status,NOW(),NOW());await audit(env,u,'collection.recorded',id);return json({ok:true},201);
 }
 if(action==='restore'){const old=await first(env,'SELECT payload FROM work_emission_history WHERE case_id=? AND version=?',r.id,version(b.restoreVersion));if(!old)fail(404,'VERSION','No encontramos esa versión.');const previous=await unseal(env,old.payload,isAAD(r));b.data=previous.data;b.title=previous.title;b.notes=previous.notes;b.proposal=previous.proposal;}
 if(['save','restore','incorporate'].includes(action)){
  if(b.companyId&&!companies.some(c=>c.id===b.companyId))fail(400,'COMPANY','Elegí una compañía del catálogo.');const companyId=b.companyId===undefined?r.company_id:(b.companyId||null);
  const n=dataFor(b.data||p.data||{},r.branch),payload={...p,title:text(b.title)||p.title,data:n.data,proposal:b.proposal===undefined?p.proposal:text(b.proposal,3000),notes:b.notes===undefined?p.notes:text(b.notes,3000)},claim=opaque(24),stamp=NOW(),expected=version(b.expectedVersion),cipher=await seal(env,payload,isAAD(r));
  if(action==='incorporate'){
   if(b.reviewed!==true)fail(400,'REVIEW','Confirmá que revisaste los datos, los archivos y el cliente.');
   if(!n.data.holder_name)fail(400,'NAME','Ingresá el nombre o razón social del tomador antes de incorporar.');
   const target=b.clientId||r.client_id||null,client=target?await first(env,'SELECT * FROM work_clients WHERE id=? AND tenant_id=? AND owner_id=?',target,r.tenant_id,r.owner_id):null;if(target&&!client)fail(404,'CLIENT','El cliente no pertenece a este productor.');if(client)await requireUnarchived(env,client,'clients',fail);
   if(r.client_id&&target!==r.client_id)fail(400,'CLIENT','El caso ya está vinculado a otro cliente.');
   const old=client?await unseal(env,client.payload,'work:'+r.tenant_id+':'+r.owner_id+':clients:'+client.id):{},clientId=client?.id||opaque(16),identity={...(old.identity||{}),...Object.fromEntries(Object.entries(n.data).filter(([k,v])=>k.startsWith('holder_')&&v!==''))},cp={...old,name:n.data.holder_name,email:n.data.holder_email||old.email||'',phone:n.data.holder_phone||old.phone||'',source:old.source||'Formulario Turi revisado por PAS',notes:old.notes||'',marketingConsent:old.marketingConsent||false,identity},clientCipher=await seal(env,cp,'work:'+r.tenant_id+':'+r.owner_id+':clients:'+clientId);
   const response=r.response_payload?await unseal(env,r.response_payload,'response:'+isAAD(r)):null,ids=response?.fileIds||[],staged=(await all(env,"SELECT * FROM work_emission_files WHERE case_id=? AND state='ready' AND imported=0",r.id)).filter(f=>ids.includes(f.id)),count=staged.length,bytes=staged.reduce((n,f)=>n+f.bytes,0),gate='EXISTS(SELECT 1 FROM work_emission_cases WHERE id=? AND claim_token=?)';
   const result=await env.DB.batch([
    stmt(env,"UPDATE work_emission_cases SET payload=?,status='reviewed',claim_token=?,token_revoked_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=work_emission_cases.tenant_id AND ra.record_type='emission' AND ra.record_id=work_emission_cases.id AND ra.state='archived') AND "+documentUsageSQL('files')+"<=1000 AND "+documentUsageSQL('bytes')+"<=1073741824"+(client?' AND EXISTS(SELECT 1 FROM work_clients WHERE id=? AND version=?)':''),cipher,claim,stamp,stamp,r.id,expected,...documentUsageArgs(r.tenant_id,r.owner_id,stamp),...documentUsageArgs(r.tenant_id,r.owner_id,stamp),...(client?[client.id,version(b.expectedClientVersion)]:[])),
    client?stmt(env,'UPDATE work_clients SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=? AND '+gate,clientCipher,stamp,client.id,b.expectedClientVersion,r.id,claim):stmt(env,'INSERT INTO work_clients(id,tenant_id,owner_id,payload,version,created_at,updated_at,archived) SELECT ?,?,?,?,1,?,?,0 WHERE '+gate,clientId,r.tenant_id,r.owner_id,clientCipher,stamp,stamp,r.id,claim),
    stmt(env,'UPDATE work_emission_cases SET client_id=? WHERE id=? AND claim_token=?',clientId,r.id,claim),
    ...staged.flatMap(f=>[stmt(env,"INSERT OR IGNORE INTO work_documents(id,tenant_id,owner_id,payload,version,created_at,updated_at,client_id,upload_id,object_key,mime,bytes,state,archived,lease_token,lease_expires_at) SELECT ?,?,?,?,1,?,?,?,?,?,?,?,'ready',0,?,0 WHERE "+gate,f.id,r.tenant_id,r.owner_id,f.payload,stamp,stamp,clientId,'case-'+r.id+'-'+f.id,f.object_key,f.mime,f.bytes,opaque(24),r.id,claim),stmt(env,'UPDATE work_emission_files SET imported=1 WHERE id=? AND EXISTS(SELECT 1 FROM work_documents WHERE id=? AND client_id=?) AND '+gate,f.id,f.id,clientId,r.id,claim)]),
    stmt(env,'INSERT OR IGNORE INTO work_emission_history(case_id,version,payload,created_at) SELECT id,version,payload,updated_at FROM work_emission_cases WHERE id=? AND claim_token=?',r.id,claim)
   ]);
   if(result[0].meta.changes!==1||result[1].meta.changes!==1)fail(409,'VERSION','El caso o cliente cambió, o falta espacio documental. Actualizá antes de incorporar.');
   await audit(env,u,'emission.incorporated',r.id);return json({record:await full(await get(r.id)),clientId,filesImported:count,emitted:false,paymentExecuted:false});
  }
  const linkedId=b.clientId||r.client_id||null;if(r.client_id&&linkedId!==r.client_id)fail(400,'CLIENT','El caso ya está vinculado a otro cliente.');if(linkedId&&!await first(env,'SELECT id FROM work_clients WHERE id=? AND tenant_id=? AND owner_id=?',linkedId,r.tenant_id,r.owner_id))fail(404,'CLIENT','El cliente no pertenece a este productor.');
  const result=await env.DB.batch([stmt(env,"UPDATE work_emission_cases SET payload=?,company_id=?,client_id=?,token_revoked_at=CASE WHEN token_used_at IS NULL THEN ? ELSE token_revoked_at END,claim_token=?,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM work_record_archives ra WHERE ra.tenant_id=work_emission_cases.tenant_id AND ra.record_type='emission' AND ra.record_id=work_emission_cases.id AND ra.state='archived')",cipher,companyId,linkedId,stamp,claim,stamp,r.id,expected),stmt(env,'INSERT OR IGNORE INTO work_emission_history(case_id,version,payload,created_at) SELECT id,version,payload,updated_at FROM work_emission_cases WHERE id=? AND claim_token=?',r.id,claim)]);
  if(result[0].meta.changes!==1)fail(409,'VERSION','El caso cambió en otra pantalla. Actualizá antes de guardar.');await audit(env,u,action==='restore'?'emission.version_restored':'emission.updated',r.id);return json({record:await full(await get(r.id))});
 }
 fail(404,'NOT_FOUND','No encontramos esa operación.');
 async function uploadPublic(){
  if(!env.BUCKET)fail(503,'FILES','Los archivos no están habilitados.');const reader=req.body?.getReader();if(!reader)fail(400,'FILE','Seleccioná un archivo.');let carry=new Uint8Array(0);
  async function prefix(n){const out=new Uint8Array(n);let i=0;while(i<n){if(!carry.length){const c=await reader.read();if(c.done)fail(400,'FILE','Carga incompleta.');carry=c.value;}const len=Math.min(carry.length,n-i);out.set(carry.subarray(0,len),i);carry=carry.subarray(len);i+=len;}return out;}
  const f=await prefix(4),size=new DataView(f.buffer,f.byteOffset,4).getUint32(0,false);if(size<2||size>8192)fail(400,'FILE','Revisá los datos del archivo.');let b;try{b=JSON.parse(new TextDecoder().decode(await prefix(size)))}catch{fail(400,'FILE','Revisá los datos del archivo.');}const r=await publicCase(b);if(r.token_used_at)fail(409,'FORM_USED','El formulario ya fue enviado.');
  if(!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>IS_MAX_FILE||!/^[a-f0-9]{64}$/.test(b.sha256||'')||!/^[a-f0-9-]{36}$/.test(b.uploadId||'')||typeof b.filename!=='string'||!b.filename.trim()||b.filename.length>180||!Object.hasOwn(IS_SCHEMA.photoTypes,b.photoType))fail(400,'FILE','Usá un archivo de hasta 10 MB y elegí su tipo.');
  if(b.photoLabel!==undefined&&(typeof b.photoLabel!=='string'||b.photoLabel.length>120))fail(400,'FILE_LABEL','La descripción adicional admite hasta 120 caracteres.');const photoLabel=(b.photoLabel||'').replace(/[\u0000-\u001f\u007f]/g,'').trim();
  const name=b.filename.replace(/[\u0000-\u001f/\\]/g,'_'),fingerprint=digest(JSON.stringify({name,bytes:b.bytes,sha256:b.sha256,photoType:b.photoType,...(photoLabel?{photoLabel}:{})})),old=await first(env,'SELECT * FROM work_emission_files WHERE case_id=? AND upload_id=?',r.id,b.uploadId);
  if(old&&old.fingerprint!==fingerprint)fail(409,'UPLOAD_CHANGED','La selección cambió. Volvé a elegir el archivo.');if(old?.state==='ready')return json({id:old.id,reused:true});if(old?.state==='uploading'&&old.lease_expires_at>NOW())fail(409,'BUSY','La carga sigue en curso.');
  const id=old?.id||opaque(16),key='private-documents/'+opaque(),lease=opaque(24),shell={id,tenant_id:r.tenant_id,owner_id:r.owner_id},stamp=NOW(),quota="(SELECT count(*) FROM work_emission_files WHERE case_id=? AND id<>? AND (state='ready' OR (state='uploading' AND lease_expires_at>?)))<20 AND (SELECT count(*) FROM work_emission_files WHERE state='uploading' AND lease_expires_at>?)<1 AND "+documentUsageSQL('files',true)+'<1000 AND '+documentUsageSQL('bytes',true)+'+?<=1073741824',q=[r.id,id,stamp,stamp,...documentUsageArgs(r.tenant_id,r.owner_id,stamp,id),...documentUsageArgs(r.tenant_id,r.owner_id,stamp,id),b.bytes];
  const meta={filename:name,title:(photoLabel||IS_SCHEMA.photoTypes[b.photoType])+' · '+name,category:b.photoType.startsWith('registration')?'identity':r.branch==='Autos'?'vehicle':'other',notes:'Formulario de cliente · revisión del PAS pendiente',sha256:b.sha256,photoType:b.photoType,photoLabel,fingerprint},cipherMeta=await seal(env,meta,'meta:'+isFileAAD(shell));
  const saved=old?await run(env,"UPDATE work_emission_files SET object_key=?,payload=?,state='uploading',lease_token=?,lease_expires_at=? WHERE id=? AND state<>'ready' AND lease_expires_at<=? AND "+quota,key,cipherMeta,lease,stamp+900000,id,stamp,...q):await run(env,"INSERT OR IGNORE INTO work_emission_files(id,case_id,tenant_id,owner_id,upload_id,object_key,payload,mime,bytes,fingerprint,state,lease_token,lease_expires_at,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,'uploading',?,?,? WHERE "+quota,id,r.id,r.tenant_id,r.owner_id,b.uploadId,key,cipherMeta,'pending',b.bytes,fingerprint,lease,stamp+900000,stamp,...q);
  if(saved.meta.changes!==1)fail(409,'QUOTA_OR_BUSY','Ya hay una carga en curso o se alcanzó el límite. Reintentá con los mismos archivos.');
  try{
   const bytes=new Uint8Array(b.bytes);let offset=0;if(carry.length>b.bytes)fail(413,'FILE','El archivo supera su tamaño.');bytes.set(carry);offset=carry.length;while(true){const c=await reader.read();if(c.done)break;if(offset+c.value.length>b.bytes){await reader.cancel();fail(413,'FILE','El archivo supera su tamaño.');}bytes.set(c.value,offset);offset+=c.value.length;}
   const mime=documentType(bytes),ext=name.split('.').pop().toLowerCase(),types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};if(offset!==b.bytes||digest(bytes)!==b.sha256||!mime||!(mime===types[ext]||['image/heic','image/heif'].includes(mime)&&['heic','heif'].includes(ext)))fail(415,'FILE','El contenido no coincide con el PDF o la foto seleccionada.');
   await publicCase(b);const savedObject=await env.BUCKET.put(key,await sealFile(env,bytes,isFileAAD(shell)),{httpMetadata:{contentType:'application/octet-stream',cacheControl:'no-store'}});if(!savedObject)fail(503,'FILE','No pudimos confirmar el guardado del original.');
   const complete=await run(env,"UPDATE work_emission_files SET mime=?,state='ready' WHERE id=? AND lease_token=? AND state='uploading' AND lease_expires_at>? AND EXISTS(SELECT 1 FROM work_emission_cases WHERE id=? AND token_hash=? AND token_used_at IS NULL AND token_revoked_at IS NULL AND token_expires_at>?)",mime,id,lease,NOW(),r.id,digest(b.token),NOW());if(complete.meta.changes!==1)fail(409,'FORM_CHANGED','El formulario cambió durante la carga.');return json({id,reused:false},201);
  }catch(e){const latest=await first(env,'SELECT * FROM work_emission_files WHERE id=?',id);if(latest?.state==='ready'&&latest.object_key===key&&latest.lease_token===lease)return json({id,reused:true});try{await env.BUCKET.delete(key)}catch{}await run(env,"UPDATE work_emission_files SET state='failed',lease_expires_at=0 WHERE id=? AND lease_token=? AND state='uploading'",id,lease);if(e.status)throw e;fail(503,'FILE','No pudimos guardar el archivo. Reintentá con la misma selección.');}
 }
}
