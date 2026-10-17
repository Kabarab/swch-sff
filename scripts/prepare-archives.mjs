import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const archives=[
  {id:'lumacore-debug',version:'V9',platforms:['windows-x64'],license:'See LumaCore upstream license',source:'https://github.com/KoriaPolis/LumaCore',archive:{url:'https://github.com/KoriaPolis/LumaCore/releases/download/V9/Debug.zip',sha256:'6924a79e9629e4efabfb1db2a7fc8abb6a3962251c67b012cefb1e9481bf42c1'}},
  {id:'lumacore',version:'V9',platforms:['windows-x64'],license:'See LumaCore upstream license',source:'https://github.com/KoriaPolis/LumaCore',archive:{url:'https://github.com/KoriaPolis/LumaCore/releases/download/V9/Release.zip',sha256:'66033757fbffd3f2616a6a67b26b5bf31bce3def962ae25da27913e0e177e36f'}},
  {id:'rclone-windows',version:'1.75.2',platforms:['windows-x64'],license:'MIT',source:'https://github.com/rclone/rclone',executables:['rclone.exe'],archive:{url:'https://github.com/rclone/rclone/releases/download/v1.75.2/rclone-v1.75.2-windows-amd64.zip',strip:'rclone-v1.75.2-windows-amd64',sha256:'8a9db2bad1dc79a65b3348fd857069598e2aab7cf4d118b77b1df23055aff818'}},
  {id:'rclone-macos',version:'1.75.2',platforms:['macos-arm64'],license:'MIT',source:'https://github.com/rclone/rclone',executables:['rclone'],archive:{url:'https://github.com/rclone/rclone/releases/download/v1.75.2/rclone-v1.75.2-osx-arm64.zip',strip:'rclone-v1.75.2-osx-arm64',sha256:'610ab7d48615135dfc60b763858b11a426a0d3d1160c1bb76fb0ae6011b02edd'}}
];
const response=await fetch('https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Cannot fetch .NET metadata');
const metadata=await response.json();const release=metadata.releases.find(r=>r.runtime?.version==='10.0.13');if(!release)throw new Error('Pinned .NET 10.0.13 release missing');
await fs.mkdir(new URL('../.tools/archives/',import.meta.url),{recursive:true});
for(const [id,rid,platform]of [['dotnet-windows','win-x64','windows-x64'],['dotnet-macos','osx-arm64','macos-arm64']]){
  const file=release.runtime.files.find(f=>f.rid===rid&&/\/dotnet-runtime-/.test(f.url)&&(f.url.endsWith('.zip')||f.url.endsWith('.tar.gz')));if(!file)throw new Error('Missing .NET archive for '+rid);
  const local=new URL('../.tools/archives/'+id+'-runtime'+(file.url.endsWith('.zip')?'.zip':'.tar.gz'),import.meta.url);let bytes;try{bytes=await fs.readFile(local);}catch{console.log('Downloading official .NET runtime '+rid);const r=await fetch(file.url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw new Error('.NET HTTP '+r.status);bytes=Buffer.from(await r.arrayBuffer());}
  if(createHash('sha512').update(bytes).digest('hex')!==file.hash.toLowerCase())throw new Error('Official .NET SHA-512 mismatch');await fs.writeFile(local,bytes);
  archives.push({id,version:'10.0.13',platforms:[platform],license:'MIT',source:'https://github.com/dotnet/runtime',executables:[rid==='win-x64'?'dotnet.exe':'dotnet'],archive:{url:file.url,sha256:createHash('sha256').update(bytes).digest('hex')}});
}
await fs.writeFile(new URL('../data/tool-archives.json',import.meta.url),JSON.stringify(archives,null,2)+'\n');console.log('Wrote verified archive metadata');
