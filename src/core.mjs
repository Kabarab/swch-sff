/* SFF for SWCH — GPL-3.0-or-later. Copyright 2026 Kabarab.
 * Domain behavior adapted from Midrag/SFF; see THIRD_PARTY_NOTICES.md. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream, createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable, Transform} from 'node:stream';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export {fs, path};
export const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : 'unsupported';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const numericId = value => { const id = String(value ?? '').trim(); if (!/^\d{1,20}$/.test(id)) throw new Error('A numeric Steam App/Depot/Manifest ID is required'); return id; };
export const json = (value, fallback = {}) => { if (typeof value !== 'string') return value ?? fallback; try { return JSON.parse(value); } catch { throw new Error('Invalid JSON input'); } };
export const exists = file => fs.access(file).then(() => true, () => false);
export const readJSON = async (file, fallback) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };
export const delay = (ms, signal) => new Promise((resolve, reject) => { signal?.throwIfAborted(); const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}; const abort=()=>{done();reject(signal.reason ?? new Error('Cancelled'));}; const timer=setTimeout(()=>{done();resolve();},ms);signal?.addEventListener('abort',abort,{once:true}); });
export function relativePath(name) {
  if (typeof name !== 'string' || !name || /^[\\/]|^[a-z]:/i.test(name) || name.includes('\0')) throw new Error('Invalid relative path');
  const parts = name.replaceAll('\\', '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]|[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Unsafe path: ' + name);
  return parts.join('/');
}
export function contained(root, file) { const rel=path.relative(path.resolve(root),path.resolve(file));return rel===''||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel); }
export async function noLinks(file) {
  let current = path.resolve(file);
  for (;;) { try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not followed: '+current); } catch(e) {if(e.code!=='ENOENT')throw e;} const parent=path.dirname(current);if(parent===current)break;current=parent; }
  return path.resolve(file);
}
export async function within(root, name) { const file=path.resolve(root,relativePath(name));if(!contained(root,file))throw new Error('Path leaves selected root');await noLinks(file);return file; }
export async function removeTree(root,target){root=path.resolve(root);target=path.resolve(target);if(target===root||!contained(root,target))throw new Error('Refusing cleanup outside the staging root');await noLinks(target);await fs.rm(target,{recursive:true,force:true});}
export async function atomicWrite(file, data, mode) {
  await noLinks(file);await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.sff-'+randomUUID()+'.tmp';
  try { await fs.writeFile(temp,data,{flag:'wx',...(mode?{mode}:{})});await fs.rename(temp,file); } finally {await fs.rm(temp,{force:true}).catch(()=>{});}
}
export async function hashFile(file, algorithm='sha256') { const hash=createHash(algorithm);for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex'); }
export async function walk(root, {signal, maxDepth=64, filter=()=>true}={}) {
  const out=[];
  async function visit(dir,depth) {signal?.throwIfAborted();if(depth>maxDepth)throw new Error('Folder nesting is too deep');await noLinks(dir);for(const item of await fs.readdir(dir,{withFileTypes:true})){signal?.throwIfAborted();const file=path.join(dir,item.name);if(item.isSymbolicLink())throw new Error('Symbolic link in selected folder: '+file);if(item.isDirectory())await visit(file,depth+1);else if(item.isFile()&&filter(file))out.push(file);}}
  if(await exists(root))await visit(root,0);return out;
}
export async function folderSize(root, signal) {let size=0;for(const file of await walk(root,{signal}))size+=(await fs.stat(file)).size;return size;}
export const safeName = value => String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,120)||'Unnamed';
export function redact(text) {return String(text).replace(/((?:access_token|refresh_token|auth_code|api[_-]?key|password|authorization|client_secret)["'\s:=]+)[^\s&"',}]+/ig,'$1[redacted]').replace(/([?&](?:key|token|auth_code)=)[^&\s]+/ig,'$1[redacted]');}

export class Network {
  constructor(fetcher=globalThis.fetch) {this.fetcher=fetcher;}
  async request(url, options={}) {
    const {signal, timeout=60000, retries=2, _redirects=0, ...init}=options;
    const parsed=new URL(url);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)))throw new Error('Only HTTPS or local OAuth endpoints are allowed');
    for(let attempt=0;;attempt++){
      signal?.throwIfAborted();
      try {const response=await this.fetcher(url,{...init,redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'User-Agent':'SWCH-SFF/1.0.0',...init.headers}});
        if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){await response.body?.cancel();const next=new URL(response.headers.get('location'),parsed),headers=new Headers(init.headers);const sensitive=[...headers.keys()].some(k=>/authorization|cookie|api[-_]?key|x-auth/i.test(k))||[...parsed.searchParams.keys()].some(k=>/key|token|auth_code/i.test(k));if(_redirects>=5||next.protocol!=='https:'&&!(next.protocol==='http:'&&['127.0.0.1','localhost'].includes(next.hostname))||sensitive&&next.origin!==parsed.origin){const error=new Error('Unsafe or excessive HTTP redirect');error.status=400;throw error;}const get=response.status===303||[301,302].includes(response.status)&&String(init.method).toUpperCase()==='POST';const redirected={...options,_redirects:_redirects+1};if(get){redirected.method='GET';delete redirected.body;headers.delete('Content-Type');headers.delete('Content-Length');redirected.headers=Object.fromEntries(headers);}return await this.request(next,redirected);}
        if(!response.ok){const error=new Error('HTTP '+response.status+' from '+parsed.hostname);error.status=response.status;if(attempt<retries&&[408,429,500,502,503,504].includes(response.status)){await response.body?.cancel();await delay(Math.min(10000,1000*2**attempt),signal);continue;}throw error;}
        return response;
      }catch(error){if(signal?.aborted||attempt>=retries||error.status)throw error;await delay(500*2**attempt,signal);}
    }
  }
  async json(url,options) {const r=await this.request(url,options);try{return await r.json();}catch(error){if(!(error instanceof SyntaxError))throw error;throw new Error('Provider returned invalid JSON: '+new URL(url).hostname);}}
  async download(url, dest, {signal,hash,progress,resume=true,headers={},timeout=600000}={}) {
    await noLinks(dest);await fs.mkdir(path.dirname(dest),{recursive:true});const partial=dest+'.partial';
    let offset=resume?(await fs.stat(partial).catch(()=>({size:0}))).size:0;
    const r=await this.request(url,{signal,timeout,headers:{...headers,'Accept-Encoding':'identity',...(offset?{Range:'bytes='+offset+'-'}:{})}});
    if(offset&&r.status!==206)offset=0;
    // Fetch decodes HTTP content encodings, but leaves the compressed wire length in headers.
    const encoded=(r.headers.get('content-encoding')||'identity').toLowerCase()!=='identity';
    if(encoded&&offset){await r.body?.cancel();await fs.rm(partial,{force:true});return this.download(url,dest,{signal,hash,progress,resume:false,headers,timeout});}
    if(offset&&!(r.headers.get('content-range')||'').startsWith('bytes '+offset+'-'))throw new Error('Invalid download resume response');
    const total=encoded?0:Number(r.headers.get('content-length')||0)+offset;let done=offset,last=0;
    const meter=new Transform({transform(chunk,encoding,callback){done+=chunk.length;if(Date.now()-last>500){last=Date.now();Promise.resolve(progress?.({done,total})).catch(()=>{});}callback(null,chunk);}});
    await pipeline(Readable.fromWeb(r.body),meter,createWriteStream(partial,{flags:offset?'a':'w'}),{signal});
    if(total&&done!==total)throw new Error('Incomplete download');
    const digest=await hashFile(partial);if(hash&&digest!==hash.toLowerCase()){await fs.rm(partial,{force:true});throw new Error('SHA-256 verification failed');}
    await fs.rename(partial,dest);await progress?.({done,total:total||done});return {path:dest,sha256:digest,size:done};
  }
}

export class Processes {
  constructor(log=()=>{}) {this.children=new Map();this.log=log;}
  async kill(child) {
    if(!child?.pid||child.exitCode!==null)return;
    if(process.platform==='win32'){await new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{killer.kill();resolve();},1000);const done=()=>{clearTimeout(timer);resolve();};killer.once('error',done);killer.once('exit',done);});if(child.exitCode===null)child.kill('SIGKILL');}
    else {try{process.kill(-child.pid,'SIGTERM');}catch{}await delay(300);try{process.kill(-child.pid,'SIGKILL');}catch{}}
  }
  run(executable,args=[],{cwd,env,signal,timeout=600000,onLine,input,allowFailure=false}={}) {
    signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const child=spawn(executable,args.map(String),{cwd,env:env?{...process.env,...env}:process.env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      let output='',tail='',failure,timer;this.children.set(child.pid,child);
      const stop=()=>{failure=signal?.reason??new Error('Process cancelled');void this.kill(child);};
      const line=chunk=>{const text=redact(chunk.toString());output=(output+text).slice(-512000);tail+=text;let index;while((index=tail.indexOf('\n'))>=0){const s=tail.slice(0,index).replace(/\r/g,'');tail=tail.slice(index+1);this.log(s);Promise.resolve(onLine?.(s)).catch(e=>this.log('Progress callback: '+e.message));}};
      child.stdout.on('data',line);child.stderr.on('data',line);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);this.children.delete(child.pid);};
      child.once('error',error=>{cleanup();reject(error);});
      child.once('close',(code,termination)=>{cleanup();if(failure)reject(failure);else if(code!==0&&!allowFailure)reject(new Error('Tool exited with '+(code??termination)+': '+output.slice(-1500)));else resolve({exit_code:code,output});});
      if(timeout)timer=setTimeout(()=>{failure=new Error('Tool timed out');void this.kill(child);},timeout);
      signal?.addEventListener('abort',stop,{once:true});if(input!==undefined)child.stdin.end(input);else child.stdin.end();
    });
  }
  async close() {await Promise.allSettled([...this.children.values()].map(child=>this.kill(child)));}
}

/** Preimage backups + optimistic checks prevent silent loss during file replacement. */
export class Changes {
  constructor(ctx,label){this.ctx=ctx;this.label=label;this.id=randomUUID();this.entries=[];this.root=path.join(ctx.paths.data,'changes',this.id);}
  async write(file,bytes) {
    await this.ctx.authorize(file);await fs.mkdir(this.root,{recursive:true});
    const before=await exists(file)?await hashFile(file):null;
    const backup=before?path.join(this.root,String(this.entries.length)):null;
    if(backup){await fs.copyFile(file,backup);if(await hashFile(backup)!==before)throw new Error('Safety backup verification failed');}
    if((await exists(file)?await hashFile(file):null)!==before)throw new Error('File changed while preparing backup: '+file);
    const item={file,backup,before,after:sha256(bytes)};this.entries.push(item);await this.record('running');
    await atomicWrite(file,bytes);return file;
  }
  async remove(file) {await this.ctx.authorize(file);if(!await exists(file))return;await fs.mkdir(this.root,{recursive:true});const before=await hashFile(file),backup=path.join(this.root,String(this.entries.length));await fs.copyFile(file,backup);if(await hashFile(backup)!==before)throw new Error('Safety backup failed');this.entries.push({file,backup,before,after:null});await this.record('running');await fs.unlink(file);}
  async copy(source,file) {await noLinks(source);await this.ctx.authorize(file);await fs.mkdir(this.root,{recursive:true});const before=await exists(file)?await hashFile(file):null;const backup=before?path.join(this.root,String(this.entries.length)):null;if(backup){await fs.copyFile(file,backup);if(await hashFile(backup)!==before)throw new Error('Safety backup verification failed');}const after=await hashFile(source);if((await exists(file)?await hashFile(file):null)!==before)throw new Error('File changed while preparing replacement');await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.sff-'+randomUUID();try{await fs.copyFile(source,temp);if(await hashFile(temp)!==after)throw new Error('Copy checksum mismatch');this.entries.push({file,backup,before,after});await this.record('running');await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}return file;}
  async record(status) {await atomicWrite(path.join(this.root,'journal.json'),JSON.stringify({id:this.id,label:this.label,status,entries:this.entries},null,2));}
  async commit() {await this.record('completed');let history=await this.ctx.swch.storage.get('changes')||[];history.unshift({id:this.id,label:this.label,date:new Date().toISOString(),count:this.entries.length});await this.ctx.swch.storage.set('changes',history.slice(0,1000));return this.id;}
  async rollback() {const current=new Map(),plan=[];for(const item of [...this.entries].reverse()){await this.ctx.authorize(item.file);if(!current.has(item.file))current.set(item.file,await exists(item.file)?await hashFile(item.file):null);const digest=current.get(item.file);if(digest===item.after){plan.push(item);current.set(item.file,item.before);}else if(digest!==item.before)throw new Error('Cannot overwrite a file changed after the operation: '+item.file);}
    for(const item of plan)if(item.backup){if(!contained(this.root,item.backup))throw new Error('Invalid safety backup path');await noLinks(item.backup);if(await hashFile(item.backup)!==item.before)throw new Error('Safety backup checksum mismatch: '+item.file);}
    for(const item of plan){const digest=await exists(item.file)?await hashFile(item.file):null;if(digest===item.before)continue;if(digest!==item.after)throw new Error('File changed during rollback: '+item.file);if(item.backup){await noLinks(item.file);const temp=item.file+'.sff-'+randomUUID();try{await fs.copyFile(item.backup,temp);await fs.rename(temp,item.file);}finally{await fs.rm(temp,{force:true});}}else await fs.rm(item.file,{force:true});}await this.record('reverted');}
}
export async function transaction(ctx,label,fn) {const change=new Changes(ctx,label);try{const result=await fn(change);const change_id=await change.commit();return {...(result??{}),change_id};}catch(error){await change.rollback().catch(e=>ctx.log('Rollback requires attention: '+e.message));throw error;}}
export async function recoverChanges(ctx){const root=path.join(ctx.paths.data,'changes');if(!await exists(root))return;for(const id of await fs.readdir(root)){if(!/^[a-f\d-]{36}$/.test(id))continue;const journal=await readJSON(path.join(root,id,'journal.json'),null);if(journal?.status!=='running')continue;const change=new Changes(ctx,journal.label);change.id=id;change.root=path.join(root,id);change.entries=journal.entries;try{await change.rollback();ctx.log('Recovered interrupted file operation '+id);}catch(error){ctx.log('Interrupted file operation needs attention '+id+': '+error.message);await change.record('needs-attention');}const history=await ctx.swch.storage.get('changes')||[];if(!history.some(item=>item.id===id))await ctx.swch.storage.set('changes',[{id,label:journal.label,date:new Date().toISOString(),count:change.entries.length,recovered:true},...history]);}}

export function parseVdf(text) {
  const tokens=[];let i=0;while(i<text.length){const c=text[i];if(/\s/.test(c)){i++;continue;}if(text.slice(i,i+2)==='//'){i=text.indexOf('\n',i);if(i<0)break;continue;}if(c==='{'||c==='}'){tokens.push(c);i++;continue;}if(c==='"'){let s='';i++;let closed=false;for(;i<text.length;i++){if(text[i]==='"'){i++;closed=true;break;}if(text[i]==='\\'&&['\\','"'].includes(text[i+1]))s+=text[++i];else s+=text[i];}if(!closed)throw new Error('Unterminated VDF string');tokens.push({value:s});continue;}let j=i;while(i<text.length&&!/[\s{}]/.test(text[i]))i++;tokens.push({value:text.slice(j,i)});}
  let at=0;function object(depth=0){if(depth>64)throw new Error('VDF nesting too deep');const out=Object.create(null);while(at<tokens.length&&tokens[at]!=='}'){const key=tokens[at++];if(!key||typeof key!=='object')throw new Error('Invalid VDF key');const v=tokens[at++];if(v==='{'){out[key.value]=object(depth+1);if(tokens[at++]!=='}')throw new Error('Missing VDF closing brace');}else if(typeof v==='object')out[key.value]=v.value;else throw new Error('Missing VDF value');}return out;}const result=object();if(at!==tokens.length)throw new Error('Unexpected VDF closing brace');return result;
}
export function dumpVdf(data,indent=0) {const quote=s=>'"'+String(s).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';return Object.entries(data).map(([k,v])=>'\t'.repeat(indent)+quote(k)+(typeof v==='object'&&v!==null?'\n'+'\t'.repeat(indent)+'{\n'+dumpVdf(v,indent+1)+'\t'.repeat(indent)+'}\n':'\t\t'+quote(v)+'\n')).join('');}
export function vdfPath(root,keys,create=false) {let cursor=root;for(const key of keys){const actual=Object.keys(cursor).find(k=>k.toLowerCase()===key.toLowerCase())??key;if(!cursor[actual]){if(!create)return undefined;cursor[actual]=Object.create(null);}if(typeof cursor[actual]!=='object')throw new Error('Invalid VDF object: '+key);cursor=cursor[actual];}return cursor;}
export function parseLua(text) {
  const lines=String(text).split(/\r?\n/).filter(l=>!/^\s*--/.test(l)).join('\n');const apps=[...lines.matchAll(/^\s*addappid\s*\(\s*(\d+)(?:\s*,\s*\d+\s*,\s*["']([a-f\d]+)["'])?\s*\)/gmi)];
  if(!apps.length)throw new Error('Lua contains no supported addappid declarations');const keys=Object.create(null);for(const m of apps)if(m[2]){if(!/^[a-f\d]{64}$/i.test(m[2]))throw new Error('Invalid AES-256 depot key');keys[m[1]]=m[2];}
  const manifests=Object.fromEntries([...lines.matchAll(/^\s*setmanifestid\s*\(\s*(\d+)\s*,\s*["'](\d+)["']\s*(?:,\s*\d+\s*)?\)/gmi)].map(m=>[m[1],m[2]]));
  return {appid:apps[0][1],ids:[...new Set(apps.map(m=>m[1]))],keys,manifests,text:String(text)};
}
export function pinLua(text,pins,enabled=true) {for(const [id,gid]of Object.entries(pins)){numericId(id);numericId(gid);}let output=text.split(/\r?\n/).filter(l=>{const match=/^\s*(?:--\s*)?setmanifestid\s*\(\s*(\d+)\s*,/i.exec(l);return !match||!Object.hasOwn(pins,match[1]);}).join('\n').trimEnd();for(const [id,gid]of Object.entries(pins))output+='\n'+(enabled?'':'-- ')+'setManifestid('+id+', "'+gid+'")';return output+'\n';}
