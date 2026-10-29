'use strict';
window.TuriQuotePDF=(()=>{
 const clean=v=>String(v??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2026/g,'...').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:0}).format(n/100);
 const date=v=>v?new Date(v.length===10?v+'T12:00:00Z':v).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):'No informada';
 async function create({record,estimate,producerName='',clientName='',logoBytes}){
  if(!record?.id||!estimate?.amountCents||estimate.insurerQuote!==false)throw Error('Guardá y calculá la estimación antes de descargar.');
  const lib=window.PDFLib;if(!lib)throw Error('No se cargó el generador de PDF. Actualizá la página y reintentá.');
  const {PDFDocument,StandardFonts,rgb}=lib,pdf=await PDFDocument.create();
  const normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo=await pdf.embedPng(logoBytes||await (await fetch('/assets/logo.png')).arrayBuffer());
  const navy=rgb(.12,.22,.27),muted=rgb(.36,.45,.49),blue=rgb(.88,.94,.96),line=rgb(.83,.88,.89),cream=rgb(.98,.98,.96);
  const W=595.28,H=841.89,M=44,BOTTOM=70,width=W-2*M;let page,y,pages=[];
  const wrap=(text,size,maxWidth,font=normal)=>{
   const lines=[];for(const para of clean(text).split('\n')){let current='';for(const word of para.split(/\s+/)){if(!word)continue;if(font.widthOfTextAtSize(word,size)>maxWidth){if(current){lines.push(current);current='';}let chunk='';for(const c of word){if(font.widthOfTextAtSize(chunk+c,size)>maxWidth&&chunk){lines.push(chunk);chunk='';}chunk+=c;}current=chunk;}else if(current&&font.widthOfTextAtSize(current+' '+word,size)>maxWidth){lines.push(current);current=word;}else current+=(current?' ':'')+word;}lines.push(current);}return lines;
  };
  const text=(value,x,top,size=10,font=normal,color=navy)=>page.drawText(clean(value),{x,y:top,size,font,color});
  function newPage(){page=pdf.addPage([W,H]);pages.push(page);page.drawImage(logo,{x:M,y:H-64,width:157.2,height:24});text('GESTIÓN',M+173,H-53,9,normal,muted);text('COTIZACIÓN PRELIMINAR',W-M-162,H-52,9,bold,muted);page.drawLine({start:{x:M,y:H-84},end:{x:W-M,y:H-84},thickness:1,color:line});y=H-114;}
  function ensure(height){if(y-height<BOTTOM)newPage();}
  function paragraph(value,{size=10,font=normal,color=navy,gap=8,maxWidth=width,x=M}={}){const lines=wrap(value,size,maxWidth,font),leading=size*1.45;for(const l of lines){ensure(leading);text(l,x,y,size,font,color);y-=leading;}y-=gap;}
  function section(title){ensure(36);y-=7;paragraph(title,{size:12,font:bold,gap:10});}
  function cells(items){for(let i=0;i<items.length;i+=2){const pair=items.slice(i,i+2),cellWidth=(width-20)/2,lines=pair.map(([,v])=>wrap(v||'Por confirmar',10.5,cellWidth-20)),height=Math.max(55,...lines.map(x=>28+x.length*14));ensure(height+8);pair.forEach(([label],j)=>{const x=M+j*(cellWidth+20);page.drawRectangle({x,y:y-height+10,width:cellWidth,height:height-3,color:cream});text(label.toUpperCase(),x+10,y-5,8,bold,muted);lines[j].forEach((l,k)=>text(l,x+10,y-23-k*14,10.5,normal,navy));});y-=height+9;}}
  newPage();
  pdf.setTitle(clean('Cotización Turi - '+[record.risk?.brand,record.risk?.model,record.risk?.year].filter(Boolean).join(' ')));
  pdf.setAuthor('Turi Gestión');pdf.setSubject('Estimación preliminar de seguro, sujeta a aprobación final');
  paragraph('Tu próxima cobertura, con Turi.',{size:24,font:bold,gap:13});
  paragraph('Referencia '+record.id.slice(0,10).toUpperCase()+' - versión '+record.version+' | '+date(estimate.calculatedAt),{size:9,color:muted,gap:18});
  page.drawRectangle({x:M,y:y-31,width,height:34,color:blue});text('VALOR APROXIMADO SUJETO A APROBACIÓN FINAL',M+13,y-17,10,bold,navy);y-=61;
  const amountLabel=estimate.amountMode==='from'?'Desde ':'Aprox. ';
  paragraph(amountLabel+money(estimate.amountCents)+' por mes',{size:31,font:bold,gap:10});
  paragraph('Rango de referencia: '+money(estimate.minCents)+' a '+money(estimate.maxCents)+(estimate.upperOpen?' o más':'')+' mensuales.',{size:10,color:muted,gap:5});
  paragraph('Cobertura usada en el cálculo: '+estimate.coverageLabel+'.',{size:10,color:muted,gap:14});
  if(estimate.extrasStatus==='pending')paragraph('Granizo y cristales: alcance e impacto en el precio pendientes de confirmación.',{size:10,font:bold,gap:8});
  section('Datos del pedido');
  const risk=record.risk||{},details=record.details||{};
  const coverage={liability:'Responsabilidad civil',third_party_full:'Terceros completo',comprehensive:'Todo riesgo'}[risk.coverage]||'Por definir';
  cells([
   ['Vehículo',[risk.brand,risk.model,risk.year].filter(Boolean).join(' ')||'Por confirmar'],
   ['Versión',risk.version],
   ['Lugar de guarda',[risk.locality,risk.province].filter(Boolean).join(', ')],
   ['Cobertura solicitada',coverage],
   ['Granizo / cristales',(details.hail==='yes'?'Granizo solicitado':details.hail==='no'?'Granizo no solicitado':'Granizo por definir')+' / '+(details.glass==='yes'?'Cristales solicitados':details.glass==='no'?'Cristales no solicitados':'Cristales por definir')],
   ['Uso',risk.usage==='particular'?'Particular':risk.usage==='comercial'?'Comercial':'Por confirmar'],
   ['Cliente',clientName||'Por identificar'],
   ['Productor titular',producerName||'Por confirmar']
  ]);
  paragraph('Esta estimación no confirma sumas aseguradas, aceptación del riesgo ni todos los adicionales. El precio y las condiciones definitivos requieren revisión del PAS y aprobación de la aseguradora.',{size:9,color:muted,gap:5});
  newPage();
  paragraph('Bases de esta orientación.',{size:23,font:bold,gap:18});
  section('Cómo se calculó');
  paragraph(estimate.method,{size:10,gap:8});
  paragraph('Perfil de referencia: '+estimate.profile+'.',{size:10,gap:12});
  section('Datos y condiciones pendientes');
  for(const note of estimate.assumptions||[])paragraph('- '+note,{size:9.5,gap:4});
  section('Fuentes utilizadas');
  for(const source of estimate.sources||[]){paragraph(source.title,{size:10,font:bold,gap:3});paragraph(source.url,{size:8.5,color:muted,gap:3});paragraph('Publicación: '+date(source.publishedOn)+' | Revisión de la referencia: '+date(source.reviewedAt),{size:8.5,color:muted,gap:12});}
  section('Alcance del documento');
  paragraph('Valor aproximado sujeto a aprobación final. Las referencias públicas no son una oferta de una aseguradora. La disponibilidad, la suma asegurada, los límites, las exclusiones, los adicionales y el importe final se confirman al evaluar el riesgo. Este documento no otorga cobertura ni reemplaza una póliza.',{size:9,color:muted,gap:10});
  pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:48},end:{x:W-M,y:48},thickness:.7,color:line});p.drawText('Turi Gestión | Documento orientativo. No otorga cobertura.',{x:M,y:31,size:8,font:normal,color:muted});p.drawText('Página '+(i+1)+' de '+pages.length,{x:W-M-62,y:31,size:8,font:normal,color:muted});});
  return pdf.save();
 }
 const filename=record=>'Cotizacion-Turi-'+clean(record.risk?.model||'Auto').replace(/[^a-z0-9_-]/gi,'-')+'-'+record.id.slice(0,8)+'-v'+record.version+'.pdf';
 return {create,filename};
})();
