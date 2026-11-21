// Camera-only observation, not an acoustic recorder or a gameplay control.
const counts=['frames','emptyCoveredFrames','detailFallbackFrames','visibleTriangles','visibleCells','detailedCells',
 'overviewPages','uploads','cacheHits','cacheMisses','evictions','detailFailures','bufferBytes'];
const timings=['frameIntervalMs','maximumFrameIntervalMs','paintMs','gpuDrawMs','cameraAgeMs','overviewReadyMs','drawSubmitMs'];
export function createOperatorMap01(now){
 let metrics=null,stopRequestedAt=null,discarded=0;
 return {
  accept(value){
   if(!value||Object.keys(value).length!==counts.length+timings.length+2||value.schema!==1||
    (value.viewerFault!==null&&(typeof value.viewerFault!=='string'||value.viewerFault.length>240))||
    counts.some(k=>!Number.isSafeInteger(value[k])||value[k]<0||value[k]>2**40)||
    timings.some(k=>value[k]!==null&&(!Number.isFinite(value[k])||value[k]<0||value[k]>2**40))||
    value.emptyCoveredFrames>value.frames||value.detailFallbackFrames>value.frames||value.detailedCells>value.visibleCells)return false;
   const receivedAt=now();
   if(metrics&&receivedAt-metrics.receivedAt<650){discarded++;return true;}
   metrics={...value,receivedAt};return true;
  },
  stop(){stopRequestedAt??=now();return stopRequestedAt;},
  status(){return {policy:'operator-controlled',stopRequestedAt,metrics,discarded};}
 };
}
