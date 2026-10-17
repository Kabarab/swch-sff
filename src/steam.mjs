/* GPL-3.0-or-later. Steam file operations adapted from Midrag/SFF. */
import os from 'node:os';
import SteamUser from 'steam-user';
import ContentManifest from 'steam-user/components/content_manifest.js';
import CdnCompression from 'steam-user/components/cdn_compression.js';
import SteamCrypto from '@doctormckay/steam-crypto';
import {createHash} from 'node:crypto';
import {fs,path,exists,parseVdf,dumpVdf,vdfPath,numericId,transaction,parseLua,within,noLinks,hashFile,atomicWrite,walk,folderSize,delay,pinLua} from './core.mjs';

export class Steam {
  constructor(ctx) {this.ctx=ctx;this.client=null;this.login=null;this.appCache=new Map();}
  async root() {
    if(this.ctx.settings.steam_path){const root=path.resolve(this.ctx.settings.steam_path);if(!await exists(path.join(root,'steamapps')))throw new Error('Selected Steam folder has no steamapps directory');return root;}
    const candidates=process.platform==='darwin'?[path.join(os.homedir(),'Library/Application Support/Steam')]:[path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Steam'),path.join(process.env.ProgramFiles||'C:/Program Files','Steam')];
    if(process.platform==='win32'){try{const r=await this.ctx.processes.run('reg.exe',['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath'],{timeout:5000});const match=r.output.match(/SteamPath\s+REG_SZ\s+(.+)/i);if(match)candidates.unshift(match[1].trim());}catch{}}
    for(const candidate of candidates)if(await exists(path.join(candidate,'steamapps')))return path.resolve(candidate);
    throw new Error('Steam was not found. Select its installation folder in Settings.');
  }
  async libraries() {
    const root=await this.root(),libraries=[root],file=path.join(root,'steamapps/libraryfolders.vdf');
    if(await exists(file)){const data=parseVdf(await fs.readFile(file,'utf8'));const entries=vdfPath(data,['libraryfolders'])||{};for(const [key,item]of Object.entries(entries))if(/^\d+$/.test(key)){const dir=typeof item==='string'?item:item.path;if(dir&&await exists(path.join(dir,'steamapps')))libraries.push(path.resolve(dir));}}
    return [...new Set(libraries)];
  }
  async games() {
    const games=new Map();const swch=await this.ctx.swch.library.list();
    for(const game of swch)if(game.launcher==='steam'&&game.app_id)games.set(String(game.app_id),{...game,appid:String(game.app_id),path:game.install_path||'',source:'swch'});
    for(const library of await this.libraries()){
      for(const name of await fs.readdir(path.join(library,'steamapps'))){const m=/^appmanifest_(\d+)\.acf$/i.exec(name);if(!m)continue;const file=path.join(library,'steamapps',name);await noLinks(file);
        try{const data=parseVdf(await fs.readFile(file,'utf8'));const s=vdfPath(data,['AppState']);if(!s)continue;const install=await within(path.join(library,'steamapps/common'),s.installdir||m[1]);games.set(m[1],{...(games.get(m[1])||{}),appid:m[1],app_id:m[1],name:s.name||m[1],path:install,install_path:install,library,acf:file,buildid:s.buildid||'0',size_bytes:Number(s.SizeOnDisk||0),is_installed:await exists(install),acf_state:s});}catch(error){this.ctx.log('Could not read '+name+': '+error.message);}
      }
    }
    const managed=await this.ctx.swch.storage.get('managed-games')||{};
    for(const [id,g] of Object.entries(managed))if(!games.has(id))games.set(id,{...g,appid:id,app_id:id,is_installed:await exists(g.path||''),managed:true});
    return [...games.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  async game(id) {id=numericId(id);const game=(await this.games()).find(g=>g.appid===id);if(!game)throw new Error('Game is not in the installed Steam/SFF library');return game;}
  async accounts() {
    const root=await this.root(),file=path.join(root,'config/loginusers.vdf');if(!await exists(file))return [];
    const users=vdfPath(parseVdf(await fs.readFile(file,'utf8')),['users'])||{};
    return Object.entries(users).filter(([id])=>/^\d{17}$/.test(id)&&BigInt(id)>=76561197960265728n).map(([id,a])=>({id,steam32_id:(BigInt(id)-76561197960265728n).toString(),username:a.AccountName||'',display_name:a.PersonaName||a.AccountName||id,is_active:a.MostRecent==='1'}));
  }
  async connected(signal) {
    if(this.client?.steamID)return this.client;if(this.login)return this.login;
    const client=new SteamUser({dataDirectory:null,autoRelogin:false,enablePicsCache:true});this.client=client;
    client.storage.on('read',(filename,callback)=>{this.ctx.swch.storage.get('steam-cache.'+createHash('sha256').update(filename).digest('hex')).then(value=>callback(null,value?Buffer.from(value,'base64'):null),callback);});
    client.storage.on('save',(filename,contents,callback)=>{this.ctx.swch.storage.set('steam-cache.'+createHash('sha256').update(filename).digest('hex'),contents.toString('base64')).then(()=>callback(null),callback);});
    client.on('error',error=>this.ctx.log('Steam connection: '+error.message));
    this.login=new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);client.off('loggedOn',ready);client.off('error',fail);signal?.removeEventListener('abort',abort);};const fail=e=>{cleanup();reject(e);};const ready=()=>{cleanup();resolve(client);};const abort=()=>{client.logOff();fail(signal.reason??new Error('Cancelled'));};client.once('loggedOn',ready);client.once('error',fail);signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>fail(new Error('Steam anonymous connection timed out')),45000);client.logOn({anonymous:true});});
    try{return await this.login;}finally{this.login=null;}
  }
  async appInfo(id,signal,refresh=false) {id=numericId(id);if(!refresh&&this.appCache.has(id))return this.appCache.get(id);const client=await this.connected(signal);const result=await client.getProductInfo([Number(id)],[]);const info=result.apps?.[id]?.appinfo;if(!info)throw new Error('Steam returned no product data for '+id);this.appCache.set(id,info);return info;}
  async storeInfo(id,signal) {id=numericId(id);const data=await this.ctx.net.json('https://store.steampowered.com/api/appdetails?appids='+id+'&l='+encodeURIComponent(this.ctx.settings.language==='ru'?'russian':'english'),{signal});if(!data[id]?.success)throw new Error('Steam Store has no public record for '+id);return data[id].data;}
  async branches(id,signal) {const info=await this.appInfo(id,signal,true);return {branches:info.depots?.branches||{},depots:info.depots||{},name:info.common?.name||id};}
  async launch(id,kind='run') {id=numericId(id);const uri='steam://'+({run:'rungameid',install:'install',validate:'validate',uninstall:'uninstall',workshop:'url/SteamWorkshopPage'}[kind]||'rungameid')+'/'+id;await this.open(uri);return {dispatched:true,message:'Request sent to Steam; completion is controlled by Steam.'};}
  async open(url) {const parsed=new URL(url);if(!['https:','steam:'].includes(parsed.protocol))throw new Error('Unsupported URL scheme');if(process.platform==='win32')await this.ctx.processes.run('rundll32.exe',['url.dll,FileProtocolHandler',url],{timeout:15000});else if(process.platform==='darwin')await this.ctx.processes.run('/usr/bin/open',[url],{timeout:15000});else throw new Error('Unsupported OS');}
  async isRunning() {if(process.platform==='win32'){const r=await this.ctx.processes.run('tasklist.exe',['/FI','IMAGENAME eq steam.exe','/FO','CSV','/NH'],{timeout:5000});return /"steam\.exe"/i.test(r.output);}const r=await this.ctx.processes.run('/usr/bin/pgrep',['-x','steam_osx'],{timeout:5000,allowFailure:true});return r.exit_code===0;}
  async requireStopped() {if(await this.isRunning())throw new Error('Exit Steam completely before changing its configuration. Then retry the operation.');}
  async restart() {
    const root=await this.root();if(process.platform==='win32'){await this.ctx.processes.run(path.join(root,'steam.exe'),['-shutdown'],{timeout:20000,allowFailure:true});}else await this.ctx.processes.run('/usr/bin/osascript',['-e','tell application "Steam" to quit'],{timeout:20000,allowFailure:true});
    for(let i=0;i<40&&await this.isRunning();i++)await delay(500);
    if(await this.isRunning())throw new Error('Steam did not exit. Close it manually.');await this.open('steam://open/main');return {dispatched:true};
  }
  async importLua({file,manifest_folder,appid,pins},job) {
    await this.requireStopped();await this.ctx.authorize(file);let text=await fs.readFile(file,'utf8');if(pins)text=pinLua(text,pins);
    const parsed=parseLua(text);if(appid&&numericId(appid)!==parsed.appid)throw new Error('Selected App ID differs from the Lua App ID');
    const root=await this.root(),target=path.join(root,'config/stplug-in',parsed.appid,parsed.appid+'.lua');
    return transaction(this.ctx,'Import Lua '+parsed.appid,async change=>{
      const configFile=path.join(root,'config/config.vdf');const config=await exists(configFile)?parseVdf(await fs.readFile(configFile,'utf8')):Object.create(null);const depots=vdfPath(config,['InstallConfigStore','Software','Valve','Steam','depots'],true);
      for(const [id,key]of Object.entries(parsed.keys))depots[id]={...(depots[id]||{}),DecryptionKey:key};
      await change.write(configFile,Buffer.from(dumpVdf(config)));await change.write(target,Buffer.from(text));
      await fs.mkdir(path.join(this.ctx.paths.data,'saved-lua'),{recursive:true});await atomicWrite(path.join(this.ctx.paths.data,'saved-lua',parsed.appid+'.lua'),text);
      let count=0;if(manifest_folder){await this.ctx.authorize(manifest_folder);for(const manifest of await walk(manifest_folder,{signal:job?.signal,filter:f=>/^\d+_\d+\.manifest$/i.test(path.basename(f))})){job?.signal.throwIfAborted();await change.write(path.join(root,'depotcache',path.basename(manifest)),await fs.readFile(manifest));count++;}}
      const recent=await this.ctx.swch.storage.get('recent-lua')||[];await this.ctx.swch.storage.set('recent-lua',[{appid:parsed.appid,file:target,date:new Date().toISOString()},...recent.filter(r=>r.appid!==parsed.appid)].slice(0,100));
      return {appid:parsed.appid,depots:Object.keys(parsed.keys).length,manifests:count,message:process.platform==='darwin'?'Lua and manifest files imported as data. No macOS ownership injection is provided.':'Lua and manifest files imported. Steam has not been launched.'};
    });
  }
  async setPins(id,pins,enabled=true) {id=numericId(id);await this.requireStopped();const root=await this.root();const files=(await walk(path.join(root,'config/stplug-in'))).filter(f=>f.toLowerCase().endsWith('.lua'));const selected=[];for(const file of files){try{if(parseLua(await fs.readFile(file,'utf8')).appid===id)selected.push(file);}catch{}}if(!selected.length)throw new Error('No managed Lua found for this game');return transaction(this.ctx,'Manifest pins '+id,async change=>{for(const f of selected)await change.write(f,Buffer.from(pinLua(await fs.readFile(f,'utf8'),pins,enabled)));return {files:selected.length};});}
  async repairAcf({appid},job){appid=numericId(appid);await this.requireStopped();const game=await this.game(appid);if(!game.acf)throw new Error('No local ACF for this game');const info=await this.appInfo(appid,job.signal,true),buildid=info.depots?.branches?.public?.buildid;if(!buildid||String(buildid)==='0')throw new Error('Steam returned no current build ID');const data=parseVdf(await fs.readFile(game.acf,'utf8')),state=vdfPath(data,['AppState']);let count=0;const installed=vdfPath(state,['InstalledDepots'])||{};for(const [id,depot]of Object.entries(installed)){const m=info.depots?.[id]?.manifests?.public,gid=typeof m==='object'?m.gid:m;if(gid){depot.manifest=String(gid);count++;}}Object.assign(state,{buildid:String(buildid),TargetBuildID:String(buildid),StateFlags:'4',DownloadType:'0',UpdateResult:'0',ScheduledAutoUpdate:'0',BytesToDownload:'0',BytesDownloaded:'0',BytesToStage:'0',BytesStaged:'0',AutoUpdateBehavior:'0'});if(await exists(game.path))state.SizeOnDisk=String(await folderSize(game.path,job.signal));return transaction(this.ctx,'ACF metadata repair '+appid,async change=>{await change.write(game.acf,Buffer.from(dumpVdf(data)));return {appid,buildid:String(buildid),depots_patched:count,files_downloaded:false,files_verified:false,message:'Only ACF metadata was updated. Game files were not downloaded or validated.'};});}
  async onlineFix(id,enabled) {if(process.platform!=='win32')throw new Error('LumaCore online fix is Windows-only');await this.requireStopped();id=numericId(id);const account=(await this.accounts()).find(a=>a.is_active);if(!account)throw new Error('No active local Steam account');const file=path.join(await this.root(),'userdata',account.steam32_id,'config/localconfig.vdf');const data=parseVdf(await fs.readFile(file,'utf8'));const apps=vdfPath(data,['UserLocalConfigStore','Software','Valve','Steam','apps'],true);const app=apps[id]??=Object.create(null);let options=(app.LaunchOptions||'').split(/\s+/).filter(v=>v&&v!=='-onlinefix');if(enabled)options.push('-onlinefix');app.LaunchOptions=options.join(' ');return transaction(this.ctx,'Online fix option '+id,async change=>{await change.write(file,Buffer.from(dumpVdf(data)));return {enabled:!!enabled};});}
  async status() {let root,error;try{root=await this.root();}catch(e){error=e.message;}return {root,error,platform:this.ctx.platform,accounts:root?await this.accounts():[],libraries:root?await this.libraries():[],lumacore:root?await exists(path.join(root,'LumaCore.dll')):false};}
  async close(){this.client?.logOff();this.client=null;}
}

