// The existing SoundMap service and solver retain authority. This bridge adds
// actual companion source identities, not decorative reflection paths.
import {isCodeWalkerProvider08} from '../../src/acoustics/world/codewalker-provider08.mjs';
import {loadWorldCoverageInspection06,createWorldCoverageSolver06,startWorldCoverageService06,createWorldCoverageSnapshot06} from './worldcoverage06.mjs';
import {freeze,requireWorld} from '../../src/acoustics/world/contracts.mjs';
export function providerCoverage08({provider,coordinator}={}){
 requireWorld(isCodeWalkerProvider08(provider),'branded CodeWalker provider');
 return freeze({kind:'RichAudioProviderCoverage08',coverage:coordinator?createWorldCoverageSnapshot06(coordinator):null,unknown:provider.unknown,
  resourceIdentities:provider.sourceBindings,providerReceiptSHA256:provider.providerReceiptSHA256,parserSHA256:provider.parserSHA256,
  sourceIdentity:'archive/member/stored-range and reconstructed-parser-buffer hashes remain distinct',paths:[],solverPathEvidence:false,viewerCanPublishAcoustics:false,installedWorldVerified:false});
}
export async function inspectProviderTile08({provider,coordinator,tileId,geometryTimeMs=0}={}){
 requireWorld(isCodeWalkerProvider08(provider),'branded CodeWalker provider');
 const page=provider.pages.find(p=>p.inventory.tilePlans.some(t=>t.tileId===tileId));requireWorld(page,'declared provider tile');
 return loadWorldCoverageInspection06({coordinator,pageId:page.pageId,tileId,inventory:page.inventory,geometryTimeMs});
}
export const solveProviderInspection08=createWorldCoverageSolver06;
export const startProviderSoundMap08=startWorldCoverageService06;
