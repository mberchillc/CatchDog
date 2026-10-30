import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
export async function ensurePdfAssets(){
 const manifest=JSON.parse(await fs.readFile('vendor/pdfjs-assets.json','utf8')),root=path.resolve('public/vendor/pdfjs');let valid=true;
 for(const f of Object.values(manifest.files)){try{if(createHash('sha256').update(await fs.readFile(path.join(root,f.path))).digest('hex')!==f.sha256)valid=false;}catch{valid=false;}}
 if(valid)return;
 const url=new URL(manifest.source);if(url.origin!=='https://registry.npmjs.org'||!url.pathname.startsWith('/pdfjs-dist/-/'))throw Error('PDF renderer source invalid');
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('PDF renderer download '+response.status);const packed=Buffer.from(await response.arrayBuffer()),[algorithm,expected]=manifest.integrity.split('-');if(createHash(algorithm).update(packed).digest('base64')!==expected)throw Error('PDF renderer archive integrity');const tar=gunzipSync(packed,{maxOutputLength:80*1024*1024}),found=new Set();
 for(let offset=0;offset+512<=tar.length;){const block=tar.subarray(offset,offset+512),name=block.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(block.subarray(124,136).toString().replace(/\0/g,'').trim()||'0',8);if(!name)break;if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw Error('PDF renderer tar');const file=manifest.files[name];if(file){const bytes=tar.subarray(offset+512,offset+512+size),dest=path.resolve(root,file.path);if(!dest.startsWith(root+path.sep)||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('PDF renderer asset integrity');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);found.add(name);}offset+=512+Math.ceil(size/512)*512;}
 if(found.size!==Object.keys(manifest.files).length)throw Error('PDF renderer archive incomplete');console.log('Verified PDF.js '+manifest.version+' rendering assets prepared.');
}
