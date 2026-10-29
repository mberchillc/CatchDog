const assert=require('node:assert/strict');
(async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const page=await worker.fetch(new Request('https://turi.test/'),{});
 assert.equal(page.status,200);const html=await page.text();
 assert.match(html,/Ingresar como PAS/);assert.match(html,/Superadministración/);
 assert.ok(!html.includes('data.js')&&!html.includes('app.js')&&!html.includes('1234'));
 for(const path of ['/app.js','/data.js','/assets/embedded.js'])assert.equal((await worker.fetch(new Request('https://turi.test'+path),{})).status,410);
 assert.equal((await worker.fetch(new Request('https://turi.test/privado/'),{})).status,200);
 console.log('Entrada privada disponible; demo y credenciales predefinidas retiradas.');
})().catch(e=>{console.error(e);process.exit(1)});
