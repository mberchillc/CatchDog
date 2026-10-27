// Local-only adapter for the same Worker. Never uses the production D1 or secrets.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {opaque,passwordHash,codeHash} from '../worker/security.js';
class PreviewDB{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.db.exec(readFileSync('drizzle/'+f,'utf8'));}
 prepare(sql){const db=this.db;let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}}}
 async batch(stmts){this.db.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());this.db.exec('COMMIT');return results}catch(e){this.db.exec('ROLLBACK');throw e}}
}
class PreviewBucket{constructor(){this.objects=new Map()}async put(key,bytes){const value=new Uint8Array(bytes).slice();this.objects.set(key,value);return {key,size:value.length}}async get(key){const value=this.objects.get(key);return value?{size:value.length,arrayBuffer:async()=>value.slice().buffer}:null}async delete(key){this.objects.delete(key)}}
const env={DB:new PreviewDB(),BUCKET:new PreviewBucket(),TURI_AUTH_PEPPER:opaque(),TURI_VAULT_KEY:Buffer.from(opaque()).subarray(0,32).toString('base64')};
// Documented fictitious development accounts. These cannot log in to the hosted site.
for(const [id,username,name,role] of [['DEV-ADMIN','vista','Mauro Berchi','superadmin'],['DEV-DANI','pasvista','Daniel Stern','producer']])env.DB.db.prepare('INSERT INTO pilot_users(id,username,name,role,tenant_id,password_hash,mfa_secret,access_code_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,username,name,role,'DEV',passwordHash('Vista local de Turi 2026!',env.TURI_AUTH_PEPPER),'',codeHash(env,'access:'+id,'12345678'),Date.now());
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]};
const port=Number(arg('--port')||process.env.PORT||5173),host=arg('--host')||process.env.HOST||'0.0.0.0';
http.createServer(async(req,res)=>{try{const visual=req.url.match(/^\/_visual\/(home|clients|policies|claims|quotes|tasks|companies|producers|activity|documents|recovery-email|recovery-code|recovery-password|recovery-unavailable)$/);if(visual&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync('qa/visual/'+visual[1]+'.html'));return;}const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);const origin=(req.headers['x-forwarded-proto']||'http')+'://'+req.headers.host;const response=await worker.fetch(new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)&&bytes.length?{body:bytes}:{} )}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('No pudimos cargar la vista local.')}}).listen(port,host,()=>console.log(`Turi local preview at http://${host}:${port} (in-memory test data only)`));
