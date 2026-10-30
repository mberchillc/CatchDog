import { opaque,seal,unseal,NOW } from './security.js';
import { emissionApi } from './emission.js';
import { multiquoteApi,mqIntakeView } from './multiquote.js';

// All tables/columns below are code-owned allowlists; input is always bound.
const WORK_TYPES={clients:'work_clients',policies:'work_policies',claims:'work_claims',tasks:'work_tasks',quotes:'work_quotes',offers:'work_offers'};
const WORK_COVERAGE_GROUPS=['unclassified','liability','third_party','third_party_full','comprehensive','fire_theft','other'];
const WORK_BRANCHES=['Autos','Motos','Hogar','Comercio','Caución','Accidentes personales','Responsabilidad civil','Vida','Salud','ART','Transporte','Otros'];
export async function workspaceApi(req,env,u,companies,helpers){
 const {json,fail,stmt,first,all,run,audit,body,rate}=helpers;
 const url=new URL(req.url),path=url.pathname.slice('/api/pilot/work'.length),admin=u.role==='superadmin';
 if(path==='/emission'||path.startsWith('/emission/'))return emissionApi(req,env,u,companies,helpers);
 if(path.startsWith('/multiquote/'))return multiquoteApi(req,env,u,path,helpers);
 const text=(v,max,required=false)=>{if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||(!v.trim()&&required))fail(400,'FIELD','Revisá los campos obligatorios y su extensión.');return v.trim()};
 const choice=(v,values)=>{if(!values.includes(v))fail(400,'FIELD','Elegí una opción válida.');return v};
 const day=(v,required=true)=>{if(!v&&!required)return null;const s=text(v,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s||s<'1900-01-01'||s>'2100-12-31')fail(400,'DATE','Revisá la fecha.');return s};
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
 const amount=v=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>1000000000000)fail(400,'AMOUNT','Revisá el importe.');return v};
 const company=v=>choice(v,companies.map(c=>c.id));
 const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(409,'VERSION','Actualizá el registro antes de guardar.');return v};
 const guard=row=>{if(!row||row.tenant_id!==u.tenant_id||(!admin&&row.owner_id!==u.id))fail(404,'NOT_FOUND','No encontramos ese registro.');return row};
 async function get(type,id,owner){const row=guard(await first(env,'SELECT * FROM '+WORK_TYPES[type]+' WHERE id=? AND tenant_id=?',text(id,100,true),u.tenant_id));if(owner&&row.owner_id!==owner)fail(400,'RELATION','Los registros deben pertenecer al mismo productor.');return row}
 async function ownerFor(b,existing){if(existing){if(b.ownerId&&b.ownerId!==existing.owner_id)fail(400,'OWNER','No se puede cambiar la atribución del registro.');return existing.owner_id}const id=admin?(b.ownerId||u.id):u.id;if(!admin&&b.ownerId&&b.ownerId!==u.id)fail(403,'OWNER','Sólo podés operar tu propia cartera.');const target=await first(env,'SELECT id FROM pilot_users WHERE id=? AND tenant_id=? AND disabled=0',text(id,100,true),u.tenant_id);if(!target)fail(400,'OWNER','Elegí una cuenta activa de tu organización.');return target.id}
 async function view(type,row){const {payload,...publicFields}=row;return {...publicFields,...await unseal(env,payload,`work:${u.tenant_id}:${row.owner_id}:${type}:${row.id}`)}}
 async function save(type,b,existing,fields,payload,owner){
  const table=WORK_TYPES[type],id=existing?.id||opaque(16),stamp=NOW();
  const encrypted=await seal(env,payload,`work:${u.tenant_id}:${owner}:${type}:${id}`);
  // A proposal cannot change after its request has been closed, including racing requests.
  const quoteGate=type==='offers'?' AND EXISTS (SELECT 1 FROM work_quotes WHERE id=? AND tenant_id=? AND owner_id=? AND status NOT IN (?,?))':'';
  const quoteArgs=type==='offers'?[fields.quote_id,u.tenant_id,owner,'approved','rejected']:[];
  const closedGate=type==='quotes'?" AND status NOT IN ('approved','rejected')":'';
  if(existing){const expected=version(b.expectedVersion),keys=Object.keys(fields);const r=await run(env,'UPDATE '+table+' SET '+[...keys.map(k=>k+'=?'),'payload=?','version=version+1','updated_at=?'].join(',')+' WHERE id=? AND tenant_id=? AND owner_id=? AND version=?'+quoteGate+closedGate,...Object.values(fields),encrypted,stamp,id,u.tenant_id,owner,expected,...quoteArgs);if(r.meta.changes!==1)fail(409,'VERSION','Este registro cambió. Actualizalo antes de guardar.');}
  else{const keys=['id','tenant_id','owner_id','payload','version','created_at','updated_at',...Object.keys(fields)],values=[id,u.tenant_id,owner,encrypted,1,stamp,stamp,...Object.values(fields)];const r=await run(env,'INSERT INTO '+table+' ('+keys.join(',')+') SELECT '+keys.map(()=>'?').join(',')+' WHERE (SELECT count(*) FROM '+table+' WHERE tenant_id=?)<500'+quoteGate,...values,u.tenant_id,...quoteArgs);if(r.meta.changes!==1)fail(409,'CAPACITY','La solicitud se cerró o alcanzaste el límite del piloto. Actualizá para continuar.');}
  await audit(env,u,`work.${type}.${existing?'updated':'created'}`,id);return json({record:await view(type,await get(type,id))},existing?200:201);
 }
 if(path==='/overview'&&req.method==='GET'){
  const requested=url.searchParams.get('owner')||'';
  if(requested&&!admin&&requested!==u.id)fail(403,'OWNER','Sólo podés consultar tu propia cartera.');
  const filter=admin?(requested?' AND owner_id=?':''):' AND owner_id=?',args=[u.tenant_id,...(admin?(requested?[requested]:[]):[u.id])];
  const entries=await Promise.all(Object.entries(WORK_TYPES).map(async([type,table])=>{const rows=await all(env,'SELECT * FROM '+table+' WHERE tenant_id=?'+filter+' ORDER BY updated_at DESC LIMIT 500',...args);return [type,await Promise.all(rows.map(row=>view(type,row)))]}));
  const data=Object.fromEntries(entries);
  const intakes=await all(env,'SELECT * FROM work_quote_intakes WHERE tenant_id=?'+filter+' ORDER BY updated_at DESC LIMIT 500',...args);data.quoteIntakes=await Promise.all(intakes.map(row=>mqIntakeView(env,row)));
  const owners=admin?await all(env,'SELECT id,name,username,role,(access_code_hash IS NOT NULL) AS code_configured,disabled FROM pilot_users WHERE tenant_id=? ORDER BY name',u.tenant_id):[{id:u.id,name:u.name,username:u.username,role:u.role,code_configured:1,disabled:0}];
  return json({...data,owners,today:today(),automaticQuotes:false,source:'private_database'});
 }
 if(path==='/integrations'&&req.method==='GET'){
  const rows=await all(env,'SELECT c.id,c.producer_id,c.company_id,c.version AS code_version,c.updated_at AS code_updated_at,r.connection_version,r.permission,r.channel,r.technical,r.payload,r.version,r.updated_at FROM pilot_connections c LEFT JOIN work_integration_reviews r ON r.connection_id=c.id WHERE c.tenant_id=?'+(admin?'':' AND c.producer_id=?')+' ORDER BY c.created_at',u.tenant_id,...(admin?[]:[u.id]));
  const reviews=await Promise.all(rows.map(async row=>{const {payload,...meta}=row;return {...meta,...(payload?await unseal(env,payload,'integration:'+u.tenant_id+':'+row.id):{notes:'',documentation:''}),stale:row.connection_version!==row.code_version,automaticQuotes:false}}));return json({integrations:reviews});
 }
 if(req.method!=='POST')fail(404,'NOT_FOUND','La operación no está disponible.');
 await rate(env,'work-write:'+u.id,120);
 const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'FIELD','Revisá el formulario.');
 if(path.startsWith('/integrations/')){
  const id=path.split('/')[2];const c=await first(env,'SELECT id,producer_id,version FROM pilot_connections WHERE id=? AND tenant_id=?'+(admin?'':' AND producer_id=?'),id,u.tenant_id,...(admin?[]:[u.id]));if(!c)fail(404,'NOT_FOUND','No encontramos esa compañía.');
  if(b.codeVersion!==c.version)fail(409,'VERSION','El código cambió. Actualizá el relevamiento.');
  const permission=choice(b.permission,['pending','confirmed','blocked']),channel=choice(b.channel,['assisted','api_requested']),technical=choice(b.technical,['pending','documentation','testing']);
  const documentation=text(b.documentation,1500);if(documentation){let link;try{link=new URL(documentation)}catch{fail(400,'URL','Usá un enlace HTTPS a la documentación.')}if(link.protocol!=='https:'||link.username||link.password)fail(400,'URL','Usá un enlace HTTPS sin credenciales.');}
  const payload=await seal(env,{documentation,notes:text(b.notes,3000)},'integration:'+u.tenant_id+':'+c.id);
  const existing=await first(env,'SELECT version FROM work_integration_reviews WHERE connection_id=? AND tenant_id=?',c.id,u.tenant_id);
  if(existing){const expected=version(b.expectedVersion);const r=await run(env,'UPDATE work_integration_reviews SET connection_version=?,permission=?,channel=?,technical=?,payload=?,version=version+1,updated_at=? WHERE connection_id=? AND tenant_id=? AND version=?',c.version,permission,channel,technical,payload,NOW(),c.id,u.tenant_id,expected);if(r.meta.changes!==1)fail(409,'VERSION','El relevamiento cambió. Actualizá para continuar.');}
  else{await run(env,'INSERT INTO work_integration_reviews (connection_id,tenant_id,producer_id,connection_version,permission,channel,technical,payload,version,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?)',c.id,u.tenant_id,c.producer_id,c.version,permission,channel,technical,payload,NOW());}
  await audit(env,u,'work.integration.reviewed',c.id);return json({ok:true,automaticQuotes:false});
 }
 const parts=path.split('/').filter(Boolean),type=parts[0];if(!Object.hasOwn(WORK_TYPES,type)||parts.length>3)fail(404,'NOT_FOUND','La operación no está disponible.');
 const existing=parts[1]?await get(type,parts[1]):null,owner=await ownerFor(b,existing);
 if(type==='quotes'&&parts[2]==='approve'){
  if(u.role!=='producer'||owner!==u.id)fail(403,'PAS_APPROVAL','La aprobación corresponde al productor titular.');
  if(existing.status==='approved'||existing.status==='rejected')fail(409,'QUOTE_CLOSED','La solicitud ya está cerrada.');
  const offer=await get('offers',b.offerId,owner);if(offer.quote_id!==existing.id||offer.valid_until<today())fail(400,'OFFER','Elegí una propuesta vigente de esta solicitud.');
  const client=await view('clients',await get('clients',existing.client_id,owner));if(client.archived||(!client.phone&&!client.email))fail(400,'CONTACT','Revisá que el cliente esté activo y tenga un teléfono o correo antes de aprobar.');
  if(b.confirmed!==true)fail(400,'APPROVAL','Confirmá que revisaste los datos y condiciones.');
  const changed=await run(env,'UPDATE work_quotes SET status=?,selected_offer_id=?,approved_by=?,approved_at=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND owner_id=? AND version=? AND status NOT IN (?,?) AND EXISTS (SELECT 1 FROM work_offers WHERE id=? AND quote_id=? AND tenant_id=? AND owner_id=? AND version=? AND valid_until>=?)','approved',offer.id,u.id,NOW(),NOW(),existing.id,u.tenant_id,owner,version(b.expectedVersion),'approved','rejected',offer.id,existing.id,u.tenant_id,owner,version(b.offerVersion),today());if(changed.meta.changes!==1)fail(409,'VERSION','La solicitud o la propuesta cambió. Actualizá antes de aprobar.');await audit(env,u,'work.quotes.approved_for_processing',existing.id);return json({ok:true,message:'Revisión registrada. La emisión debe completarse y confirmarse en la compañía; este registro no otorga cobertura.'});
 }
 if(parts[2])fail(404,'NOT_FOUND','La operación no está disponible.');
 if(type==='clients'){
  const email=text(b.email,320);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'EMAIL','Revisá el correo del cliente.');const phone=text(b.phone,40);if(phone&&(!/^[+\d\s().-]{6,40}$/.test(phone)||!/^\d{6,15}$/.test(phone.replace(/\D/g,''))))fail(400,'PHONE','Revisá el teléfono e incluí país y área.');
  const prior=existing?await view('clients',existing):{};return save(type,b,existing,{archived:b.archived===true?1:0},{...(prior.identity?{identity:prior.identity}:{}),name:text(b.name,160,true),email,phone,notes:text(b.notes,3000),marketingConsent:b.marketingConsent===true,source:text(b.source,100)||'Carga manual'},owner);
 }
 if(type==='policies'){
  await get('clients',b.clientId,owner);const starts=day(b.startsOn),expires=day(b.expiresOn);if(expires<starts)fail(400,'DATE','El vencimiento debe ser posterior al inicio.');
  return save(type,b,existing,{client_id:b.clientId,company_id:company(b.companyId),branch:choice(b.branch,WORK_BRANCHES),status:choice(b.status,['active','renewal','cancelled','expired']),starts_on:starts,expires_on:expires},{number:text(b.number,120,true),risk:text(b.risk,300,true),coverage:text(b.coverage,1200),premiumCents:amount(b.premiumCents),currency:choice(b.currency,['ARS','USD']),paymentStatus:choice(b.paymentStatus,['unknown','current','pending']),notes:text(b.notes,3000),source:'Carga manual · verificar en compañía'},owner);
 }
 if(type==='claims'){
  await get('policies',b.policyId,owner);const occurred=day(b.occurredOn);if(occurred>today())fail(400,'DATE','La fecha del hecho no puede ser futura.');
  return save(type,b,existing,{policy_id:b.policyId,status:choice(b.status,['reported','documents','insurer','resolved']),occurred_on:occurred,next_due:day(b.nextDue,false)},{reference:text(b.reference,120),title:text(b.title,200,true),nextAction:text(b.nextAction,600),notes:text(b.notes,3000)},owner);
 }
 if(type==='tasks'){
  if(b.clientId)await get('clients',b.clientId,owner);
  return save(type,b,existing,{client_id:b.clientId||null,category:choice(b.category,['renewals','updates','requotes','cancellations','claims','payments','accounting','marketing','other']),priority:choice(b.priority,['red','amber','green']),status:choice(b.status,['open','done']),due_on:day(b.dueOn)},{title:text(b.title,200,true),notes:text(b.notes,3000)},owner);
 }
 if(type==='quotes'){
  if(existing&&['approved','rejected'].includes(existing.status))fail(409,'QUOTE_CLOSED','La solicitud está cerrada. Creá una nueva para recotizar.');
  await get('clients',b.clientId,owner);const status=choice(b.status,['draft','requested','comparing','approval','rejected']);
  const prior=existing?await view('quotes',existing):{};const followup=b.companyFollowup===undefined?(prior.companyFollowup||[]):b.companyFollowup;if(!Array.isArray(followup)||followup.length>companies.length)fail(400,'FIELD','Revisá el seguimiento de compañías.');const seen=new Set();const companyFollowup=followup.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row))fail(400,'FIELD','Revisá el seguimiento de compañías.');const companyId=company(row.companyId);if(seen.has(companyId))fail(400,'FIELD','La compañía ya figura en el seguimiento.');seen.add(companyId);return {companyId,status:choice(row.status,['pending','error','no_offer']),note:text(row.note,600)};});return save(type,b,existing,{client_id:b.clientId,branch:choice(b.branch,WORK_BRANCHES),status},{risk:text(b.risk,400,true),notes:text(b.notes,3000),companyFollowup,source:'Solicitud interna · gestión asistida'},owner);
 }
 if(type==='offers'){
  const quote=await get('quotes',b.quoteId,owner);if(['approved','rejected'].includes(quote.status))fail(409,'QUOTE_CLOSED','La solicitud está cerrada.');if(existing&&existing.quote_id!==quote.id)fail(400,'RELATION','La propuesta no puede cambiar de solicitud.');
  const price=amount(b.premiumCents);if(price===0)fail(400,'AMOUNT','Ingresá el importe de la propuesta.');
  const reference=text(b.sourceReference,400,true),prior=existing?await view('offers',existing):{},coverageCategory=choice(b.coverageCategory===undefined?(prior.coverageCategory||'unclassified'):b.coverageCategory,WORK_COVERAGE_GROUPS),limits=text(b.limits===undefined?prior.limits:b.limits,1500);
  return save(type,b,existing,{quote_id:quote.id,company_id:company(b.companyId),valid_until:day(b.validUntil)},{premiumCents:price,currency:choice(b.currency,['ARS','USD']),period:choice(b.period,['monthly','annual','single']),coverageCategory,limits,coverage:text(b.coverage,1500,true),deductible:text(b.deductible,600,true),sourceReference:reference,notes:text(b.notes,2000),source:'Carga asistida · informada por el productor'},owner);
 }
 fail(404,'NOT_FOUND','La operación no está disponible.');
}
