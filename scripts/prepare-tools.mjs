import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const definitions=JSON.parse(await fs.readFile(new URL('../data/tool-sources.json',import.meta.url),'utf8'));
const cache=new URL('../.tools/verified/',import.meta.url);await fs.mkdir(cache,{recursive:true});
// A quarantined original has a previously verified digest. Never reacquire it in a build.
const pinnedOnly=definitions.filter(tool=>tool.detection).flatMap(tool=>tool.files);for(const file of pinnedOnly)if(!/^[a-f\d]{64}$/.test(file.sha256)||!/^[a-f\d]{40}$/.test(file.git_blob))throw new Error('Missing previously verified original tool digest');
let count=0;const files=definitions.filter(tool=>!tool.detection).flatMap(tool=>tool.files);let next=0;const pending=new Map();
async function verified(file){if(pending.has(file.git_blob))return pending.get(file.git_blob);const task=(async()=>{const target=new URL(file.git_blob,cache);const valid=bytes=>bytes.length===file.size&&createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')===file.git_blob;let bytes=await fs.readFile(target).catch(()=>null);if(bytes&&valid(bytes))return bytes;for(let retry=0;;retry++){try{const response=await fetch(file.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw new Error('Pinned upstream object mismatch: '+file.path);const temp=new URL(file.git_blob+'.'+randomUUID()+'.tmp',cache);await fs.writeFile(temp,bytes);await fs.rename(temp,target);return bytes;}catch(error){if(retry>=3)throw error;await new Promise(r=>setTimeout(r,1000*(retry+1)));}}})();pending.set(file.git_blob,task);return task;}
await Promise.all(Array.from({length:8},async()=>{for(;;){const file=files[next++];if(!file)return;const bytes=await verified(file);file.sha256=createHash('sha256').update(bytes).digest('hex');delete file.git_blob;count++;if(count%25===0)console.log('Verified '+count+'/'+files.length);}}));
const extra=JSON.parse(await fs.readFile(new URL('../data/tool-archives.json',import.meta.url),'utf8'));
for(const def of extra){if(!/^[a-f\d]{64}$/.test(def.archive.sha256))throw new Error('Missing checksum for '+def.id);}
await fs.writeFile(new URL('../data/tools.lock.json',import.meta.url),JSON.stringify([...definitions,...extra],null,2)+'\n');console.log('Wrote pinned tool lock ('+count+' files)');