/** Steam's actual manifest format and chunk verifier come from steam-user 5.3.0. */
export async function downloadDepot(ctx,{appid,depotid,manifestid,key,manifestfile,directory,branch='public'},job) {
  appid=numericId(appid);depotid=numericId(depotid);manifestid=numericId(manifestid);if(!/^[a-f\d]{64}$/i.test(key))throw new Error('A valid authorized depot key is required');
  await ctx.authorize(directory);const client=await ctx.steam.connected(job.signal);const keys=Buffer.from(key,'hex');let manifest;
  if(manifestfile&&await exists(manifestfile)){const bytes=await fs.readFile(manifestfile);try{manifest=ContentManifest.parse(bytes);}catch{manifest=ContentManifest.parse(await CdnCompression.unzip(bytes));}}
  else {manifest=ctx.manifests?(await ctx.manifests.fetch({appid,depotid,manifestid,branch},job)).manifest:ContentManifest.parse((await client.getRawManifest(Number(appid),Number(depotid),manifestid,branch)).manifest);}
  if(String(manifest.depot_id)!==depotid||String(manifest.gid_manifest)!==manifestid)throw new Error('Manifest depot/version differs from request');ContentManifest.decryptFilenames(manifest,keys);
  const {servers}=await client.getContentServers(Number(appid));const hosts=servers.filter(s=>s.https_support!=='none');if(!hosts.length)throw new Error('No HTTPS Steam content servers');let index=0,done=0;
  const files=(manifest.files||[]).filter(f=>!(f.flags&64));if(!files.length)throw new Error('Manifest contains no regular files');const total=files.reduce((n,f)=>n+Number(f.size),0);
  const concurrency=Math.max(1,Math.min(32,Number(ctx.settings.download_concurrency)||8));let cursor=0;const cancellation=new AbortController();job={...job,signal:AbortSignal.any([job.signal,cancellation.signal])};
  const workers=Array.from({length:Math.min(concurrency,files.length)},async()=>{try{
    for(;;){const at=cursor++;if(at>=files.length)return;job.signal.throwIfAborted();const file=files[at];if(file.flags&512)throw new Error('Symlink entry in depot is unsupported');const dest=await within(directory,file.filename.replaceAll('\\','/'));await fs.mkdir(path.dirname(dest),{recursive:true});
      if(await exists(dest)&&(!Number(file.size)||await hashFile(dest,'sha1')===file.sha_content)){done+=Number(file.size);continue;}
      const partial=dest+'.sff-partial';await noLinks(partial);const handle=await fs.open(partial,await exists(partial)?'r+':'w+');
      try {await handle.truncate(Number(file.size));for(const chunk of file.chunks||[]){job.signal.throwIfAborted();await ctx.downloads?.awaitResume(job.signal);const size=Number(chunk.cb_original),offset=Number(chunk.offset);if(!Number.isSafeInteger(size)||size<0||size>64*1024*1024||!Number.isSafeInteger(offset)||offset<0||offset+size>Number(file.size))throw new Error('Invalid depot chunk bounds');const probe=Buffer.alloc(size);const read=await handle.read(probe,0,size,offset);
          if(read.bytesRead===size&&createHash('sha1').update(probe).digest('hex')===chunk.sha){done+=size;continue;}
          let data,lastError;for(let attempt=0;attempt<5;attempt++){job.signal.throwIfAborted();const server=hosts[index++%hosts.length];try{const r=await ctx.net.request('https://'+server.Host+'/depot/'+depotid+'/chunk/'+chunk.sha,{signal:job.signal});data=await CdnCompression.unzip(SteamCrypto.symmetricDecrypt(Buffer.from(await r.arrayBuffer()),keys));if(data.length!==size||createHash('sha1').update(data).digest('hex')!==chunk.sha)throw new Error('Chunk checksum mismatch');break;}catch(e){lastError=e;data=null;}}
          if(!data)throw lastError;await handle.write(data,0,data.length,offset);done+=data.length;await job.progress({stage:'download',done,total,file:file.filename});}
      }finally{await handle.close();}
      if(Number(file.size)&&await hashFile(partial,'sha1')!==file.sha_content)throw new Error('Downloaded file checksum mismatch: '+file.filename);
      if(await exists(dest))await transaction(ctx,'Replace downloaded file',async change=>{await change.copy(partial,dest);});else await fs.rename(partial,dest);
      if(await exists(partial))await fs.rm(partial);if(process.platform!=='win32'&&file.flags&32)await fs.chmod(dest,0o755);await job.checkpoint({depotid,manifestid,completed_file:at});
    }
  }catch(error){cancellation.abort(error);throw error;}});const settled=await Promise.allSettled(workers),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;return {depotid,manifestid,files:files.length,bytes:total,directory};
}
