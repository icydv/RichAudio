// This worker is launched suspended inside OwnedTree before it can spawn a host.
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {supervise} from './supervisor.mjs';
import {preflight} from './adapter.mjs';
import {approval,consume} from './approval-gate.mjs';
const [mode,value]=process.argv.slice(2);
let command,args,cwd,env,limits;
if(mode==='fixture'){
 if(!['normal','orphan','unresponsive','producer-stuck'].includes(value))throw Error('Explicit disposable fixture required');
 command=process.execPath;args=[fileURLToPath(new URL('../../tests/operator/tree-fixture.mjs',import.meta.url)),value];
 limits={ready:600,stop:700,ack:1100,kill:1400,end:2000,statusAge:250};
}else if(mode==='approved-live'){
 // Parent adapter has consumed a fresh approval. This private IPC marker alone is
 // not an approval: a worker cannot enter this path outside its sealed parent.
 const p=preflight(value);approval(value,p,process.argv[4]);consume(p,'host-start-consumed.json');
 command=p.executable;args=p.args;cwd=p.cwd;env=p.env;
}else throw Error('No host fallback');
const events=[];
const c=supervise(command,args,{cwd,env,limits,onEvent:e=>{if(events.length<256)events.push(e);if(mode==='approved-live')console.log('CUE '+JSON.stringify(e));if(value==='normal'&&e.code==='receiver-stop-observed')c.control('sender-stop-confirmed');},onDone:r=>{console.log('SESSION_RESULT '+JSON.stringify({...r,commands:events}));process.exit(0);}});
readline.createInterface({input:process.stdin}).on('line',line=>{if(mode==='fixture'&&line==='frames')c.control('sender-frames-confirmed');else if(/^frames [0-9]+ [0-9]+$/.test(line)){const [_,a,b]=line.split(' ').map(Number);if(Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>0&&b>a){events.push({code:'human-observed-sender-frame-acks',first:a,second:b,at:c.snapshot().elapsedMs});c.control('sender-frames-confirmed');}}else if(line==='abort')c.control('abort');else if(line==='sender-stop')c.control('sender-stop-confirmed');}).on('close',()=>c.control('abort'));
c.control('arm'); // fixture synthetic gate, or the fresh candidate-bound gate checked above
