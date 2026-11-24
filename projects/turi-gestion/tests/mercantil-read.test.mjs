import test from 'node:test';
import assert from 'node:assert/strict';
import {mercantilQaRead,MQA_TOKEN_URL} from '../worker/mercantil-qa.js';

// Provider contracts use only synthetic identities and credentials.
const account='700007',credentials={username:'QA-FICTIONAL-MAURO',password:'FICTIONAL_PASSWORD',subscriptionKey:'FICTIONAL_KEY'},token='FICTIONAL_TOKEN';
const query={service:'operaciones',from:'2026-11-01',to:'2026-11-24',page:1};
const producers=()=>({datos:[{cuenta:Number(account),nombre:'Productor QA ficticio'}],cantidad:1});
const record=service=>service==='operaciones'?{operacion:{poliza:7001,endoso:0,productor:{id:Number(account),nombre:'Productor QA ficticio'},asegurado:{nombre:'Cliente QA ficticio',documento:{numero:'PRIVATE_DOCUMENT'}},fecha_operacion:'2026-11-05',tipo:'Nueva'},cuota:{costo:{premio:100,moneda:'ARS'}}}:{poliza:7001,endoso:0,productor:service==='comisiones'?{id:Number(account)}:{cuenta:Number(account)},costo:{premio:100,moneda:'ARS'},comision:{totales:10},asegurado:{nombre:'Cliente QA ficticio',dni:'PRIVATE_DOCUMENT'},fecha_movimiento:'2026-11-05',fecha_cobranza:'2026-11-05',fecha_rechazo:'2026-11-05',motivo_rechazo:{descripcion:'Rechazo de prueba'}};
function mockProvider({service='operaciones',accounts=producers(),records=[record(service)],onCall=()=>{},override}={}){
 const calls=[];
 return {calls,fetchImpl:async(url,options)=>{
  calls.push({url,method:options.method});onCall(url,options);
  assert.equal(new URL(url).origin,'https://apidev.mercantilandina.com.ar');assert.equal(options.redirect,'manual');assert.equal(options.headers['Ocp-Apim-Subscription-Key'],credentials.subscriptionKey);
  if(url===MQA_TOKEN_URL)return Response.json({access_token:token,token_type:'Bearer'});
  assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer '+token);
  if(new URL(url).pathname==='/productores/v1/')return Response.json(accounts);
  if(override)return override();
  return Response.json({datos:records,total_elementos:records.length,total_paginas:records.length?1:0,pagina_actual:1});
 }};
}
function noSecrets(value){const body=JSON.stringify(value);for(const secret of [token,credentials.password,credentials.subscriptionKey,'PRIVATE_DOCUMENT'])assert.ok(!body.includes(secret));}

test('verifica cuenta de QA antes de consultar y devuelve sólo el resumen permitido',async()=>{
 const provider=mockProvider();const result=await mercantilQaRead(credentials,account,query,provider);
 assert.equal(provider.calls.length,3);const url=new URL(provider.calls[2].url);assert.equal(url.pathname,'/cartera/v1/operaciones');assert.equal(url.searchParams.get('cuentas'),account);assert.equal(url.searchParams.get('size'),'20');
 assert.equal(result.environment,'qa');assert.equal(result.pasAttributionVerified,true);assert.equal(result.productionReady,false);assert.equal(result.imported,false);assert.equal(result.automaticQuotes,false);assert.equal(result.records[0].insured,'Cliente QA ficticio');noSecrets(result);
});
test('verificar productor requiere sólo autenticación y consulta de cuentas',async()=>{
 const provider=mockProvider();const result=await mercantilQaRead(credentials,account,{service:'productor'},provider);assert.equal(provider.calls.length,2);assert.equal(result.records,undefined);noSecrets(result);
});
test('cuenta ausente o duplicada bloquea cartera sin revelar otras cuentas',async()=>{
 for(const datos of [[{cuenta:700008,nombre:credentials.password}],[],[{cuenta:Number(account)},{cuenta:Number(account)}]]){
  const provider=mockProvider({accounts:{datos}});await assert.rejects(mercantilQaRead(credentials,account,query,provider),e=>{noSecrets(e.message);return e.code==='MERCANTIL_QA_PAS_MISMATCH'});assert.equal(provider.calls.length,2);
 }
});
test('los registros de otra cuenta o sin productor nunca se muestran',async()=>{
 for(const rec of [{operacion:{productor:{id:700008}}},{operacion:{productor:{}}},null]){
  const provider=mockProvider({records:[rec]});await assert.rejects(mercantilQaRead(credentials,account,query,provider),e=>e.code==='MERCANTIL_QA_SCOPE');
 }
});
test('los cuatro servicios usan parámetros de cuenta específicos y rama explícita para comisiones',async()=>{
 for(const service of ['operaciones','cobranzas','rechazos','comisiones']){
  const provider=mockProvider({service});const result=await mercantilQaRead(credentials,account,{...query,service,...(service==='comisiones'?{branch:4}:{})},provider);
  const url=new URL(provider.calls[2].url);assert.equal(url.searchParams.get(service==='operaciones'?'cuentas':'cuenta'),account);assert.equal(url.pathname,'/cartera/v1/'+service);if(service==='comisiones')assert.equal(url.searchParams.get('rama'),'4');noSecrets(result);
 }
});
test('rutas, cuenta, fechas, tamaño y página no pueden cambiarse desde entradas libres',async()=>{
 for(const [pas,input] of [[account,{...query,service:'https://evil.test'}],['700007&cuentas=700008',query],[account,{...query,from:'2026-02-30'}],[account,{...query,to:'2026-12-25'}],[account,{...query,page:0}],[account,{...query,page:'1'}],[account,{...query,service:'comisiones'}]]){
  const provider=mockProvider();await assert.rejects(mercantilQaRead(credentials,pas,input,provider),e=>e.status===400);assert.equal(provider.calls.length,0);
 }
});
test('fallos de servicio y respuestas inválidas no filtran datos ni aparentan éxito',async()=>{
 for(const override of [()=>new Response(credentials.password,{status:403}),()=>new Response(token,{status:302}),()=>new Response('<html>'+credentials.password+'</html>'),()=>Response.json({datos:[],total_elementos:0,total_paginas:0,pagina_actual:2}),()=>new Response('x'.repeat(2*1024*1024+1))]){
  await assert.rejects(mercantilQaRead(credentials,account,query,mockProvider({override})),e=>{noSecrets(e.message);return e.status>=400});
 }
});
