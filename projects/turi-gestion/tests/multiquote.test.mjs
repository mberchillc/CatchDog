import test from 'node:test';
import assert from 'node:assert/strict';
import {mqExtract,mqPrepare,mqRunDemo,mqRunConnectors,MQ_CANDIDATES} from '../worker/multiquote.js';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const query='¿Cuánto me cuesta por mes una póliza contra terceros completo viviendo en Villa Ballester para un Chevrloet Celta 1.4 LT 2014?';
const risk=mqExtract(query);
test('extrae el caso del PAS y mantiene faltantes sin inventar CP, uso ni provincia',()=>{
 assert.equal(risk.brand,'Chevrolet');assert.equal(risk.model,'Celta');assert.equal(risk.version,'1.4 LT');assert.equal(risk.year,'2014');assert.equal(risk.locality,'Villa Ballester');assert.equal(risk.coverage,'third_party_full');
 assert.equal(risk.postalCode,'');assert.equal(risk.usage,'');assert.equal(risk.province,'');assert.equal(mqExtract('2014 o 2015, no quiero terceros completo').year,'');assert.equal(mqExtract('2014, no quiero terceros completo').coverage,'');
 const known=mqExtract(query+' uso particular, CP 1653, provincia Buenos Aires');assert.equal(known.usage,'particular');assert.equal(known.postalCode,'1653');assert.equal(known.province,'Buenos Aires');
});
test('preparación no consulta APIs ni IA sin configuración y expone bloqueos reales',async()=>{
 let called=false;const out=await mqPrepare(query,{AI:{run:()=>{called=true;throw Error()}}});assert.equal(called,false);assert.equal(out.reader,'rules');assert.equal(out.liveAvailable,false);assert.deepEqual(out.missing.map(x=>x.key),['province','postalCode','usage']);assert.equal(out.candidates.length,2);assert.ok(MQ_CANDIDATES.every(x=>x.status==='access_required'));
});
test('agente acotado: no precios, URLs, datos inventados ni acciones de aprobación',async()=>{
 const out=await mqPrepare(query,{TURI_QUOTE_AGENT_ENABLED:'true',AI:{run:async()=>({response:JSON.stringify({brand:'Ford',model:'Celta',year:'2025',province:'Neuquén',postalCode:'1653',usage:'particular',premiumCents:123,candidates:[{source:'https://evil.invalid'}],approve:true})})}});
 assert.equal(out.reader,'ai_assisted');assert.equal(out.risk.brand,'Chevrolet');assert.equal(out.risk.year,'2014');assert.equal(out.risk.postalCode,'');assert.equal(out.risk.usage,'');assert.equal(out.risk.province,'');assert.ok(!JSON.stringify(out).includes('evil.invalid'));assert.equal(out.premiumCents,undefined);
 const failed=await mqPrepare(query,{TURI_QUOTE_AGENT_ENABLED:'true',AI:{run:async()=>{throw Error('credential-secret')}}});assert.equal(failed.agentStatus,'unavailable');assert.ok(!JSON.stringify(failed).includes('credential-secret'));
});
test('fixture explícito sólo para el caso modelado, importes siempre simulados',async()=>{
 const r=await mqRunDemo(risk);assert.equal(r.supported,true);assert.equal(r.results.length,2);assert.ok(r.results.every(o=>o.sourceType==='simulation'&&o.providerName.includes('ficticia')&&o.reference.startsWith('FIXTURE-')));
 for(const patch of [{year:'2015'},{model:'Onix'},{coverage:'liability'},{locality:'Córdoba'}]){const out=await mqRunDemo({...risk,...patch});assert.equal(out.supported,false);assert.equal(out.results.length,0);}
});
test('consultas paralelas, fallo parcial y respuesta inválida no contaminan otras consultas',async()=>{
 let started=0,release;const gate=new Promise(resolve=>{release=resolve});const valid={sourceType:'simulation',premiumCents:100,currency:'ARS',period:'monthly',coverage:'Ejemplo'};
 const run=mqRunConnectors(risk,[{id:'a',name:'A',quote:async()=>{started++;await gate;return valid}},{id:'b',name:'B',quote:async()=>{started++;await gate;throw Error('token-private')}},{id:'c',name:'C',quote:async()=>({sourceType:'insurer_api',premiumCents:100,currency:'ARS',period:'monthly',coverage:'Falso real'})}]);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(started,2);release();const r=await run;assert.deepEqual(r.map(x=>x.status),['quoted','error','error']);assert.ok(!JSON.stringify(r).includes('token-private'));
});
test('tiempo máximo individual y ausencia de oferta son estados separados',async()=>{
 const r=await mqRunConnectors(risk,[{id:'slow',name:'Lenta',quote:()=>new Promise(()=>{})},{id:'none',name:'Fuera',quote:async()=>({status:'no_offer'})}],{timeoutMs:20});assert.deepEqual(r.map(x=>x.status),['error','no_offer']);
});
