'use strict';
window.TuriIntakeFields=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(schema,data={},branch='Autos'){
  return Object.entries(schema.groups).map(([group,title])=>{
   const fields=schema.fields.filter(f=>f.group===group&&(!f.branches||f.branches.includes(branch)));if(!fields.length)return '';
   return `<section class="ei-section" data-intake-group="${group}"><div class="eyebrow">${group==='holder'?'QUIÉN CONTRATA':group==='owner'?'A QUIÉN PERTENECE':group==='payment'?'CÓMO SE PAGARÁ':'DATOS DEL RIESGO'}</div><h2>${esc(title)}</h2>${group==='owner'?'<p class="small">Tomador y titular pueden ser personas distintas. Indicá el vínculo y el interés asegurable para la revisión del PAS.</p>':''}<div class="ei-fields">${fields.map(f=>{
    const value=data[f.key]||'',type=['date','email','tel','number'].includes(f.type)?f.type:['money','year','cbu','last4','expiry'].includes(f.type)?'text':'text',extra=f.type==='cbu'?' inputmode="numeric" autocomplete="off"':f.type==='money'?' inputmode="decimal"':f.type==='year'||f.type==='last4'?' inputmode="numeric"':'';
    return `<label ${group==='owner'&&f.key!=='owner_same'?'data-owner-detail '+((data.owner_same||'yes')==='yes'?'hidden':''):''} ${f.when?'data-intake-when="'+esc(JSON.stringify(f.when))+'" '+(Object.entries(f.when).some(([k,v])=>data[k]!==v)?'hidden':''):''} class="${f.type==='textarea'?'ei-wide':''}"><span>${esc(f.label)}</span>${f.options?`<select name="data.${f.key}"><option value="">Por confirmar</option>${Object.entries(f.options).map(([k,v])=>`<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea name="data.${f.key}" maxlength="${f.max||180}" rows="3">${esc(value)}</textarea>`:`<input name="data.${f.key}" type="${type}" value="${esc(value)}" maxlength="${f.max||180}" ${extra} ${f.type==='money'?'placeholder="ARS, sin separador de miles"':''}>`}</label>`;
   }).join('')}</div>${group==='payment'?`<p class="ei-note" data-card-note ${data.payment_method!=='card'?'hidden':''}>${esc(schema.paymentNotice)}</p><p class="small">El medio de pago y el estado del cobro se registran por separado. La recepción de este formulario no realiza un débito.</p>`:''}</section>`;
  }).join('');
 }
 function read(form){return Object.fromEntries([...new FormData(form)].filter(([k])=>k.startsWith('data.')).map(([k,v])=>[k.slice(5),String(v)]));}
 function visibility(form){if(!form)return;const data=read(form);for(const el of form.querySelectorAll('[data-owner-detail]'))el.hidden=(data.owner_same||'yes')==='yes';for(const el of form.querySelectorAll('[data-intake-when]')){let condition;try{condition=JSON.parse(el.dataset.intakeWhen)}catch{condition={}}el.hidden=Object.entries(condition).some(([k,v])=>data[k]!==v);}for(const el of form.querySelectorAll('[data-card-note]'))el.hidden=data.payment_method!=='card';}
 return {esc,render,read,visibility};
})();
