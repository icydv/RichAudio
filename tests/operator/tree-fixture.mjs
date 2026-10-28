import {spawn} from 'node:child_process';
import readline from 'node:readline';
const mode=process.argv[2];
if(mode==='producer'){setInterval(()=>{},1000);if(process.argv[3]==='cooperative')readline.createInterface({input:process.stdin}).on('line',c=>{if(c==='stop')process.exit(0);});}

if(mode!=='producer'){
 const producer=spawn(process.execPath,[import.meta.filename,'producer',mode==='normal'?'cooperative':'stuck'],{stdio:['pipe','ignore','ignore'],windowsHide:true,detached:true});
 let frame=0,started=false;setInterval(()=>frame+=512,100).unref();
 console.log('RichAudio shared output: fixture. Maximum 120 seconds; gain 0.2');
 const end=()=>{if(mode==='normal'){producer.on('exit',()=>process.exit(0));producer.stdin.end('stop\n');}else process.exit(0);};
 readline.createInterface({input:process.stdin}).on('line',c=>{
  if(c==='start')started=true;
  if(c==='stop'&&mode!=='unresponsive')end();
  if(c==='status'&&mode!=='unresponsive')console.log(JSON.stringify({type:'status',beaconFrequencyHz:600,beaconLevel:.44,outputTrim:{db:24,peakLimit:.5,rejectedBlocks:0},sourceEmitting:started,listenerMode:'native-orientation-only-in-synthetic-scene',listenerPlayoutMode:'interpolated',listenerControlDelaySeconds:.1,observationAgeSeconds:.03,frame,paths:2,limited:0,peak:0}));
 });
 if(mode==='normal')setTimeout(()=>{console.log('Listener terminal '+JSON.stringify({Connection:1,Stage:'connection',Code:'sender-stop',Outcome:'deliberate-stop',Terminal:true,AnotherAttempt:false}));setTimeout(end,40);},800);
 if(mode==='orphan')setTimeout(()=>process.exit(7),450);
}
