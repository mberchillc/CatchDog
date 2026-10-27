import { Buffer } from 'node:buffer';
import { scryptSync, timingSafeEqual, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
const enc=new TextEncoder();
export const NOW=()=>Date.now();
export const opaque=(n=32)=>randomBytes(n).toString('base64url');
export const digest=s=>createHash('sha256').update(s).digest('hex');
export const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export function passwordHash(password,pepper,salt=opaque(16)){
 if(typeof password!=='string'||password.length<14||password.length>128)throw new Error('PASSWORD_LENGTH');
 const input=createHmac('sha256',pepper).update(password).digest();
 const hash=scryptSync(input,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('base64url');
 return `scrypt$16384$8$5$${salt}$${hash}`;
}
export function passwordValid(password,stored,pepper){
 try{const [alg,n,r,p,salt,hash]=stored.split('$');if(alg!=='scrypt'||n!=='16384'||r!=='8'||p!=='5'||typeof password!=='string'||password.length>128)return false;
 const input=createHmac('sha256',pepper).update(password).digest();const out=scryptSync(input,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('base64url');return equal(hash,out);
 }catch{return false}
}
export async function seal(env,value,aad){const key=await crypto.subtle.importKey('raw',Buffer.from(env.TURI_VAULT_KEY,'base64'),'AES-GCM',false,['encrypt']);const iv=randomBytes(12);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},key,enc.encode(JSON.stringify(value)));return 'v1:'+iv.toString('base64')+':'+Buffer.from(cipher).toString('base64')}
export async function unseal(env,value,aad){const [version,nonce,payload]=value.split(':');if(version!=='v1')throw new Error('ENCRYPTION_VERSION');const key=await crypto.subtle.importKey('raw',Buffer.from(env.TURI_VAULT_KEY,'base64'),'AES-GCM',false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(nonce,'base64'),additionalData:enc.encode(aad)},key,Buffer.from(payload,'base64'));return JSON.parse(new TextDecoder().decode(plain))}
export const personalCode=()=>String(randomInt(0,100000000)).padStart(8,'0');
export const emailCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
export const normalizeCode=v=>String(v??'').replace(/[\s-]/g,'');
export const codeHash=(env,scope,code)=>createHmac('sha256',env.TURI_AUTH_PEPPER).update(scope+'|'+code).digest('hex');

// Binary originals are encrypted separately from their private metadata.
export async function sealFile(env,bytes,aad){const key=await crypto.subtle.importKey('raw',Buffer.from(env.TURI_VAULT_KEY,'base64'),'AES-GCM',false,['encrypt']);const iv=randomBytes(12);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},key,bytes));const out=new Uint8Array(17+cipher.length);out.set([84,85,82,73,1]);out.set(iv,5);out.set(cipher,17);return out;}
export async function unsealFile(env,bytes,aad){const b=new Uint8Array(bytes);if(b.length<33||b[0]!==84||b[1]!==85||b[2]!==82||b[3]!==73||b[4]!==1)throw new Error('FILE_ENCRYPTION_VERSION');const key=await crypto.subtle.importKey('raw',Buffer.from(env.TURI_VAULT_KEY,'base64'),'AES-GCM',false,['decrypt']);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.subarray(5,17),additionalData:enc.encode(aad)},key,b.subarray(17)));}
