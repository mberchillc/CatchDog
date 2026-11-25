import {seal,unseal,NOW,opaque} from './security.js';
import {companyAccessState,companySessionGuard} from './company-setup.js';
import {MercantilQaError,mercantilQaCredentials,mqaAccessToken,mqaAccount} from './mercantil-qa.js';

// Deliberately no configurable host: this workflow can never call production.
const MAQ_HOST='https://apidev.mercantilandina.com.ar';
const maqFail=(status,code,message)=>{throw new MercantilQaError(status,code,message);};
const maqText=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').slice(0,1000):typeof v==='number'&&Number.isFinite(v)?String(v):'';
const maqInt=(v,name,min=1,max=999999999)=>{if(!Number.isSafeInteger(v)||v<min||v>max)maqFail(400,'QA_FIELD','Revisá '+name+'.');return v;};
function maqString(v,name,pattern){if(typeof v!=='string'||!pattern.test(v))maqFail(400,'QA_FIELD','Revisá '+name+'.');return v;}
function maqErrorText(data,credentials,token){
 const values=[];const visit=(v,depth=0)=>{if(depth>4||values.length>8)return;if(typeof v==='string')values.push(v);else if(Array.isArray(v))v.slice(0,5).forEach(x=>visit(x,depth+1));else if(v&&typeof v==='object'){const entries=Object.entries(v),known=entries.filter(([k])=>/^(message|messages|mensaje|mensajes|error|error_description|descripcion|description|detail|details|errors|errores|title|modelstate|validationerrors)$/i.test(k));for(const [,x] of (known.length?known:depth?entries.slice(0,8):[]))visit(x,depth+1);}};visit(data);
 if(!values.length&&data&&typeof data==='object')values.push('Campos de respuesta: '+Object.keys(data).filter(k=>/^[A-Za-z_]{1,40}$/.test(k)).slice(0,12).join(', '));
 let s=values.join(' · ').replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/gi,'[enlace omitido]');
 for(const secret of [credentials.username,credentials.password,credentials.subscriptionKey,token])if(secret)s=s.split(secret).join('[dato resguardado]');
 return maqText(s);
}
async function maqHttp(path,method,data,credentials,token,{fetchImpl=fetch,timeoutMs=25000}={}){
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),timeoutMs);
 try{
  const response=await fetchImpl(MAQ_HOST+path,{method,redirect:'manual',signal:control.signal,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token,'Ocp-Apim-Subscription-Key':credentials.subscriptionKey},...(method==='POST'?{body:JSON.stringify(data)}:{})});
  const reader=response.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
  if(!reader)maqFail(502,'QA_RESPONSE','Mercantil TEST devolvió una respuesta sin contenido.');
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();maqFail(502,'QA_RESPONSE','La respuesta TEST superó el tamaño permitido.');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
  let result;try{result=JSON.parse(raw);}catch{maqFail(502,'QA_RESPONSE','Mercantil TEST respondió con HTTP '+response.status+' y un formato que requiere revisión.');}
  if(!response.ok){const detail=maqErrorText(result,credentials,token);maqFail(response.status===429?429:422,response.status>=500&&method==='POST'?'QA_OUTCOME_UNKNOWN':'QA_PROVIDER_REJECTED','Mercantil TEST respondió HTTP '+response.status+(detail?': '+detail:'. No se confirmó la operación.'));}
  return result;
 }catch(e){if(e instanceof MercantilQaError)throw e;maqFail(control.signal.aborted?504:502,'QA_OUTCOME_UNKNOWN','No se pudo confirmar la respuesta de Mercantil TEST. Si era una operación de alta, consultá su estado antes de repetirla.');}
 finally{clearTimeout(timer);}
}
function maqBoundAccount(data,account){
 const value=data?.productor;
 if(value!==undefined&&mqaAccount(typeof value==='object'&&value!==null?value.id??value.cuenta:value)!==account)maqFail(502,'QA_PAS_MISMATCH','La respuesta de TEST no coincide con el productor habilitado.');
}
function maqQuoteBody(b,account){
 if(!b||typeof b!=='object'||Array.isArray(b))maqFail(400,'QA_FIELD','Completá la solicitud de cotización.');
 const v=b.vehiculo||{},l=b.localidad||{};
 if(typeof v.gnc!=='boolean')maqFail(400,'QA_FIELD','Confirmá si tiene GNC.');
 for(const [key,val] of Object.entries({comision:b.comision,bonificacion:b.bonificacion,ajuste_suma:b.ajuste_suma}))if(typeof val!=='number'||!Number.isFinite(val)||val<0||val>100)maqFail(400,'QA_FIELD','Revisá '+key+'.');
 return {localidad:{codigo_postal:maqInt(l.codigo_postal,'código postal',1,9999),...(l.id!==undefined?{id:maqInt(l.id,'localidad')}: {})},vehiculo:{infoauto:maqInt(v.infoauto,'modelo Infoauto'),anio:maqInt(v.anio,'año',1950,new Date().getUTCFullYear()+1),uso:maqInt(v.uso,'uso',1,99),gnc:v.gnc,rastreo:maqInt(v.rastreo,'rastreador',0,99)},comision:b.comision,bonificacion:b.bonificacion,periodo:maqInt(b.periodo,'período',1,24),cuotas:maqInt(b.cuotas,'cuotas',1,24),pago:{tipo_pago:maqString(b.pago?.tipo_pago,'forma de pago',/^[A-Z]{1,20}$/)},ajuste_suma:b.ajuste_suma,iva:maqInt(b.iva,'condición fiscal',1,99),desglose:true,productor:{id:Number(account)}};
}
function maqQuoteView(data){
 const result=Array.isArray(data?.resultado)?data.resultado:null;
 if(!result||result.length>150||!maqText(data.id))maqFail(502,'QA_RESPONSE','Mercantil TEST respondió pero no se pudo interpretar la cotización.');
 const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>typeof obj?.[k]==='number'||typeof obj?.[k]==='boolean'||typeof obj?.[k]==='string').map(k=>[k,typeof obj[k]==='string'?maqText(obj[k]):obj[k]]));
 return {id:maqText(data.id),rama:data.rama,localidad:pick(data.localidad,['id','nombre','provincia','codigo_postal']),vehiculo:pick(data.vehiculo,['id','nombre','anio','valor','uso','gnc','infoauto','rastreo']),suma_asegurada:data.suma_asegurada,periodo:data.periodo,cuotas:data.cuotas,pago:pick(data.pago,['tipo_pago','descripcion']),comision:data.comision,bonificacion:data.bonificacion,advertencia:maqText(data.advertencia),fecha_cotizacion:maqText(data.fecha_cotizacion),resultado:result.map(r=>({codigo_producto:r.codigo_producto,producto:maqText(r.producto),texto:maqText(r.texto||r.descripcion),costo:r.costo,franquicia:r.franquicia,error:maqText(r.error),cantidad_cuotas:r.cantidad_cuotas,adicional:pick(r.adicional,['granizo']),inspeccion:{opciones:(r.inspeccion?.opciones||[]).slice(0,20).map(x=>({id:maqText(x.id),descripcion:maqText(x.descripcion)}))}}))};
}
export async function mercantilAutoQaOperation(credentials,account,action,input,state={},options={}){
 account=mqaAccount(account);if(!account)maqFail(400,'QA_ACCOUNT','Revisá el código PAS de Mercantil.');
 const session=await mqaAccessToken(credentials,options),call=(path,method='GET',data)=>maqHttp(path,method,data,credentials,session.token,options);
 const producers=await call('/productores/v1/');
 if(!Array.isArray(producers?.datos)||producers.datos.filter(p=>mqaAccount(p.cuenta)===account).length!==1)maqFail(409,'QA_PAS_MISMATCH','El acceso de TEST no confirmó una única cuenta para este productor.');
 const next={...state,account};let result;
 if(action==='vehicles'){
  const query=maqString(input?.query,'marca o modelo',/^[\p{L}\p{N} .-]{2,80}$/u),year=maqInt(input?.year,'año',1950,new Date().getUTCFullYear()+1);
  const data=await call('/vehiculos/v1/?'+new URLSearchParams({q:query,anio:String(year),tipo:'AUTO',offset:'0',limit:'50'}));
  if(!Array.isArray(data?.datos)||data.datos.length>100)maqFail(502,'QA_RESPONSE','No pudimos interpretar el catálogo de vehículos de TEST.');
  result={datos:data.datos.map(x=>({codigo:x.codigo,infoauto:x.infoauto,nombre:maqText(x.nombre),propulsion:x.propulsion})),cantidad:data.cantidad,total:data.total};
  next.vehicles={year,...result};
 }else if(action==='schemes'){
  const data=await call('/productores/v1/'+account+'/esquemas/auto');maqBoundAccount(data,account);
  if(!Array.isArray(data?.datos)||data.datos.length>1000)maqFail(502,'QA_RESPONSE','No pudimos interpretar los esquemas comerciales de TEST.');
  result={datos:data.datos.map(x=>({esquema:maqText(x.esquema),comision:x.comision,bonificacion:x.bonificacion,recargo:x.recargo,descripcion:maqText(x.descripcion)}))};next.schemes=result.datos;
 }else if(action==='quote'){
  const body=maqQuoteBody(input,account);
  if(!state.vehicles?.datos?.some(v=>v.infoauto===body.vehiculo.infoauto)||state.vehicles.year!==body.vehiculo.anio)maqFail(409,'QA_CATALOG','Buscá primero el vehículo y año en el catálogo TEST.');
  if(!state.schemes?.some(s=>s.comision===body.comision&&s.bonificacion===body.bonificacion))maqFail(409,'QA_SCHEME','Elegí comisión y bonificación entre los esquemas TEST habilitados.');
  const data=await call('/cotizaciones/v2/auto','POST',body);maqBoundAccount(data,account);result=maqQuoteView(data);next.quote=result;next.quoteInput=body;delete next.inspection;delete next.subscription;
 }else if(action==='inspection'){
  if(!state.quote)maqFail(409,'QA_QUOTE','Primero obtené una cotización de TEST.');
  const product=state.quote.resultado.find(x=>x.codigo_producto===input?.codigo_producto&&!x.error);
  if(!product?.inspeccion?.opciones?.some(x=>x.id===input?.opcion&&x.id))maqFail(409,'QA_INSPECTION','Elegí una modalidad de inspección ofrecida por Mercantil para esa cobertura.');
  const body={opcion:maqString(input.opcion,'modalidad',/^[A-Z_0-9]{1,50}$/),dominio:maqString(input.dominio,'patente',/^[A-Z0-9]{6,7}$/),apellido:maqString(input.apellido,'apellido',/^[\p{L} .'-]{1,100}$/u),nombre:maqString(input.nombre,'nombre',/^[\p{L} .'-]{1,100}$/u)};
  const data=await call('/suscripciones/v2/inspecciones/auto/'+encodeURIComponent(state.quote.id),'POST',body);
  const link=new URL(data?.url);if(link.protocol!=='https:'||link.username||link.password)maqFail(502,'QA_RESPONSE','La inspección TEST devolvió un enlace no válido.');
  result={codigo_producto:product.codigo_producto,url:link.href,estado:'enlace_generado',completed:false};next.inspection=result;
 }else if(action==='client'){
  if(!state.quote?.localidad?.id)maqFail(409,'QA_QUOTE','Cotizá primero para confirmar la localidad TEST.');
  const dni=maqInt(input?.dni,'DNI',1,999999999),sexo=maqString(input?.sexo,'sexo registral',/^[MF]$/);
  if(state.holder)maqFail(409,'QA_CLIENT_EXISTS','Este ensayo ya tiene un tomador creado en TEST.');
  const birth=maqString(input?.nacimiento,'fecha de nacimiento',/^\d{4}-\d{2}-\d{2}$/);if(!Number.isFinite(Date.parse(birth+'T00:00:00Z'))||new Date(birth+'T00:00:00Z').toISOString().slice(0,10)!==birth)maqFail(400,'QA_FIELD','Revisá la fecha de nacimiento.');
  const body={persona:'FISICA',tipoDocumento:'4',dni,sexo,apellido:maqString(input.apellido,'apellido',/^[\p{L} .'-]{1,100}$/u),nombre:maqString(input.nombre,'nombre',/^[\p{L} .'-]{1,100}$/u),nacimiento:birth,distribucionDigital:false,localidad:{id:state.quote.localidad.id,postal:state.quote.localidad.codigo_postal,nombre:state.quote.localidad.nombre,provincia:state.quote.localidad.provincia},calle:maqString(input.calle,'calle',/^[\p{L}\p{N} .'-]{1,150}$/u),numero:maqString(input.numero,'número de domicilio',/^[\p{L}\p{N} -]{1,20}$/u),departamento:maqText(input.departamento||''),iva:{inscripcion:{id:5,nombre:'consumidor final'},retencion:false,percepcion:false}};
  for(const field of ['cuil','cuit'])if(input[field]!==undefined)body[field]=maqInt(input[field],field,10000000000,99999999999);
  const data=await call('/clientes/v1/','POST',body);
  if(!maqText(data?.id)||Number(data.dni)!==dni||data.sexo!==sexo)maqFail(502,'QA_RESPONSE','El alta de tomador TEST no devolvió una identidad coincidente.');
  result={id:maqText(data.id),nombre:maqText(data.nombre),apellido:maqText(data.apellido),created:true};next.holder={...result,dni,sexo};
 }else if(action==='subscribe'){
  if(!state.quote)maqFail(409,'QA_QUOTE','Primero obtené una cotización de TEST.');
  const product=state.quote.resultado.find(x=>x.codigo_producto===input?.codigo_producto&&!x.error);
  if(!product)maqFail(409,'QA_PRODUCT','Elegí una cobertura válida de esta cotización TEST.');
  if(state.subscription)maqFail(409,'QA_ALREADY_SENT','Esta cotización ya tiene una suscripción TEST. Consultá su estado.');
  if(state.holder&&(state.holder.dni!==input?.tomador?.dni||state.holder.sexo!==input?.tomador?.sexo))maqFail(409,'QA_CLIENT_MISMATCH','El tomador no coincide con el creado para este ensayo TEST.');
  // The documented CONVENIO example requires no bank/card data. No debit is created here.
  const body={codigo_producto:product.codigo_producto,pago:{tipoPago:'CONVENIO'},tomador:{dni:maqInt(input?.tomador?.dni,'DNI',1,999999999),sexo:maqString(input?.tomador?.sexo,'sexo registral',/^[MF]$/)},vehiculo:{dominio:maqString(input?.vehiculo?.dominio,'patente',/^[A-Z0-9]{6,7}$/),chasis:maqString(input?.vehiculo?.chasis,'chasis',/^[A-Z0-9]{8,30}$/),motor:maqString(input?.vehiculo?.motor,'motor',/^[A-Z0-9]{4,30}$/)}};
  const data=await call('/suscripciones/v2/auto/'+encodeURIComponent(state.quote.id),'POST',body);maqBoundAccount(data,account);
  if(!maqText(data?.solicitud)&&!maqText(data?.poliza))maqFail(502,'QA_RESPONSE','Mercantil TEST no confirmó un número de solicitud ni de póliza.');
  result={solicitud:maqText(data.solicitud),poliza:maqText(data.poliza),estado_solicitud:maqText(data.estado_solicitud?.descripcion??data.estado_solicitud),codigo_estado:maqText(data.estado_solicitud?.codigo),fecha_solicitud:maqText(data.fecha_solicitud),fecha_vigencia:maqText(data.fecha_vigencia),issued:!!maqText(data.poliza)&&Number(data.poliza)>0&&data.estado_solicitud?.codigo==='E'};next.subscription=result;
 }else if(action==='requests'){
  const data=await call('/solicitudes/v1/?'+new URLSearchParams({accion:'ASEGURAR',productor:account}));
  // Only the current QA quote/subscription is exposed, never the whole copied portfolio.
  const rows=Array.isArray(data?.items)?data.items:[];
  const id=next.subscription?.solicitud;result={total:data.total,cantidad:data.cantidad,coincidencias:id?rows.filter(x=>String(x.referencia??x.solicitud??x.id)===id).map(x=>({solicitud:maqText(x.referencia??x.solicitud??x.id),poliza:maqText(x.poliza),estado:maqText(x.estado?.descripcion??x.estado??x.estado_solicitud)})):[]};
 }else maqFail(400,'QA_ACTION','Elegí una operación de Automotores TEST.');
 return {environment:'qa',productionReady:false,action,result,state:next};
}
export async function mercantilAutoQaApi(req,env,u,id,{json,fail,first,run,audit,body,rate,current}){
 if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Abrí el espacio del productor para ensayar.');
 const row=await first(env,'SELECT * FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);
 if(!row||row.company_id!=='mercantil')fail(404,'NOT_FOUND','No encontramos Mercantil en este espacio.');
 const scope=`connection:${u.tenant_id}:${u.id}:mercantil:`,payload=await unseal(env,row.encrypted_payload,scope+row.version),state=payload.mercantilAutoQa||{};
 const view=s=>({environment:'qa',productionReady:false,quote:s.quote||null,inspection:s.inspection||null,subscription:s.subscription||null,holder:s.holder?{id:s.holder.id,nombre:s.holder.nombre,apellido:s.holder.apellido}:null,vehicles:s.vehicles||null,schemes:s.schemes||null,operation:s.operation||null,unresolved:s.unresolved||null,lastError:s.lastError||null});
 if(req.method==='GET')return json({connectionVersion:row.version,...view(state)});
 if(req.method!=='POST')fail(405,'METHOD','Usá el formulario TEST.');
 const b=await body(req);
 if(b?.authorized!==true||b?.environment!=='qa'||!row.authorized||row.status!=='qa_auth_verified')fail(400,'QA_AUTH','Confirmá el ensayo TEST con un acceso QA ya validado.');
 if(b.expectedVersion!==row.version)fail(409,'VERSION','La configuración cambió. Volvé a abrir la ficha.');
 if(!['vehicles','schemes','quote','inspection','client','subscribe','requests'].includes(b.action))fail(400,'QA_ACTION','Elegí una operación de Automotores TEST.');
 if(state.account&&state.account!==mqaAccount(payload.pasCode))fail(409,'QA_ACCOUNT','El productor cambió desde el ensayo anterior. Requiere una nueva revisión.');
 const unresolved=state.unresolved||(state.operation?.status==='pending'||state.operation?.status==='uncertain'?state.operation:null);
 if(unresolved&&['quote','inspection','client','subscribe'].includes(b.action))fail(409,'QA_UNCERTAIN','Hay una operación sin resultado confirmado. Revisá el estado en Mercantil antes de repetirla.');
 const credentials=mercantilQaCredentials({apiUsername:companyAccessState(payload).api.username,apiPassword:companyAccessState(payload).api.password,subscriptionKey:companyAccessState(payload).api.subscriptionKey});
 await rate(env,'mercantil-auto-qa:'+u.id,30,15*60*1000);
 const active=await current(req,env);if(active.id!==u.id||active.tenant_id!==u.tenant_id||active.role!=='producer')fail(403,'PRODUCER_ONLY','Los permisos cambiaron antes del ensayo.');
 const guard=companySessionGuard(active),operation={id:opaque(12),action:b.action,status:'pending',startedAt:NOW()},reserved={...state,operation,lastError:null,...(unresolved?{unresolved}:{})};
 const encrypted=await seal(env,{...payload,mercantilAutoQa:reserved},scope+(row.version+1));
 const claimed=await run(env,'UPDATE pilot_connections SET encrypted_payload=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND producer_id=? AND version=? AND authorized=1 AND '+guard.sql,encrypted,NOW(),id,u.tenant_id,u.id,row.version,...guard.values);
 if(claimed.meta.changes!==1)fail(409,'VERSION','Otro proceso cambió el acceso. No se envió la operación.');
 let result,error;
 try{result=await mercantilAutoQaOperation(credentials,payload.pasCode,b.action,b.input,reserved);}catch(e){error=e instanceof MercantilQaError?e:new MercantilQaError(502,'QA_OUTCOME_UNKNOWN','El resultado TEST requiere revisión antes de repetir la operación.');if(['quote','inspection','client','subscribe'].includes(b.action)&&['QA_RESPONSE','QA_PAS_MISMATCH'].includes(error.code))error=new MercantilQaError(502,'QA_OUTCOME_UNKNOWN',error.message+' Revisá el estado antes de repetir el alta.');}
 const finalState=result?.state||reserved;finalState.operation={...operation,status:error?(error.code==='QA_OUTCOME_UNKNOWN'?'uncertain':'rejected'):'completed',finishedAt:NOW()};
 if(error?.code==='QA_OUTCOME_UNKNOWN'&&['quote','inspection','client','subscribe'].includes(b.action))finalState.unresolved=finalState.operation;
 if(error)finalState.lastError={code:error.code,message:error.message};
 const live=await current(req,env);if(live.id!==u.id||live.tenant_id!==u.tenant_id||live.role!=='producer')fail(403,'PRODUCER_ONLY','La sesión cambió durante el ensayo.');
 const finalEncrypted=await seal(env,{...payload,mercantilAutoQa:finalState},scope+(row.version+2)),finalGuard=companySessionGuard(live);
 const saved=await run(env,'UPDATE pilot_connections SET encrypted_payload=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND producer_id=? AND version=? AND authorized=1 AND '+finalGuard.sql,finalEncrypted,NOW(),id,u.tenant_id,u.id,row.version+1,...finalGuard.values);
 if(saved.meta.changes!==1)fail(409,'QA_UNCERTAIN','El resultado no pudo guardarse porque cambió el acceso. Revisá Mercantil antes de repetir el alta.');
 await audit(env,u,'connection.mercantil_auto_qa_'+b.action+(error?'_rejected':''),id);
 return json({connectionVersion:row.version+2,...view(finalState),...(result?{action:b.action,result:result.result}:{error:error.code,message:error.message})},error?error.status:200);
}
