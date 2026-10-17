/* GPL-3.0-or-later. SFF download/import workflows on SWCH jobs. */
import {fs,path,exists,atomicWrite,numericId,parseLua,walk,safeName,transaction,dumpVdf,folderSize,json,delay,removeTree} from './core.mjs';
import {downloadDepot} from './steam.mjs';
import {extractArchive} from './tools.mjs';

export class Downloads {
  constructor(ctx){this.ctx=ctx;}
  async pause(paused){await this.ctx.swch.storage.set('downloads-paused',!!paused);this.ctx.swch.events.emit('downloads.paused',!!paused);return {paused:!!paused};}
  async awaitResume(signal){while(await this.ctx.swch.storage.get('downloads-paused')){signal.throwIfAborted();await delay(500,signal);}}
  async state(){return {paused:!!await this.ctx.swch.storage.get('downloads-paused'),jobs:(await this.ctx.swch.jobs.list()).filter(j=>['download','workshop','import'].includes(j.type)),history:await this.ctx.swch.storage.get('download-history')||[]};}
  async enqueue(items){if(!Array.isArray(items))throw new Error('Download list required');const jobs=[];for(const item of items){numericId(item.appid);jobs.push(await this.ctx.swch.jobs.start('download',item));}return jobs;}
  async download(input,job){const {ctx}=this;const appid=numericId(input.appid);await this.awaitResume(job.signal);
    const info=await ctx.steam.appInfo(appid,job.signal);const name=info.common?.name||appid;
    let acquired;
    if(input.lua_file){await ctx.authorize(input.lua_file);acquired={file:input.lua_file,manifest_folder:input.manifest_folder||path.dirname(input.lua_file),parsed:parseLua(await fs.readFile(input.lua_file,'utf8'))};if(acquired.parsed.appid!==appid)throw new Error('Lua App ID differs from selected game');}
    else acquired=await ctx.providers.acquire(input,job);
    if(input.engine==='steam'){
      if(ctx.platform!=='windows-x64')throw new Error('LumaCore native Steam installation is Windows-only. Choose the native CDN engine for authorized macOS depots.');
      if(!await exists(path.join(await ctx.steam.root(),'LumaCore.dll')))throw new Error('Install and configure LumaCore first');
      const imported=await ctx.steam.importLua({...acquired,appid},job);const launched=await ctx.steam.launch(appid,'install');return {...imported,...launched,download_verified:false};
    }
    let directory=input.directory;if(!directory){const library=ctx.settings.active_library||(await ctx.steam.libraries())[0];directory=path.join(library,'steamapps/common',safeName(info.config?.installdir||name));}await ctx.authorize(directory);await fs.mkdir(directory,{recursive:true});
    const targetOS=ctx.platform==='macos-arm64'?'macos':'windows';const pins={...acquired.parsed.manifests,...(input.manifests||{})};const selected=(input.depots?.length?input.depots:Object.keys(acquired.parsed.keys)).filter(id=>{numericId(id);const oslist=info.depots?.[id]?.config?.oslist;return input.all_platforms||!oslist||oslist.split(',').includes(targetOS);});
    if(!selected.length)throw new Error('No compatible depots with authorized keys. Select depots explicitly or use another Lua.');
    const manifests=await walk(acquired.manifest_folder,{signal:job.signal,filter:f=>f.toLowerCase().endsWith('.manifest')});const results=[];
    for(let i=0;i<selected.length;i++){await this.awaitResume(job.signal);const depotid=numericId(selected[i]);const manifest=info.depots?.[depotid]?.manifests?.[input.branch||'public'];const manifestid=numericId(pins[depotid]||(typeof manifest==='object'?manifest.gid:manifest));pins[depotid]=manifestid;
      let manifestfile=manifests.find(f=>path.basename(f)===depotid+'_'+manifestid+'.manifest');if(input.engine==='ddmod'&&!manifestfile)manifestfile=(await ctx.manifests.fetch({appid,depotid,manifestid,branch:input.branch||'public'},job)).file;const params={appid,depotid,manifestid,key:acquired.parsed.keys[depotid],manifestfile,directory,branch:input.branch||'public'};
      await job.progress({stage:'depot',done:i,total:selected.length,depotid});
      results.push(input.engine==='ddmod'?await this.ddmod(params,job):await downloadDepot(ctx,params,job));await job.checkpoint({completed_depots:i+1});
    }
    const bytes=await folderSize(directory,job.signal);if(!bytes)throw new Error('Download completed without any game data');
    const library=(await ctx.steam.libraries()).find(p=>directory.startsWith(path.join(p,'steamapps/common')+path.sep));
    if(library){await ctx.steam.requireStopped();await transaction(ctx,'Register downloaded Steam files '+appid,async change=>{await change.write(path.join(library,'steamapps','appmanifest_'+appid+'.acf'),Buffer.from(dumpVdf({AppState:{appid,name,universe:'1',StateFlags:'4',installdir:path.relative(path.join(library,'steamapps/common'),directory),LastUpdated:String(Math.floor(Date.now()/1000)),SizeOnDisk:String(bytes),buildid:String(input.buildid||(selected.every(id=>{const m=info.depots?.[id]?.manifests?.[input.branch||'public'];return String(typeof m==='object'?m.gid:m)===String(pins[id]);})?info.depots?.branches?.[input.branch||'public']?.buildid||'0':'0')),UpdateResult:'0',InstalledDepots:Object.fromEntries(selected.map(id=>[id,{manifest:pins[id],size:'0'}]))}})));});}
    const managed=await ctx.swch.storage.get('managed-games')||{};managed[appid]={appid,name,path:directory,install_path:directory,manifests:pins};await ctx.swch.storage.set('managed-games',managed);
    const history=await ctx.swch.storage.get('download-history')||[];await ctx.swch.storage.set('download-history',[{appid,name,directory,bytes,date:new Date().toISOString(),engine:input.engine||'native'},...history].slice(0,1000));
    let refresh_error;try{await ctx.swch.library.refreshSteam();}catch(error){refresh_error=error.message;}return {appid,name,directory,bytes,results,verified:true,refresh_error};
  }
  async ddmod(p,job){const tool=await this.ctx.tools.require('ddmod','DepotDownloaderMod.dll');const runtime=this.ctx.platform==='windows-x64'?'dotnet-windows':'dotnet-macos';const executable=await this.ctx.tools.executable(runtime,this.ctx.platform==='windows-x64'?'dotnet.exe':'dotnet');const keyfile=path.join(this.ctx.paths.temp,'depotkeys-'+job.id+'.txt');await atomicWrite(keyfile,p.depotid+';'+p.key,0o600);
    const args=[tool,'-app',p.appid,'-depot',p.depotid,'-manifest',p.manifestid,'-depotkeys',keyfile,'-dir',p.directory,'-validate','-max-downloads',String(Math.min(64,Number(this.ctx.settings.download_concurrency)||8)),'-os',this.ctx.platform==='macos-arm64'?'macos':'windows'];if(p.manifestfile)args.push('-manifestfile',p.manifestfile);
    try{await this.ctx.processes.run(executable,args,{signal:job.signal,cwd:path.dirname(tool),timeout:6*3600000,env:{DOTNET_ROOT:path.dirname(executable)},onLine:line=>{const m=line.match(/(\d+(?:\.\d+)?)%/);if(m)void job.progress({stage:'ddmod',percent:Number(m[1])});}});return {depotid:p.depotid,manifestid:p.manifestid,directory:p.directory,engine:'ddmod'};}finally{await fs.rm(keyfile,{force:true});}
  }
  async bulkImport({files},job){if(!Array.isArray(files)||!files.length)throw new Error('Choose Lua files, archives or folders');const luas=[],stages=[];
    for(const file of files){await this.ctx.authorize(file);const stat=await fs.stat(file);if(stat.isDirectory())luas.push(...(await walk(file,{signal:job.signal,filter:f=>f.toLowerCase().endsWith('.lua')})).map(f=>({file:f,manifest_folder:file})));
      else if(file.toLowerCase().endsWith('.lua'))luas.push({file});
      else {const stage=path.join(this.ctx.paths.temp,'import-'+job.id+'-'+stages.length);stages.push(stage);await extractArchive(file,stage,{signal:job.signal});luas.push(...(await walk(stage,{signal:job.signal,filter:f=>f.toLowerCase().endsWith('.lua')})).map(f=>({file:f,manifest_folder:stage})));}}
    if(!luas.length)throw new Error('No Lua files in selected input');const imported=[];
    try{for(let i=0;i<luas.length;i++){job.signal.throwIfAborted();imported.push(await this.ctx.steam.importLua(luas[i],job));await job.checkpoint({next:i+1});await job.progress({done:i+1,total:luas.length});}}finally{for(const stage of stages)await removeTree(this.ctx.paths.temp,stage);}
    return {imported};
  }
  async workshop({appid,itemid,directory,collection=false},job){appid=numericId(appid);itemid=numericId(itemid);await this.ctx.authorize(directory);let ids=[itemid];
    if(collection){const result=await this.ctx.net.json('https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'collectioncount':'1','publishedfileids[0]':itemid}),signal:job.signal});const details=result.response?.collectiondetails?.[0];if(details?.result!==1)throw new Error('Workshop collection is unavailable');ids=(details.children||[]).map(v=>numericId(v.publishedfileid));}
    const completed=[];for(let i=0;i<ids.length;i++){job.signal.throwIfAborted();const id=ids[i];const data=await this.ctx.net.json('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'itemcount':'1','publishedfileids[0]':id}),signal:job.signal});const info=data.response?.publishedfiledetails?.[0];if(info?.result!==1)throw new Error('Workshop item is unavailable: '+id);if(String(info.consumer_app_id)!==appid)throw new Error('Workshop item belongs to another game');
      const dest=path.join(directory,id);await fs.mkdir(dest,{recursive:true});if(info.file_url){await this.ctx.net.download(info.file_url,path.join(dest,safeName(info.filename||id+'.bin')),{signal:job.signal,progress:job.progress});}
      else {const dll=await this.ctx.tools.require('ddmod','DepotDownloaderMod.dll');const runtime=this.ctx.platform==='windows-x64'?'dotnet-windows':'dotnet-macos';const exe=await this.ctx.tools.executable(runtime,this.ctx.platform==='windows-x64'?'dotnet.exe':'dotnet');await this.ctx.processes.run(exe,[dll,'-app',appid,'-pubfile',id,'-dir',dest,'-validate'],{signal:job.signal,cwd:path.dirname(dll),env:{DOTNET_ROOT:path.dirname(exe)},timeout:6*3600000});}
      if(!await folderSize(dest,job.signal))throw new Error('Workshop download produced no files');completed.push({id,title:info.title,directory:dest});await job.checkpoint({next:i+1});await job.progress({done:i+1,total:ids.length});}
    const history=await this.ctx.swch.storage.get('workshop')||{};for(const item of completed)history[item.id]={...item,appid,date:new Date().toISOString()};await this.ctx.swch.storage.set('workshop',history);return {completed};
  }
}
