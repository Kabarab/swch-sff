/* GPL-3.0-or-later. LetUpdate behavior adapted from Midrag/SFF update_pins.py
 * and update_prompt_override.py, Copyright 2025-2026 Midrag and contributors. */
import {fs,path,exists,walk,parseLua,transaction,numericId,pinLua} from './core.mjs';
const REDIST=new Set([1004,1005,1006,228500,228980,228981,228982,228983,228984,228985,228986,228987,228988,228989,228990,229000,229001,229002,229003,229004,229005,229006,229007,229010,229011,229012,229020,229021,229030,229031,229032,229033,229040,229060,229080].map(String));
export function renderUpdateHelper(depots=[]){depots=[...new Set(depots.map(numericId))].filter(d=>!REDIST.has(d)).sort((a,b)=>Number(a)-Number(b));return `-- GPL-3.0-or-later. Adapted from SteaMidra; managed by SFF for SWCH.
-- STEAMIDRA_EXCLUDED_DEPOTS: [${depots.join(',')}]
local original_setManifestid = _originals and (_originals.setManifestid or _originals.setmanifestid) or setManifestid
local auto_update_depots = {
${depots.map(id=>'    ['+id+'] = true,').join('\n')}
}
local function route_set_manifest(depot_id, manifest_id, size)
    if auto_update_depots[tonumber(depot_id)] == true then
        if skipmanifestpin then skipmanifestpin(depot_id) end
        return nil
    end
    if original_setManifestid then return original_setManifestid(depot_id, manifest_id, size) end
    return nil
end
function setManifestid(depot_id, manifest_id, size) return route_set_manifest(depot_id, manifest_id, size) end
function setmanifestid(depot_id, manifest_id, size) return route_set_manifest(depot_id, manifest_id, size) end
`;}
const PER_GAME=`-- GPL-3.0-or-later. Midrag/SFF per-game LetUpdate route.
local original_setManifestid = _originals and _originals.setManifestid or setManifestid
local original_setmanifestid = _originals and _originals.setmanifestid or setmanifestid
local function route(depotId, gidStr, sizeArg)
    local fn = original_setManifestid or original_setmanifestid
    if fn then return fn(depotId, gidStr, sizeArg) end
end
function setManifestid(depotId, gidStr, sizeArg) return route(depotId, gidStr, sizeArg) end
function setmanifestid(depotId, gidStr, sizeArg) return route(depotId, gidStr, sizeArg) end
`;
export class Updates{
  constructor(ctx){this.ctx=ctx;}
  async root(){return path.join(await this.ctx.steam.root(),'config/stplug-in');}
  async list(){const root=await this.root(),games=[];for(const file of await walk(root,{filter:f=>f.toLowerCase().endsWith('.lua')&&!path.basename(f).toLowerCase().includes('letupdate_override')})){let parsed,text;try{text=await fs.readFile(file,'utf8');parsed=parseLua(text);}catch{continue;}const pins=Object.fromEntries([...text.matchAll(/^\s*(?:--\s*)?setmanifestid\s*\(\s*(\d+)\s*,\s*["'](\d+)["']/gmi)].map(m=>[m[1],m[2]]));if(Object.keys(pins).length)games.push({appid:parsed.appid,file,pins,allow_update:!Object.keys(parsed.manifests).length,text});}const helper=path.join(root,'00_LetUpdate_override.lua');return {games,helper:{exists:await exists(helper),path:helper}};}
  async apply({allowed,appid,enabled}){await this.ctx.steam.requireStopped();const state=await this.list();const selected=new Set(allowed?.map(numericId)||state.games.filter(g=>g.allow_update).map(g=>g.appid));if(appid){appid=numericId(appid);if(!state.games.some(g=>g.appid===appid))throw new Error('No pinned Lua found for this game');enabled?selected.add(appid):selected.delete(appid);}const depots=[];return transaction(this.ctx,'LetUpdate selection',async change=>{for(const game of state.games){const allow=selected.has(game.appid),next=pinLua(game.text,game.pins,!allow);if(next!==game.text)await change.write(game.file,Buffer.from(next));if(allow)depots.push(...Object.keys(game.pins));}await change.write(state.helper.path,Buffer.from(renderUpdateHelper(depots)));return {allowed:[...selected],auto_update_depots:[...new Set(depots)].filter(id=>!REDIST.has(id)),helper:state.helper.path};});}
  async helper({enabled}){await this.ctx.steam.requireStopped();const state=await this.list();return transaction(this.ctx,'LetUpdate helper',async change=>{if(enabled)await change.write(state.helper.path,Buffer.from(renderUpdateHelper(state.games.filter(g=>g.allow_update).flatMap(g=>Object.keys(g.pins)))));else await change.remove(state.helper.path);return {enabled:!!enabled};});}
  async override({appid,enabled}){await this.ctx.steam.requireStopped();appid=numericId(appid);const root=await this.root();return transaction(this.ctx,'Per-game update route '+appid,async change=>{const file=path.join(root,appid,'00_LetUpdate_override.lua');if(enabled)await change.write(file,Buffer.from(PER_GAME));else {await change.remove(file);await change.remove(path.join(root,appid+'_LetUpdate_override.lua'));}const map=await this.ctx.swch.storage.get('game-update-overrides')||{};map[appid]=!!enabled;await this.ctx.swch.storage.set('game-update-overrides',map);return {appid,enabled:!!enabled};});}
}
