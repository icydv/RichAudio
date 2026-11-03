import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sealStartupCatalogue06} from '../../src/acoustics/world/startup-catalogue06.mjs';
import {StartupAcousticCoordinator06} from '../../src/acoustics/world/startup-coordinator06.mjs';
import {StartupCheckpointStore06} from '../../src/acoustics/world/startup-checkpoint06.mjs';
import {StartupTileStoreRouter06} from '../../src/acoustics/world/startup-tile-store06.mjs';
export async function startupHarness06(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-startup06-')),directory=path.join(root,'.local','checkpoints');await fs.mkdir(directory,{recursive:true});
 const checkpoint=new StartupCheckpointStore06({root,directory}),router=new StartupTileStoreRouter06({root,directory:path.join(root,'.local','tiles')}),coordinators=[];
 return {root,checkpoint,router,create(fixture,options={}){
  const catalogue=sealStartupCatalogue06({catalogueId:fixture.catalogueId,pages:fixture.pages.map(({pageId,inventory})=>({pageId,inventory})),discovery:fixture.discovery});
  const coordinator=new StartupAcousticCoordinator06({catalogue,pageProvider:fixture.pageProvider,checkpoint,storeForPage:async()=>router,session:fixture.session,...options});coordinators.push(coordinator);return coordinator;
 },async close(){
  for(const c of coordinators)await c.close();await router.close();
  const absolute=path.resolve(root),parent=path.resolve(os.tmpdir());assert(path.dirname(absolute)===parent&&/^richaudio-startup06-[^\\/]+$/.test(path.basename(absolute)),'verified owned temporary test directory');await fs.rm(absolute,{recursive:true,force:true});
 }};
}
