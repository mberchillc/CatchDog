import { opaque,digest,equal,passwordHash,passwordValid,seal,unseal,personalCode,emailCode,normalizeCode,codeHash,NOW } from './security.js';
import { mailReady,deliverCode } from './mail.js';
import { emissionApi } from './emission.js';
import { workspaceApi } from './workspace.js';
import { documentsApi,filesReady } from './documents.js';
const COOKIE='__Host-turi_session';
const RESET_COOKIE='__Host-turi_reset';
const ADMIN_RESET_COOKIE='__Host-turi_admin_reset';
const adminResetCookie=(value,maxAge)=>`${ADMIN_RESET_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const SESSION_MS=60*60*1000,IDLE_MS=15*60*1000;
export class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(status,code,message)=>{throw new HttpError(status,code,message)};
const json=(v,status=200,headers={})=>{const h=new Headers(headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','no-store');return new Response(JSON.stringify(v),{status,headers:h})};
const stmt=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const first=async(env,sql,...v)=>stmt(env,sql,...v).first();
const all=async(env,sql,...v)=>(await stmt(env,sql,...v).all()).results;
const run=async(env,sql,...v)=>stmt(env,sql,...v).run();
const audit=(env,u,action,record='')=>run(env,'INSERT INTO pilot_audit (id,tenant_id,actor_id,action,record_id,created_at) VALUES (?,?,?,?,?,?)',opaque(16),u.tenant_id||'TURI',u.id,action,record,NOW());
const userView=u=>({id:u.id,username:u.username,name:u.name,role:u.role,tenantId:u.tenant_id,codeConfigured:!!u.access_code_hash,email:u.email||'',emailVerified:!!u.email_verified});
const cookie=(token,maxAge)=>`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const resetCookie=(token,maxAge)=>`${RESET_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const readCookie=(req,name)=>req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const credentialVersion=u=>digest(u.password_hash+'|'+(u.access_code_hash||''));
const ready=env=>!!env.DB&&!!env.TURI_AUTH_PEPPER&&!!env.TURI_VAULT_KEY;
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const normalizeEmail=v=>{const s=clean(v,320).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null};
async function body(req,limit=24576){if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON_REQUIRED','Usá un formulario de la plataforma.');const reader=req.body?.getReader();if(!reader)fail(400,'BODY_REQUIRED','Faltan datos.');let total=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();fail(413,'BODY_LIMIT','El formulario es demasiado grande.')}chunks.push(value)}const bytes=new Uint8Array(total);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.byteLength}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail(400,'JSON_INVALID','No pudimos leer el formulario.')}}
async function rate(env,key,max=8,period=15*60*1000){const bucket=Math.floor(NOW()/period);const k=digest(env.TURI_AUTH_PEPPER+'|'+key+'|'+bucket);const r=await stmt(env,'INSERT INTO pilot_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,(bucket+1)*period).first();if(r.count>max)fail(429,'RATE_LIMIT','Demasiados intentos. Esperá unos minutos y volvé a intentar.');}
async function current(req,env,complete=true){const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||token.length>128)fail(401,'SIGN_IN','Ingresá con tu usuario y contraseña.');const s=await first(env,'SELECT s.*,u.username,u.name,u.role,u.tenant_id,u.access_code_hash,u.email,u.email_verified,u.disabled FROM pilot_sessions s JOIN pilot_users u ON u.id=s.user_id WHERE s.id=?',digest(token));if(!s||s.disabled||s.expires_at<NOW()||s.last_seen<NOW()-IDLE_MS)fail(401,'SIGN_IN','Tu sesión terminó. Volvé a ingresar.');const adminPasswordSession=token.startsWith('admin.')&&s.role==='superadmin';if(token.startsWith('admin.')&&!adminPasswordSession)fail(401,'SIGN_IN','Tu sesión terminó. Volvé a ingresar.');if(complete&&(!s.mfa||(!s.access_code_hash&&!adminPasswordSession)))fail(403,'CODE_SETUP_REQUIRED','Confirmá tu código personal para continuar.');if(req.method!=='GET'&&!equal(s.csrf,req.headers.get('x-turi-csrf')||''))fail(403,'CSRF','Actualizá la página para continuar.');await run(env,'UPDATE pilot_sessions SET last_seen=? WHERE id=?',NOW(),s.id);return {...s,adminPasswordSession,session_id:s.id,id:s.user_id};}
async function session(env,u,complete,adminPasswordOnly=false){const token=(adminPasswordOnly?'admin.':'')+opaque(),csrf=opaque();await run(env,'INSERT INTO pilot_sessions (id,user_id,csrf,mfa,expires_at,last_seen) VALUES (?,?,?,?,?,?)',digest(token),u.id,csrf,complete?1:0,NOW()+(complete?SESSION_MS:10*60*1000),NOW());return {token,csrf};}
function onlyProducer(u){if(u.role!=='producer')fail(403,'PRODUCER_ONLY','Los accesos pertenecen al productor. El administrador puede supervisar su estado.');}
async function newChallenge(env,u,kind,email){const id=opaque(24),code=emailCode(),payload=await seal(env,{email,...(kind==='recovery'?{credentialVersion:credentialVersion(u)}:{})},'challenge:'+id);await run(env,'INSERT INTO pilot_auth_challenges (id,user_id,kind,value_hash,payload,attempts,expires_at,created_at) VALUES (?,?,?,?,?,0,?,?)',id,u.id,kind,codeHash(env,'challenge:'+id,code),payload,NOW()+10*60*1000,NOW());try{await deliverCode(env,{id,email,code,kind});await run(env,'UPDATE pilot_auth_challenges SET sent_at=? WHERE id=?',NOW(),id);}catch{await run(env,'UPDATE pilot_auth_challenges SET used_at=? WHERE id=?',NOW(),id);fail(502,'EMAIL_DELIVERY','No pudimos enviar el código. Volvé a intentar en unos minutos.');}return id;}
async function checkChallenge(env,id,code,kind,userId=null){const c=await stmt(env,'UPDATE pilot_auth_challenges SET attempts=attempts+1 WHERE id=? AND kind=? AND used_at IS NULL AND sent_at IS NOT NULL AND expires_at>? AND attempts<5 RETURNING *',clean(id,80),kind,NOW()).first();const normalized=normalizeCode(code);if(!c||(userId&&c.user_id!==userId)||!/^\d{6}$/.test(normalized)||!equal(c.value_hash,codeHash(env,'challenge:'+c.id,normalized)))fail(400,'CODE_INVALID','El código no es válido o venció. Solicitá uno nuevo.');return c;}
async function claimChallenge(env,c,updates,guard=null){const claim=opaque(24);const gates=updates(claim);const result=await env.DB.batch([stmt(env,'UPDATE pilot_auth_challenges SET used_at=?,claim_token=? WHERE id=? AND used_at IS NULL AND expires_at>? AND sent_at IS NOT NULL'+(guard?' AND '+guard.sql:''),NOW(),claim,c.id,NOW(),...(guard?.values||[])),...gates]);if(result[0].meta.changes!==1||result[1].meta.changes!==1)fail(400,'CODE_INVALID','El código no es válido o ya fue utilizado.');}
const recoveryGuard=(u,email)=>({sql:'EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND password_hash=? AND access_code_hash IS ? AND email=? AND email_verified=1 AND disabled=0)',values:[u.id,u.password_hash,u.access_code_hash,email]});
async function recoveryAccount(env,c){let p;try{p=await unseal(env,c.payload,'challenge:'+c.id)}catch{fail(400,'CODE_INVALID','El código no es válido o venció. Solicitá uno nuevo.')}const u=await first(env,'SELECT * FROM pilot_users WHERE id=?',c.user_id);if(!u||u.disabled||!u.email_verified||p.email!==u.email||!equal(p.credentialVersion,credentialVersion(u)))fail(400,'CODE_INVALID','El acceso cambió. Solicitá un código de recuperación nuevo.');return {u,p};}
async function resetState(req,env){const value=readCookie(req,RESET_COOKIE);if(!/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(value))fail(400,'RESET_INVALID','Ingresá primero el código que recibiste por correo.');const [id,token]=value.split('.'),c=await first(env,'SELECT * FROM pilot_auth_challenges WHERE id=? AND kind=? AND used_at IS NULL AND sent_at IS NOT NULL AND expires_at>?',id,'password_reset',NOW());if(!c||!equal(c.value_hash,codeHash(env,'password-reset:'+id,token)))fail(400,'RESET_INVALID','El permiso para crear tu contraseña venció. Solicitá otro código.');return {c,...await recoveryAccount(env,c)};}
const adminResetInvalid=()=>fail(403,'ADMIN_RESET_INVALID','Este permiso venció, ya fue utilizado o tu acceso cambió. Abrí un enlace personal vigente para crear tu contraseña.');
async function adminResetGrant(req,env,b={}){
 const value=readCookie(req,ADMIN_RESET_COOKIE),parts=value.split('.');
 const explicit=Object.hasOwn(b,'token'),token=explicit?(typeof b.token==='string'?b.token:''):(parts.length===2?parts[1]:''),username=explicit?clean(b.username,40).toLowerCase():null;
 const hash=digest(token);let grants=[];try{grants=JSON.parse(env.TURI_ADMIN_PASSWORD_RESET_GRANTS||'[]')}catch{}
 const grant=Array.isArray(grants)&&grants.find(g=>(explicit?g.username===username:g.id===parts[0])&&Number.isFinite(g.expiresAt)&&g.expiresAt>NOW()&&typeof g.id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(g.id)&&typeof g.expectedPasswordHash==='string'&&equal(g.tokenHash,hash));
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!grant)adminResetInvalid();
 const u=await first(env,'SELECT * FROM pilot_users WHERE id=? AND username=? AND tenant_id=?',grant.userId,grant.username,grant.tenantId);
 if(!u||u.disabled||u.role!=='superadmin'||!equal(u.password_hash,grant.expectedPasswordHash))adminResetInvalid();
 const used=await first(env,'SELECT * FROM pilot_auth_challenges WHERE id=?',grant.id);
 if(used&&(used.used_at||used.user_id!==u.id||used.kind!=='owner_admin_password_reset'||!equal(used.value_hash,hash)))adminResetInvalid();
 return {u,grant,hash,token};
}
function producerInvitations(env){try{const values=JSON.parse(env.TURI_PAS_INVITATIONS||'[]');return Array.isArray(values)?values.filter(i=>i&&i.role==='producer'):[]}catch{return []}}

async function pasSignupGrant(env,token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail(403,'INVITE_INVALID','El enlace no es válido, venció o ya fue utilizado. Pedí una invitación nueva a Turi.');
 const invite=await first(env,"SELECT i.* FROM pilot_pas_invitations i JOIN pilot_users a ON a.id=i.created_by AND a.tenant_id=i.tenant_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND a.role='superadmin' AND a.disabled=0",digest(token),NOW());
 if(!invite)fail(403,'INVITE_INVALID','El enlace no es válido, venció o ya fue utilizado. Pedí una invitación nueva a Turi.');return invite;
}

export async function api(req,env,companies){
 const path=new URL(req.url).pathname;
 if(path==='/api/pilot/status'&&req.method==='GET')return json({stage:'workspace',accounts:ready(env)?'configured':'not_configured',accessMode:'personal_code',emailRecoveryAvailable:mailReady(env),fileStorageAvailable:filesReady(env),connectionLimit:15,automaticQuotes:false,deadline:'2026-11-13'});
 if(!ready(env))fail(503,'NOT_CONFIGURED','El espacio privado todavía no está habilitado.');
 if(!['GET','POST','DELETE'].includes(req.method))fail(405,'METHOD','Operación no disponible.');
 if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)fail(403,'ORIGIN','Abrí el formulario desde Turi Gestión.');
 const ip=req.headers.get('cf-connecting-ip')||'unknown';

 if(path.startsWith('/api/pilot/public/emission/'))return emissionApi(req,env,null,companies,{json,fail,stmt,first,all,run,audit,body,rate});
 if(path==='/api/pilot/auth/invitation/prepare'&&req.method==='POST'){
  await rate(env,'invite-prepare-ip:'+ip,30,3600000);const b=await body(req),invite=await pasSignupGrant(env,b.token);
  return json({name:invite.name,expiresAt:invite.expires_at});
 }
 if(path==='/api/pilot/auth/invitation/accept'&&req.method==='POST'){
  await rate(env,'invite-accept-ip:'+ip,12,3600000);const b=await body(req),invite=await pasSignupGrant(env,b.token),username=clean(b.username,40).toLowerCase();
  if(typeof b.username!=='string'||b.username.trim().length>40||!/^[a-z][a-z0-9._-]{2,39}$/.test(username))fail(400,'USERNAME','Elegí un usuario de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
  if(typeof b.passwordConfirmation!=='string'||b.password!==b.passwordConfirmation)fail(400,'PASSWORD_CONFIRMATION','Las contraseñas no coinciden.');
  if(await first(env,'SELECT id FROM pilot_users WHERE username=?',username))fail(409,'USERNAME_IN_USE','Ese usuario no está disponible. Elegí otro.');
  const email=b.email?normalizeEmail(b.email):null;if(b.email&&!email)fail(400,'EMAIL_INVALID','Revisá el correo electrónico.');
  let hash;try{hash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}
  const id='PAS-'+opaque(16),claim=opaque(24),stamp=NOW(),gate='EXISTS (SELECT 1 FROM pilot_pas_invitations WHERE id=? AND claim_token=? AND claimed_user_id=?)';
  const result=await env.DB.batch([
   stmt(env,"UPDATE pilot_pas_invitations SET used_at=?,claim_token=?,claimed_user_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND NOT EXISTS (SELECT 1 FROM pilot_users WHERE username=?) AND EXISTS (SELECT 1 FROM pilot_users WHERE id=pilot_pas_invitations.created_by AND tenant_id=pilot_pas_invitations.tenant_id AND role='superadmin' AND disabled=0)",stamp,claim,id,invite.id,stamp,username),
   stmt(env,'INSERT INTO pilot_users (id,username,name,role,tenant_id,password_hash,mfa_secret,mfa_enabled,recovery_hashes,last_totp_step,disabled,created_at,email,email_verified) SELECT ?,?,?,?,?,?,?,0,?,-1,0,?,?,0 WHERE '+gate,id,username,invite.name,'producer',invite.tenant_id,hash,'','[]',stamp,email,invite.id,claim,id)
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)fail(409,'INVITATION_CHANGED','El enlace ya se usó o el usuario dejó de estar disponible. Volvé a revisar el acceso.');
  const u=await first(env,'SELECT * FROM pilot_users WHERE id=?',id);await audit(env,u,'auth.invitation_accepted',invite.id);const s=await session(env,u,false);
  return json({user:userView(u),csrf:s.csrf,requiresCodeSetup:true},201,{'Set-Cookie':cookie(s.token,600)});
 }
 if(path==='/api/pilot/auth/activate'&&req.method==='POST'){
  await rate(env,'activate-ip:'+ip,12);const b=await body(req);const username=clean(b.username,40).toLowerCase();const invites=[...JSON.parse(env.TURI_INVITATIONS||'[]'),...producerInvitations(env)];const invite=invites.find(i=>i.username===username&&i.expiresAt>NOW()&&equal(i.tokenHash,digest(String(b.token||''))));
  if(!invite)fail(403,'INVITE_INVALID','El enlace de activación no es válido o venció.');if(await first(env,'SELECT id FROM pilot_users WHERE username=?',username))fail(409,'ALREADY_ACTIVATED','La cuenta ya está creada. Ingresá con tu usuario y contraseña.');
  let hash;try{hash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}
  const u={id:invite.id,username,name:invite.name,role:invite.role,tenant_id:invite.tenantId||'TURI'};
  await run(env,'INSERT INTO pilot_users (id,username,name,role,tenant_id,password_hash,mfa_secret,mfa_enabled,recovery_hashes,last_totp_step,disabled,created_at) VALUES (?,?,?,?,?,?,?,0,?,-1,0,?)',u.id,username,u.name,u.role,u.tenant_id,hash,'','[]',NOW());await audit(env,u,'auth.activated');const s=await session(env,u,false);return json({user:userView(u),csrf:s.csrf,requiresCodeSetup:true},201,{'Set-Cookie':cookie(s.token,600)});
 }
 if((path==='/api/pilot/auth/login'||path==='/api/pilot/auth/admin/login')&&req.method==='POST'){
  const adminEntry=path==='/api/pilot/auth/admin/login';
  const b=await body(req),username=clean(b.username,40).toLowerCase();await rate(env,'login-ip:'+ip,30);await rate(env,'login-user:'+username,8);
  const u=await first(env,'SELECT * FROM pilot_users WHERE username=?',username);const dummy='scrypt$16384$8$5$0000000000000000000000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';const valid=passwordValid(b.password,u?.password_hash||dummy,env.TURI_AUTH_PEPPER);const code=normalizeCode(b.code);
  if(!u||!valid||u.disabled||(adminEntry&&u.role!=='superadmin'))fail(401,'LOGIN_INVALID',adminEntry?'Revisá tu usuario y contraseña.':'Revisá tu usuario, contraseña y código personal.');
  const adminPasswordOnly=u.role==='superadmin';
  if(!adminPasswordOnly&&u.access_code_hash&&!code)fail(401,'CODE_REQUIRED','Tu usuario y contraseña son correctos. El código personal ya está activado y es obligatorio. Si no lo conservás, necesitás recuperarlo.');
  if(!adminPasswordOnly&&u.access_code_hash&&(!/^\d{8}$/.test(code)||!equal(u.access_code_hash,codeHash(env,'access:'+u.id,code))))fail(401,'LOGIN_INVALID','Revisá tu usuario, contraseña y código personal.');
  const complete=adminPasswordOnly||!!u.access_code_hash;const s=await session(env,u,complete,adminPasswordOnly);await audit(env,u,adminPasswordOnly?'auth.admin_login':'auth.login');return json({user:userView(u),csrf:s.csrf,requiresCodeSetup:!complete},200,{'Set-Cookie':cookie(s.token,complete?3600:600)});
 }
 if(path==='/api/pilot/auth/admin/owner-reset/prepare'&&req.method==='POST'){
  await rate(env,'owner-admin-prepare-ip:'+ip,20);const b=await body(req),state=await adminResetGrant(req,env,b);
  return json({username:state.u.username,expiresAt:state.grant.expiresAt},200,{'Set-Cookie':adminResetCookie(state.grant.id+'.'+state.token,Math.max(1,Math.floor((state.grant.expiresAt-NOW())/1000)))});
 }
 if(path==='/api/pilot/auth/admin/owner-reset/state'&&req.method==='GET'){
  const state=await adminResetGrant(req,env);return json({username:state.u.username,expiresAt:state.grant.expiresAt});
 }
 if(path==='/api/pilot/auth/admin/owner-reset'&&req.method==='POST'){
  const b=await body(req);await rate(env,'owner-admin-reset-ip:'+ip,12);const suppliedUser=clean(b.username,40).toLowerCase();if(suppliedUser)await rate(env,'owner-admin-reset-user:'+suppliedUser,8);
  const {u,grant,hash}=await adminResetGrant(req,env,b);const username=u.username;if(!suppliedUser)await rate(env,'owner-admin-reset-user:'+username,8);
  let nextHash;try{nextHash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}
  await run(env,'INSERT OR IGNORE INTO pilot_auth_challenges (id,user_id,kind,value_hash,attempts,expires_at,created_at) VALUES (?,?,?,?,0,?,?)',grant.id,u.id,'owner_admin_password_reset',hash,grant.expiresAt,NOW());
  const claim=opaque(24),gate='EXISTS (SELECT 1 FROM pilot_auth_challenges WHERE id=? AND user_id=? AND claim_token=?)';
  const result=await env.DB.batch([
   stmt(env,'UPDATE pilot_auth_challenges SET used_at=?,claim_token=? WHERE id=? AND user_id=? AND kind=? AND value_hash=? AND used_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND username=? AND tenant_id=? AND role=? AND password_hash=? AND disabled=0)',NOW(),claim,grant.id,u.id,'owner_admin_password_reset',hash,NOW(),u.id,username,u.tenant_id,'superadmin',u.password_hash),
   stmt(env,'UPDATE pilot_users SET password_hash=? WHERE id=? AND tenant_id=? AND role=? AND password_hash=? AND disabled=0 AND '+gate,nextHash,u.id,u.tenant_id,'superadmin',u.password_hash,grant.id,u.id,claim),
   stmt(env,'DELETE FROM pilot_sessions WHERE user_id=? AND '+gate,u.id,grant.id,u.id,claim),
   stmt(env,'UPDATE pilot_auth_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL AND '+gate,NOW(),u.id,grant.id,u.id,claim)
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)adminResetInvalid();
  await audit(env,u,'auth.admin_password_set_by_owner');const s=await session(env,u,true,true);return json({user:userView(u),csrf:s.csrf,requiresCodeSetup:false},200,{'Set-Cookie':cookie(s.token,3600)});
 }
 if(path==='/api/pilot/auth/me'&&req.method==='GET'){const u=await current(req,env,false);return json({user:userView(u),csrf:u.csrf,requiresCodeSetup:!u.access_code_hash&&!u.adminPasswordSession,emailRecoveryAvailable:mailReady(env)});}
 if(path==='/api/pilot/auth/code/owner-recovery'&&req.method==='POST'){
  const b=await body(req),username=clean(b.username,40).toLowerCase();await rate(env,'owner-code-recover-ip:'+ip,12);await rate(env,'owner-code-recover-user:'+username,8);
  const token=typeof b.token==='string'?b.token:'',hash=digest(token);let grants=[];try{grants=JSON.parse(env.TURI_CODE_RECOVERY_GRANTS||'[]')}catch{}
  const grant=Array.isArray(grants)&&grants.find(g=>g.username===username&&g.expiresAt>NOW()&&typeof g.id==='string'&&g.id.length<=80&&equal(g.tokenHash,hash));
  if(!grant||token.length<32||token.length>128)fail(403,'RECOVERY_LINK_INVALID','El enlace de recuperación no es válido o ya venció. Solicitá uno nuevo.');
  const u=await first(env,'SELECT * FROM pilot_users WHERE id=? AND username=? AND tenant_id=?',grant.userId,username,grant.tenantId);
  if(!u||u.disabled||!passwordValid(b.password,u.password_hash,env.TURI_AUTH_PEPPER))fail(401,'RECOVERY_PASSWORD','Revisá tu contraseña actual. Este enlace no cambia tu contraseña.');
  await run(env,'INSERT OR IGNORE INTO pilot_auth_challenges (id,user_id,kind,value_hash,attempts,expires_at,created_at) VALUES (?,?,?,?,0,?,?)',grant.id,u.id,'owner_code_recovery',hash,grant.expiresAt,NOW());
  const claim=opaque(24),gate='EXISTS (SELECT 1 FROM pilot_auth_challenges WHERE id=? AND user_id=? AND claim_token=?)';
  const result=await env.DB.batch([
   stmt(env,'UPDATE pilot_auth_challenges SET used_at=?,claim_token=? WHERE id=? AND kind=? AND value_hash=? AND used_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND password_hash=? AND disabled=0)',NOW(),claim,grant.id,'owner_code_recovery',hash,NOW(),u.id,u.password_hash),
   stmt(env,'UPDATE pilot_users SET access_code_hash=NULL,pending_code_hash=NULL,pending_code_ciphertext=NULL,pending_code_expires_at=NULL,mfa_secret=?,mfa_enabled=0,recovery_hashes=?,last_totp_step=-1 WHERE id=? AND tenant_id=? AND password_hash=? AND '+gate,'','[]',u.id,u.tenant_id,u.password_hash,grant.id,u.id,claim),
   stmt(env,'DELETE FROM pilot_sessions WHERE user_id=? AND '+gate,u.id,grant.id,u.id,claim)
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)fail(403,'RECOVERY_LINK_USED','Este enlace ya se usó o tu acceso cambió. Ingresá con tu código personal nuevo.');
  await audit(env,u,'auth.code_recovered_by_owner');const s=await session(env,u,false),updated=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);return json({user:userView(updated),csrf:s.csrf,requiresCodeSetup:true},200,{'Set-Cookie':cookie(s.token,600)});
 }
 if(path.startsWith('/api/pilot/auth/mfa/'))fail(410,'ACCESS_UPDATED','Actualizá la página. Ahora ingresás con tu código personal, sin app de autenticación.');
 if(path==='/api/pilot/auth/code/prepare'&&req.method==='POST'){
  const u=await current(req,env,false);await rate(env,'code-prepare:'+u.id,12);let row=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);if(row.access_code_hash)fail(409,'CODE_CONFIGURED','Tu código personal ya está configurado.');
  if(!row.pending_code_ciphertext){const generated=personalCode(),encrypted=await seal(env,generated,'pending-access:'+u.id);await run(env,'UPDATE pilot_users SET pending_code_hash=?,pending_code_ciphertext=?,pending_code_expires_at=NULL WHERE id=? AND access_code_hash IS NULL AND pending_code_ciphertext IS NULL',codeHash(env,'access:'+u.id,generated),encrypted,u.id);row=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);}
  if(row.access_code_hash)fail(409,'CODE_CONFIGURED','Tu código personal ya está configurado.');const code=await unseal(env,row.pending_code_ciphertext,'pending-access:'+u.id);if(!/^\d{8}$/.test(code)||!equal(row.pending_code_hash,codeHash(env,'access:'+u.id,code)))fail(409,'CODE_UNAVAILABLE','No pudimos recuperar tu código personal. Contactá a Turi.');return json({code:code.slice(0,4)+'-'+code.slice(4),email:u.email||'',emailRecoveryAvailable:mailReady(env)});
 }
 if(path==='/api/pilot/auth/code/confirm'&&req.method==='POST'){
  const u=await current(req,env,false);await rate(env,'code-confirm:'+u.id,8);const b=await body(req),code=normalizeCode(b.code),row=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);if(row.access_code_hash)fail(409,'CODE_CONFIGURED','Tu código ya está configurado.');if(!/^\d{8}$/.test(code)||!row.pending_code_hash||!equal(row.pending_code_hash,codeHash(env,'access:'+u.id,code)))fail(400,'CODE_INVALID','Copiá el código personal que aparece arriba.');
  const email=b.email?normalizeEmail(b.email):row.email;if(b.email&&!email)fail(400,'EMAIL_INVALID','Revisá el correo electrónico.');const verified=email===row.email?row.email_verified:0;
  const changed=await run(env,'UPDATE pilot_users SET access_code_hash=?,pending_code_hash=NULL,pending_code_ciphertext=NULL,pending_code_expires_at=NULL,email=?,email_verified=?,mfa_secret=?,mfa_enabled=0,recovery_hashes=?,last_totp_step=-1 WHERE id=? AND access_code_hash IS NULL AND pending_code_hash=?',row.pending_code_hash,email||null,verified||0,'','[]',u.id,row.pending_code_hash);if(changed.meta.changes!==1)fail(409,'CODE_CONFIGURED','Tu acceso cambió. Volvé a ingresar.');await run(env,'DELETE FROM pilot_sessions WHERE user_id=?',u.id);const s=await session(env,{id:u.id},true);await audit(env,u,'auth.personal_code_set');const updated=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);return json({user:userView(updated),csrf:s.csrf},200,{'Set-Cookie':cookie(s.token,3600)});
 }
 if(path==='/api/pilot/auth/logout'&&req.method==='POST'){const u=await current(req,env,false);await run(env,'DELETE FROM pilot_sessions WHERE id=?',u.session_id);return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 if(path==='/api/pilot/auth/recovery/start'&&req.method==='POST'){
  if(!mailReady(env))fail(503,'EMAIL_NOT_CONFIGURED','La recuperación por correo todavía no está habilitada.');const b=await body(req),email=normalizeEmail(b.email);if(!email)fail(400,'EMAIL_INVALID','Revisá el correo electrónico.');await rate(env,'recover-ip:'+ip,15,3600000);await rate(env,'recover-email:'+email,3,3600000);const users=await all(env,'SELECT * FROM pilot_users WHERE lower(email)=? AND email_verified=1 AND disabled=0 LIMIT 2',email);let id=opaque(24);if(users.length===1){try{id=await newChallenge(env,users[0],'recovery',email)}catch(e){if(!(e instanceof HttpError))throw e;}}return json({challengeId:id,message:'Si el correo coincide con una cuenta confirmada, recibirás un código de recuperación. Revisá también Spam. Si no llega, podés volver a solicitarlo.'});
 }
 if(path==='/api/pilot/auth/recovery/verify'&&req.method==='POST'){
  await rate(env,'recover-verify-ip:'+ip,30);const b=await body(req),c=await checkChallenge(env,b.challengeId,b.code,'recovery'),{u,p}=await recoveryAccount(env,c);const id=opaque(24),token=opaque(),payload=await seal(env,p,'challenge:'+id),expires=NOW()+10*60*1000;
  await claimChallenge(env,c,claim=>[stmt(env,'INSERT INTO pilot_auth_challenges (id,user_id,kind,value_hash,payload,attempts,expires_at,sent_at,created_at) SELECT ?,?,?,?,?,0,?,?,? WHERE EXISTS (SELECT 1 FROM pilot_auth_challenges WHERE id=? AND claim_token=?) AND EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND password_hash=? AND access_code_hash IS ? AND email=? AND email_verified=1 AND disabled=0)',id,u.id,'password_reset',codeHash(env,'password-reset:'+id,token),payload,expires,NOW(),NOW(),c.id,claim,u.id,u.password_hash,u.access_code_hash,p.email)],recoveryGuard(u,p.email));
  return json({verified:true,message:'Código confirmado. Ahora creá tu nueva contraseña.'},200,{'Set-Cookie':resetCookie(id+'.'+token,600)});
 }
 if(path==='/api/pilot/auth/recovery/state'&&req.method==='GET'){try{await resetState(req,env);return json({verified:true})}catch(e){if(!(e instanceof HttpError))throw e;return json({verified:false})}}
 if(path==='/api/pilot/auth/recovery/complete'&&req.method==='POST'){
  await rate(env,'recover-confirm-ip:'+ip,30);const b=await body(req),{c,u,p}=await resetState(req,env);let hash;try{hash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}if(passwordValid(b.password,u.password_hash,env.TURI_AUTH_PEPPER))fail(400,'PASSWORD_REUSED','Elegí una contraseña diferente de la anterior.');
  const gate='EXISTS (SELECT 1 FROM pilot_auth_challenges WHERE id=? AND claim_token=?)';await claimChallenge(env,c,claim=>[stmt(env,'UPDATE pilot_users SET password_hash=?,access_code_hash=NULL,pending_code_hash=NULL,pending_code_ciphertext=NULL,pending_code_expires_at=NULL,mfa_secret=?,mfa_enabled=0,recovery_hashes=?,last_totp_step=-1 WHERE id=? AND password_hash=? AND access_code_hash IS ? AND email=? AND email_verified=1 AND disabled=0 AND '+gate,hash,'','[]',u.id,u.password_hash,u.access_code_hash,p.email,c.id,claim),stmt(env,'DELETE FROM pilot_sessions WHERE user_id=? AND '+gate,u.id,c.id,claim),stmt(env,'UPDATE pilot_auth_challenges SET used_at=? WHERE user_id=? AND kind IN (?,?) AND used_at IS NULL AND '+gate,NOW(),u.id,'recovery','password_reset',c.id,claim)],recoveryGuard(u,p.email));await audit(env,u,'auth.recovered_by_email');const s=await session(env,{id:u.id},false),updated=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id),headers=new Headers();headers.append('Set-Cookie',cookie(s.token,600));headers.append('Set-Cookie',resetCookie('',0));return json({user:userView(updated),csrf:s.csrf,requiresCodeSetup:true},200,headers);
 }
 const u=await current(req,env);
 if(path==='/api/pilot/documents'||path.startsWith('/api/pilot/documents/'))return documentsApi(req,env,u,{json,fail,stmt,first,all,run,audit,body,rate,current});
 if(path.startsWith('/api/pilot/work/'))return workspaceApi(req,env,u,companies,{json,fail,stmt,first,all,run,audit,body,rate});
 if(path==='/api/pilot/auth/email/start'&&req.method==='POST'){
  if(!mailReady(env))fail(503,'EMAIL_NOT_CONFIGURED','La recuperación por correo todavía no está habilitada.');const b=await body(req),email=normalizeEmail(b.email);if(!email)fail(400,'EMAIL_INVALID','Revisá el correo electrónico.');await rate(env,'email-verify:'+u.id,3,3600000);const id=await newChallenge(env,u,'verify_email',email);return json({challengeId:id,message:'Enviamos un código para confirmar tu correo.'});
 }
 if(path==='/api/pilot/auth/email/confirm'&&req.method==='POST'){
  const b=await body(req);const c=await checkChallenge(env,b.challengeId,b.code,'verify_email',u.id);const {email}=await unseal(env,c.payload,'challenge:'+c.id);if(await first(env,'SELECT id FROM pilot_users WHERE lower(email)=? AND email_verified=1 AND id<>?',email,u.id))fail(409,'EMAIL_IN_USE','Ese correo ya está confirmado en otra cuenta. Usá un correo propio diferente.');const gate='EXISTS (SELECT 1 FROM pilot_auth_challenges WHERE id=? AND claim_token=?)';await claimChallenge(env,c,claim=>[stmt(env,'UPDATE pilot_users SET email=?,email_verified=1 WHERE id=? AND NOT EXISTS (SELECT 1 FROM pilot_users WHERE lower(email)=? AND email_verified=1 AND id<>?) AND '+gate,email,u.id,email,u.id,c.id,claim)]);await audit(env,u,'auth.email_verified');const updated=await first(env,'SELECT * FROM pilot_users WHERE id=?',u.id);return json({user:userView(updated)});
 }
 if(path==='/api/pilot/companies'&&req.method==='GET')return json({companies:companies.map(c=>({id:c.id,name:c.name,portal:c.portal,api:c.api})),limit:15});
 if(path==='/api/pilot/connections'&&req.method==='GET'){
  onlyProducer(u);const rows=await all(env,'SELECT id,company_id,method,status,version,authorized,created_at,updated_at FROM pilot_connections WHERE tenant_id=? AND producer_id=? ORDER BY created_at',u.tenant_id,u.id);return json({connections:rows,limit:15});
 }
 if(path==='/api/pilot/connections'&&req.method==='POST'){
  onlyProducer(u);await rate(env,'vault:'+u.id,30);const b=await body(req);if(b.method!=='pas_only'&&env.TURI_ENABLE_PORTAL_SECRETS!=='1')fail(409,'CONNECTOR_NOT_ENABLED','Primero validaremos el conector de esta compañía. Por ahora registrá sólo tu código PAS.');if(!companies.some(c=>c.id===b.companyId))fail(400,'COMPANY','Elegí una compañía del listado.');if(!['pas_only','portal','api_key'].includes(b.method))fail(400,'METHOD','Elegí el tipo de acceso.');const pas=clean(b.pasCode,120),username=clean(b.portalUser,160),password=typeof b.portalPassword==='string'?b.portalPassword.slice(0,512):'',apiKey=typeof b.apiKey==='string'?b.apiKey.slice(0,4096):'';
  if(!pas||b.authorized!==true||(b.method==='portal'&&(!username||!password))||(b.method==='api_key'&&!apiKey))fail(400,'REQUIRED','Completá los datos del acceso y confirmá tu autorización.');
  const existing=await first(env,'SELECT id,version FROM pilot_connections WHERE tenant_id=? AND producer_id=? AND company_id=?',u.tenant_id,u.id,b.companyId);const id=existing?.id||opaque(16);const version=(existing?.version||0)+1;const payload=await seal(env,{pasCode:pas,portalUser:username,portalPassword:password,apiKey},`connection:${u.tenant_id}:${u.id}:${b.companyId}:${version}`);
  if(existing){const expected=Number(b.expectedVersion);if(expected!==existing.version)fail(409,'VERSION','Este acceso cambió. Actualizá la lista antes de reemplazarlo.');const r=await run(env,'UPDATE pilot_connections SET method=?,encrypted_payload=?,version=?,authorized=1,status=?,updated_at=? WHERE id=? AND producer_id=? AND tenant_id=? AND version=?',b.method,payload,version,'registered',NOW(),id,u.id,u.tenant_id,expected);if(r.meta.changes!==1)fail(409,'VERSION','Este acceso cambió. Actualizá la lista.');}
  else{const r=await run(env,'INSERT INTO pilot_connections (id,tenant_id,producer_id,company_id,method,encrypted_payload,status,version,authorized,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT count(*) FROM pilot_connections WHERE producer_id=? AND tenant_id=?)<15',id,u.tenant_id,u.id,b.companyId,b.method,payload,'registered',version,NOW(),NOW(),u.id,u.tenant_id);if(r.meta.changes!==1)fail(409,'LIMIT','Ya tenés 15 compañías registradas. Podés reemplazar o quitar una.');}
  await audit(env,u,existing?'connection.replaced':'connection.created',id);return json({id,status:'registered',message:'Acceso guardado. La integración con esta compañía está pendiente de validación.'},existing?200:201);
 }
 if(path.startsWith('/api/pilot/connections/')&&req.method==='DELETE'){
  onlyProducer(u);const id=path.split('/').pop();const r=await run(env,'DELETE FROM pilot_connections WHERE id=? AND tenant_id=? AND producer_id=?',id,u.tenant_id,u.id);if(r.meta.changes!==1)fail(404,'NOT_FOUND','No encontramos ese acceso.');await audit(env,u,'connection.deleted',id);return json({ok:true});
 }
 if(path==='/api/pilot/audit'&&req.method==='GET'){const rows=u.role==='superadmin'?await all(env,'SELECT action,actor_id,record_id,created_at FROM pilot_audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',u.tenant_id):await all(env,'SELECT action,actor_id,record_id,created_at FROM pilot_audit WHERE tenant_id=? AND actor_id=? ORDER BY created_at DESC LIMIT 100',u.tenant_id,u.id);return json({events:rows});}

 if(path==='/api/pilot/admin/invitations'&&req.method==='POST'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Sólo el superadministrador puede invitar a un productor.');await rate(env,'admin-invite-producer:'+u.id,20,3600000);
  const b=await body(req),name=clean(b.name,120);if(!name||typeof b.name!=='string'||b.name.trim().length>120)fail(400,'NAME','Ingresá el nombre del productor.');
  const id=opaque(16),token=opaque(),stamp=NOW(),expiresAt=stamp+7*24*3600000;
  const r=await run(env,"INSERT INTO pilot_pas_invitations(id,tenant_id,name,token_hash,created_by,expires_at,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND tenant_id=? AND role='superadmin' AND disabled=0) AND (SELECT count(*) FROM pilot_pas_invitations WHERE tenant_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?)<20",id,u.tenant_id,name,digest(token),u.id,expiresAt,stamp,u.id,u.tenant_id,u.tenant_id,stamp);
  if(r.meta.changes!==1)fail(409,'INVITATION_LIMIT','Revisá tus permisos o las invitaciones pendientes antes de crear otra.');await audit(env,u,'admin.producer_invited',id);
  return json({id,name,expiresAt,activationUrl:new URL(req.url).origin+'/privado/activar/#invite='+token},201);
 }
 if(path==='/api/pilot/admin/invitations'&&req.method==='GET'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Esta sección pertenece al superadministrador.');
  return json({invitations:await all(env,'SELECT id,name,expires_at,used_at,revoked_at,claimed_user_id,created_at FROM pilot_pas_invitations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50',u.tenant_id)});
 }
 const inviteRevoke=path.match(/^\/api\/pilot\/admin\/invitations\/([A-Za-z0-9_-]{10,80})\/revoke$/);
 if(inviteRevoke&&req.method==='POST'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Esta sección pertenece al superadministrador.');
  const r=await run(env,'UPDATE pilot_pas_invitations SET revoked_at=? WHERE id=? AND tenant_id=? AND used_at IS NULL AND revoked_at IS NULL',NOW(),inviteRevoke[1],u.tenant_id);
  if(r.meta.changes!==1)fail(404,'NOT_FOUND','La invitación no está pendiente.');await audit(env,u,'admin.invitation_revoked',inviteRevoke[1]);return json({ok:true});
 }
 if(path==='/api/pilot/admin/producers'&&req.method==='POST'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Sólo el superadministrador puede crear un PAS de prueba.');await rate(env,'admin-create-producer:'+u.id,20,3600000);
  const b=await body(req),username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
  if(!/^[a-z][a-z0-9._-]{2,39}$/.test(username))fail(400,'USERNAME','Elegí un usuario de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
  if(typeof b.passwordConfirmation!=='string'||b.password!==b.passwordConfirmation)fail(400,'PASSWORD_CONFIRMATION','Las contraseñas no coinciden.');
  let hash;try{hash=passwordHash(b.password,env.TURI_AUTH_PEPPER)}catch{fail(400,'PASSWORD_LENGTH','Elegí una contraseña de entre 14 y 128 caracteres. Podés usar una frase.');}
  const code=personalCode(),pas={id:'PAS-'+opaque(16),username,name:clean(b.name,120)||'PAS de prueba',role:'producer',tenant_id:u.tenant_id,access_code_hash:null,email:null,email_verified:0};pas.access_code_hash=codeHash(env,'access:'+pas.id,code);
  const result=await env.DB.batch([
   stmt(env,'INSERT INTO pilot_users (id,username,name,role,tenant_id,password_hash,mfa_secret,mfa_enabled,recovery_hashes,last_totp_step,disabled,created_at,access_code_hash) SELECT ?,?,?,?,?,?,?,0,?,-1,0,?,? WHERE EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND tenant_id=? AND role=? AND disabled=0) ON CONFLICT(username) DO NOTHING',pas.id,username,pas.name,'producer',u.tenant_id,hash,'','[]',NOW(),pas.access_code_hash,u.id,u.tenant_id,'superadmin'),
   stmt(env,'INSERT INTO pilot_audit (id,tenant_id,actor_id,action,record_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM pilot_users WHERE id=? AND tenant_id=?)',opaque(16),u.tenant_id,u.id,'admin.producer_created',pas.id,NOW(),pas.id,u.tenant_id)
  ]);
  if(result[0].meta.changes!==1)fail(409,'USERNAME_IN_USE','Ese usuario ya existe o tu permiso cambió. Elegí otro usuario o volvé a ingresar.');
  return json({user:userView(pas),accessCode:code.slice(0,4)+'-'+code.slice(4)},201);
 }
 if(path==='/api/pilot/admin/overview'&&req.method==='GET'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Esta sección pertenece al superadministrador.');const users=await all(env,'SELECT id,username,name,role,(access_code_hash IS NOT NULL) AS code_configured,email_verified,disabled,created_at FROM pilot_users WHERE tenant_id=?',u.tenant_id);const connections=await all(env,'SELECT id,producer_id,company_id,method,status,version,authorized,updated_at FROM pilot_connections WHERE tenant_id=?',u.tenant_id);const invitations=await all(env,'SELECT id,name,expires_at,used_at,revoked_at,created_at FROM pilot_pas_invitations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50',u.tenant_id);return json({users,connections,invitations,deadline:'2026-11-13',automaticQuotes:false});
 }
 if(path==='/api/pilot/admin/revoke-sessions'&&req.method==='POST'){
  if(u.role!=='superadmin')fail(403,'ADMIN_ONLY','Acceso de superadministrador requerido.');const b=await body(req);const target=await first(env,'SELECT id FROM pilot_users WHERE id=? AND tenant_id=?',clean(b.userId,80),u.tenant_id);if(!target||target.id===u.id)fail(400,'USER','Elegí una cuenta de productor.');await run(env,'DELETE FROM pilot_sessions WHERE user_id=?',target.id);await audit(env,u,'admin.sessions_revoked',target.id);return json({ok:true});
 }
 fail(404,'NOT_FOUND','La operación no está disponible.');
}
