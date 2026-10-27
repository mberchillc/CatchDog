import { Buffer } from 'node:buffer';
import { scryptSync, timingSafeEqual, createHash, createHmac, randomBytes } from 'node:crypto';
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
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(){let bits=0,value=0,out='';for(const b of randomBytes(20)){value=(value<<8)|b;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5}}return out}
function fromB32(s){let bits=0,value=0,out=[];for(const c of s){const n=B32.indexOf(c);if(n<0)throw new Error('TOTP_SECRET');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out)}
export function totpAt(secret,step){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',fromB32(secret)).update(b).digest();const o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
export function verifyTotp(secret,code,lastStep=-1,time=NOW()){if(!/^\d{6}$/.test(String(code)))return null;const step=Math.floor(time/30000);for(const d of [0,-1,1]){const s=step+d;if(s>lastStep&&equal(totpAt(secret,s),code))return s}return null}
