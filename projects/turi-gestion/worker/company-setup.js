import {opaque,seal,unseal,NOW} from './security.js';

export const COMPANY_API_FIELDS=['username','password','subscriptionKey','clientId','clientSecret','apiKey'];
export function companyAccessState(payload={}){
 const stored=payload.companyAccess||{},portal=stored.portal||{username:payload.portalUser,password:payload.portalPassword};
 const api=stored.api||{...payload.mercantilQa,apiKey:payload.apiKey};
 return {portal:{username:portal.username||'',password:portal.password||''},api:Object.fromEntries(COMPANY_API_FIELDS.map(k=>[k,api[k]||''])),taxId:stored.taxId||''};
}
export function companyAccessPack(previous,access,pasCode=previous.pasCode){
 const {portalUser,portalPassword,apiKey,mercantilQa,companyAccess,...rest}=previous;
 return {...rest,pasCode,companyAccess:access};
}
export function companySessionGuard(u,stamp=NOW()){
 if(u.delegation)return {sql:"EXISTS (SELECT 1 FROM pilot_sessions s JOIN pilot_users a ON a.id=s.user_id JOIN pilot_users p ON p.id=? AND p.tenant_id=a.tenant_id WHERE s.id=? AND s.user_id=? AND a.tenant_id=? AND a.role='superadmin' AND a.disabled=0 AND p.role='producer' AND p.disabled=0 AND s.mfa=1 AND s.expires_at>? AND s.last_seen>?)",values:[u.id,u.session_id,u.delegation.actorId,u.tenant_id,stamp,stamp-15*60*1000]};
 return {sql:"EXISTS (SELECT 1 FROM pilot_sessions s JOIN pilot_users p ON p.id=s.user_id WHERE s.id=? AND s.user_id=? AND p.tenant_id=? AND p.role='producer' AND p.disabled=0 AND s.mfa=1 AND s.expires_at>? AND s.last_seen>?)",values:[u.session_id,u.id,u.tenant_id,stamp,stamp-15*60*1000]};
}
export function companySetupView(row,payload={}){
 const access=companyAccessState(payload),pas=String(payload.pasCode||'');
 return {id:row?.id||null,version:row?.version||0,status:row?.status||'not_registered',pasConfigured:!!pas,pasHint:pas?'••••'+pas.slice(-4):'',taxId:access.taxId,portalConfigured:!!(access.portal.username&&access.portal.password),apiConfigured:Object.fromEntries(COMPANY_API_FIELDS.map(k=>[k,!!access.api[k]])),qaAuthenticated:row?.status==='qa_auth_verified',portfolioAvailable:false,automaticQuotes:false};
}
function companyTaxId(value,fail){
 if(typeof value!=='string'||value.length>20)fail(400,'TAX_ID','Revisá el CUIT del titular.');
 const digits=value.replace(/[\s-]/g,'');if(!digits)return '';
 if(!/^\d{11}$/.test(digits))fail(400,'TAX_ID','Ingresá los once números del CUIT del titular.');
 const weights=[5,4,3,2,7,6,5,4,3,2];let digit=11-weights.reduce((sum,w,i)=>sum+w*Number(digits[i]),0)%11;
 digit=digit===11?0:digit===10?9:digit;
 if(digit!==Number(digits[10]))fail(400,'TAX_ID','El dígito verificador del CUIT no coincide. Revisá el número.');
 return digits.slice(0,2)+'-'+digits.slice(2,10)+'-'+digits.slice(10);
}
function companyField(value,max,name,fail,trim=true){
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>max||/[\x00]/.test(value))fail(400,'FIELD','Revisá el campo '+name+'.');
 return trim?value.trim():value;
}
export async function companySetupApi(req,env,u,companyId,companies,{json,fail,first,run,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Los accesos pertenecen al productor. El administrador sólo supervisa su estado.');
 const company=companies.find(c=>c.id===companyId);
 if(!company?.setup?.priority)fail(404,'COMPANY','Elegí una de las compañías preparadas para esta etapa.');
 const row=await first(env,'SELECT * FROM pilot_connections WHERE tenant_id=? AND producer_id=? AND company_id=?',u.tenant_id,u.id,companyId);
 const scope=`connection:${u.tenant_id}:${u.id}:${companyId}:`,previous=row?await unseal(env,row.encrypted_payload,scope+row.version):{};
 if(req.method==='GET')return json({companyId,record:companySetupView(row,previous)});
 if(req.method!=='POST')fail(405,'METHOD','Usá el formulario de configuración.');
 const b=await body(req);
 if(!b||typeof b!=='object'||Array.isArray(b)||b.authorized!==true)fail(400,'REQUIRED','Confirmá que estás autorizado a gestionar estos accesos.');
 if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion!==(row?.version||0))fail(409,'VERSION','La configuración cambió. Actualizá la ficha antes de guardar.');
 const pas=companyField(b.pasCode,120,'Código PAS',fail)||previous.pasCode;
 if(!pas)fail(400,'PAS_REQUIRED','Ingresá tu código PAS en esta compañía.');
 const access=companyAccessState(previous),before=JSON.stringify(access.api),beforePas=previous.pasCode;
 const portalUser=companyField(b.portalUser,160,'Usuario del portal',fail),portalPassword=companyField(b.portalPassword,512,'Contraseña del portal',fail,false);
 if(!!portalUser!==!!portalPassword)fail(400,'PORTAL_PAIR','Para cambiar el acceso al portal completá usuario y contraseña juntos. Los dos vacíos conservan lo guardado.');
 if(portalUser&&portalPassword)access.portal={username:portalUser,password:portalPassword};
 if(b.taxId!==undefined){const tax=companyTaxId(b.taxId,fail);if(tax)access.taxId=tax;}
 if(b.api!==undefined){
  if(!b.api||typeof b.api!=='object'||Array.isArray(b.api)||Object.keys(b.api).some(k=>!COMPANY_API_FIELDS.includes(k)))fail(400,'API_FIELDS','Usá los campos API de esta ficha.');
  const api=Object.fromEntries(COMPANY_API_FIELDS.map(k=>[k,companyField(b.api[k],['username','clientId'].includes(k)?160:k==='password'?512:k==='subscriptionKey'?256:4096,'API '+k,fail,!['password','clientSecret','apiKey','subscriptionKey'].includes(k))]));
  if(!!api.username!==!!api.password)fail(400,'API_PAIR','Para cambiar el usuario API completá usuario y contraseña API juntos. Los dos vacíos conservan lo guardado.');
  if(!!api.clientId!==!!api.clientSecret)fail(400,'API_CLIENT_PAIR','Para cambiar las credenciales de aplicación completá Client ID y Client Secret juntos.');
  for(const k of COMPANY_API_FIELDS)if(api[k])access.api[k]=api[k];
 }
 await rate(env,'company-setup:'+u.id,30);
 const active=await current(req,env);if(active.role!=='producer'||active.tenant_id!==u.tenant_id||active.id!==u.id)fail(403,'PRODUCER_ONLY','Los permisos de tu cuenta cambiaron.');
 const credentialsPresent=!!(access.portal.username||Object.values(access.api).some(Boolean));
 const keepQa=row?.status==='qa_auth_verified'&&before===JSON.stringify(access.api)&&beforePas===pas;
 const status=keepQa?'qa_auth_verified':credentialsPresent?'credentials_saved':'registered',method=keepQa?'mercantil_qa':credentialsPresent?'configuration':'pas_only';
 const version=(row?.version||0)+1,id=row?.id||opaque(16),stamp=NOW(),packed=companyAccessPack(previous,access,pas);
 if(!keepQa)delete packed.mercantilQaVerifiedAt;
 const encrypted=await seal(env,packed,scope+version),guard=companySessionGuard(active);
 if(row){
  const r=await run(env,'UPDATE pilot_connections SET method=?,encrypted_payload=?,status=?,version=?,authorized=1,updated_at=? WHERE id=? AND tenant_id=? AND producer_id=? AND version=? AND '+guard.sql,method,encrypted,status,version,stamp,id,u.tenant_id,u.id,row.version,...guard.values);
  if(r.meta.changes!==1)fail(409,'VERSION','La configuración cambió mientras guardabas. Actualizá y revisá la ficha.');
 }else{
  const r=await run(env,'INSERT INTO pilot_connections(id,tenant_id,producer_id,company_id,method,encrypted_payload,status,version,authorized,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT count(*) FROM pilot_connections WHERE tenant_id=? AND producer_id=?)<15 AND NOT EXISTS (SELECT 1 FROM pilot_connections WHERE tenant_id=? AND producer_id=? AND company_id=?) AND '+guard.sql,id,u.tenant_id,u.id,companyId,method,encrypted,status,version,stamp,stamp,u.tenant_id,u.id,u.tenant_id,u.id,companyId,...guard.values);
  if(r.meta.changes!==1)fail(409,'LIMIT_OR_VERSION','La compañía ya se registró o alcanzaste el límite de 15. Actualizá la lista.');
 }
 await audit(env,u,row?'connection.setup_updated':'connection.setup_created',id);
 return json({companyId,record:companySetupView({id,version,status},packed),message:keepQa?'Configuración guardada. La autenticación QA conserva su validación; cartera y cotización siguen pendientes.':'Configuración guardada. El acceso API sigue pendiente de validación.'},row?200:201);
}
