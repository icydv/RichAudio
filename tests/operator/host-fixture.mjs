import readline from 'node:readline';
const mode=process.argv[2];let frame=0,started=0;
console.log('RichAudio shared output: synthetic fixture. Commands: start, mute, resume, emit-stop, status, stop. Maximum 120 seconds; gain 0.2');
readline.createInterface({input:process.stdin}).on('line',command=>{
  if(command==='start'){started++;if(started>1)process.exit(8);}
  if(command==='stop'&&mode!=='blocked')process.exit(0);
  if(command==='status'&&mode!=='missing'&&mode!=='blocked'){
    if(mode==='malformed'){console.log('{broken');return;}
    console.log(JSON.stringify({type:'status',beaconFrequencyHz:600,beaconLevel:.44,outputTrim:{db:24,peakLimit:.5,rejectedBlocks:0},sourceEmitting:false,listenerMode:'native-orientation-only-in-synthetic-scene',listenerPlayoutMode:'interpolated',listenerControlDelaySeconds:.1,observationAgeSeconds:.03,frame:mode==='cached'?1:++frame*512,paths:2,limited:0,peak:0}));
  }
});
if(mode==='normal')setTimeout(()=>{
 console.log('Listener terminal '+JSON.stringify({Connection:1,Stage:'connection',Code:'sender-stop',Outcome:'deliberate-stop',Terminal:true,AnotherAttempt:false})+'; owned output muted/stopping');
 setTimeout(()=>process.exit(started===1?0:9),30);
},800);
