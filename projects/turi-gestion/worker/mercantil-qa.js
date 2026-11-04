import {seal,unseal,NOW} from './security.js';

// The endpoint and form fields come from Mercantil's supplied connection guide.
// Only QA authentication is implemented. A token does not prove PAS attribution,
// portfolio access, a quote, or permission to issue a policy.
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
export async function mercantilQaAuthenticate(credentials,{fetchImpl=fetch,timeoutMs=8000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(MQA_TOKEN_URL,{
   method:'POST',redirect:'error',signal:controller.signal,
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
  // Never return, persist, log or expose the token to the browser.
  return {authenticated:true,environment:'qa',authenticatedAt:NOW(),portfolioAvailable:false,automaticQuotes:false,pasAttributionVerified:false};
 }catch(e){
  if(e instanceof MercantilQaError)throw e;
  if(controller.signal.aborted)mqaFail(504,'MERCANTIL_QA_TIMEOUT','Mercantil no respondió a tiempo. No se guardaron cambios en tu acceso.');
  mqaFail(502,'MERCANTIL_QA_UNAVAILABLE','No pudimos confirmar la comunicación con Mercantil. No se guardaron cambios en tu acceso.');
 }finally{clearTimeout(timer);}
}

export async function mercantilQaApi(req,env,u,id,{json,fail,first,run,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Las credenciales API pertenecen al productor. El administrador sólo supervisa su estado.');
 const row=await first(env,'SELECT * FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);
 if(!row)fail(404,'NOT_FOUND','No encontramos esa compañía en tu cuenta.');
 if(row.company_id!=='mercantil')fail(409,'CONNECTOR_NOT_ENABLED','La prueba de autenticación disponible corresponde a Mercantil Andina.');
 const b=await body(req);
 if(!b||b.authorized!==true||!row.authorized)fail(400,'REQUIRED','Confirmá que estás autorizado a usar estas credenciales API de test.');
 if(Number(b.expectedVersion)!==row.version)fail(409,'VERSION','El acceso cambió. Actualizá la lista antes de configurar la API.');
 let credentials;try{credentials=mercantilQaCredentials(b)}catch(e){if(e instanceof MercantilQaError)fail(e.status,e.code,e.message);throw e;}
 await rate(env,'mercantil-qa:'+u.id,5,15*60*1000);
 let result;try{result=await mercantilQaAuthenticate(credentials)}catch(e){
  if(e instanceof MercantilQaError){await audit(env,u,'connection.mercantil_qa_rejected',id);fail(e.status===401?422:e.status,e.code,e.message);}throw e;
 }
 // A revoked session or replaced connection cannot commit after the HTTP call.
 const active=await current(req,env);
 if(active.role!=='producer'||active.id!==u.id||active.tenant_id!==u.tenant_id)fail(403,'PRODUCER_ONLY','Los permisos de tu cuenta cambiaron durante la prueba.');
 const scope=`connection:${u.tenant_id}:${u.id}:mercantil:`,previous=await unseal(env,row.encrypted_payload,scope+row.version),version=row.version+1;
 const encrypted=await seal(env,{...previous,mercantilQa:credentials},scope+version);
 const changed=await run(env,'UPDATE pilot_connections SET method=?,encrypted_payload=?,status=?,version=?,updated_at=? WHERE id=? AND tenant_id=? AND producer_id=? AND version=?','mercantil_qa',encrypted,'qa_auth_verified',version,result.authenticatedAt,id,u.tenant_id,u.id,row.version);
 if(changed.meta.changes!==1)fail(409,'VERSION','El acceso cambió durante la prueba. Actualizá y revisá la versión vigente.');
 await audit(env,u,'connection.mercantil_qa_authenticated',id);
 return json({id,status:'qa_auth_verified',version,...result,message:'Mercantil confirmó la autenticación de prueba. Falta verificar el vínculo con tu código PAS y habilitar la consulta de cartera y la cotización.'});
}
