import { api,HttpError } from './api.js';
import { ASSETS,COMPANIES } from './assets.generated.js';
const SECURITY={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000; includeSubDomains',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"
};
export default {async fetch(req,env){
 let response;const url=new URL(req.url);
 try{
  if(['/app.js','/data.js','/assets/embedded.js'].includes(url.pathname))response=new Response('La demo anterior fue retirada. Ingresá a tu espacio privado.',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  else if(url.pathname.startsWith('/api/pilot/'))response=await api(req,env,COMPANIES);
  else{
   if(!['GET','HEAD'].includes(req.method))response=new Response('Method not allowed',{status:405});
   else {const path=['/privado','/privado/','/privado/activar','/privado/activar/','/admin','/admin/','/admin/crear-contrasena','/admin/crear-contrasena/'].includes(url.pathname)?'/pilot.html':url.pathname==='/'?'/index.html':url.pathname;const a=ASSETS[path];if(!a)response=new Response('No encontramos esta página.',{status:404});else {const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));response=new Response(req.method==='HEAD'?null:bytes,{headers:{'Content-Type':a.type,'Cache-Control':path.startsWith('/assets/')?'public, max-age=3600':'no-store'}});}}
  }
 }catch(e){const known=e instanceof HttpError;response=new Response(JSON.stringify({error:known?e.code:'SERVER_ERROR',message:known?e.message:'No pudimos completar la operación. Volvé a intentar.'}),{status:known?e.status:500,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});if(!known)console.error('TURI_REQUEST_FAILED');}
 const headers=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
}};
