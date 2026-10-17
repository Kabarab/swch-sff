import {unzipSync} from 'fflate';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {fs,path,within,contained,sha256} from '../src/core.mjs';
const parent=fileURLToPath(new URL('../.test-data/',import.meta.url)),root=path.join(parent,'package-'+randomUUID());await fs.mkdir(root,{recursive:true});
try{const files=unzipSync(await fs.readFile(new URL('../dist/mod.zip',import.meta.url)));const integrity=JSON.parse(Buffer.from(files['integrity.json']).toString());for(const [name,bytes]of Object.entries(files)){if(name.endsWith('/'))continue;if(/^.*(?:^|\/)\.env/i.test(name)||name.endsWith('.node')||name.includes('/playwright'))throw new Error('Forbidden runtime entry: '+name);if(name!=='integrity.json'&&integrity[name]!==sha256(bytes))throw new Error('Payload integrity mismatch: '+name);const target=await within(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}for(const name of Object.keys(integrity))if(!files[name])throw new Error('Official packer omitted runtime resource: '+name);
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test',fileURLToPath(new URL('../tests/runtime.test.mjs',import.meta.url))],{env:{...process.env,SWCH_TEST_BACKEND:path.join(root,'backend.mjs')},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Extracted ZIP runtime failed: '+code)));});console.log('Extracted ZIP: all '+Object.keys(integrity).length+' resources verified; actual SDK runtime passed.');
}finally{if(!contained(parent,root)||root===parent)throw new Error('Unsafe package fixture cleanup');await fs.rm(root,{recursive:true,force:true});}
