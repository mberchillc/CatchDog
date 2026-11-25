'use strict';
window.TuriMercantilAutoQa=(()=>{
 const templates={vehicles:{query:'',year:new Date().getFullYear()},schemes:{},quote:{localidad:{codigo_postal:0},vehiculo:{infoauto:0,anio:new Date().getFullYear(),uso:1,gnc:false,rastreo:0},comision:0,bonificacion:0,periodo:1,cuotas:1,pago:{tipo_pago:'C'},ajuste_suma:0,iva:5},inspection:{codigo_producto:0,opcion:'AUTOINSPECCION',dominio:'',apellido:'',nombre:''},subscribe:{codigo_producto:0,tomador:{dni:0,sexo:''},vehiculo:{dominio:'',chasis:'',motor:''}},requests:{}};
 templates.client={apellido:'',nombre:'',dni:0,sexo:'',nacimiento:'',calle:'',numero:'',departamento:''};
 const labels={vehicles:'Buscar vehículo en catálogo',schemes:'Consultar esquemas comerciales',quote:'Cotizar en TEST',inspection:'Generar autoinspección TEST',client:'Crear tomador en TEST',subscribe:'Solicitar emisión en TEST',requests:'Consultar solicitudes TEST'};
 function html(){return `<details class="w-span" id="mercantil-auto-qa"><summary><strong>Ensayo de Automotores · TEST</strong></summary><p>Catálogo, cotización, inspección y solicitud de emisión en el entorno de pruebas de Mercantil. Los resultados se conservan separados de la cartera y no dan cobertura real.</p><label>Operación<select name="auto_qa_action">${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Datos para esta operación<textarea name="auto_qa_input" rows="14" spellcheck="false" style="font-family:monospace"></textarea></label><p class="small">Primero buscá el vehículo y consultá los esquemas; usá los códigos que devuelve Mercantil. La emisión de ensayo usa CONVENIO y no envía datos bancarios.</p><label class="check"><input type="checkbox" name="auto_qa_confirm"><span>Confirmo el ensayo en TEST con los datos de esta operación.</span></label><button type="button" name="auto_qa_execute">Ejecutar en TEST</button><button type="button" name="auto_qa_refresh">Ver resultado guardado</button><p role="status" id="auto-qa-progress"></p><pre id="auto-qa-result" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:580px;overflow:auto"></pre></details>`;}
 async function mount(form,saved,record,isActive){
  if(!record.id)return;const root=form.querySelector('#mercantil-auto-qa');if(!root)return;
  const select=root.querySelector('[name="auto_qa_action"]'),editor=root.querySelector('textarea'),out=root.querySelector('#auto-qa-result'),progress=root.querySelector('#auto-qa-progress'),execute=root.querySelector('[name="auto_qa_execute"]'),refresh=root.querySelector('[name="auto_qa_refresh"]');
  const path='/connections/'+encodeURIComponent(record.id)+'/mercantil-qa/auto';let busy=false;
  const live=()=>isActive(saved)&&document.querySelector('#company-access-form')===form;
  const show=result=>{if(!live())return;form.dataset.version=String(result.connectionVersion);out.textContent=JSON.stringify(result,null,2);};
  const load=async()=>{const result=await saved.request(path);show(result);return result;};
  const template=()=>{editor.value=JSON.stringify(templates[select.value],null,2);};select.addEventListener('change',template);template();
  async function act(send){if(busy||!live())return;busy=true;execute.disabled=refresh.disabled=true;progress.textContent=send?'Consultando Mercantil TEST…':'Recuperando el ensayo guardado…';
   try{if(send){if(!form.elements.authorized.checked||!form.elements.auto_qa_confirm.checked)throw Error('Confirmá la autorización y el ensayo TEST.');let input;try{input=JSON.parse(editor.value);}catch{throw Error('Revisá los datos de la operación: deben tener formato JSON válido.');}show(await saved.request(path,'POST',{expectedVersion:Number(form.dataset.version),environment:'qa',authorized:true,action:select.value,input}));}else await load();if(live())progress.textContent='Resultado de TEST guardado. No se modificó la cartera.';}
   catch(e){if(!live())return;if(e.status===401){saved.expired(e);return;}progress.textContent=e.message;try{await load();}catch{}}
   finally{busy=false;if(live())execute.disabled=refresh.disabled=false;}
  }
  execute.addEventListener('click',()=>act(true));refresh.addEventListener('click',()=>act(false));
 }
 return {html,mount};
})();
