'use strict';
window.TuriSupervision=(()=>{
 const match=/^\/admin\/vista-pas\/([A-Za-z0-9_-]{1,100})\/?$/.exec(location.pathname),producerId=match?.[1]||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const view=()=>new URLSearchParams(location.hash.slice(1)).get('view')||'home';
 const url=(id,page='home')=>'/admin/vista-pas/'+encodeURIComponent(id)+'/#view='+encodeURIComponent(page==='producers'?'home':page);
 function open(id,page){location.assign(url(id,page));}
 function leave(){location.assign('/admin/#view='+encodeURIComponent(view()));}
 async function mount(profile,request){
  if(!producerId||profile.supervision?.producerId!==producerId||profile.supervision?.actor.role!=='superadmin')throw Error('No pudimos verificar la vista del PAS.');
  const roster=await request('/admin/overview');
  const strip=document.createElement('section');strip.id='supervision-strip';strip.className='supervision-strip';strip.setAttribute('aria-label','Supervisión de perfiles');
  strip.innerHTML=`<div><strong>Superadmin · Vista del PAS</strong><span>Acceso completo · Cambios registrados como Superadmin</span></div><label>Viendo como<select id="supervision-producer">${roster.users.filter(u=>u.role==='producer'&&!u.disabled).map(u=>`<option value="${esc(u.id)}" ${u.id===producerId?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><button type="button" id="supervision-exit">Volver a Superadmin</button>`;
  document.getElementById('supervision-strip')?.remove();document.querySelector('#pilot').before(strip);document.body.classList.add('supervising-pas');
  strip.querySelector('select').addEventListener('change',event=>open(event.target.value,view()));
  strip.querySelector('button').addEventListener('click',leave);
  const size=()=>document.documentElement.style.setProperty('--supervision-height',strip.getBoundingClientRect().height+'px');size();
  if(window.ResizeObserver)new ResizeObserver(size).observe(strip);
 }
 function unavailable(message){
  window.TuriWorkspace?.leave();document.body.classList.remove('in-workspace');
  document.querySelector('#pilot').innerHTML=`<section class="auth panel"><h1>Vista del PAS</h1><p role="alert">${esc(message)}</p><a class="btn" href="/admin/">Volver a Superadmin</a></section>`;
 }
 document.addEventListener('click',event=>{
  if(!producerId)return;
  const button=event.target.closest('[data-action="logout"]');
  if(button){event.preventDefault();event.stopImmediatePropagation();leave();return;}
  const logo=event.target.closest('a.w-logo[href="/privado/"]');
  if(logo){event.preventDefault();location.assign(url(producerId));}
 },true);
 return {producerId,readOnly:false,open,mount,unavailable,endpoint:path=>producerId&&path!=='/status'?'/supervision/'+producerId+path:path};
})();
