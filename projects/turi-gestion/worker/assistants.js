import {opaque,seal,unseal,NOW} from './security.js';
import {companySessionGuard} from './company-setup.js';

export const ASSISTANT_PROVIDERS=[
 {id:'openai',label:'ChatGPT · OpenAI'},
 {id:'gemini',label:'Gemini · Google'},
 {id:'claude',label:'Claude · Anthropic'},
 {id:'copilot',label:'Copilot · Microsoft'},
 {id:'meta',label:'Muse / Spark · Meta'}
];
const DIRECT_LINE_ORIGINS={global:'https://directline.botframework.com',europe:'https://europe.directline.botframework.com',india:'https://india.directline.botframework.com'};
const MAX_PROBE_BYTES=262144;

export class AssistantProbeError extends Error{
 constructor(code,message){super(message);this.code=code;}
}
const probeError=(code,message)=>{throw new AssistantProbeError(code,message);};
function probeRequest(provider,credentials){
 const headers={Accept:'application/json'};
 switch(provider){
  case'openai':return {url:'https://api.openai.com/v1/models',method:'GET',headers:{...headers,Authorization:'Bearer '+credentials.apiKey}};
  case'gemini':return {url:'https://generativelanguage.googleapis.com/v1beta/models',method:'GET',headers:{...headers,'x-goog-api-key':credentials.apiKey,'x-goog-api-client':'turi-gestion/1.0'}};
  case'claude':return {url:'https://api.anthropic.com/v1/models',method:'GET',headers:{...headers,'Content-Type':'application/json',Authorization:'Bearer '+credentials.apiKey,'anthropic-version':'2026-10-21',...(credentials.workspaceId?{'anthropic-workspace-id':credentials.workspaceId}:{})}};
  case'meta':return {url:'https://api.meta.ai/v1/models',method:'GET',headers:{...headers,Authorization:'Bearer '+credentials.apiKey}};
  case'copilot':return {url:(DIRECT_LINE_ORIGINS[credentials.region]||DIRECT_LINE_ORIGINS.global)+'/v3/directline/tokens/generate',method:'POST',headers:{...headers,Authorization:'Bearer '+credentials.apiKey,'Content-Type':'application/json'},body:'{}'};
  default:probeError('PROVIDER','Elegí un asistente del listado.');
 }
}
async function boundedProbeJson(response){
 const length=Number(response.headers.get('content-length')||0);
 if(length>MAX_PROBE_BYTES)probeError('RESPONSE','El proveedor devolvió una respuesta inesperada. Volvé a probar más tarde.');
 const reader=response.body?.getReader();
 if(!reader)probeError('RESPONSE','El proveedor no devolvió una confirmación válida.');
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PROBE_BYTES){await reader.cancel();probeError('RESPONSE','El proveedor devolvió una respuesta demasiado grande.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch(error){if(error instanceof AssistantProbeError)throw error;probeError('RESPONSE','El proveedor no devolvió una confirmación válida.');}
 finally{reader.releaseLock();}
}

// Credential probes never send prompts, client records, files or identifying PAS data.
export async function assistantProbe(provider,credentials,{fetchImpl=globalThis.fetch,timeoutMs=12000}={}){
 const {url,...request}=probeRequest(provider,credentials),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{...request,redirect:'error',signal:controller.signal});
  if(response.status===401||response.status===403)probeError('CREDENTIALS','El proveedor no autorizó este acceso. Revisá la clave y sus permisos.');
  if(response.status===429)probeError('RATE_LIMIT','El proveedor limitó las consultas. Esperá y volvé a probar.');
  if(!response.ok)probeError('UNAVAILABLE','El proveedor no pudo confirmar el acceso. Volvé a probar más tarde.');
  const data=await boundedProbeJson(response);
  const models=provider==='gemini'?data?.models:data?.data;
  const valid=provider==='copilot'
   ?typeof data?.token==='string'&&data.token.length>0&&Number.isFinite(data.expires_in)&&data.expires_in>0
   :Array.isArray(models)&&models.length>0&&models.every(model=>model&&typeof (provider==='gemini'?model.name:model.id)==='string'&&(provider==='gemini'?model.name:model.id).length>0);
  if(!valid)probeError('RESPONSE','El proveedor no devolvió una confirmación de acceso válida.');
  return {verified:true};
 }catch(error){
  if(controller.signal.aborted)probeError('TIMEOUT','El proveedor tardó demasiado en responder. Volvé a probar.');
  if(error instanceof AssistantProbeError)throw error;
  probeError('NETWORK','No pudimos contactar al proveedor. Volvé a probar más tarde.');
 }finally{clearTimeout(timer);}
}

