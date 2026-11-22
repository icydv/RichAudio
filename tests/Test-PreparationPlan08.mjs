import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreparationPlan08} from '../tools/Prepare-CodeWalkerWorld08.mjs';
test('prelaunch plan rejects oversized per-file and aggregate staged allocation before any source IO',async()=>{
 const plan={schema:1,kind:'RichAudioPreparationPlan08',inputs:[],nativeReviews:[]},item={path:'input/authored.rpf',file:'C:/nonexistent-original-fixture08.rpf',sha256:'a'.repeat(64),bytes:16};
 await assert.rejects(runPreparationPlan08({...plan,inputs:[{...item,maximum:2**30,bytes:2**30}]},{showUi:false}),/bounded planned source aggregate/);
 await assert.rejects(runPreparationPlan08({...plan,inputs:[{...item,bytes:20000000},{...item,path:'input/second.rpf',bytes:20000000}]},{showUi:false}),/bounded planned source aggregate/);
});
