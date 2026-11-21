// Device-free only: no executable/path substitution and no live approval capability.
import { fileURLToPath } from 'node:url';
import { supervise } from './operator/supervisor.mjs';
const mode=process.argv[2];
if(!['normal','cached','missing','malformed','no-ack','blocked'].includes(mode))throw Error('Explicit fixture mode required');
const events=[];
const controller=supervise(process.execPath,[fileURLToPath(new URL('../tests/operator/host-fixture.mjs',import.meta.url)),mode],{
 limits:{ready:600,stop:700,ack:1100,kill:1400,end:2000,statusAge:250},
 onEvent:e=>{
   if(events.length<256)events.push(e);
   if(['command-start','command-mute','bridge-stop-required','owned-child-kill'].includes(e.code))process.stderr.write(`${Math.round(e.at)}ms ${e.code}\n`);
   if(e.code==='receiver-stop-observed'){if(process.send)process.send(e);else controller.control('sender-stop-confirmed');}
 },
 onDone:result=>{console.log(JSON.stringify({...result,commands:events}));process.disconnect?.();}
});
// These fixture controls cannot launch anything other than the named disposable child.
process.on('message',message=>controller.control(message));
process.on('disconnect',()=>controller.control('abort'));
if(!process.send){controller.control('arm');controller.control('sender-frames-confirmed');}