function assistantView(provider,row,payload={}){
 return {...provider,configured:!!row,apiKeyConfigured:!!payload.apiKey,status:row?.status||'not_connected',version:row?.version||0,model:payload.model||'',workspaceId:payload.workspaceId||'',region:payload.region||'global',updatedAt:row?.updated_at||null,verifiedAt:row?.verified_at||null};
}
function assistantField(value,max,label,fail){
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail(400,'FIELD','Revisá el campo '+label+'.');
 return value.trim();
}
export async function assistantsApi(req,env,u,{json,fail,first,all,run,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PAS_REQUIRED','Elegí un productor en la selectora para conectar su asistente de IA.');
 const path=new URL(req.url).pathname,scopeFor=provider=>'assistant:'+u.tenant_id+':'+u.id+':'+provider+':';
 if(path==='/api/pilot/assistants'&&req.method==='GET'){
  const rows=await all(env,'SELECT * FROM pilot_ai_connections WHERE tenant_id=? AND owner_id=?',u.tenant_id,u.id);
  const providers=await Promise.all(ASSISTANT_PROVIDERS.map(async provider=>{const row=rows.find(item=>item.provider===provider.id);return assistantView(provider,row,row?await unseal(env,row.encrypted_payload,scopeFor(provider.id)+row.version):{});}));
  return json({providers});
 }
 const match=/^\/api\/pilot\/assistants\/(openai|gemini|claude|copilot|meta)(\/test)?$/.exec(path);
 if(!match)fail(404,'PROVIDER','No encontramos ese asistente.');
 if(req.method!=='POST')fail(405,'METHOD','Usá el formulario del asistente.');
 const provider=ASSISTANT_PROVIDERS.find(item=>item.id===match[1]),b=await body(req);
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'FORM','Revisá los datos de la conexión.');
 // Scope comes from the authenticated PAS profile, never from submitted owner/tenant IDs.
 if(b.ownerId&&b.ownerId!==u.id||b.tenantId&&b.tenantId!==u.tenant_id)fail(403,'OWNER','La conexión pertenece al productor seleccionado.');
 const row=await first(env,'SELECT * FROM pilot_ai_connections WHERE tenant_id=? AND owner_id=? AND provider=?',u.tenant_id,u.id,provider.id);
 if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion!==(row?.version||0))fail(409,'VERSION','La conexión cambió. Actualizá la ficha antes de guardar.');
 const scope=scopeFor(provider.id),previous=row?await unseal(env,row.encrypted_payload,scope+row.version):{};
 let payload,status='configured',verifiedAt=null,message='Configuración guardada. Probá el acceso para validarla.',verified=false;
 await rate(env,'assistant:'+u.id+':'+provider.id,match[2]?10:30,3600000);
 if(match[2]){
  if(!row||!previous.apiKey)fail(400,'KEY_REQUIRED','Guardá primero la clave de conexión.');
  const authorized=await current(req,env);
  if(authorized.role!=='producer'||authorized.id!==u.id||authorized.tenant_id!==u.tenant_id)fail(403,'PAS_REQUIRED','Los permisos de la cuenta cambiaron.');
  payload=previous;
  try{await assistantProbe(provider.id,payload);status='verified';verifiedAt=NOW();verified=true;message='Acceso validado. La conexión está preparada; no se enviaron datos de clientes.';}
  catch(error){if(!(error instanceof AssistantProbeError))throw error;status='failed';message=error.message;}
 }else{
  if(b.authorized!==true)fail(400,'AUTHORIZATION_REQUIRED','Confirmá que tenés autorización para configurar esta conexión.');
  const apiKey=assistantField(b.apiKey,8192,'clave de conexión',fail)||previous.apiKey;
  if(!apiKey)fail(400,'KEY_REQUIRED','Ingresá la clave de conexión del asistente.');
  const model=b.model===undefined?previous.model||'':assistantField(b.model,200,'modelo',fail);
  const workspaceId=provider.id==='claude'?(b.workspaceId===undefined?previous.workspaceId||'':assistantField(b.workspaceId,200,'workspace',fail)):'';
  const region=provider.id==='copilot'?(b.region===undefined?previous.region||'global':assistantField(b.region,20,'región',fail)):'global';
  if(!Object.hasOwn(DIRECT_LINE_ORIGINS,region))fail(400,'REGION','Elegí una región de Copilot del listado.');
  payload={apiKey,model,workspaceId,region};
  if(row&&JSON.stringify(payload)===JSON.stringify(previous)){status=row.status;verifiedAt=row.verified_at;verified=status==='verified';}
 }
 const active=await current(req,env);
 if(active.role!=='producer'||active.id!==u.id||active.tenant_id!==u.tenant_id)fail(403,'PAS_REQUIRED','Los permisos de la cuenta cambiaron.');
 const version=(row?.version||0)+1,id=row?.id||opaque(16),stamp=NOW(),guard=companySessionGuard(active),encrypted=await seal(env,payload,scope+version);
 let result;
 if(row)result=await run(env,'UPDATE pilot_ai_connections SET encrypted_payload=?,status=?,version=?,verified_at=?,updated_at=? WHERE id=? AND tenant_id=? AND owner_id=? AND version=? AND '+guard.sql,encrypted,status,version,verifiedAt,stamp,id,u.tenant_id,u.id,row.version,...guard.values);
 else result=await run(env,'INSERT INTO pilot_ai_connections(id,tenant_id,owner_id,provider,encrypted_payload,status,version,verified_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM pilot_ai_connections WHERE tenant_id=? AND owner_id=? AND provider=?) AND '+guard.sql,id,u.tenant_id,u.id,provider.id,encrypted,status,version,verifiedAt,stamp,stamp,u.tenant_id,u.id,provider.id,...guard.values);
 if(result.meta.changes!==1)fail(409,'VERSION','La conexión o tu acceso cambiaron. Actualizá la ficha para continuar.');
 await audit(env,u,match[2]?(verified?'assistant.verified':'assistant.validation_failed'):(row?'assistant.updated':'assistant.created'),id);
 return json({record:assistantView(provider,{id,status,version,verified_at:verifiedAt,updated_at:stamp},payload),verified,message},row?200:201);
}
