import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectZipFile} from '../mod-sdk/validation.mjs';
export function validateReleaseRef(version,environment=process.env){const tag=environment.SWCH_RELEASE_TAG||(environment.GITHUB_REF_TYPE==='tag'?environment.GITHUB_REF_NAME:undefined);if(tag&&tag!=='v'+version)throw new Error('Release tag must be v'+version);return tag||null;}
async function main(){const manifest=JSON.parse(await fs.readFile(new URL('../sff-mod/manifest.json',import.meta.url),'utf8')),version=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version;if(manifest.version!==version)throw new Error('Manifest/package versions differ');validateReleaseRef(version);const result=await inspectZipFile(new URL('../dist/mod.zip',import.meta.url));if(JSON.stringify(result.manifest)!==JSON.stringify(manifest))throw new Error('ZIP manifest differs');console.log(JSON.stringify(result));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
