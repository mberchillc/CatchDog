import { opaque,digest,equal,passwordHash,passwordValid,seal,unseal,newTotpSecret,verifyTotp,NOW } from './security.js';
const COOKIE='__Host-turi_session';
const SESSION_MS=60*60*1000,IDLE_MS=15*60*1000;
export class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(status,code,message)=>{throw new HttpError(status,code,message)};
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const stmt=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const first=async(env,sql,...v)=>stmt(env,sql,...v).first();
const all=async(env,sql,...v)=>(await stmt(env,sql,...v).all()).results;
const run=async(env,sql,...v)=>stmt(env,sql,...v).run();
const audit=(env,u,action,record='')=>run(env,'INSERT INTO pilot_audit (id,tenant_id,actor_id,action,record_id,created_at) VALUES (?,?,?,?,?,?)',opaque(16),u.tenant_id||'TURI',u.id,action,record,NOW());
const userView=u=>({id:u.id,username:u.username,name:u.name,role:u.role,tenantId:u.tenant_id,mfaEnabled:!!u.mfa_enabled});
const cookie=(token,maxAge)=>`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const ready=env=>!!env.DB&&!!env.TURI_AUTH_PEPPER&&!!env.TURI_VAULT_KEY;
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON_REQUIRED','Usá un formulario de la plataforma.');const reader=req.body?.getReader();if(!reader)fail(400,'BODY_REQUIRED','Faltan datos.');let total=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>24576){await reader.cancel();fail(413,'BODY_LIMIT','El formulario es demasiado grande.')}chunks.push(value)}const bytes=new Uint8Array(total);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.byteLength}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail(400,'JSON_INVALID','No pudimos leer el formulario.')}}
async function rate(env,key,max=8,period=15*60*1000){const bucket=Math.floor(NOW()/period);const k=digest(env.TURI_AUTH_PEPPER+'|'+key+'|'+bucket);const r=await stmt(env,'INSERT INTO pilot_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,(bucket+1)*period).first();if(r.count>max)fail(429,'RATE_LIMIT','Demasiados intentos. Esperá unos minutos y volvé a intentar.');}
async function current(req,env,mfa=true){const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||token.length>128)fail(401,'SIGN_IN','Ingresá con tu usuario y contraseña.');const s=await first(env,'SELECT s.*,u.username,u.name,u.role,u.tenant_id,u.mfa_enabled,u.disabled FROM pilot_sessions s JOIN pilot_users u ON u.id=s.user_id WHERE s.id=?',digest(token));if(!s||s.disabled||s.expires_at<NOW()||s.last_seen<NOW()-IDLE_MS)fail(401,'SIGN_IN','Tu sesión terminó. Volvé a ingresar.');if(mfa&&(!s.mfa||!s.mfa_enabled))fail(403,'MFA_REQUIRED','Completá la verificación en dos pasos.');if(req.method!=='GET'&&(!equal(s.csrf,req.headers.get('x-turi-csrf')||'')))fail(403,'CSRF','Actualizá la página para continuar.');await run(env,'UPDATE pilot_sessions SET last_seen=? WHERE id=?',NOW(),s.id);return {...s,session_id:s.id,id:s.user_id};}
async function session(env,u,mfa){const token=opaque(),csrf=opaque();await run(env,'INSERT INTO pilot_sessions (id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,?,?,?)',digest(token),u.id,csrf,mfa?1:0,NOW()+(mfa?SESSION_MS:10*60*1000),NOW());return {token,csrf};}
function onlyProducer(u){if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Los accesos pertenecen al productor. El administrador puede supervisar su estado.');}
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
async function verifyFactor(env,u,code){
 if(/^\d{6}$/.test(code)){const secret=await unseal(env,u.mfa_secret,'mfa:'+u.id);const step=verifyTotp(secret,code,u.last_totp_step);if(step===null)return false;const r=await run(env,'UPDATE pilot_users SET last_totp_step=? WHERE id=? AND last_totp_step<?',step,u.id,step);return r.meta.changes===1;}
 const hashes=JSON.parse(u.recovery_hashes);const hash=digest(code);if(!hashes.includes(hash))return false;const remaining=JSON.stringify(hashes.filter(x=>x!==hash));const r=await run(env,'UPDATE pilot_users SET recovery_hashes=? WHERE id=? AND recovery_hashes=?',remaining,u.id,u.recovery_hashes);if(r.meta.changes===1){await audit(env,u,'auth.recovery_used');return true}return false;
}
export async function api(req,env,companies){
 const path=new URL(req.url).pathname;
 if(path==='/api/pilot/status'&&req.method==='GET')return json({stage:'foundation',accounts:ready(env)?'configured':'not_configured',mfaRequired:true,connectionLimit:10,automaticQuotes:false,deadline:'2026-11-13'});
 if(!ready(env))fail(503,'NOT_CONFIGURED','El espacio privado todavía no está habilitado.');
 if(!['GET','POST','DELETE'].includes(req.method))fail(405,'METHOD','Operación no disponible.');
 if(req.method!=='GET'){if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'ORIGIN','Abrí el formulario desde Turi Gestión.');}
 const ip=req.headers.get('cf-connecting-ip')||'unknown';
 if(path==='/api/pilot/auth/activate'&&req.method==='POST'){
  await rate(env,'activate-ip:'+ip,12);const b=await body(req);const username=clean(b.username,40).toLowerCase();const invites=JSON.parse(env.TURI_INVITATIONS||'[]');const invite=invites.find(i=>i.username===username&&i.expiresAt>NOW()&&equal(i.tokenHash,digest(String(b.token||''))));
  if(!invite)fail(403,'INVITE_INVALID','El enlace de activación no es válido o venció.');if(await first(env,'SELECT id FROM pilot_users WHERE username=?',username))fail(409,'ALREADY_ACTIVATED','La cuenta ya está activada. Ingresá con tu contraseña.');
  let hash;try{hash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}
  const secret=newTotpSecret(),u={id:invite.id,username,name:invite.name,role:invite.role,tenant_id:invite.tenantId||'TURI',mfa_enabled:0};
  const sealed=await seal(env,secret,'mfa:'+u.id);await run(env,'INSERT INTO pilot_users (id,username,name,role,tenant_id,password_hash,mfa_secret,mfa_enabled,recovery_hashes,last_totp_step,disabled,created_at) VALUES (?,?,?,?,?,?,?,0,?,-1,0,?)',u.id,username,u.name,u.role,u.tenant_id,hash,sealed,'[]',NOW());await audit(env,u,'auth.activated');const s=await session(env,u,false);return json({user:userView(u),csrf:s.csrf,requiresMfaSetup:true},201,{'Set-Cookie':cookie(s.token,600)});
 }
 if(path==='/api/pilot/auth/login'&&req.method==='POST'){
  const b=await body(req),username=clean(b.username,40).toLowerCase();await rate(env,'login-ip:'+ip,30);await rate(env,'login-user:'+username,8);
  const u=await first(env,'SELECT * FROM pilot_users WHERE username=?',username);const dummy='scrypt$16384$8$5$0000000000000000000000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';const valid=passwordValid(b.password,u?.password_hash||dummy,env.TURI_AUTH_PEPPER);
  if(!u||!valid||u.disabled)fail(401,'LOGIN_INVALID','Revisá el usuario, la contraseña y el código de verificación.');
  if(u.mfa_enabled&&!(await verifyFactor(env,u,clean(b.code,80))))fail(401,'LOGIN_INVALID','Revisá el usuario, la contraseña y el código de verificación.');
  const s=await session(env,u,!!u.mfa_enabled);await audit(env,u,'auth.login');return json({user:userView(u),csrf:s.csrf,requiresMfaSetup:!u.mfa_enabled},200,{'Set-Cookie':cookie(s.token,u.mfa_enabled?3600:600)});
 }
 if(path==='/api/pilot/auth/me'&&req.method==='GET'){const u=await current(req,env,false);return json({user:userView(u),csrf:u.csrf,requiresMfaSetup:!u.mfa_enabled});}
 if(path==='/api/pilot/auth/mfa/setup'&&req.method==='GET'){
  const u=await current(req,env,false);if(u.mfa_enabled)fail(409,'MFA_ENABLED','La verificación en dos pasos ya está activa.');const row=await first(env,'SELECT mfa_secret FROM pilot_users WHERE id=?',u.id);const secret=await unseal(env,row.mfa_secret,'mfa:'+u.id);return json({secret,uri:'otpauth://totp/'+encodeURIComponent('Turi Gestión:'+u.username)+'?secret='+secret+'&issuer=Turi%20Gesti%C3%B3n&algorithm=SHA1&digits=6&period=30'});
 }
 if(path==='/api/pilot/auth/mfa/enable'&&req.method==='POST'){
  const u=await current(req,env,false);await rate(env,'mfa:'+u.id,8);if(u.mfa_enabled)fail(409,'MFA_ENABLED','La verificación en dos pasos ya está activa.');const b=await body(req);const row=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);const secret=await unseal(env,row.mfa_secret,'mfa:'+u.id),step=verifyTotp(secret,clean(b.code,6));if(step===null)fail(400,'MFA_INVALID','El código no coincide. Revisá la hora del teléfono.');const recoveryCodes=Array.from({length:8},()=>opaque(16));const changed=await run(env,'UPDATE pilot_users SET mfa_enabled=1,last_totp_step=?,recovery_hashes=? WHERE id=? AND mfa_enabled=0',step,JSON.stringify(recoveryCodes.map(digest)),u.id);if(changed.meta.changes!==1)fail(409,'MFA_ENABLED','Ya se activó la verificación. Volvé a ingresar.');await run(env,'DELETE FROM pilot_sessions WHERE user_id=?',u.id);const s=await session(env,{id:u.id},true);await audit(env,u,'auth.mfa_enabled');return json({recoveryCodes,csrf:s.csrf,user:{...userView(u),mfaEnabled:true}},200,{'Set-Cookie':cookie(s.token,3600)});
 }
 const u=await current(req,env);
 if(path==='/api/pilot/auth/logout'&&req.method==='POST'){await run(env,'DELETE FROM pilot_sessions WHERE id=?',u.session_id);return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 if(path==='/api/pilot/companies'&&req.method==='GET')return json({companies:companies.map(c=>({id:c.id,name:c.name,portal:c.portal})),limit:10});
 if(path==='/api/pilot/connections'&&req.method==='GET'){
  onlyProducer(u);const rows=await all(env,'SELECT id,company_id,method,status,version,authorized,created_at,updated_at FROM pilot_connections WHERE tenant_id=? AND producer_id=? ORDER BY created_at',u.tenant_id,u.id);return json({connections:rows,limit:10});
 }
 if(path==='/api/pilot/connections'&&req.method==='POST'){
  onlyProducer(u);await rate(env,'vault:'+u.id,30);const b=await body(req);if(b.method!=='pas_only'&&env.TURI_ENABLE_PORTAL_SECRETS!=='1')fail(409,'CONNECTOR_NOT_ENABLED','Primero validaremos el conector de esta compañía. Por ahora registrá sólo tu código PAS.');if(!companies.some(c=>c.id===b.companyId))fail(400,'COMPANY','Elegí una compañía del listado.');if(!['pas_only','portal','api_key'].includes(b.method))fail(400,'METHOD','Elegí el tipo de acceso.');const pas=clean(b.pasCode,120),username=clean(b.portalUser,160),password=typeof b.portalPassword==='string'?b.portalPassword.slice(0,512):'',apiKey=typeof b.apiKey==='string'?b.apiKey.slice(0,4096):'';
  if(!pas||b.authorized!==true||(b.method==='portal'&&(!username||!password))||(b.method==='api_key'&&!apiKey))fail(400,'REQUIRED','Completá los datos del acceso y confirmá tu autorización.');
  const existing=await first(env,'SELECT id,version FROM pilot_connections WHERE tenant_id=? AND producer_id=? AND company_id=?',u.tenant_id,u.id,b.companyId);const id=existing?.id||opaque(16);const version=(existing?.version||0)+1;const payload=await seal(env,{pasCode:pas,portalUser:username,portalPassword:password,apiKey},`connection:${u.tenant_id}:${u.id}:${b.companyId}:${version}`);
  if(existing){const expected=Number(b.expectedVersion);if(expected!==existing.version)fail(409,'VERSION','Este acceso cambió. Actualizá la lista antes de reemplazarlo.');const r=await run(env,'UPDATE pilot_connections SET method=?,encrypted_payload=?,version=?,authorized=1,status=?,updated_at=? WHERE id=? AND producer_id=? AND tenant_id=? AND version=?',b.method,payload,version,'registered',NOW(),id,u.id,u.tenant_id,expected);if(r.meta.changes!==1)fail(409,'VERSION','Este acceso cambió. Actualizá la lista.');}
  else{const r=await run(env,'INSERT INTO pilot_connections (id,tenant_id,producer_id,company_id,method,encrypted_payload,status,version,authorized,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT count(*) FROM pilot_connections WHERE producer_id=? AND tenant_id=?)<10',id,u.tenant_id,u.id,b.companyId,b.method,payload,'registered',version,NOW(),NOW(),u.id,u.tenant_id);if(r.meta.changes!==1)fail(409,'LIMIT','Ya tenés 10 compañías registradas. Podés reemplazar o quitar una.');}
  await audit(env,u,existing?'connection.replaced':'connection.created',id);return json({id,status:'registered',message:'Acceso guardado. La integración con esta compañía está pendiente de validación.'},existing?200:201);
 }
 if(path.startsWith('/api/pilot/connections/')&&req.method==='DELETE'){
  onlyProducer(u);const id=path.split('/').pop();const r=await run(env,'DELETE FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);if(r.meta.changes!==1)fail(404,'NOT_FOUND','No encontramos ese acceso.');await audit(env,u,'connection.deleted',id);return json({ok:true});
 }
 if(path==='/api/pilot/audit'&&req.method==='GET'){const rows=u.role==='superadmin'?await all(env,'SELECT action,actor_id,record_id,created_at FROM pilot_audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',u.tenant_id):await all(env,'SELECT action,actor_id,record_id,created_at FROM pilot_audit WHERE tenant_id=? AND actor_id=? ORDER BY created_at DESC LIMIT 100',u.tenant_id,u.id);return json({events:rows});}
 if(path==='/api/pilot/admin/overview'&&req.method==='GET'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Esta sección pertenece al superadministrador.');const users=await all(env,'SELECT id,username,name,role,mfa_enabled,disabled,created_at FROM pilot_users WHERE tenant_id=?',u.tenant_id);const connections=await all(env,'SELECT id,producer_id,company_id,method,status,version,authorized,updated_at FROM pilot_connections WHERE tenant_id=?',u.tenant_id);return json({users,connections,deadline:'2026-11-13',automaticQuotes:false});
 }
 if(path==='/api/pilot/admin/revoke-sessions'&&req.method==='POST'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Acceso de superadministrador requerido.');const b=await body(req);const target=await first(env,'SELECT id FROM pilot_users WHERE id=? AND tenant_id=?',clean(b.userId,80),u.tenant_id);if(!target||target.id===u.id)fail(400,'USER','Elegí una cuenta de productor.');await run(env,'DELETE FROM pilot_sessions WHERE user_id=?',target.id);await audit(env,u,'admin.sessions_revoked',target.id);return json({ok:true});
 }
 fail(404,'NOT_FOUND','La operación no está disponible.');
}
