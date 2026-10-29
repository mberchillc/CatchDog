'use strict';
window.TuriMultiQuote=(()=>{
 let ctx,generation=0;
 const blank=()=>({description:'',risk:{},details:{},commercial:{},clientId:'',catalog:null,candidates:[],record:null,orientation:null,busy:false,error:'',notice:'',dirty:false,requestKey:crypto.randomUUID()});
 let state=blank();
 const sample='Quiero terceros completo con granizo y cristales para un Chevrolet Celta 1.4 LT 2012 en Villa Ballester. Uso particular, sin choques.';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
 const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('es-AR'):'No informada';
 const riskFields={brand:'Marca',model:'Modelo',year:'Año',version:'Versión',locality:'Localidad de guarda',province:'Provincia',postalCode:'Código postal',usage:'Uso del vehículo',coverage:'Cobertura buscada'};
 const extraFields={referenceSegment:'Segmento para la referencia',hail:'Granizo',glass:'Cristales',garage:'Dónde duerme',fuel:'Combustible',doors:'Puertas',gnc:'Equipo de GNC',alarm:'Alarma',driverAge:'Edad del conductor',claimsHistory:'Siniestros previos',insuredValue:'Valor del vehículo, si lo conocés',paymentMethod:'Forma de pago',ivaCondition:'Condición IVA'};
 const choices={referenceSegment:{entry_used:'Gama baja / usado',mid:'Gama media',high:'Gama alta / 0 km'},usage:{particular:'Particular',comercial:'Comercial'},coverage:{liability:'Responsabilidad civil',third_party_full:'Terceros completo',comprehensive:'Todo riesgo'},hail:{yes:'Lo necesito',no:'No es necesario'},glass:{yes:'Los necesito',no:'No son necesarios'},garage:{garage:'Garaje cerrado',street:'En la calle',mixed:'Alterna'},fuel:{nafta:'Nafta',diesel:'Diésel',electric:'Eléctrico',hybrid:'Híbrido'},doors:{3:'3 puertas',4:'4 puertas',5:'5 puertas'},gnc:{yes:'Sí',no:'No'},alarm:{yes:'Sí',no:'No'},claimsHistory:{none:'Sin siniestros declarados',yes:'Con siniestros declarados'},paymentMethod:{cash:'Efectivo',debit:'Débito automático'},ivaCondition:{CF:'Consumidor final',IN:'Responsable inscripto',MO:'Monotributo',EA:'Exento',NA:'No alcanzado'}};
 const allRisk=Object.keys(riskFields),allExtra=Object.keys(extraFields);
 function configure(options){if(ctx?.user.id!==options.user.id)reset();ctx=options;}
 function field(key,group='risk'){
  const value=state[group][key]||'',label=(group==='risk'?riskFields:extraFields)[key],options=choices[key];
  return `<label>${label}${options?`<select name="${key}" data-mq-group="${group}"><option value="">Todavía no lo sé</option>${Object.entries(options).map(([v,l])=>`<option value="${v}" ${value===v?'selected':''}>${l}</option>`).join('')}</select>`:`<input name="${key}" data-mq-group="${group}" value="${esc(value)}" maxlength="100" placeholder="Opcional" ${['year','driverAge','postalCode'].includes(key)?'inputmode="numeric"':''} ${key==='insuredValue'?'type="number" step="0.01"':''}>`}</label>`;
 }
 function savings(){
  const c=state.commercial,a=c.currentCents,b=c.targetCents;if(!(a>0&&b>0))return '<span>Completá cuota actual y objetivo si querés medir el ahorro buscado.</span>';
  const delta=a-b,pct=new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(delta/a*100);
  return delta>0?`<strong>Ahorro buscado: ${money(delta)} al mes · ${pct}%</strong><span>Comparación de importes. La equivalencia de cobertura está pendiente de revisión.</span>`:delta===0?'<strong>El objetivo iguala la cuota actual.</strong>':'<strong>El objetivo supera la cuota actual.</strong><span>Podés mantenerlo si buscás ampliar la cobertura.</span>';
 }
 function sourceCards(){return state.catalog?`<details class="mq-card mq-library"><summary>Fuentes de esta orientación · ${state.catalog.sources.length}</summary><p class="small">${esc(state.catalog.notice)}</p>${state.catalog.sources.map(s=>`<article class="mq-source"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><span class="mq-source-kind">${s.kind==='ai_summary'?'Resumen de IA':'Fuente del proveedor'}</span><p>${esc(s.summary)}</p><p class="small">${esc(s.scope)}<br>Publicación: ${date(s.publishedOn)} · Revisada: ${date(s.reviewedAt)}</p><p class="small">${esc(s.limitations)}</p></article>`).join('')}</details>`:'<section class="mq-card"><p>Las fuentes se mostrarán al cargar la orientación.</p><button type="button" data-mq="load">Cargar fuentes</button></section>';}

 function estimateCard(){
  const e=state.orientation?.estimate;if(!state.orientation)return '';
  if(!e)return '<section class="mq-card mq-estimate" id="mq-estimate" tabindex="-1" role="status"><h2>Contanos qué vehículo querés asegurar.</h2><p>Con la marca o el modelo ya podemos mostrar una referencia inicial. El pedido quedó guardado y podés completarlo cuando quieras.</p></section>';
  return `<section class="mq-card mq-estimate" id="mq-estimate" tabindex="-1" aria-labelledby="mq-estimate-title"><div class="eyebrow">ESTIMACIÓN TURI · MENSUAL</div><h2 id="mq-estimate-title">${e.amountMode==='from'?'Desde':'Aproximadamente'} <strong>${money(e.amountCents)}</strong></h2><p class="mq-range">Rango de referencia: <b>${money(e.minCents)}–${money(e.maxCents)}${e.upperOpen?' o más':''}</b> por mes.</p><p><strong>Valor aproximado sujeto a aprobación final.</strong><br>${esc(e.coverageLabel)} · ${esc([state.record.risk.brand,state.record.risk.model,state.record.risk.year,state.record.risk.locality].filter(Boolean).join(' · '))}</p>${e.extrasStatus==='pending'?'<p class="mq-note"><b>Granizo y cristales pendientes:</b> el precio orienta sobre la cobertura base. La fuente no confirma el costo ni el alcance de estos adicionales.</p>':''}<p class="small">Referencias públicas revisadas, sin consulta en vivo a Google. No es una oferta de aseguradora ni otorga cobertura.</p><div class="mq-actions"><button type="button" class="primary" data-mq="pdf" ${state.busy||state.dirty||!state.record?.estimate?'disabled':''}>Descargar cotización Turi · PDF</button><span class="mq-dirty" role="status" ${state.dirty?'':'hidden'}>Tenés cambios sin guardar. Actualizá la estimación para descargar.</span>${!state.record?.estimate?'<span class="small">Actualizá la estimación para habilitar el PDF de este pedido anterior.</span>':''}</div><details class="mq-calculation"><summary>Cómo se obtuvo este número y qué falta confirmar</summary><p>${esc(e.method)}</p><p>${esc(e.profile)}</p><ul>${e.assumptions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="small">Calculada el ${new Date(e.calculatedAt).toLocaleDateString('es-AR')}. La cuota actual y tu objetivo comercial no modifican este cálculo.</p>${e.sources.map(x=>`<p class="small"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a><br>Publicación: ${date(x.publishedOn)} · Revisada: ${date(x.reviewedAt)}</p>`).join('')}</details></section>`;
 }
 function reference(){return '<section class="mq-card mq-reference"><div class="eyebrow">REFERENCIA INICIAL</div><h2>Un número para empezar.</h2><p>Completá marca o modelo y pulsá «Estimar con lo que tengo». Vas a ver el importe y su rango arriba del formulario.</p><p class="small">Si faltan datos usamos un perfil general y mostramos los supuestos. Los adicionales, la suma asegurada y el precio final requieren confirmación.</p></section>';}
 function result(){
  const o=state.orientation;if(!o)return '';const r=state.record;
  return `<section class="mq-card mq-request-result" aria-live="polite"><div class="eyebrow">PEDIDO INICIAL GUARDADO</div><h2>Podés avanzar con lo que tenés.</h2><p>${esc(o.message)}</p><p class="small">Pedido ${esc(r.id)} · versión ${r.version} · disponible en Cotizaciones.</p>${state.dirty?'<p class="mq-note">Hay cambios sin guardar. Volvé a solicitar con estos datos para actualizar el pedido.</p>':''}<div class="mq-result-grid"><div><h3>Información pendiente</h3>${o.missing.length?`<ul>${o.missing.map(m=>`<li>${esc(m.label)}</li>`).join('')}</ul>`:'<p>Ya tenemos los datos iniciales. Cada compañía puede requerir validaciones adicionales.</p>'}<p class="small">Estos faltantes no bloquean tu pedido inicial.</p></div><div><h3>Meta de precio</h3><p>${o.commercial.currentCents?'Cuota informada: '+money(o.commercial.currentCents):'Cuota actual sin informar.'}<br>${o.commercial.targetCents?'Objetivo del PAS: '+money(o.commercial.targetCents):'Objetivo sin definir.'}</p><p class="small">Una meta no es una tarifa prometida.</p></div></div><h3>Estado de las consultas a compañías</h3>${o.providerRequests.map(p=>`<article class="mq-provider"><strong>${esc(p.name)}</strong><span class="mq-pending">Conexión pendiente · pedido aún no enviado</span>${p.missing.length?`<span class="small">Datos iniciales pendientes: ${p.missing.map(esc).join(', ')}.</span>`:''}<span class="small">Para la consulta tarifada: ${p.additionalRequirements.map(esc).join('; ')}.</span></article>`).join('')}<p class="small">La orientación no puede aprobarse como oferta ni emitirse. Las cotizaciones de aseguradoras aparecerán con su origen y vigencia cuando esté habilitada la conexión.</p></section>`;
 }
 function render(){
  const ownClients=(ctx?.clients||[]).filter(c=>!c.archived&&c.owner_id===(state.record?.owner_id||ctx?.user.id));
  return `<section class="mq"><div class="mq-banner"><strong>Empezá con lo que sabés.</strong><span>Todos los campos son opcionales para pedir una orientación inicial.</span></div><div class="mq-layout"><div><div class="error" role="alert">${esc(state.error)}</div>${estimateCard()}<form id="mq-request" novalidate><section class="mq-card"><div class="eyebrow">TU PEDIDO</div><h2>¿Qué necesitás cotizar?</h2><label for="mq-description">Describilo con tus palabras</label><textarea id="mq-description" name="description" maxlength="2000" rows="3" placeholder="Auto, localidad, cobertura… lo que ya conozcas.">${esc(state.description)}</textarea><div class="mq-actions"><button type="submit" class="primary" ${state.busy?'disabled':''}>Estimar con lo que tengo</button><button type="button" data-mq="sample" ${state.busy?'disabled':''}>Usar ejemplo del Celta</button><button type="button" data-mq="read" ${state.busy||!state.description.trim()?'disabled':''}>Completar desde el texto</button></div><p class="small">La lectura inicial usa reglas; la conexión con un agente de IA todavía no está activada.</p></section><section class="mq-card"><div class="eyebrow">LO QUE YA SABÉS</div><h2>Completá sólo lo que tengas.</h2><div class="mq-fields">${['brand','model','year','version','locality','province','postalCode','coverage'].map(k=>field(k)).join('')}${field('hail','details')}${field('glass','details')}</div>${ownClients.length?`<label class="mq-client">Vincular a un cliente, si ya está cargado<select name="clientId"><option value="">Lo vinculo después</option>${ownClients.map(c=>`<option value="${esc(c.id)}" ${state.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`:''}<details class="mq-extra"><summary>Agregar datos para afinar el precio · opcional</summary><p class="small">Podés dejar todo esto para después. No ingreses DNI, patente ni datos bancarios en esta instancia.</p><div class="mq-fields">${field('usage')}${['referenceSegment','garage','fuel','doors','gnc','alarm','driverAge','claimsHistory','insuredValue','paymentMethod','ivaCondition'].map(k=>field(k,'details')).join('')}</div></details></section><section class="mq-card"><div class="eyebrow">OBJETIVO COMERCIAL · OPCIONAL</div><h2>Una propuesta que ayude a ganar la cuenta.</h2><div class="mq-fields"><label>Compañía actual<input name="currentInsurer" value="${esc(state.commercial.currentInsurer||'')}" maxlength="100" placeholder="Si la conocés"></label><label>Cuota actual por mes · ARS<input name="currentAmount" type="number" step="0.01" min="0.01" value="${state.commercial.currentCents?state.commercial.currentCents/100:''}" placeholder="Opcional"></label><label>Precio objetivo por mes · ARS<input name="targetAmount" type="number" step="0.01" min="0.01" value="${state.commercial.targetCents?state.commercial.targetCents/100:''}" placeholder="Opcional"></label></div><div id="mq-savings" class="mq-savings" aria-live="polite">${savings()}</div></section><div class="mq-submit-bar"><div><strong>Podés pedirlo ahora.</strong><span>Completá los faltantes cuando tengas la información.</span></div><button type="submit" class="primary" ${state.busy?'disabled':''}>${state.busy?'Calculando…':state.record?'Actualizar estimación':'Calcular estimación'}</button></div><p class="mq-note">Se guarda el pedido y se calcula una estimación con las referencias públicas disponibles. Las compañías que exijan más datos quedarán pendientes; no se inventa la información.</p></form>${state.notice?`<p class="w-notice" role="status">${esc(state.notice)}</p>`:''}${result()}</div><aside>${reference()}${sourceCards()}<section class="mq-card"><h2>Tus pedidos siguen acá.</h2><p>Podés retomarlos desde Cotizaciones, incluso si todavía no cargaste al cliente.</p><button type="button" data-work="nav" data-page="quotes">Ver mis pedidos</button>${state.record?'<button type="button" data-mq="new">Iniciar otro pedido</button>':''}</section></aside></div></section>`;
 }
 function readForm(){
  const form=document.querySelector('#mq-request');if(!form)return;
  const data=new FormData(form);state.description=String(data.get('description')||'');
  for(const k of allRisk)if(data.has(k))state.risk[k]=String(data.get(k)||'');
  for(const k of allExtra)if(data.has(k))state.details[k]=String(data.get(k)||'');
  if(data.has('clientId'))state.clientId=String(data.get('clientId')||'');
  const amount=k=>{const v=String(data.get(k)||'');return v===''?null:Math.round(Number(v)*100);};
  state.commercial={currentInsurer:String(data.get('currentInsurer')||''),currentCents:amount('currentAmount'),targetCents:amount('targetAmount')};
 }
 function paint(){const host=document.querySelector('#w-body');if(host?.querySelector('.mq'))host.innerHTML=render();}
 async function load(){
  if(state.catalog)return;const turn=generation;try{const r=await ctx.request('/work/multiquote/catalog');if(turn!==generation)return;state.catalog=r.catalog;state.candidates=r.candidates;}catch(e){if(turn===generation)state.error=e.message;}
 }
 async function action(kind){
  if(state.busy)return;readForm();const turn=generation;state.busy=true;state.error='';state.notice='';paint();
  try{
   if(kind==='read'){
    const r=await ctx.request('/work/multiquote/prepare','POST',{text:state.description});if(turn!==generation)return;
    for(const [group,keys]of [['risk',allRisk],['details',allExtra]])for(const k of keys)if(!state[group][k]&&r[group]?.[k])state[group][k]=r[group][k];
    state.notice='Datos reconocidos. Revisalos y pedí la orientación cuando quieras.';state.dirty=true;
   }else{
    const b={description:state.description,risk:state.risk,details:state.details,commercial:state.commercial,clientId:state.clientId,requestKey:state.requestKey,...(state.record?{id:state.record.id,expectedVersion:state.record.version}:{})};
    const r=await ctx.request('/work/multiquote/request','POST',b);if(turn!==generation)return;state.record=r.record;state.orientation=r.orientation;state.risk=r.record.risk;state.details=r.record.details;state.dirty=false;
    state.catalog={...(state.catalog||{}),version:r.orientation.catalogVersion,notice:r.orientation.sourceNotice,sources:r.orientation.sources};
    state.notice=r.orientation.estimate?'Estimación calculada y guardada. Podés descargar el PDF o retomar desde Cotizaciones.':'Pedido guardado. Agregá marca o modelo para obtener un número.';await ctx.changed?.();
   }
  }catch(e){if(turn===generation)state.error=e.message;}
  finally{if(turn===generation){state.busy=false;paint();if(kind==='request'){const card=document.querySelector('#mq-estimate');card?.focus({preventScroll:true});card?.scrollIntoView?.({behavior:'smooth',block:'start'});}}}
 }

 async function download(){
  if(state.busy||state.dirty||!state.record?.estimate)return;
  const turn=generation,id=state.record.id,version=state.record.version;state.busy=true;state.error='';paint();
  try{
   const r=await ctx.request('/work/multiquote/requests/'+encodeURIComponent(id));if(turn!==generation)return;
   if(r.record.version!==version)throw Error('El pedido cambió en otra pantalla. Retomalo desde Cotizaciones para descargar su última versión.');
   if(!r.record.estimate)throw Error('Actualizá la estimación antes de descargar.');
   const producer=(ctx.owners||[]).find(x=>x.id===r.record.owner_id),client=(ctx.clients||[]).find(x=>x.id===r.record.clientId);
   const bytes=await window.TuriQuotePDF.create({record:r.record,estimate:r.record.estimate,producerName:producer?.name||(ctx.user.id===r.record.owner_id?ctx.user.name:''),clientName:client?.name||''});
   if(turn!==generation)return;
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=window.TuriQuotePDF.filename(r.record);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);state.notice='Cotización Turi descargada en PDF.';
  }catch(e){if(turn===generation)state.error=e.message;}
  finally{if(turn===generation){state.busy=false;paint();}}
 }
 function markDirty(){
  if(!state.record)return;state.dirty=true;
  const button=document.querySelector('[data-mq=pdf]');if(button)button.disabled=true;
  const note=document.querySelector('.mq-dirty');if(note)note.hidden=false;
  document.querySelector('.mq-estimate')?.setAttribute('data-unsaved','true');
  document.querySelector('.mq-request-result')?.setAttribute('data-unsaved','true');
 }
 async function resume(id){const turn=generation;const r=await ctx.request('/work/multiquote/requests/'+encodeURIComponent(id));if(turn!==generation)return false;const savedCatalog=state.catalog;state=blank();state.catalog=savedCatalog;state.record=r.record;state.description=r.record.description;state.risk=r.record.risk;state.details=r.record.details;state.commercial=r.record.commercial;state.clientId=r.record.clientId;state.orientation=r.orientation;return true;}
 document.addEventListener('input',e=>{if(!e.target.closest('#mq-request'))return;readForm();markDirty();const s=document.querySelector('#mq-savings');if(s)s.innerHTML=savings();const read=document.querySelector('[data-mq=read]');if(read)read.disabled=state.busy||!state.description.trim();const stale=document.querySelector('.mq-request-result');if(stale&&state.record)stale.setAttribute('data-unsaved','true');});
 document.addEventListener('change',e=>{if(e.target.closest('#mq-request')){readForm();markDirty();}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-mq]');if(!b||!ctx||state.busy)return;
  if(b.dataset.mq==='sample'){readForm();state.description=sample;markDirty();paint();document.querySelector('#mq-description')?.focus();}
  if(b.dataset.mq==='read')await action('read');
  if(b.dataset.mq==='pdf')await download();
  if(b.dataset.mq==='load'){await load();paint();}
  if(b.dataset.mq==='new'){const catalog=state.catalog;reset();state.catalog=catalog;paint();}
 });
 document.addEventListener('submit',async e=>{if(e.target.id!=='mq-request'||!ctx)return;e.preventDefault();await action('request');});
 function reset(){generation++;state=blank();}
 return {configure,render,load,resume,reset};
})();
