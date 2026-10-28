import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const entry=fileURLToPath(new URL('../tools/Run-LaunchAdapter.mjs',import.meta.url));
for(const mode of ['normal','orphan','producer-stuck','unresponsive','disconnected','blocked'])test('contained host and producer: '+mode,async()=>{
 const c=spawn(process.execPath,[entry,'fixture',['disconnected','blocked'].includes(mode)?'unresponsive':mode],{stdio:['pipe','pipe','pipe'],windowsHide:true});let text='',err='';
 c.stdout.on('data',b=>text+=b);c.stderr.on('data',b=>err+=b);c.stdin.on('error',()=>{});c.stdin.write('frames\n');
 const exited=new Promise((resolve,reject)=>{c.on('error',reject);c.on('exit',resolve);});
 if(mode==='disconnected')c.stdin.end();
 if(mode==='blocked'){const until=Date.now()+1800;while(Date.now()<until){}}
 await exited;assert.equal(err,'');const lines=text.trim().split(/\r?\n/);const owner=JSON.parse(lines.find(x=>x.startsWith('OWNER_RESULT ')).slice(13));
 assert.equal(owner.verifiedTreeExit,true);assert.ok(owner.totalOwnedProcesses>=3);assert.ok(owner.elapsedMs<2100);
 if(mode==='normal'){const r=JSON.parse(lines.find(x=>x.startsWith('SESSION_RESULT ')).slice(15));assert.equal(r.normalStop,true);assert.equal(owner.forcedTreeCleanup,false);}
 if(['orphan','producer-stuck'].includes(mode))assert.equal(owner.forcedTreeCleanup,true);
 console.log(JSON.stringify({mode,...owner}));
});
