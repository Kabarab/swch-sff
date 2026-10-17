/* GPL-3.0-or-later. Archive execution is isolated from the SDK event loop. */
import {parentPort,workerData} from 'node:worker_threads';
import SevenZip from '7z-wasm';
import {fs,path,within,atomicWrite} from './core.mjs';
try {
  const {archive,destination,password}=workerData;const stat=await fs.stat(archive);
  if(stat.size>256*1024*1024)throw new Error('Archive exceeds the WASM import limit (256 MiB). Extract it using 7-Zip, then select the extracted folder.');
  let lines='';const z=await SevenZip({print:s=>{lines+=s+'\n';},printErr:s=>{lines+=s+'\n';}});
  z.FS.mkdir('/input');z.FS.mkdir('/output');const input='/input/'+path.basename(archive);z.FS.writeFile(input,await fs.readFile(archive));
  const argumentsFor=file=>['x',file,'-o/output','-y','-bsp0',...(password?['-p'+password]:[])];
  let code=z.callMain(argumentsFor(input));if(code!==0)throw new Error('Archive extraction failed: '+lines.slice(-2000));
  // tar.gz distributions contain one tar after the first extraction.
  const first=z.FS.readdir('/output').filter(n=>n!=='.'&&n!=='..');
  if(first.length===1&&first[0].endsWith('.tar')){const tar='/output/'+first[0];code=z.callMain(argumentsFor(tar));if(code!==0)throw new Error('TAR extraction failed');z.FS.unlink(tar);}
  const entries=[];let total=0;function visit(dir){for(const name of z.FS.readdir(dir)){if(name==='.'||name==='..')continue;const file=dir+'/'+name;const s=z.FS.lstat(file);if(z.FS.isDir(s.mode))visit(file);else if(z.FS.isFile(s.mode)){const rel=file.slice('/output/'.length);entries.push({file,rel,size:s.size});total+=s.size;}else throw new Error('Links and special archive entries are not supported');}}
  visit('/output');if(total>2*1024*1024*1024)throw new Error('Expanded archive exceeds 2 GiB staging budget');
  const seen=new Set();for(const entry of entries){await within(destination,entry.rel);const key=entry.rel.toLowerCase();if(seen.has(key))throw new Error('Duplicate archive path');seen.add(key);}
  for(const entry of entries){await atomicWrite(await within(destination,entry.rel),z.FS.readFile(entry.file));z.FS.unlink(entry.file);}
  parentPort.postMessage({ok:true,files:entries.map(e=>e.rel),bytes:total});
}catch(error){parentPort.postMessage({ok:false,error:error.message});}
