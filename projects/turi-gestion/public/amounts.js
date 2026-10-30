'use strict';
// Shared by the browser and server. Money is stored as exact integer cents.
globalThis.TuriAmounts=(()=>{
 const invalid=()=>{throw Error('Revisá el importe. Podés usar 56318,58, 56.318,58 o 56,318.58.');};
 function parseCents(value){
  if(typeof value!=='string'&&typeof value!=='number')return invalid();
  let s=String(value).trim().replace(/^(?:AR\$|ARS|USD|US\$|\$)\s*/i,'').replace(/\s*(?:ARS|USD)$/i,'').replace(/[\s\u00a0\u202f]/g,'');
  if(!/^\d[\d.,]*$/.test(s)||s.length>35)return invalid();
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');let whole=s,fraction='';
  function groups(v,sep){const a=v.split(sep);if(a.length===1)return /^\d+$/.test(v)?v:invalid();if(!/^\d{1,3}$/.test(a[0])||a.slice(1).some(x=>!/^\d{3}$/.test(x)))return invalid();return a.join('');}
  if(comma>=0&&dot>=0){const decimal=comma>dot?',':'.',group=decimal===','?'.':',';const a=s.split(decimal);if(a.length!==2||!/^\d{1,2}$/.test(a[1]))return invalid();whole=groups(a[0],group);fraction=a[1];}
  else if(comma>=0||dot>=0){const sep=comma>=0?',':'.',a=s.split(sep);if(a.length===2&&/^\d{1,2}$/.test(a[1])){whole=a[0];fraction=a[1];}else whole=groups(s,sep);}
  if(!/^\d+$/.test(whole))return invalid();const cents=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));if(cents>1000000000000n)return invalid();return Number(cents);
 }
 const input=cents=>String(Math.trunc(cents/100))+','+String(cents%100).padStart(2,'0');
 const normalizeDecimal=value=>{const cents=parseCents(value),clean=String(value).replace(/(?:ARS|USD|US\$|AR\$|\$|\s)/gi,''),fraction=clean.match(/[.,](\d{1,2})$/)?.[1]||'';return String(Math.trunc(cents/100))+(fraction?'.'+String(cents%100).padStart(2,'0').slice(0,fraction.length):'');};
 return {parseCents,input,normalizeDecimal};
})();
