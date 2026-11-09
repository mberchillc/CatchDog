// Portable front end for /masturi/ on the existing WordPress host.
// All private processing and encrypted storage stay in Turi Gestión on Cloudflare.
import {readFile,writeFile,mkdir,copyFile,cp} from 'node:fs/promises';
import path from 'node:path';
const arg=process.argv.indexOf('--out');
if(arg<0||!process.argv[arg+1])throw Error('Indicá --out con una carpeta nueva de salida.');
const root=path.resolve(process.argv[arg+1]),site=path.join(root,'masturi');
await mkdir(path.join(site,'assets'),{recursive:true});
for(const name of ['index.html','masturi.css','masturi.js']){
 let content=await readFile('public/masturi/'+name,'utf8');
 content=content.replaceAll('/assets/','/masturi/assets/');
 if(name==='index.html')content=content.replace('data-api-base=""','data-api-base="https://turi-gestion-dev.pages.dev"').replace('<meta name="theme-color" content="#f2efe8">','<meta name="theme-color" content="#f2efe8">\n <link rel="canonical" href="https://www.turi.com.ar/masturi/">\n <meta property="og:url" content="https://www.turi.com.ar/masturi/">').replace('content="/masturi/assets/turi-catchdog-avatar.png"','content="https://www.turi.com.ar/masturi/assets/turi-catchdog-avatar.png"');
 await writeFile(path.join(site,name),content);
}
for(const name of ['logo.png','plus-turi.svg','plus-turi-inverse.svg','plus-turi-avatar.svg','plus-turi-avatar.png','turi-catchdog.svg','turi-catchdog-inverse.svg','turi-catchdog-avatar.svg','turi-catchdog-avatar.png','agente-turi.webp','RecoletaBold.woff2','GraphikLight.woff2','GraphikMedium.woff2'])await copyFile('public/assets/'+name,path.join(site,'assets',name));
await cp('public/assets/insurers',path.join(site,'assets','insurers'),{recursive:true});
await copyFile('docs/MAS_TURI_HOSTING.md',path.join(root,'INSTALACION.md'));
console.log('Landing portable preparada en '+root);
