/* SFF for SWCH. GPL-3.0-or-later. No console/stdout transport writes. */
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {fs,path,platform,exists,noLinks,contained,Network,Processes,redact,readJSON,atomicWrite,walk,parseLua,parseVdf,dumpVdf,vdfPath,transaction,numericId,folderSize,sha256,delay,within,pinLua,recoverChanges} from './core.mjs';
import {Steam} from './steam.mjs';
import {Tools} from './tools.mjs';
import {Providers} from './providers.mjs';
import {Downloads} from './downloads.mjs';
import {GameTools} from './game-tools.mjs';
import {Saves} from './saves.mjs';
import {Drive} from './drive.mjs';
import {Rclone} from './rclone.mjs';
import {Updates} from './updates.mjs';
import {Manifests} from './manifests.mjs';
import {DLC} from './dlc.mjs';
import {Uploads} from './uploads.mjs';

export const DEFAULTS={language:'ru',direction:'auto',theme:'midnight',game_language:'english',player_name:'Player',player_steamid:'76561198001737783',download_concurrency:8,parallel_jobs:2,active_library:'',steam_path:'',backup_root:'',music_volume:0.25};
const VERSION=(await readJSON(new URL('../package.json',import.meta.url),{})).version||'1.0.0';
const SETTING_KEYS=new Set([...Object.keys(DEFAULTS),'avatar_file','background_file','music_file']);
export const SECRET_KEYS=['hubcap-key','manifesthub-key','ryuu-key','ryuu-api-key','depotbox-key','depotbox-build-key','steam-web-key','drive-client-id','drive-client-secret'];

