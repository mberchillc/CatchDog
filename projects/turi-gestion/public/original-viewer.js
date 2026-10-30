'use strict';
window.TuriOriginalViewer=(()=>{
 let sequence=0,dialog=null,objectURL='',returnFocus=null,pdfController=null;
 function close(){sequence++;pdfController?.destroy();pdfController=null;const current=dialog;dialog=null;if(objectURL){URL.revokeObjectURL(objectURL);objectURL='';}if(current){try{current.close?.();}catch{}current.remove();}if(returnFocus?.isConnected)returnFocus.focus?.({preventScroll:true});returnFocus=null;}
 async function open({file,load,trigger}){
  close();const turn=++sequence;returnFocus=trigger||document.activeElement;const esc=window.TuriIntakeFields.esc;
  dialog=document.createElement('dialog');dialog.className='ei-original-dialog';dialog.setAttribute('aria-labelledby','original-viewer-title');dialog.innerHTML=`<header><div><h2 id="original-viewer-title">${esc(file.title||file.filename||'Documento recibido')}</h2><p>${esc(file.filename||'Original completo')}</p></div><button type="button" data-original-close aria-label="Cerrar original">Cerrar ✕</button></header><div class="ei-original-body" aria-live="polite"><p role="status">Recuperando original…</p></div><footer><span>Archivo original, sin recortes.</span><a hidden data-original-download>Descargar original</a></footer>`;document.body.append(dialog);const shell=dialog;
  shell.querySelector('[data-original-close]').onclick=close;shell.addEventListener('cancel',e=>{e.preventDefault();close();});shell.addEventListener('close',()=>{if(dialog===shell)close();});try{if(shell.showModal)shell.showModal();else shell.setAttribute('open','');}catch{shell.setAttribute('open','');}shell.querySelector('[data-original-close]').focus?.({preventScroll:true});
  try{const response=await load();if(turn!==sequence)return;let blob=response instanceof Blob?response:await response.blob();if(turn!==sequence)return;objectURL=URL.createObjectURL(blob);const body=shell.querySelector('.ei-original-body'),download=shell.querySelector('[data-original-download]');download.href=objectURL;download.download=file.filename||'Documento-Turi';download.hidden=false;download.textContent='Descargar original';body.replaceChildren();
   if(['image/jpeg','image/png','image/webp'].includes(file.mime)){const img=document.createElement('img');img.src=objectURL;img.alt='Original completo: '+(file.title||file.filename||'Documento');body.append(img);}
   else if(file.mime==='application/pdf'){body.classList.add('ei-pdf-host');const controller=await window.TuriPdfPreview.open({blob,container:body,isCurrent:()=>turn===sequence});if(turn!==sequence){controller.destroy();return;}pdfController=controller;}
   else{const p=document.createElement('p');p.textContent='Este formato se conserva como original. Descargalo para abrirlo.';body.append(p);}
  }catch(error){if(turn===sequence){const body=shell.querySelector('.ei-original-body');body.textContent='No pudimos abrir el original. '+error.message;body.setAttribute('role','alert');}}
 }
 return {open,close};
})();
