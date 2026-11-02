// Eight original, fixed-pose preparations. No native sound, installed asset or
// device is read. These are explicit test models, not live acquisition support.
import {createPreparedTransientKernel} from './prepared-path.mjs';
import {transientFixtureScene,transientFixtureSession,transientFixturePoses} from './fixture-scenes.mjs';
export function createTransientFixtureLibrary(){
  const poses=transientFixturePoses,make=(kernelSlot,name,sceneName,sourcePose=poses.source,listenerPose=poses.listener)=>Object.freeze({kernelSlot,kernelGeneration:1,sourceId:kernelSlot+1,name,
    kernel:createPreparedTransientKernel({scene:transientFixtureScene(sceneName),sceneId:sceneName,sceneGeneration:1,session:transientFixtureSession,
      sourcePose,listenerPose,authority:'authored-fixture-only'})});
  return Object.freeze([
    make(0,'unknown-direct','unknown'),make(1,'qualified-open','open'),make(2,'qualified-wall','wall'),make(3,'qualified-passage','passage'),
    make(4,'camera-generation-two','wall',poses.source,{position:[0,0,1],generation:2,forward:[1,0,0],up:[0,0,1]}),
    make(5,'left-impact','wall',{position:[-1,2,1],generation:1}),make(6,'right-impact','wall',{position:[1,2,1],generation:1}),
    make(7,'near-unknown-direct','unknown',{position:[0,1,1],generation:1})
  ]);
}
