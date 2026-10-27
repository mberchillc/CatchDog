// Static screenshots only: no production calls, credentials, cookies or actual emails.
import {JSDOM} from 'jsdom';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
mkdirSync('qa/visual',{recursive:true});
for(const [name,script] of [
 ['recovery-email','emailAvailable=true;recoveryStartView()'],
 ['recovery-code',"recoveryCodeView('Si el correo coincide con una cuenta confirmada, recibirás un código de recuperación. Revisá también Spam. Si no llega, podés volver a solicitarlo.')"],
 ['recovery-password','recoveryPasswordView()'],
 ['recovery-unavailable','emailAvailable=false;recoveryStartView()']
]){
 const dom=new JSDOM(readFileSync('public/pilot.html','utf8'),{url:'http://terminal.local:4173/_visual/'+name,runScripts:'outside-only'}),w=dom.window;w.fetch=async()=>Response.json({verified:false,emailRecoveryAvailable:false},{status:401});w.scrollTo=()=>{};
 vm.runInContext(readFileSync('public/pilot.js','utf8'),dom.getInternalVMContext());await new Promise(r=>setTimeout(r,0));vm.runInContext(script,dom.getInternalVMContext());for(const el of w.document.querySelectorAll('script'))el.remove();w.document.querySelector('footer').textContent='QA visual · recuperación · sin envíos ni cuentas reales';writeFileSync('qa/visual/'+name+'.html',dom.serialize());w.close();
}
console.log('4 vistas de recuperación generadas para QA local; no se publican.');
