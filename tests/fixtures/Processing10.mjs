// Original analytic bank only. Same samples and declared bounds as budget042.
export function processingBank10({texture=false}={}){
 const samples=Float32Array.from({length:8192},(_,i)=>.043*Math.sin(i*.119)+.021*Math.cos(i*.037));
 const asset={frames:samples.length,sampleRate:24000,samples,nativePeak:.064,...(texture?{intervals:Array.from({length:32},(_,i)=>({startFrame:i*256,endFrame:(i+1)*256}))}:{})};
 return {model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
}

// The source is absent, genuinely appears later, retires, and is reacquired
// under a fresh generation. Preparation must not change any of those events.
export function processingLifecycleFrame10(frame,time){
 const result=structuredClone(frame);
 if(time<.35||time>=.9&&time<1.1)result.vehicles=[];
 else for(const vehicle of result.vehicles){
  vehicle.generation=time>=1.1?2:1;
  vehicle.operatingPoint=time<.65?.2:time<1.4?.7:.35;
  vehicle.running=!(time>=1.6&&time<1.8);
 }
 return result;
}