class Gate {
  constructor(){this.active=0;this.keys=new Set();}
  async run(key,limit,signal,fn){while(this.active>=limit||this.keys.has(key))await delay(150,signal);signal.throwIfAborted();this.active++;this.keys.add(key);try{return await fn();}finally{this.active--;this.keys.delete(key);}}
}
export async function createContext(swch,{fetcher,paths,hostPlatform=platform,toolDefinitions}={}){
  if(!swch.registerMethod||!swch.jobs?.register||!swch.files?.paths)throw new Error('SFF requires SWCH Mod SDK 1.1. Update SWCH before enabling this mod.');
  const ctx={swch,platform:hostPlatform,paths:paths||await swch.files.paths(),settings:{...DEFAULTS,...await swch.settings.get()},roots:await swch.storage.get('approved-roots')||[],logs:[],gate:new Gate(),stop:new AbortController()};
  for(const dir of Object.values(ctx.paths)){await noLinks(dir);await fs.mkdir(dir,{recursive:true});}
  ctx.log=message=>{const line=new Date().toISOString()+' '+redact(message);ctx.logs.push(line);ctx.logs=ctx.logs.slice(-500);swch.log(line);swch.events.emit('sff.log',line);};
  ctx.net=new Network(fetcher);ctx.processes=new Processes(ctx.log);ctx.steam=new Steam(ctx);ctx.providers=new Providers(ctx);ctx.downloads=new Downloads(ctx);ctx.gameTools=new GameTools(ctx);ctx.saves=new Saves(ctx);ctx.drive=new Drive(ctx);ctx.rclone=new Rclone(ctx);
  const definitions=toolDefinitions||await readJSON(new URL('../data/tools.lock.json',import.meta.url),[]);ctx.tools=new Tools(ctx,definitions);ctx.updates=new Updates(ctx);ctx.manifests=new Manifests(ctx);ctx.dlc=new DLC(ctx);ctx.uploads=new Uploads(ctx);
  ctx.approve=async file=>{if(typeof file!=='string'||!path.isAbsolute(file)||path.parse(path.resolve(file)).root===path.resolve(file))throw new Error('Select a specific absolute folder or file');await noLinks(file);const root=path.resolve(file);if(!ctx.roots.includes(root)){ctx.roots.push(root);await swch.storage.set('approved-roots',ctx.roots);}return root;};
  let steamRoots=[];try{steamRoots=await ctx.steam.libraries();}catch{}
  ctx.authorize=async file=>{if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Select an absolute folder or file');await noLinks(file);const roots=[...Object.values(ctx.paths),...ctx.roots,...steamRoots];if(!roots.some(root=>contained(root,file)))throw new Error('Select this location with Browse before accessing it: '+file);return path.resolve(file);};
  // Remove only this mod's abandoned transient rclone configurations on activation.
  for(const name of await fs.readdir(ctx.paths.temp))if(/^rclone-session-[a-f\d-]+\.conf$/.test(name))await fs.rm(path.join(ctx.paths.temp,name),{force:true});
  ctx.detectedSave=async file=>{await noLinks(file);const known=[os.homedir(),process.env.PUBLIC,process.env.ProgramData,...steamRoots].filter(Boolean);if(!known.some(root=>contained(root,file)))throw new Error('Select the detected save folder manually before using it');return ctx.approve(file);};
  ctx.saveSettings=async values=>{for(const key of Object.keys(values))if(!SETTING_KEYS.has(key))throw new Error('Unknown setting: '+key);const next={...ctx.settings,...values};if(!['ru','en','pt'].includes(next.language))throw new Error('Unsupported language');next.download_concurrency=Math.max(1,Math.min(32,Number(next.download_concurrency)||8));next.parallel_jobs=Math.max(1,Math.min(4,Number(next.parallel_jobs)||2));if(!/^\d{17}$/.test(next.player_steamid))throw new Error('Player SteamID must contain 17 digits');for(const field of ['steam_path','active_library','backup_root','avatar_file','background_file','music_file'])if(next[field])await ctx.authorize(next[field]);await swch.settings.set(next);ctx.settings=next;if(values.steam_path){steamRoots=await ctx.steam.libraries();}swch.events.emit('sff.settings',next);return next;};
  ctx.close=async()=>{ctx.stop.abort(new Error('Mod disabled'));await ctx.steam.close();await Promise.race([ctx.rclone.close(),delay(3000)]);await ctx.drive.close();await ctx.processes.close();await ctx.uploads.close();};
  await recoverChanges(ctx);return ctx;
}

export const JOB_HANDLERS={
  'catalog-refresh':(c,i,j)=>c.providers.refreshCatalog(j),
  'provider-refresh':(c,i,j)=>c.providers.refreshKeys(j),
  'tool-install':(c,i,j)=>c.tools.install(i.id,j,i),
  download:(c,i,j)=>c.downloads.download(i,j),
  import:(c,i,j)=>c.downloads.bulkImport(i,j),
  workshop:(c,i,j)=>c.downloads.workshop(i,j),
  'game-fix':(c,i,j)=>c.gameTools.fix(i,j),
  'game-unlock':(c,i,j)=>c.gameTools.unlock(i,j),
  'game-config':(c,i,j)=>c.gameTools.generateConfig(i,j),
  'dlc-add':(c,i,j)=>c.dlc.add(i,j),
  'acf-repair':(c,i,j)=>c.steam.repairAcf(i,j),
  'lumacore-patterns':(c,i,j)=>c.gameTools.prewarmPatterns(i,j),
  'profile-gse':(c,i,j)=>c.gameTools.globalProfile(i,j),
  'game-steamauto':(c,i,j)=>c.gameTools.steamauto(i,j),
  lumacore:(c,i,j)=>c.gameTools.lumacore(i,j),
  'curated-search':(c,i,j)=>c.gameTools.curated(i,j),
  'curated-apply':(c,i,j)=>c.gameTools.applyCurated(i,j),
  'save-scan':(c,i,j)=>c.saves.scan(i,j),
  'save-backup':(c,i,j)=>c.saves.backup(i,j),
  'save-restore':(c,i,j)=>c.saves.restore(i,j),
  'save-manifest':(c,i,j)=>c.saves.refreshManifest(j),
  'save-scan-backups':(c,i,j)=>c.saves.scanBackups(i,j),
  'drive-upload':(c,i,j)=>c.drive.upload(i,j),
  'drive-download':(c,i,j)=>c.drive.download(i,j),
  'rclone-transfer':(c,i,j)=>c.rclone.transfer(i,j),
  'provider-contribute':(c,i,j)=>c.providers.contribute(i,j),
  'history-fetch':(c,i,j)=>c.providers.history(i,j),
  'build-details':(c,i,j)=>c.providers.buildDetails(i,j),
  'provider-branch':(c,i,j)=>c.providers.requestBranch(i,j),
  'download-build':async(c,i,j)=>{const details=await c.providers.buildDetails(i,j);const acquired=await c.providers.acquire(i,j);const depots=Object.keys(acquired.parsed.keys).filter(id=>details.pins[id]);if(!depots.length)throw new Error('This build has no depots matching the authorized Lua');return c.downloads.download({...i,engine:i.engine||'native',lua_file:acquired.file,manifest_folder:acquired.manifest_folder,depots,manifests:details.pins,buildid:details.buildid},j);},
  'lua-migrate':async(c,i,j)=>{await c.steam.requireStopped();const root=path.join(await c.steam.root(),'config/stplug-in');const files=(await fs.readdir(root)).filter(n=>/^\d+\.lua$/.test(n));return transaction(c,'Migrate legacy Lua layout',async change=>{let count=0;for(const name of files){j.signal.throwIfAborted();const source=path.join(root,name),id=parseLua(await fs.readFile(source,'utf8')).appid;const target=path.join(root,id,name);if(await exists(target))throw new Error('Destination already exists: '+target);await change.copy(source,target);await change.remove(source);count++;}return {migrated:count};});},
  'saves-backup-all':async(c,i,j)=>{const scan=await c.saves.scan({},j);const results=[];for(let n=0;n<scan.games.length;n++){const game=scan.games[n];results.push(await c.saves.backup({...game,destination:i.destination},j));await j.checkpoint({next:n+1});}return {backups:results};},
};

export function methods(ctx){const swch=ctx.swch;return {
  state:async()=>({version:VERSION,sdk:swch.apiVersion,platform:ctx.platform,settings:ctx.settings,steam:await ctx.steam.status(),paths:ctx.paths,tools:await ctx.tools.list(),credentials:Object.fromEntries(await Promise.all(SECRET_KEYS.map(async key=>[key,!!await swch.secrets.get(key)]))),game_context:null}),
  'settings.get':()=>ctx.settings,
  'settings.save':input=>ctx.saveSettings(input),
  'secrets.save':async({key,value})=>{if(!SECRET_KEYS.includes(key))throw new Error('Unknown credential');if(typeof value!=='string'||value.length>32768)throw new Error('Invalid credential');if(value)await swch.secrets.set(key,value.trim());else await swch.secrets.delete(key);return {key,configured:!!value};},
  'paths.approve':({path:file})=>ctx.approve(file),
  'uploads.begin':input=>ctx.uploads.begin(input),
  'uploads.chunk':input=>ctx.uploads.chunk(input),
  'uploads.finish':input=>ctx.uploads.finish(input),
  'uploads.cancel':input=>ctx.uploads.cancel(input),
  'catalog.search':input=>ctx.providers.search(input),
  'catalog.status':()=>ctx.providers.status(),
  'games.list':()=>ctx.steam.games(),
  'games.details':async({appid})=>{const local=await ctx.steam.game(appid);let remote,error;try{remote=await ctx.steam.appInfo(appid);}catch(e){error=e.message;}return {...local,remote,error};},
  'games.launch':({appid})=>ctx.steam.launch(appid),
  'games.validate':({appid})=>ctx.steam.launch(appid,'validate'),
  'games.uninstall':({appid})=>ctx.steam.launch(appid,'uninstall'),
  'games.dlc':input=>ctx.gameTools.dlc(input),
  'games.update':async({appid})=>{const local=await ctx.steam.game(appid),remote=await ctx.steam.branches(appid);const build=remote.branches?.public?.buildid;return {appid,installed_build:local.buildid,latest_build:build,update_available:!!build&&String(build)!==String(local.buildid),branches:remote.branches};},
  'steam.restart':()=>ctx.steam.restart(),
  'steam.refresh':()=>swch.library.refreshSteam(),
  'steam.online-fix':input=>ctx.steam.onlineFix(input.appid,input.enabled),
  'steam.updates':input=>ctx.gameTools.steamUpdates(input),
  'steam.update-state':async()=>{const file=path.join(await ctx.steam.root(),'steam.cfg');return {blocked:await exists(file)&&/^\s*BootStrapperInhibitAll\s*=\s*(?:Enable|true|1)\s*$/im.test(await fs.readFile(file,'utf8'))};},
  'lua.list':async()=>{const root=path.join(await ctx.steam.root(),'config/stplug-in');const files=await walk(root,{filter:f=>f.toLowerCase().endsWith('.lua')});const rows=[];for(const file of files){try{const text=await fs.readFile(file,'utf8'),parsed=parseLua(text);const all_pins=Object.fromEntries([...text.matchAll(/^\s*(?:--\s*)?setmanifestid\s*\(\s*(\d+)\s*,\s*["'](\d+)["']/gmi)].map(m=>[m[1],m[2]]));rows.push({file,appid:parsed.appid,depots:Object.keys(parsed.keys).length,manifests:parsed.manifests,all_pins});}catch{}}return rows;},
  'lua.pins':input=>ctx.steam.setPins(input.appid,input.pins,input.enabled!==false),
  'lua.allow-updates':input=>ctx.updates.apply(input),
  'lua.update-helper':input=>ctx.updates.helper(input),
  'lua.update-override':input=>ctx.updates.override(input),
  'lua.update-state':async()=>{const state=await ctx.updates.list();return {...state,games:state.games.map(({text,...game})=>game)};},
  'lua.remove':async({appid})=>{await ctx.steam.requireStopped();appid=numericId(appid);const rows=await methods(ctx)['lua.list']();return transaction(ctx,'Remove managed Lua '+appid,async change=>{let count=0;for(const row of rows)if(row.appid===appid){await change.remove(row.file);count++;}return {removed:count};});},
  'lua.inspect':async({file})=>{await ctx.authorize(file);const lua=parseLua(await fs.readFile(file,'utf8'));return {appid:lua.appid,ids:lua.ids,depots:Object.keys(lua.keys),manifests:lua.manifests};},
  'vdf.keys':async({file})=>{await ctx.authorize(file);const data=parseVdf(await fs.readFile(file,'utf8'));const depots=vdfPath(data,['InstallConfigStore','Software','Valve','Steam','depots'])||{};return Object.keys(depots).filter(k=>depots[k].DecryptionKey).map(id=>({depotid:id,configured:true}));},
  'history.import':input=>ctx.providers.importHistory(input),
  'downloads.state':()=>ctx.downloads.state(),
  'downloads.enqueue':({items})=>ctx.downloads.enqueue(items),
  'downloads.pause':({paused})=>ctx.downloads.pause(paused),
  'jobs.retry':async({id})=>{const old=await swch.jobs.get(id);if(!['failed','cancelled'].includes(old.status))throw new Error('Only failed or cancelled jobs can be retried');return swch.jobs.start(old.type,old.input);},
  'tools.list':()=>ctx.tools.list(),
  'tools.remove':({id})=>ctx.tools.remove(id),
  'changes.list':async()=>{const history=await swch.storage.get('changes')||[];return Promise.all(history.map(async entry=>({...entry,status:(await readJSON(path.join(ctx.paths.data,'changes',entry.id,'journal.json'),{})).status})));},
  'changes.revert':input=>ctx.gameTools.revert(input),
  'saves.list':()=>ctx.saves.list(),
  'saves.inspect':input=>ctx.saves.inspect(input),
  'saves.custom':input=>ctx.saves.custom(input),
  'drive.status':()=>ctx.drive.status(),
  'drive.connect':()=>ctx.drive.authorize(),
  'drive.disconnect':()=>ctx.drive.disconnect(),
  'drive.cancel':async()=>{await ctx.drive.close();return {cancelled:true};},
  'drive.list':()=>ctx.drive.list(),
  'rclone.providers':()=>ctx.rclone.providers(),
  'rclone.remotes':()=>ctx.rclone.remotes(),
  'rclone.configure':input=>ctx.rclone.configure(input),
  'rclone.delete':input=>ctx.rclone.delete(input),
  'rclone.import':input=>ctx.rclone.import(input),
  'rclone.test':input=>ctx.rclone.test(input),
  'provider.preview':async()=>{const data=await ctx.providers.contributionPreview();return {...data,preview_hash:sha256(Buffer.from(JSON.stringify(data.items)))};},
  'provider.reset-submitted':async()=>{await swch.storage.delete('provider-submitted');return {reset:true};},
  'provider.test':async({provider})=>{if(provider==='hubcap')return ctx.providers.hub('/user/stats');if(provider==='ryuu-premium')return ctx.net.json('https://generator.ryuu.lol/requestupdate',{headers:{'X-Auth-Key':await ctx.providers.secret('ryuu-api-key')}});throw new Error('Use an actual provider request to validate this key');},
  'workshop.list':async()=>Object.values(await swch.storage.get('workshop')||{}),
  'workshop.open':({appid})=>ctx.steam.launch(appid,'workshop'),
  'online-fix.search':({query})=>ctx.steam.open('https://online-fix.me/index.php?do=search&subaction=search&story='+encodeURIComponent(query)),
  'logs.get':()=>ctx.logs,
  'diagnostics.read':async({file})=>{await ctx.authorize(file);const handle=await fs.open(file,'r');try{const size=(await handle.stat()).size,bytes=Buffer.alloc(Math.min(size,16384));await handle.read(bytes,0,bytes.length,Math.max(0,size-bytes.length));return {file,text:redact(bytes.toString('utf8'))};}finally{await handle.close();}},
  'settings.export':async({directory})=>{await ctx.authorize(directory);const file=path.join(directory,'sff-swch-settings.json');await atomicWrite(file,JSON.stringify({format:1,settings:ctx.settings},null,2));return {file,secrets_included:false};},
  'settings.import':async({file})=>{await ctx.authorize(file);const data=await readJSON(file,null);if(data?.format!==1||!data.settings)throw new Error('Unsupported settings file');return ctx.saveSettings(data.settings);},
  'profile.asset':async({kind,file})=>{if(!['avatar','background','music'].includes(kind))throw new Error('Unknown profile asset');await ctx.authorize(file);const stat=await fs.stat(file);if(stat.size>25*1024*1024)throw new Error('Profile asset exceeds 25 MiB');const bytes=await fs.readFile(file);const image=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'png':bytes[0]===255&&bytes[1]===216?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;const extension=kind==='music'?path.extname(file).slice(1).toLowerCase():image;if(!extension||kind==='music'&&!['mp3','ogg','wav','m4a'].includes(extension))throw new Error('Unsupported media file');const target=path.join(ctx.paths.data,'profile',kind+'.'+extension);await atomicWrite(target,bytes);await ctx.saveSettings({[kind+'_file']:target});return {saved:true};},
  'profile.get':async()=>{const out={};for(const kind of ['avatar','background','music']){const file=ctx.settings[kind+'_file'];if(file&&await exists(file)){const ext=path.extname(file).slice(1);out[kind]='data:'+(kind==='music'?({mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4'}[ext]):ext==='jpg'?'image/jpeg':'image/'+ext)+';base64,'+(await fs.readFile(file)).toString('base64');}}return out;},
};}

/** @param {import('../mod-sdk/index.d.ts').SDK} swch */
export default async function activate(swch){
  const ctx=await createContext(swch);const handlers=methods(ctx);
  const steamMutations=new Set(['steam.restart','steam.online-fix','steam.updates','lua.pins','lua.allow-updates','lua.update-helper','lua.update-override','lua.remove','changes.revert']);
  swch.registerTab({id:'sff',name:'SFF'});
  swch.registerAction({id:'inspect-game',name:'SFF: диагностика игры'},async({game}={})=>game?.launcher==='steam'&&game.app_id?handlers['games.details']({appid:game.app_id}):ctx.steam.status());
  for(const [id,handler]of Object.entries(handlers))swch.registerMethod(id,async(input={})=>{try{return await (steamMutations.has(id)?ctx.gate.run('steam-config',ctx.settings.parallel_jobs,ctx.stop.signal,()=>handler(input||{})):handler(input||{}));}catch(error){ctx.log(id+': '+error.message);throw error;}});
  for(const [type,handler]of Object.entries(JOB_HANDLERS))swch.jobs.register(type,async(input={},job)=>{const signal=AbortSignal.any([job.signal,ctx.stop.signal]);const context={...job,signal};const key=type==='tool-install'?'tool:'+input.id:type==='import'||type==='lua-migrate'||type==='lumacore'||type==='dlc-add'||type==='acf-repair'?'steam-config':/^saves?-/.test(type)?'saves':input.appid?'game:'+input.appid:type;
    return ctx.gate.run(key,ctx.settings.parallel_jobs,signal,async()=>{ctx.log('Started '+type+' ('+job.id+')');try{const result=await handler(ctx,input,context);ctx.log('Completed '+type+' ('+job.id+')');return result;}catch(error){ctx.log(type+' failed: '+error.message);throw error;}});
  });
  ctx.log('Activated SFF for SWCH with SDK '+swch.apiVersion);
  return ()=>ctx.close();
}
