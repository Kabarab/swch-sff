import fs from 'node:fs/promises';
const REF='bdd8640947dea4b2724aaa5c2a464a62797d3cd7';
const files=['cli.mjs','validation.mjs','index.mjs','index.d.ts','runtime.mjs','runtime-lock.json','templates/release.yml','templates/tab/manifest.json','templates/tab/backend.mjs','templates/tab/index.html'];
for(const file of files){const target=new URL('../mod-sdk/'+file,import.meta.url);await fs.mkdir(new URL('./',target),{recursive:true});const response=await fetch('https://raw.githubusercontent.com/Kabarab/swch/'+REF+'/mod-sdk/'+file,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(file+': HTTP '+response.status);await fs.writeFile(target,new Uint8Array(await response.arrayBuffer()));}
console.log('Fetched official SWCH SDK at '+REF);
