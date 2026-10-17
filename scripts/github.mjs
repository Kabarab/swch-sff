// Developer-only publishing helper. No credential is written into the project.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const portable=fileURLToPath(new URL('../.tools/github/bin/gh.exe',import.meta.url));
const executable=process.platform==='win32'&&await fs.access(portable).then(()=>true,()=>false)?portable:'gh';
let token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
if(!token&&process.platform==='win32'){
  const git=process.env.SWCH_GIT||'E:/Git/cmd/git.exe';
  const credential=await new Promise((resolve,reject)=>{const child=spawn(git,['-c','credential.interactive=never','credential','fill'],{cwd:root,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('GitHub authorization unavailable. Run gh auth login yourself, then retry.')));child.stdin.end('protocol=https\nhost=github.com\nusername=Kabarab\n\n');});token=credential.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);
}
const args=process.argv.slice(2);if(!args.length)throw new Error('Supply GitHub CLI arguments. Example: node scripts/github.mjs api user --jq .login');
const code=await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:root,env:{...process.env,GH_PROMPT_DISABLED:'1',...(token?{GH_TOKEN:token}: {})},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});process.exitCode=code??1;
