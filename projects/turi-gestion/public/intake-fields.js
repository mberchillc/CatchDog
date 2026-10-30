'use strict';
window.TuriIntakeFields=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();let placesPromise;
 async function loadPlaces(){if(!placesPromise)placesPromise=Promise.resolve().then(()=>fetch('/ar-localities.json')).then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{if(j.provinces?.length!==24)throw Error();return j;}).catch(()=>{placesPromise=null;return null;});return placesPromise;}
 function provinceFor(places,value){const q=fold(value);return places?.provinces.find(p=>fold(p.name)===q||p.id===value||p.id==='02'&&['caba','capital federal','ciudad de buenos aires'].includes(q)||p.id==='06'&&['bs as','bs. as.','buenos aires provincia'].includes(q));}
 function choice(name,options,value,placeholder,disabled=false){return `<select name="data.${name}" ${disabled?'disabled':''}><option value="">${esc(placeholder)}</option>${options.map(([k,v])=>`<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`;}
 function render(schema,data={},branch='Autos',options={}){
  const client=!!options.client,places=options.places;
  return Object.entries(schema.groups).map(([group,title])=>{
   let fields=schema.fields.filter(f=>f.group===group&&(!f.branches||f.branches.includes(branch))&&!(client&&f.type==='money'));if(!fields.length)return '';
   if(client&&group==='vehicle'){const order=['vehicle_postal','vehicle_province','vehicle_locality'],slots=fields.map((f,i)=>order.includes(f.key)?i:-1).filter(i=>i>=0);slots.forEach((i,n)=>{fields[i]=schema.fields.find(f=>f.key===order[n]);});}
   return `<section class="ei-section" data-intake-group="${group}"><div class="eyebrow">${group==='holder'?'QUIÉN CONTRATA':group==='owner'?'A QUIÉN PERTENECE':group==='payment'?'CÓMO SE PAGARÁ':'DATOS DEL RIESGO'}</div><h2>${esc(title)}</h2>${group==='owner'?'<p class="small">Tomador y titular pueden ser personas distintas. Indicá el vínculo y el interés asegurable para la revisión del PAS.</p>':''}<div class="ei-fields">${fields.map(f=>{
    let value=data[f.key]||'',control;const type=['date','email','tel','number'].includes(f.type)?f.type:'text',extra=f.type==='cbu'?' inputmode="numeric" autocomplete="off"':f.type==='money'?' inputmode="decimal"':f.type==='year'||f.type==='last4'?' inputmode="numeric"':'';
    if(client&&f.key.endsWith('_province')){const p=provinceFor(places,value),options=(places?.provinces||[]).map(p=>[p.name,p.name]);if(value&&!p)options.unshift([value,value+' (dato ya informado)']);control=choice(f.key,options,p?.name||value,places?'Seleccioná provincia':'Lo completa tu PAS',!places);}
    else if(client&&f.key==='vehicle_locality'){const p=provinceFor(places,data.vehicle_province),options=(p?.localities||[]).map(n=>[n,n]);if(value&&!options.some(([k])=>fold(k)===fold(value)))options.unshift([value,value+' (dato ya informado; revisar)']);else value=options.find(([k])=>fold(k)===fold(value))?.[0]||value;control=choice(f.key,options,value,p?'Seleccioná localidad o dejala al PAS':'Elegí primero la provincia',!p)+'<small>Si no la encontrás o tenés dudas, dejala sin completar. La revisa tu PAS.</small>';}
    else if(client&&f.clientManagedByPAS){control=`<input name="data.${f.key}" type="text" readonly value="${esc(value)}" placeholder="No completar. Lo completa tu PAS." aria-describedby="help-${f.key}"><small id="help-${f.key}">Tu PAS completa este dato con la dirección y el código postal.</small>`;}
    else if(f.options)control=choice(f.key,Object.entries(f.options),value,'Por confirmar');
    else if(f.type==='textarea')control=`<textarea name="data.${f.key}" maxlength="${f.max||180}" rows="3">${esc(value)}</textarea>`;
    else control=`<input name="data.${f.key}" type="${type}" value="${esc(value)}" maxlength="${f.max||180}" ${extra} ${f.type==='money'?'placeholder="ARS, sin separador de miles"':''}>`;
    return `<label ${group==='owner'&&f.key!=='owner_same'?'data-owner-detail '+((data.owner_same||'yes')==='yes'?'hidden':''):''} ${f.when?'data-intake-when="'+esc(JSON.stringify(f.when))+'" '+(Object.entries(f.when).some(([k,v])=>data[k]!==v)?'hidden':''):''} class="${f.type==='textarea'?'ei-wide':''}"><span>${esc(f.label)}</span>${control}</label>`;
   }).join('')}</div>${client&&['vehicle','home'].includes(group)?'<p class="small ei-pas-managed">La suma asegurada la completa tu PAS. No necesitás informarla acá.</p>':''}${group==='payment'?`<p class="ei-note" data-card-note ${data.payment_method!=='card'?'hidden':''}>${esc(schema.paymentNotice)}</p><p class="small">El medio de pago y el estado del cobro se registran por separado. La recepción de este formulario no realiza un débito.</p>`:''}</section>`;
  }).join('');
 }
 function read(form){return Object.fromEntries([...new FormData(form)].filter(([k])=>k.startsWith('data.')).map(([k,v])=>[k.slice(5),String(v)]));}
 function visibility(form){if(!form)return;const data=read(form);for(const el of form.querySelectorAll('[data-owner-detail]'))el.hidden=(data.owner_same||'yes')==='yes';for(const el of form.querySelectorAll('[data-intake-when]')){let condition;try{condition=JSON.parse(el.dataset.intakeWhen)}catch{condition={}}el.hidden=Object.entries(condition).some(([k,v])=>data[k]!==v);}for(const el of form.querySelectorAll('[data-card-note]'))el.hidden=data.payment_method!=='card';}
 return {esc,render,read,visibility,loadPlaces,provinceFor};
})();
