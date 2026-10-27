export const mailReady=env=>!!env.RESEND_API_KEY&&!!env.TURI_MAIL_FROM;
export async function deliverCode(env,{email,code,kind,id}){
 if(!mailReady(env))throw new Error('MAIL_NOT_CONFIGURED');
 const recovery=kind==='recovery';const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'turi-'+id},body:JSON.stringify({from:env.TURI_MAIL_FROM,to:[email],subject:recovery?'Turi Gestión · Recuperá tu acceso':'Turi Gestión · Confirmá tu correo',text:`Tu código de ${recovery?'recuperación':'confirmación'} de Turi Gestión es: ${code}\n\nVence en 10 minutos y sirve una sola vez.\n\nSi no pediste este código, podés ignorar este correo. No compartas el código con otras personas.`}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('MAIL_DELIVERY_FAILED');const d=await r.json();if(!d.id)throw new Error('MAIL_DELIVERY_FAILED');return d.id;
}
