import {seal,unseal,NOW} from './security.js';
import {companyAccessState,companyAccessPack,companySessionGuard} from './company-setup.js';

// The endpoint and form fields come from Mercantil's supplied connection guide.
// A token alone does not prove PAS attribution or permission to issue a policy.
// Read-only QA requests below verify the stored account before querying cartera.
export const MQA_TOKEN_URL='https://apidev.mercantilandina.com.ar/credenciales/v2/';
export class MercantilQaError extends Error {
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
const mqaFail=(status,code,message)=>{throw new MercantilQaError(status,code,message);};
export function mercantilQaCredentials(input){
 const username=typeof input?.apiUsername==='string'?input.apiUsername.trim():'';
 const password=typeof input?.apiPassword==='string'?input.apiPassword:'';
 const subscriptionKey=typeof input?.subscriptionKey==='string'?input.subscriptionKey.trim():'';
 if(!username||username.length>160||!password||password.length>512||!subscriptionKey||subscriptionKey.length>256||/[\x00-\x20\x7f]/.test(subscriptionKey))
  mqaFail(400,'MERCANTIL_QA_REQUIRED','Completá el usuario API de test, su contraseña y la Subscription Key del portal.');
 if(/^(USUARIODETEST|USUARIO_TEST)$/i.test(username))
  mqaFail(400,'MERCANTIL_QA_REQUIRED','Usá el usuario de test emitido para vos por Mercantil; el ejemplo de la guía no es un acceso habilitado.');
 return {username,password,subscriptionKey};
}
async function mqaAccessToken(credentials,{fetchImpl=fetch,timeoutMs=8000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(MQA_TOKEN_URL,{
   // Workers supports manual/follow, not redirect:error. Reject 3xx below.
   method:'POST',redirect:'manual',signal:controller.signal,
   headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Ocp-Apim-Subscription-Key':credentials.subscriptionKey},
   body:new URLSearchParams({client_id:'api-clientes-login',username:credentials.username,password:credentials.password,grant_type:'password'}).toString()
  });
  if(response.status===401)mqaFail(401,'MERCANTIL_QA_CREDENTIALS','Mercantil no aceptó las credenciales API de test. Revisá que sean las emitidas por su equipo de API.');
  if(response.status===403)mqaFail(403,'MERCANTIL_QA_SUBSCRIPTION','Mercantil no habilitó esta suscripción. Revisá el producto, la Subscription Key y el permiso del usuario de test.');
  if(response.status===429)mqaFail(429,'MERCANTIL_QA_RATE_LIMIT','Mercantil pidió esperar antes de volver a consultar. Intentá nuevamente en unos minutos.');
  if(!response.ok)mqaFail(502,'MERCANTIL_QA_UNAVAILABLE','Mercantil no pudo completar la autenticación de prueba. Volvé a intentar más tarde.');
  const reader=response.body?.getReader();let text='',size=0;const decoder=new TextDecoder();
  if(!reader)mqaFail(502,'MERCANTIL_QA_RESPONSE','La respuesta de Mercantil no permitió confirmar la autenticación.');
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();mqaFail(502,'MERCANTIL_QA_RESPONSE','La respuesta de Mercantil requiere revisión técnica.');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();let payload;try{payload=JSON.parse(text)}catch{mqaFail(502,'MERCANTIL_QA_RESPONSE','Mercantil devolvió una respuesta que requiere revisión técnica.');}
  if(typeof payload?.access_token!=='string'||!payload.access_token.length||payload.access_token.length>16384||/\s/.test(payload.access_token)||(payload.token_type&&String(payload.token_type).toLowerCase()!=='bearer'))
   mqaFail(502,'MERCANTIL_QA_RESPONSE','La respuesta de Mercantil no permitió confirmar un token API válido.');
  // Private server-only value; public operations return an explicit allowlist.
  return {token:payload.access_token,authenticatedAt:NOW()};
 }catch(e){
  if(e instanceof MercantilQaError)throw e;
  if(controller.signal.aborted)mqaFail(504,'MERCANTIL_QA_TIMEOUT','Mercantil no respondió a tiempo. La autenticación de prueba sigue pendiente.');
  mqaFail(502,'MERCANTIL_QA_UNAVAILABLE','No pudimos confirmar la comunicación con Mercantil. La autenticación de prueba sigue pendiente.');
 }finally{clearTimeout(timer);}
}

export async function mercantilQaAuthenticate(credentials,options={}){
 const session=await mqaAccessToken(credentials,options);
 return {authenticated:true,environment:'qa',authenticatedAt:session.authenticatedAt,portfolioAvailable:false,automaticQuotes:false,pasAttributionVerified:false};
}

function mqaAccount(value){
 const text=typeof value==='number'&&Number.isSafeInteger(value)?String(value):typeof value==='string'?value.trim():'';
 return /^\d{1,12}$/.test(text)&&Number(text)>0?String(Number(text)):null;
}
function mqaDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const stamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?stamp:null;
}
function mqaReadQuery(input,storedAccount){
 const account=mqaAccount(storedAccount),service=input?.service||'productor';
 if(!account)mqaFail(400,'MERCANTIL_QA_ACCOUNT','El código PAS guardado debe coincidir con la cuenta numérica habilitada por Mercantil para esta prueba.');
 if(!['productor','operaciones','cobranzas','rechazos','comisiones'].includes(service))mqaFail(400,'MERCANTIL_QA_SERVICE','Elegí una consulta de prueba disponible.');
 const page=input?.page===undefined?1:input.page;
 if(!Number.isSafeInteger(page)||page<1||page>10000)mqaFail(400,'MERCANTIL_QA_PAGE','Revisá el número de página.');
 if(service==='productor')return {account,service,page};
 const start=mqaDate(input?.from),end=mqaDate(input?.to);
 if(start===null||end===null||end<start||end-start>30*86400000)mqaFail(400,'MERCANTIL_QA_DATES','Elegí un período válido de hasta 31 días.');
 const branch=input?.branch;
 if(service==='comisiones'&&(!Number.isSafeInteger(branch)||branch<1||branch>999))mqaFail(400,'MERCANTIL_QA_BRANCH','Para consultar comisiones indicá el número de rama informado por Mercantil.');
 return {account,service,page,from:input.from,to:input.to,branch};
}
async function mqaGetJson(path,credentials,token,{fetchImpl=fetch,timeoutMs=8000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  // Paths are built exclusively from the fixed service allowlist and validated fields.
  const response=await fetchImpl('https://apidev.mercantilandina.com.ar'+path,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json',Authorization:'Bearer '+token,'Ocp-Apim-Subscription-Key':credentials.subscriptionKey}});
  if(response.status===401)mqaFail(422,'MERCANTIL_QA_TOKEN','Mercantil no aceptó el acceso de prueba para este servicio. Revisá el permiso del usuario API.');
  if(response.status===403)mqaFail(403,'MERCANTIL_QA_SERVICE_PERMISSION','La suscripción o el usuario API no tienen habilitado este servicio de prueba.');
  if(response.status===429)mqaFail(429,'MERCANTIL_QA_RATE_LIMIT','Mercantil pidió esperar antes de volver a consultar.');
  if(!response.ok)mqaFail(502,'MERCANTIL_QA_SERVICE_UNAVAILABLE','Mercantil no pudo completar esta consulta de prueba.');
  const reader=response.body?.getReader();if(!reader)mqaFail(502,'MERCANTIL_QA_RESPONSE','Mercantil devolvió una respuesta que requiere revisión técnica.');
  let text='',size=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();mqaFail(502,'MERCANTIL_QA_RESPONSE','La respuesta de prueba superó el tamaño permitido.');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();try{return JSON.parse(text)}catch{mqaFail(502,'MERCANTIL_QA_RESPONSE','Mercantil devolvió una respuesta que requiere revisión técnica.');}
 }catch(e){
  if(e instanceof MercantilQaError)throw e;
  if(controller.signal.aborted)mqaFail(504,'MERCANTIL_QA_TIMEOUT','Mercantil no respondió a tiempo a la consulta de prueba.');
  mqaFail(502,'MERCANTIL_QA_SERVICE_UNAVAILABLE','No pudimos completar la comunicación con Mercantil.');
 }finally{clearTimeout(timer);}
}
const mqaText=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').slice(0,240):typeof value==='number'&&Number.isFinite(value)?String(value):'';
const mqaMoney=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function mqaRecord(record,service,account){
 const operation=service==='operaciones'?record?.operacion:record;
 const producer=operation?.productor;
 if(mqaAccount(producer?.cuenta??producer?.id)!==account)mqaFail(502,'MERCANTIL_QA_SCOPE','La respuesta incluye registros cuya atribución al productor no pudo verificarse. No se mostraron ni importaron datos.');
 return {policy:mqaText(operation.poliza),endorsement:mqaText(operation.endoso),insured:mqaText(operation.asegurado?.nombre),date:mqaText(service==='operaciones'?operation.fecha_operacion:service==='comisiones'?record.fecha_movimiento:service==='rechazos'?record.fecha_rechazo:record.fecha_cobranza),currency:mqaText(record.costo?.moneda||record.cuota?.costo?.moneda),amount:mqaMoney(service==='comisiones'?record.comision?.totales:record.costo?.premio??record.cuota?.costo?.premio),detail:mqaText(service==='rechazos'?record.motivo_rechazo?.descripcion:operation.tipo)};
}

export async function mercantilQaRead(credentials,storedAccount,input={},options={}){
 const query=mqaReadQuery(input,storedAccount),session=await mqaAccessToken(credentials,options);
 const producers=await mqaGetJson('/productores/v1/',credentials,session.token,options);
 if(!Array.isArray(producers?.datos)||producers.datos.length>1000||producers.datos.some(p=>!mqaAccount(p?.cuenta)))mqaFail(502,'MERCANTIL_QA_RESPONSE','No pudimos interpretar las cuentas habilitadas por Mercantil.');
 const matching=producers.datos.filter(p=>mqaAccount(p.cuenta)===query.account);
 if(matching.length!==1)mqaFail(409,'MERCANTIL_QA_PAS_MISMATCH','El usuario API de test no devolvió una coincidencia única con el código PAS guardado. Confirmá con Mercantil qué cuenta vincularon antes de consultar cartera.');
 const result={environment:'qa',authenticated:true,authenticatedAt:session.authenticatedAt,pasAttributionVerified:true,producerName:mqaText(matching[0].nombre),service:query.service,productionReady:false,automaticQuotes:false,imported:false};
 if(query.service==='productor')return result;
 const params=new URLSearchParams({size:'20',page:String(query.page),[query.service==='operaciones'?'cuentas':'cuenta']:query.account,desde:query.from,hasta:query.to});
 if(query.service==='comisiones')params.set('rama',String(query.branch));
 const data=await mqaGetJson('/cartera/v1/'+query.service+'?'+params,credentials,session.token,options);
 if(!Array.isArray(data?.datos)||data.datos.length>20||!Number.isSafeInteger(data.total_elementos)||data.total_elementos<0||!Number.isSafeInteger(data.total_paginas)||data.total_paginas<0||!Number.isSafeInteger(data.pagina_actual)||data.pagina_actual!==query.page)mqaFail(502,'MERCANTIL_QA_RESPONSE','La respuesta de cartera de prueba requiere revisión técnica.');
 return {...result,from:query.from,to:query.to,page:query.page,totalPages:data.total_paginas,totalRecords:data.total_elementos,records:data.datos.map(record=>mqaRecord(record,query.service,query.account))};
}

export async function mercantilQaReadApi(req,env,u,id,{json,fail,first,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PRODUCER_ONLY','La consulta requiere el espacio del productor.');
 const row=await first(env,'SELECT * FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);
 if(!row)fail(404,'NOT_FOUND','No encontramos esa compañía en tu cuenta.');
 if(row.company_id!=='mercantil')fail(409,'CONNECTOR_NOT_ENABLED','Esta consulta corresponde a Mercantil Andina.');
 const b=await body(req);
 if(b?.authorized!==true||!row.authorized)fail(400,'REQUIRED','Confirmá que estás autorizado a consultar este acceso de prueba.');
 if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion!==row.version)fail(409,'VERSION','El acceso cambió. Actualizá la configuración.');
 const payload=await unseal(env,row.encrypted_payload,`connection:${u.tenant_id}:${u.id}:mercantil:${row.version}`),access=companyAccessState(payload);
 let result;
 try{
  const credentials=mercantilQaCredentials({apiUsername:access.api.username,apiPassword:access.api.password,subscriptionKey:access.api.subscriptionKey});
  mqaReadQuery(b,payload.pasCode);
  await rate(env,'mercantil-qa-read:'+u.id,5,15*60*1000);
  result=await mercantilQaRead(credentials,payload.pasCode,b);
 }catch(e){if(e instanceof MercantilQaError)fail(e.status===401?422:e.status,e.code,e.message);throw e;}
 // Recheck session, ownership, authorization and version before releasing external data.
 const active=await current(req,env);
 if(active.role!=='producer'||active.id!==u.id||active.tenant_id!==u.tenant_id)fail(403,'PRODUCER_ONLY','Los permisos de tu cuenta cambiaron durante la consulta.');
 const guard=companySessionGuard(active),unchanged=await first(env,'SELECT id FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=? AND version=? AND authorized=1 AND '+guard.sql,id,u.tenant_id,u.id,row.version,...guard.values);
 if(!unchanged)fail(409,'VERSION','El acceso cambió durante la consulta. Actualizá la configuración.');
 await audit(env,u,'connection.mercantil_qa_read_'+result.service,id);
 return json({...result,message:result.service==='productor'?'Mercantil confirmó la cuenta del productor en TEST. La habilitación de producción sigue pendiente.':'Consulta de TEST completada. Los resultados no se importaron a la cartera ni modificaron pólizas.'});
}

export async function mercantilQaApi(req,env,u,id,{json,fail,first,run,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Las credenciales API pertenecen al productor. El administrador sólo supervisa su estado.');
 const row=await first(env,'SELECT * FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);
 if(!row)fail(404,'NOT_FOUND','No encontramos esa compañía en tu cuenta.');
 if(row.company_id!=='mercantil')fail(409,'CONNECTOR_NOT_ENABLED','La prueba de autenticación disponible corresponde a Mercantil Andina.');
 const b=await body(req);
 if(!b||b.authorized!==true||!row.authorized)fail(400,'REQUIRED','Confirmá que estás autorizado a usar estas credenciales API de test.');
 if(Number(b.expectedVersion)!==row.version)fail(409,'VERSION','El acceso cambió. Actualizá la lista antes de configurar la API.');
 const scope=`connection:${u.tenant_id}:${u.id}:mercantil:`,previous=await unseal(env,row.encrypted_payload,scope+row.version),access=companyAccessState(previous);
 let credentials;try{credentials=mercantilQaCredentials(b.useSaved===true?{apiUsername:access.api.username,apiPassword:access.api.password,subscriptionKey:access.api.subscriptionKey}:b)}catch(e){if(e instanceof MercantilQaError)fail(e.status,e.code,e.message);throw e;}
 await rate(env,'mercantil-qa:'+u.id,5,15*60*1000);
 let result;try{result=await mercantilQaAuthenticate(credentials)}catch(e){
  if(e instanceof MercantilQaError){await audit(env,u,'connection.mercantil_qa_rejected',id);fail(e.status===401?422:e.status,e.code,e.message);}throw e;
 }
 // A revoked session or replaced connection cannot commit after the HTTP call.
 const active=await current(req,env);
 if(active.role!=='producer'||active.id!==u.id||active.tenant_id!==u.tenant_id)fail(403,'PRODUCER_ONLY','Los permisos de tu cuenta cambiaron durante la prueba.');
 const version=row.version+1;access.api={...access.api,...credentials};
 const encrypted=await seal(env,{...companyAccessPack(previous,access),mercantilQaVerifiedAt:result.authenticatedAt},scope+version);
 const guard=companySessionGuard(active);
 const changed=await run(env,'UPDATE pilot_connections SET method=?,encrypted_payload=?,status=?,version=?,updated_at=? WHERE id=? AND tenant_id=? AND producer_id=? AND version=? AND '+guard.sql,'mercantil_qa',encrypted,'qa_auth_verified',version,result.authenticatedAt,id,u.tenant_id,u.id,row.version,...guard.values);
 if(changed.meta.changes!==1)fail(409,'VERSION','El acceso cambió durante la prueba. Actualizá y revisá la versión vigente.');
 await audit(env,u,'connection.mercantil_qa_authenticated',id);
 return json({id,status:'qa_auth_verified',version,...result,message:'Mercantil confirmó la autenticación de prueba. Falta verificar el vínculo con tu código PAS y habilitar la consulta de cartera y la cotización.'});
}
