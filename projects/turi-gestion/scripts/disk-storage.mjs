import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
export class DiskDB{
 constructor(directory){mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(join(directory,'database.sqlite'));this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _turi_migrations (name TEXT PRIMARY KEY NOT NULL)');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){if(this.db.prepare('SELECT name FROM _turi_migrations WHERE name=?').get(file))continue;this.db.exec('BEGIN');try{this.db.exec(readFileSync(join('drizzle',file),'utf8'));this.db.prepare('INSERT INTO _turi_migrations (name) VALUES (?)').run(file);this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}}}
 prepare(sql){const db=this.db;let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}}}
 async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results}catch(e){this.db.exec('ROLLBACK');throw e}}
 close(){this.db.close()}
}
export class DiskBucket{
 constructor(directory){this.directory=resolve(directory);mkdirSync(this.directory,{recursive:true})}
 path(key){return join(this.directory,createHash('sha256').update(String(key)).digest('hex')+'.bin')}
 async put(key,bytes){const target=this.path(key),temporary=target+'.'+randomUUID()+'.tmp';await writeFile(temporary,new Uint8Array(bytes),{mode:0o600});await rename(temporary,target);return {key,size:bytes.byteLength}}
 async get(key){try{const value=await readFile(this.path(key));return {size:value.byteLength,arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}}catch(e){if(e.code==='ENOENT')return null;throw e}}
 async delete(key){try{await unlink(this.path(key))}catch(e){if(e.code!=='ENOENT')throw e}}
}
export function localKeys(directory){mkdirSync(directory,{recursive:true});const path=join(directory,'keys.json');if(existsSync(path)){const keys=JSON.parse(readFileSync(path,'utf8'));if(!keys.authPepper||Buffer.from(keys.vaultKey||'','base64').length!==32)throw Error('Las claves locales no son válidas. Conservá una copia antes de reparar el entorno.');return keys}const keys={authPepper:randomBytes(32).toString('base64url'),vaultKey:randomBytes(32).toString('base64')};writeFileSync(path,JSON.stringify(keys),{mode:0o600,flag:'wx'});return keys}
