import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('public/mercantil-auto-form.js','utf8');
const fixture={connectionVersion:4,environment:'qa',quote:{id:'QA-FIXTURE',vehiculo:{nombre:'Vehículo ficticio',anio:2012,infoauto:777},localidad:{nombre:'Localidad ficticia',codigo_postal:1000},suma_asegurada:1000000,periodo:1,cuotas:1,comision:10,bonificacion:0,resultado:[{codigo_producto:800,texto:'Cobertura de ensayo',costo:100,inspeccion:{opciones:[]}}]},vehicles:{year:2012,datos:[{infoauto:777,nombre:'Vehículo ficticio'}]},schemes:[{comision:10,bonificacion:0,descripcion:'Condición de ensayo'}]};
async function setup(request){const dom=new JSDOM('<form id="company-access-form" data-version="1"><input name="authorized" type="checkbox" checked></form>',{runScripts:'outside-only'});dom.window.eval(source);const form=dom.window.document.querySelector('form');form.insertAdjacentHTML('beforeend',dom.window.TuriMercantilAutoQa.html());const saved={request,expired(){throw Error('unexpected expiration')}};await dom.window.TuriMercantilAutoQa.mount(form,saved,{id:'QA-CONNECTION'},()=>true);return {dom,form,root:form.querySelector('#mercantil-auto-qa')};}
function choose(f,value){const s=f.form.querySelector('[name="auto_qa_action"]');s.value=value;s.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));}
test('el ensayo muestra campos, tabla y estado legibles sin JSON, y escapa contenido del proveedor',async()=>{
 const f=await setup(async()=>({...fixture,quote:{...fixture.quote,vehiculo:{...fixture.quote.vehiculo,nombre:'<img src=x onerror=alert(1)>'}}}));
 assert.equal(f.root.querySelectorAll('pre,textarea').length,0);assert.ok(f.root.textContent.includes('Cotización TEST QA-FIXTURE'));assert.equal(f.root.querySelectorAll('img').length,0);assert.equal(f.root.querySelectorAll('tbody tr').length,1);
 choose(f,'client');assert.ok(f.root.querySelector('[name="maq_birth"]'));assert.ok(f.root.textContent.includes('Fecha de nacimiento'));assert.equal(f.form.dataset.version,'4');
 choose(f,'inspection');assert.ok(f.root.textContent.includes('no informó modalidades de inspección'));assert.equal(f.root.querySelectorAll('pre,textarea').length,0);
});
test('cotizar envía sólo los valores de los campos y conserva el control de versión sin exponer la respuesta técnica',async()=>{
 const calls=[];const f=await setup(async(path,method,body)=>{calls.push({path,method,body});return {...fixture,connectionVersion:method?6:4};});choose(f,'quote');f.form.querySelector('[name="auto_qa_confirm"]').checked=true;f.root.querySelector('[name="auto_qa_execute"]').click();
 await new Promise(resolve=>setImmediate(resolve));const sent=calls.find(x=>x.method==='POST');assert.equal(sent.body.expectedVersion,4);assert.equal(sent.body.environment,'qa');assert.equal(sent.body.action,'quote');assert.equal(sent.body.input.vehiculo.infoauto,777);assert.equal(sent.body.input.vehiculo.anio,2012);assert.equal(sent.body.input.localidad.codigo_postal,1000);assert.equal(sent.body.input.comision,10);assert.equal(f.form.dataset.version,'6');assert.equal(f.root.querySelectorAll('pre,textarea').length,0);assert.ok(!f.root.textContent.includes('connectionVersion'));
});
