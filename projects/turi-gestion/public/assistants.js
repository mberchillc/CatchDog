'use strict';
window.TuriAssistants=(()=>{
 let ctx=null,records=[],opened='',loaded=false,loadError='',notice='',noticeTone='',busy=false,generation=0;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const catalog=[
  {id:'openai',name:'ChatGPT',company:'OpenAI',icon:'/assets/providers/chatgpt.ico',credential:'Clave API de OpenAI',help:'Conectá tu proyecto de OpenAI. Las conversaciones y los GPTs de tu cuenta de ChatGPT no se importan.',url:'https://platform.openai.com/api-keys',link:'Obtener clave en OpenAI'},
  {id:'gemini',name:'Gemini',company:'Google',icon:'/assets/providers/gemini.ico',credential:'Clave API de Gemini',help:'Usá una clave de tu proyecto de Gemini API, disponible desde Google AI Studio.',url:'https://aistudio.google.com/api-keys',link:'Obtener clave en Google AI Studio'},
  {id:'claude',name:'Claude',company:'Anthropic',icon:'/assets/providers/claude.ico',credential:'Clave API de Anthropic',help:'Conectá un proyecto de la plataforma de Anthropic. Tu historial personal de Claude se conserva en Claude.',url:'https://platform.claude.com/settings/keys',link:'Administrar claves de Anthropic'},
  {id:'copilot',name:'Copilot',company:'Microsoft',icon:'/assets/providers/copilot.ico',credential:'Secreto de Direct Line',help:'Requiere un agente publicado en Copilot Studio con el canal Direct Line habilitado. La cuenta personal de Copilot no proporciona este secreto.',url:'https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-web-security',link:'Configurar el agente en Copilot Studio'},
  {id:'meta',name:'Muse / Spark',company:'Meta',icon:'/assets/ai/meta.svg',credential:'Clave API de Meta',help:'Conectá tu acceso a los modelos Muse de Meta. La clave se gestiona en la plataforma para desarrolladores de Meta.',url:'https://dev.meta.ai/docs/overview',link:'Abrir la plataforma de Meta'}
 ];
 const record=id=>records.find(item=>item.id===id)||{id,version:0,status:'not_connected',configured:false,apiKeyConfigured:false};
 const isProducer=()=>ctx?.user.role==='producer';
 const active=(saved,turn)=>ctx?.user.id===saved.user.id&&ctx?.user.role===saved.user.role&&generation===turn;
 const stamp=value=>value?new Date(value).toLocaleString('es-AR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 function wipeSecrets(){for(const field of document.querySelectorAll('[data-ai-secret]'))field.value='';}
 function configure(options){
  if(ctx?.user.id!==options.user.id||ctx?.user.role!==options.user.role||ctx?.user.tenantId!==options.user.tenantId){wipeSecrets();generation++;records=[];opened='';loaded=false;loadError='';notice='';noticeTone='';busy=false;}
  ctx=options;
 }
 async function load(){
  if(!ctx)return;
  const saved=ctx,turn=generation;loadError='';
  if(!isProducer()){loaded=true;records=[];return;}
  try{const result=await saved.request('/assistants');if(!active(saved,turn))return;records=Array.isArray(result.providers)?result.providers:[];loaded=true;}
  catch(error){if(!active(saved,turn))return;loaded=false;loadError=error.message||'No pudimos cargar tus conexiones.';if(error.status===401)saved.expired?.(error);}
 }
 function state(row){
  if(row.status==='verified')return {text:'Acceso validado',tone:'verified'};
  if(row.status==='failed')return {text:'No se pudo validar',tone:'failed'};
  if(row.configured||row.apiKeyConfigured)return {text:'Guardada · falta probar',tone:'configured'};
  return {text:'Sin configurar',tone:'empty'};
 }
 function card(provider){const row=record(provider.id),status=state(row),selected=opened===provider.id;return `<button type="button" class="ai-provider ${selected?'selected':''}" data-ai="toggle" data-provider="${provider.id}" aria-expanded="${selected}" aria-controls="ai-provider-panel" ${busy?'disabled':''}><span class="ai-provider-logo"><img src="${provider.icon}" alt="" width="42" height="42"></span><span class="ai-provider-name">${provider.name}</span><span class="ai-provider-company">${provider.company}</span><span class="ai-status ${status.tone}">${status.text}</span><span class="ai-provider-action">${selected?'Cerrar configuración':'Configurar conexión'} <span aria-hidden="true">${selected?'−':'＋'}</span></span></button>`;}
 function textField(label,name,value='',extra=''){return `<label>${label}<input name="${name}" type="text" value="${esc(value)}" maxlength="200" autocomplete="off" spellcheck="false" ${extra}></label>`;}
 function form(){
  const provider=catalog.find(item=>item.id===opened);if(!provider)return '';
  const row=record(provider.id),configured=!!(row.apiKeyConfigured||row.configured),status=state(row);
  return `<section id="ai-provider-panel" class="panel ai-panel" aria-labelledby="ai-provider-heading"><header class="ai-panel-header"><div><div class="eyebrow">TU ASISTENTE · ${provider.company}</div><h2 id="ai-provider-heading" tabindex="-1">Conectá ${provider.name}.</h2></div><span class="ai-status ${status.tone}">${status.text}</span></header><p>${provider.help}</p><form id="ai-connection-form" class="w-form" data-provider="${provider.id}" data-version="${Number(row.version)||0}" autocomplete="off"><label class="w-span">${provider.credential}<input type="password" name="apiKey" data-ai-secret autocomplete="new-password" spellcheck="false" maxlength="4096" ${configured?'placeholder="Clave guardada; dejá vacío para conservarla"':'required placeholder="Pegá aquí tu clave de conexión"'}><small>${configured?'La clave guardada no se muestra. Completá este campo sólo para reemplazarla.':'Usá una credencial API; no ingreses la contraseña de tu cuenta.'}</small></label>${textField(provider.id==='copilot'?'Nombre de tu agente (opcional)':'Modelo que querés usar (opcional)','model',row.model||'','placeholder="'+(provider.id==='copilot'?'Nombre del agente del PAS':'Identificador del modelo en tu proveedor')+'"')}${provider.id==='claude'?textField('Identificador del espacio de trabajo (opcional)','workspaceId',row.workspaceId||''):provider.id==='copilot'?`<label>Región del agente<select name="region"><option value="global" ${!row.region||row.region==='global'?'selected':''}>Global</option><option value="europe" ${row.region==='europe'?'selected':''}>Europa</option><option value="india" ${row.region==='india'?'selected':''}>India</option></select></label>`:''}<label class="check w-span"><input name="authorized" type="checkbox" required><span>Confirmo que esta conexión es mía o que tengo autorización del PAS para configurarla.</span></label><div class="ai-form-help w-span"><p>La prueba verifica el acceso con tu proveedor; no envía datos de clientes, documentos ni mensajes. Guardar una clave no importa tus conversaciones personales.</p><a href="${provider.url}" target="_blank" rel="noopener noreferrer">${provider.link} ↗</a></div><div id="ai-form-error" class="error w-span" role="alert"></div><div class="w-form-actions w-span"><button type="button" data-ai="close" ${busy?'disabled':''}>Cerrar</button><button type="submit" value="save" ${busy?'disabled':''}>${busy?'Procesando…':'Guardar conexión'}</button><button type="submit" class="primary" value="test" ${busy?'disabled':''}>Guardar y probar acceso</button></div></form>${row.verifiedAt?`<p class="ai-verified-at">Última validación: ${esc(stamp(row.verifiedAt))}. Verifica credenciales, no disponibilidad de saldo ni de cada modelo.</p>`:''}</section>`;
 }
 function render(){
  if(!ctx)return '';
  if(!isProducer())return `<section id="ai-connections" class="panel ai-admin"><h2>Elegí el espacio del PAS.</h2><p>Las conexiones de IA pertenecen a cada productor. Seleccioná el perfil que querés configurar.</p><label>Ver como PAS<select data-ai="owner"><option value="">Seleccioná un productor</option>${(ctx.owners||[]).filter(owner=>owner.role==='producer'&&!owner.disabled).map(owner=>`<option value="${esc(owner.id)}">${esc(owner.name)}</option>`).join('')}</select></label></section>`;
  if(loadError)return `<section id="ai-connections" class="panel"><p class="error" role="alert">${esc(loadError)}</p><button type="button" data-ai="retry">Volver a intentar</button></section>`;
  if(!loaded)return '<section id="ai-connections" class="panel"><p role="status">Cargando tus conexiones de IA…</p></section>';
  return `<section id="ai-connections" class="ai-connections"><div class="ai-intro"><div><span class="ai-intro-mark" aria-hidden="true">✦</span><p>Elegí tu asistente y prepará la conexión de tu espacio. Vos decidís cuándo usarlo; tus clientes y documentos no se comparten automáticamente.</p></div><span class="ai-private">Conexión privada del PAS</span></div>${notice?`<div class="ai-notice ${noticeTone}" role="${noticeTone==='failed'?'alert':'status'}">${esc(notice)}</div>`:''}<div class="ai-provider-grid" aria-label="Proveedores de asistentes de IA">${catalog.map(card).join('')}</div>${form()}<p class="ai-footnote">Las API pueden requerir habilitación y facturación propias del proveedor, independientes de una suscripción al chat. Tus claves se guardan cifradas y nunca se muestran al volver a abrir esta página.</p></section>`;
 }
 function repaint(){const host=document.querySelector('#w-body');if(host?.querySelector('#ai-connections'))host.innerHTML=render();}
 function showError(message){const field=document.querySelector('#ai-form-error');if(field)field.textContent=message;else{notice=message;noticeTone='failed';repaint();}}
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-ai]');if(!button||!ctx)return;
  const action=button.dataset.ai;
  if(action==='toggle'&&!busy){wipeSecrets();opened=opened===button.dataset.provider?'':button.dataset.provider;notice='';noticeTone='';repaint();if(opened)document.querySelector('#ai-provider-heading')?.focus({preventScroll:true});}
  else if(action==='close'&&!busy){wipeSecrets();opened='';repaint();}
  else if(action==='retry'&&!busy){button.disabled=true;await load();repaint();}
 });
 document.addEventListener('change',event=>{if(event.target.matches('[data-ai="owner"]')&&ctx?.user.role==='superadmin'&&event.target.value)ctx.viewProducer?.(event.target.value,'assistants');});
 document.addEventListener('submit',async event=>{
  const element=event.target;if(element.id!=='ai-connection-form'||!ctx)return;
  event.preventDefault();event.stopPropagation();if(busy||!isProducer())return;
  const saved=ctx,turn=generation,provider=element.dataset.provider,values=new FormData(element),mode=event.submitter?.value||'save';
  let payload={expectedVersion:Number(element.dataset.version),apiKey:String(values.get('apiKey')||''),model:String(values.get('model')||''),workspaceId:String(values.get('workspaceId')||''),region:String(values.get('region')||'global'),authorized:element.elements.authorized.checked};
  if(!payload.authorized){showError('Confirmá que tenés autorización para configurar esta conexión.');return;}
  busy=true;notice='';noticeTone='';wipeSecrets();for(const field of element.querySelectorAll('button,input,select'))field.disabled=true;let persisted=false;
  try{
   let result=await saved.request('/assistants/'+provider,'POST',payload);payload=null;if(!active(saved,turn))return;
   persisted=true;records=records.filter(item=>item.id!==provider).concat(result.record);
   if(mode==='test'){result=await saved.request('/assistants/'+provider+'/test','POST',{expectedVersion:result.record.version});if(!active(saved,turn))return;records=records.filter(item=>item.id!==provider).concat(result.record);}
   notice=result.message||(result.record.status==='verified'?'Acceso validado.':'Conexión guardada. Probá el acceso para validarla.');noticeTone=result.record.status==='failed'?'failed':'success';
   busy=false;await saved.changed?.();repaint();
  }catch(error){if(!active(saved,turn))return;notice=(persisted?'La conexión quedó guardada. ':'')+(error.message||'No pudimos guardar la conexión.');noticeTone='failed';if(error.status===401)saved.expired?.(error);if(error.code==='VERSION')await load();}
  finally{payload=null;if(active(saved,turn)){busy=false;wipeSecrets();repaint();}}
 });
 function reset(){wipeSecrets();generation++;ctx=null;records=[];opened='';loaded=false;loadError='';notice='';noticeTone='';busy=false;}
 return {configure,load,render,reset};
})();
