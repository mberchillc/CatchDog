import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../../dist/server/index.js';
import {opaque,digest} from '../../worker/security.js';
export class TestDB{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.db.exec(readFileSync('drizzle/'+file,'utf8'));}
 prepare(sql){const db=this.db;let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}}}
 async batch(statements){this.db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
}
export class TestBucket{
 constructor(){this.objects=new Map();this.failPut=false;this.failDelete=false;}
 async put(key,bytes,options){this.objects.set(key,{bytes:new Uint8Array(bytes).slice(),options});if(this.failPut)throw Error('Test storage failure');return {key,size:bytes.byteLength};}
 async get(key){const obj=this.objects.get(key);if(!obj)return null;return {size:obj.bytes.length,arrayBuffer:async()=>obj.bytes.slice().buffer};}
 async delete(key){if(this.failDelete)throw Error('Test deletion failure');this.objects.delete(key);}
}
export async function harness(){
 const DB=new TestDB(),BUCKET=new TestBucket(),env={DB,BUCKET,TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.from(opaque()).subarray(0,32).toString('base64')},sessions={},tokens={};
 const people=[['dani','DOC-DANI','producer','TURI'],['peer','DOC-PEER','producer','TURI'],['mauro','DOC-ADMIN','superadmin','TURI'],['other','DOC-OTHER','producer','OTHER']];
 for(const [name] of people)tokens[name]=opaque();env.TURI_INVITATIONS=JSON.stringify(people.map(([username,id,role,tenantId])=>({username,id,name:username==='dani'?'Daniel Stern':username,role,tenantId,tokenHash:digest(tokens[username]),expiresAt:Date.now()+3600000})));
 async function call(path,{method='GET',data,bytes,headers={},as='dani',origin='https://turi.test',csrf=true}={}){const s=sessions[as];const response=await worker.fetch(new Request('https://turi.test/api/pilot'+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':bytes?'application/octet-stream':'application/json'}),...(s?{Cookie:s.cookie,'X-Turi-CSRF':csrf?s.csrf:'invalid'}:{}),'CF-Connecting-IP':'192.0.2.40',...headers},body:bytes??(data?JSON.stringify(data):undefined)}),env);const binary=(response.headers.get('content-type')||'').includes('application/json')?null:new Uint8Array(await response.clone().arrayBuffer());const result=binary?null:await response.json();return {status:response.status,data:result,bytes:binary,response};}
 const password='Credencial ficticia para las pruebas!';
 for(const [username] of people){const a=await call('/auth/activate',{method:'POST',as:'',data:{username,password,token:tokens[username]}});sessions[username]={cookie:a.response.headers.get('set-cookie').split(';')[0],csrf:a.data.csrf};const p=await call('/auth/code/prepare',{method:'POST',as:username,data:{}});const c=await call('/auth/code/confirm',{method:'POST',as:username,data:{code:p.data.code}});sessions[username]={cookie:c.response.headers.get('set-cookie').split(';')[0],csrf:c.data.csrf};}
 const create=async(type,data,as='dani')=>{const r=await call('/work/'+type,{method:'POST',data,as});if(r.status!==201)throw Error(JSON.stringify(r.data));return r.data.record};
 return {DB,BUCKET,env,sessions,call,create};
}
