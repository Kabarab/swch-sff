import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Build requires Node.js 24 LTS');
const output=path.resolve(root,'sff-mod');if(path.dirname(output)!==path.resolve(root)||path.basename(output)!=='sff-mod')throw new Error('Unsafe build output');await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
const dependencyLock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
async function copyTree(source,destination,dependencies=false){await fs.mkdir(destination,{recursive:true});for(const entry of await fs.readdir(source,{withFileTypes:true})){if(['.bin','.git','test','tests','coverage'].includes(entry.name)||entry.name.startsWith('.')||entry.name.endsWith('.map'))continue;if(entry.isSymbolicLink())throw new Error('Symlink in build input: '+entry.name);const from=path.join(source,entry.name),lockPath=path.relative(root,from).replaceAll('\\','/');if(dependencies&&dependencyLock.packages?.[lockPath]?.dev)continue;const to=path.join(destination,dependencies&&entry.name==='dist'?'runtime-dist':entry.name);if(entry.isDirectory())await copyTree(from,to,dependencies);else if(entry.isFile()){if(entry.name.toLowerCase().endsWith('.node'))throw new Error('Native addon in build input: '+from);if(dependencies&&/\.(?:[cm]?js|json|ts)$/.test(entry.name)){const content=await fs.readFile(from,'utf8');await fs.writeFile(to,content.replace(/(^|[\/\\'"`])dist\//gm,'$1runtime-dist/'));}else await fs.copyFile(from,to);}}}
// The payload has no dev dependencies. The root node_modules directory is never packed.
await copyTree(path.join(root,'src'),path.join(output,'lib'));
// The official packer excludes every directory named dist, including dependency code.
// Relocate those directories with their literal references; extracted-ZIP smoke tests guard this.
await copyTree(path.join(root,'node_modules'),path.join(output,'node_modules'),true);
await fs.mkdir(path.join(output,'data'),{recursive:true});const lock=JSON.parse(await fs.readFile(path.join(root,'data/tools.lock.json'),'utf8'));
for(const tool of lock){for(const file of tool.files||[])if(!/^[a-f\d]{64}$/.test(file.sha256))throw new Error('Unverified tool file: '+tool.id+'/'+file.path);if(tool.archive&&!/^[a-f\d]{64}$/.test(tool.archive.sha256))throw new Error('Unverified archive: '+tool.id);}
await fs.copyFile(path.join(root,'data/tools.lock.json'),path.join(output,'data/tools.lock.json'));
const html=await fs.readFile(path.join(root,'ui/index.html'),'utf8'),css=await fs.readFile(path.join(root,'ui/styles.css'),'utf8'),js=await fs.readFile(path.join(root,'ui/app.mjs'),'utf8');
await fs.writeFile(path.join(output,'index.html'),html.replace('/*STYLE*/',css).replace('/*APP*/',js.replace(/<\/script/gi,'<\\/script')));
await fs.writeFile(path.join(output,'backend.mjs'),"export {default} from './lib/backend.mjs';\n");
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const manifest={id:'kabarab.sff',name:'SFF for SWCH',version:pkg.version,api:'^1.1.0',platforms:['windows-x64','macos-arm64'],description:'Steam library, Lua/manifests, downloads, game tools and verified save backups integrated into SWCH. Windows game tools; portable features on macOS.',backend:'backend.mjs',ui:'index.html'};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(output,'package.json'),JSON.stringify({name:'swch-sff-runtime',version:pkg.version,type:'module',private:true,license:'GPL-3.0-or-later'},null,2)+'\n');
for(const name of ['README.md','LICENSE','THIRD_PARTY_NOTICES.md'])await fs.copyFile(path.join(root,name),path.join(output,name));
for(const name of ['feature-matrix.md','testing.md','sources.json','tool-detection.md']){await fs.mkdir(path.join(output,'docs'),{recursive:true});await fs.copyFile(path.join(root,'docs',name),path.join(output,'docs',name));}
await copyTree(path.join(root,'licenses'),path.join(output,'licenses'));
// Keep the original generated release template out of the install payload.
const generatedWorkflow=path.resolve(output,'.github');if(generatedWorkflow.startsWith(path.resolve(output)+path.sep))await fs.rm(generatedWorkflow,{recursive:true,force:true});
const integrity={};async function hashTree(dir,prefix=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+entry.name;if(/^\.env/i.test(entry.name)||entry.isSymbolicLink()||entry.name.endsWith('.node'))throw new Error('Forbidden payload entry: '+rel);const full=path.join(dir,entry.name);if(entry.isDirectory())await hashTree(full,rel+'/');else if(entry.isFile()&&rel!=='integrity.json')integrity[rel]=createHash('sha256').update(await fs.readFile(full)).digest('hex');}}
await hashTree(output);await fs.writeFile(path.join(output,'integrity.json'),JSON.stringify(integrity,null,2)+'\n');console.log('Built '+manifest.id+' '+manifest.version+' ('+Object.keys(integrity).length+' files)');
