'use strict';
window.TuriPdfPreview=(()=>{
 let library;
 async function open({blob,container,isCurrent=()=>true,onReady=()=>{},libraryOverride}){
  const lib=libraryOverride||await (library||=import('/vendor/pdfjs/pdf.min.mjs'));if(!isCurrent())return {destroy(){}};
  lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';const loading=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,useWasm:false,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});let document,task=null,number=1,epoch=0,closed=false;
  const destroy=()=>{closed=true;epoch++;task?.cancel?.();loading.destroy?.().catch?.(()=>{});document?.destroy?.().catch?.(()=>{});container.replaceChildren();};
  try{document=await loading.promise;if(!isCurrent()){destroy();return {destroy};}
   container.innerHTML='<div class="ei-pdf-tools"><button type="button" data-pdf="prev">Anterior</button><span data-pdf-page role="status"></span><button type="button" data-pdf="next">Siguiente</button><label>Zoom<select data-pdf="zoom"><option value="fit">Ajustar al ancho</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div><div class="ei-pdf-scroll"><canvas aria-label="Página del PDF"></canvas></div>';
   const canvas=container.querySelector('canvas'),pageLabel=container.querySelector('[data-pdf-page]'),prev=container.querySelector('[data-pdf=prev]'),next=container.querySelector('[data-pdf=next]'),zoom=container.querySelector('[data-pdf=zoom]'),scroll=container.querySelector('.ei-pdf-scroll');let rendering=false;
   async function render(){const own=++epoch;rendering=true;prev.disabled=true;next.disabled=true;zoom.disabled=true;pageLabel.textContent='Cargando página '+number+'…';task?.cancel?.();try{const page=await document.getPage(number);if(closed||own!==epoch||!isCurrent())return;const base=page.getViewport({scale:1}),scale=zoom.value==='fit'?Math.max(.3,(scroll.clientWidth>40?scroll.clientWidth-40:850)/base.width):Number(zoom.value),viewport=page.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(12000000/(viewport.width*viewport.height)),20000/Math.max(viewport.width,viewport.height));canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';const context=canvas.getContext('2d');task=page.render({canvasContext:context,viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:undefined});await task.promise;if(closed||own!==epoch||!isCurrent())return;scroll.scrollTop=0;pageLabel.textContent='Página '+number+' de '+document.numPages;onReady(number,document.numPages);
    }catch(e){if(!closed&&own===epoch&&e.name!=='RenderingCancelledException')pageLabel.textContent='No pudimos mostrar esta página. Podés descargar el original.';}finally{if(!closed&&own===epoch){rendering=false;zoom.disabled=false;prev.disabled=number<=1;next.disabled=number>=document.numPages;}}}
   prev.onclick=()=>{if(!rendering&&number>1){number--;render();}};next.onclick=()=>{if(!rendering&&number<document.numPages){number++;render();}};zoom.onchange=()=>render();await render();return {destroy};
  }catch(e){destroy();throw e;}
 }
 return {open};
})();
