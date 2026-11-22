// Read-only RichAudio-owned loading presentation. No game/RPH/native setter,
// player control, loading-screen hold or geometry authority is supplied here.
import {isStartupCoordinator06} from './startup-coordinator06.mjs';
import {freeze,requireWorld} from './contracts.mjs';
export function startupLoadingPresentation06(coordinator){
 requireWorld(isStartupCoordinator06(coordinator),'branded startup preparation for loading presentation');const p=coordinator.snapshot({includeTiles:false}),ready=p.readiness==='ready-supported-subset',partial=['partial','cancelled','budget-exceeded'].includes(p.readiness),percent=p.eligibleTiles>0?p.percent:null;
 const text=ready?'Acoustic cache ready — declared supported subset':partial?'Acoustic cache incomplete — review coverage':percent===null?'Discovering acoustic resources…':`Warming up acoustic cache — ${percent}%`;
 return freeze({schema:1,kind:'RichAudioStartupLoadingPresentation06',text,stage:p.stage,percent,indeterminate:percent===null,percentBasis:p.percentBasis,
  work:{completed:p.completedEligibleTiles,eligible:p.eligibleTiles,declared:p.totalTiles,unsupported:p.unsupportedTiles,failed:p.failedTiles,unknownRegions:p.unknownRegions.length},
  readiness:p.readiness,staticSubsetPrepared:ready,actualWorldCoverage:p.actualWorldCoverage,
  message:'Declared supported static tiles only. Unknown coverage and runtime states remain explicit.',
  actions:{continuePartiallyAvailable:partial,continuePartiallySelected:p.continuePartiallySelected,recoveryAvailable:p.recoveryAvailable||partial,automaticRetry:false},
  surface:'RichAudio-owned-read-only-preview',preferredPlacement:'bottom-right',nativeLoadingLabelModified:false,gameplayGateConnected:false,earliestLiveStartupStageVerified:false,viewerCanPublishAcoustics:false});
}
