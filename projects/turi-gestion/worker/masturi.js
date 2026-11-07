import { mqValidateRisk,mqValidateDetails,mqCommercial,mqOrientation,MQ_SOURCE_CATALOG } from './multiquote.js';
import { seal,unseal,opaque,NOW,codeHash } from './security.js';

const MST_DEFAULT_ORIGINS=['https://turi.com.ar','https://www.turi.com.ar'];
const mstClean=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const mstEmail=value=>{const normalized=mstClean(value,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)?normalized:''};
const mstPhone=value=>{const normalized=mstClean(value,40).replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'');return /^\+?\d{8,15}$/.test(normalized)?normalized:''};
const mstAllowedOrigin=(req,env)=>{const origin=req.headers.get('origin')||'';const same=new URL(req.url).origin;const configured=String(env.TURI_MASTURI_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);return [same,...MST_DEFAULT_ORIGINS,...configured].includes(origin)?origin:''};
const mstCors=(origin)=>({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'});
const mstResponse=(json,value,status=200,origin='')=>json(value,status,origin?mstCors(origin):{});
const MST_LABELS={
 auto:'Auto',camioneta:'Camioneta',moto:'Moto',casa:'Hogar',comercio:'Comercio',caucion:'Caución',accidentes_personales:'Accidentes personales',responsabilidad_civil:'Responsabilidad civil',vida:'Vida',salud:'Salud',
 embarcacion:'Embarcaciones',bicicleta:'Bicicletas',monopatin:'Monopatines eléctricos',flota:'Flotas de vehículos',maquinaria_agricola:'Maquinaria agrícola',maquinaria:'Equipos y maquinaria',mercaderias_transito:'Transporte de mercaderías',incendio:'Incendio',consorcio:'Consorcios',robo:'Robo',todo_riesgo_operativo:'Todo riesgo operativo',seguro_tecnico:'Seguro técnico',art:'Riesgos del trabajo ART',ap_gimnasios:'Accidentes personales para gimnasios',ap_eventos:'Accidentes personales para eventos',rc_profesional:'Responsabilidad civil profesional',rc_comercio:'Responsabilidad civil para comercios',agro_granizo:'Agro y granizo',mascotas:'Mascotas',construccion_montaje:'Construcción y montaje',otro:'Otro'
};
const MST_PRODUCTS=new Set(Object.keys(MST_LABELS));
const MST_PRODUCT_FIELDS=new Set(['brand','model','version','year','locality','province','postalCode','usage','coverage','insuredValue','hail','glass','cylinderCapacity','propertyType','relationship','surface','protections','bondType','applicantType','amount','deadline','description','businessName','activity','stockValue','equipmentValue','peopleCount','ageRange','duration','sumInsured','exposure','coverageLimit','territory','claims','birthDate','occupation','smoker','beneficiariesCount','coverageScope','currentCoverage','assetType','vehicleCount','vehicleTypes','goodsType','transportMode','origin','destination','frequency','maximumValue','buildingType','units','floors','amenities','assetDescription','coverageNeed','equipmentType','employees','payroll','eventType','eventDate','attendees','profession','annualRevenue','crop','hectares','campaign','petType','breed','petAge','projectType']);
const MST_LONG_FIELDS=new Set(['description','assetDescription','coverageNeed']);

function mstContactData(input={}){
 const name=mstClean(input.name,100),mail=input.email?mstEmail(input.email):'',mobile=input.phone?mstPhone(input.phone):'',preferred=['whatsapp','email','indistinto'].includes(input.preferred)?input.preferred:'indistinto';
 return {name,email:mail,phone:mobile,preferred};
}
function mstTrackingData(input={}){
 const value=key=>mstClean(input[key],120);
 return {source:value('source'),medium:value('medium'),campaign:value('campaign'),content:value('content'),term:value('term'),landing:value('landing')||'masturi',referrer:mstClean(input.referrer,500)};
}
function mstProductData(product,input={}){
 const out={};
 if(!MST_PRODUCTS.has(product)||!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [key,value] of Object.entries(input))if(MST_PRODUCT_FIELDS.has(key))out[key]=mstClean(value,MST_LONG_FIELDS.has(key)?1000:120);
 return out;
}
function mstAutomotive(product,data){
 if(!['auto','camioneta'].includes(product))return {risk:{},details:{},commercial:{},orientation:null};
 const risk=mqValidateRisk({brand:data.brand,model:data.model,version:data.version,year:data.year,locality:data.locality,province:data.province,postalCode:data.postalCode,usage:data.usage,coverage:data.coverage});
 const details=mqValidateDetails({insuredValue:data.insuredValue,hail:data.hail,glass:data.glass,referenceSegment:product==='camioneta'?'high':''});
 const commercial=mqCommercial({});
 return {risk,details,commercial,orientation:mqOrientation(risk,details,commercial)};
}
async function mstExistingLead(env,row){
 try{const payload=await unseal(env,row.payload,'mq:'+row.tenant_id+':'+row.owner_id+':'+row.id);return {id:row.id,productType:payload.productType||'auto',estimate:payload.estimate||null};}
 catch{return {id:row.id,productType:'auto',estimate:null};}
}

export async function masturiApi(req,env,{json,fail,stmt,first,run,body,rate}){
 const origin=mstAllowedOrigin(req,env);
 if(req.method==='OPTIONS'){
  if(!origin)fail(403,'ORIGIN','Abrí el formulario desde Turi.');
  return new Response(null,{status:204,headers:mstCors(origin)});
 }
 if(req.method!=='POST')fail(405,'METHOD','Operación no disponible.');
 if(!origin)fail(403,'ORIGIN','Abrí el formulario desde Turi.');
 const path=new URL(req.url).pathname;
 if(path!=='/api/pilot/public/masturi/submit')fail(404,'NOT_FOUND','La operación no está disponible.');
 const ip=req.headers.get('cf-connecting-ip')||'unknown';await rate(env,'masturi-ip:'+ip,10,15*60*1000);
 const input=await body(req,16384);
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'FIELD','Revisá la consulta.');
 if(mstClean(input.website,200))return mstResponse(json,{ok:true,received:true},202,origin);
 if(input.consent!==true)fail(400,'CONSENT','Necesitamos tu autorización para enviar la consulta al productor.');
 const product=mstClean(input.productType,40);if(!MST_PRODUCTS.has(product))fail(400,'PRODUCT','Elegí qué querés asegurar.');
 const contact=mstContactData(input.contact);if(contact.name.length<2)fail(400,'CONTACT','Ingresá tu nombre.');if(!contact.email&&!contact.phone)fail(400,'CONTACT','Ingresá un teléfono o correo válido.');
 const requestKey=mstClean(input.requestKey,80);if(!/^[A-Za-z0-9_-]{16,80}$/.test(requestKey))fail(400,'REQUEST_KEY','Actualizá la página para iniciar la consulta.');
 const ownerUsername=mstClean(env.TURI_MASTURI_OWNER_USERNAME||'mauro',40).toLowerCase();
 const owner=await first(env,'SELECT id,tenant_id,username,name,disabled FROM pilot_users WHERE username=?',ownerUsername);if(!owner||owner.disabled)fail(503,'OWNER_UNAVAILABLE','La recepción de consultas está temporalmente pausada.');
 const duplicate=await first(env,'SELECT * FROM work_quote_intakes WHERE tenant_id=? AND owner_id=? AND request_key=?',owner.tenant_id,owner.id,requestKey);if(duplicate)return mstResponse(json,{ok:true,lead:await mstExistingLead(env,duplicate),message:'Tu consulta ya estaba registrada.'},200,origin);
 const data=mstProductData(product,input.product),tracking=mstTrackingData(input.tracking),auto=mstAutomotive(product,data),stamp=NOW(),id=opaque(16);
 const description=mstClean(input.notes,1000)||[MST_LABELS[product],data.brand,data.model,data.year,data.locality].filter(Boolean).join(' · ');
 const payload={sourceChannel:'masturi',productType:product,productLabel:MST_LABELS[product],description,risk:auto.risk,details:auto.details,commercial:auto.commercial,clientId:'',productData:data,contact,tracking,consent:{accepted:true,acceptedAt:new Date(stamp).toISOString()},estimate:auto.orientation?.estimate||null,sourceCatalogVersion:MQ_SOURCE_CATALOG.version,sourceIds:auto.orientation?.estimate?.sourceIds||[]};
 const fingerprint=codeHash(env,'masturi:'+owner.tenant_id+':'+owner.id,JSON.stringify({product,data,contact,tracking,description}));
 const encrypted=await seal(env,payload,'mq:'+owner.tenant_id+':'+owner.id+':'+id),status=auto.orientation?.estimate?'public_estimate':'public_request';
 const inserted=await run(env,'INSERT OR IGNORE INTO work_quote_intakes(id,tenant_id,owner_id,request_key,request_hash,payload,status,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,1,?,? WHERE (SELECT count(*) FROM work_quote_intakes WHERE tenant_id=?)<500',id,owner.tenant_id,owner.id,requestKey,fingerprint,encrypted,status,stamp,stamp,owner.tenant_id);
 if(inserted.meta.changes!==1)fail(409,'CAPACITY','No pudimos guardar la consulta ahora. Escribinos por WhatsApp y la continuamos personalmente.');
 return mstResponse(json,{ok:true,lead:{id,productType:product,estimate:payload.estimate},message:payload.estimate?'Esta referencia es orientativa y requiere revisión del productor.':'Recibimos tu solicitud. Mauro la revisará personalmente.'},201,origin);
}
