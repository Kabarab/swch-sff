import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {contained,noLinks,Network} from '../src/core.mjs';
export async function fixture(t){
  const root=fileURLToPath(new URL('../.test-data/'+randomUUID()+'/',import.meta.url));await fs.mkdir(root,{recursive:true});
  t.after(async()=>{const parent=fileURLToPath(new URL('../.test-data/',import.meta.url));if(!contained(parent,root)||root===parent)throw new Error('Unsafe test cleanup');await fs.rm(root,{recursive:true,force:true});});
  const data=new Map(),secrets=new Map();const store=map=>({get:async k=>structuredClone(map.get(k)),set:async(k,v)=>{map.set(k,structuredClone(v));},delete:async k=>map.delete(k)});
  const paths=Object.fromEntries(['data','cache','temp','tools'].map(k=>[k,path.join(root,k)]));for(const p of Object.values(paths))await fs.mkdir(p,{recursive:true});
  let settings={};const ctx={paths,platform:'windows-x64',settings:{},log:()=>{},net:new Network(),authorize:async f=>{await noLinks(f);if(!contained(root,f))throw new Error('Outside test fixture');return f;},swch:{storage:store(data),secrets:store(secrets),settings:{get:async()=>settings,set:async v=>{settings=v;}},events:{emit:()=>{}},library:{list:async()=>[],refreshSteam:async()=>{}},log:()=>{}}};
  const job={id:randomUUID(),signal:new AbortController().signal,progress:async()=>{},checkpoint:async()=>{}};return {ctx,root,job,data,secrets};
}
