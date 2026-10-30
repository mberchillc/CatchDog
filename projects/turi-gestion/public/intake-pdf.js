'use strict';
window.TuriIntakePDF=(()=>{
 const clean=v=>String(v??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
 async function create({receipt,summary={},logoBytes}){
  if(!receipt?.caseId||!receipt?.responseId)throw Error('Primero enviá el formulario al productor.');
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),logo=await doc.embedPng(logoBytes||await(await fetch('/assets/logo.png')).arrayBuffer());
  const W=595.28,H=841.89,M=43,width=W-2*M,navy=rgb(.12,.22,.27),muted=rgb(.38,.46,.49),blue=rgb(.88,.94,.96);let page,y,pages=[];
  function newPage(){page=doc.addPage([W,H]);pages.push(page);page.drawImage(logo,{x:M,y:H-61,width:157.2,height:24});page.drawText('GESTIÓN',{x:220,y:H-50,size:9,font,color:muted});page.drawText('DATOS PARA TU SEGURO',{x:W-M-155,y:H-50,size:9,font:bold,color:navy});y=H-105;}
  const wrap=(value,size,max=width)=>{const lines=[];let line='';for(const word of clean(value).split(/\s+/)){if(font.widthOfTextAtSize(word,size)>max){if(line){lines.push(line);line='';}let part='';for(const c of word){if(font.widthOfTextAtSize(part+c,size)>max&&part){lines.push(part);part='';}part+=c;}line=part;}else if(line&&font.widthOfTextAtSize(line+' '+word,size)>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
  function text(value,size=10,b=false){for(const line of wrap(value,size)){if(y<75)newPage();page.drawText(line,{x:M,y,size,font:b?bold:font,color:b?navy:muted});y-=size*1.45;}y-=7;}
  newPage();doc.setTitle('Turi - Constancia de formulario recibido');doc.setAuthor('Turi Gestión');
  text('Tu información está recibida.',25,true);text('Solicitud de '+receipt.branch+' - '+new Date().toLocaleDateString('es-AR'),10);
  page.drawRectangle({x:M,y:y-29,width,height:32,color:blue});page.drawText('PENDIENTE DE REVISIÓN DEL PRODUCTOR',{x:M+12,y:y-17,size:10,font:bold,color:navy});y-=55;
  text('Tomador: '+(summary.name||'Datos enviados al productor'),12,true);
  if(summary.risk)text('Bien: '+summary.risk,11);if(summary.company)text('Compañía prevista: '+summary.company,11);
  if(summary.payment)text('Medio de pago informado: '+summary.payment,10);
  text('El productor revisará los datos, los documentos y la información de cobro antes de continuar con la compañía.',10);
  text('Esta constancia no es una póliza, no otorga cobertura y no confirma un cobro o débito.',10,true);
  y-=12;text('Cómo continúa tu solicitud',15,true);text('Compartí con tu productor esta constancia o el enlace de devolución. Dentro de Turi podrá recuperar la respuesta, corregir los datos e incorporarlos a tu expediente.',10);
  text('Los originales de las fotografías y documentos permanecen asociados a la respuesta para la revisión del productor.',10);
  text('El CBU completo y los datos internos de cobro se mantienen en el expediente privado. Esta constancia utiliza referencias y datos mínimos.',9);
  y-=12;text('Referencia del formulario',12,true);
  const form=doc.getForm();
  for(const [key,label,value]of [['turi_case_id','Caso',receipt.caseId],['turi_response_id','Respuesta',receipt.responseId]]){
   text(label,9,true);if(y<110)newPage();const f=form.createTextField(key);f.setText(value);f.enableReadOnly();f.addToPage(page,{x:M,y:y-22,width,height:25,fontSize:9,borderWidth:.5,borderColor:rgb(.8,.85,.85)});f.setFontSize(9);y-=43;
  }
  text('Devolución al productor',12,true);text(receipt.returnUrl,8);
  text('Para corregir lo informado después del envío, contactá al productor. Él puede editar la información en Turi.',9);
  form.updateFieldAppearances(font);
  pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:46},end:{x:W-M,y:46},thickness:.5,color:rgb(.82,.87,.87)});p.drawText('Turi Gestión | Datos recibidos, sujetos a revisión.',{x:M,y:30,size:8,font,color:muted});p.drawText((i+1)+' / '+pages.length,{x:W-M-25,y:30,size:8,font,color:muted});});
  return doc.save();
 }
 async function identify(file){if(file.size>10*1024*1024)throw Error('La constancia debe pesar hasta 10 MB.');const bytes=await file.arrayBuffer(),pdf=await window.PDFLib.PDFDocument.load(bytes);let id,response;try{id=pdf.getForm().getTextField('turi_case_id').getText();response=pdf.getForm().getTextField('turi_response_id').getText();}catch{throw Error('Este PDF no es una constancia del formulario Turi. Podés adjuntarlo en Documentos y cargar sus datos a mano.');}if(!/^[A-Za-z0-9_-]{10,80}$/.test(id||'')||!/^[A-Za-z0-9_-]{10,80}$/.test(response||''))throw Error('No pudimos verificar la referencia de esta constancia.');return {caseId:id,responseId:response};}
 return {create,identify};
})();
