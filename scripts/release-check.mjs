import fs from 'node:fs/promises';
import {inspectDirectory,inspectZipFile} from '../mod-sdk/validation.mjs';
const manifest=JSON.parse(await fs.readFile(new URL('../sff-mod/manifest.json',import.meta.url),'utf8'));const version=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version;
if(manifest.version!==version)throw new Error('Manifest/package versions differ');const tag=process.env.GITHUB_REF_NAME;if(tag&&tag!=='v'+version)throw new Error('Release tag must be v'+version);
const result=await inspectZipFile(new URL('../dist/mod.zip',import.meta.url));if(result.manifest.id!==manifest.id)throw new Error('ZIP manifest differs');console.log(JSON.stringify(result));
