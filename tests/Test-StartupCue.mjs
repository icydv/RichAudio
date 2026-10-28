import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Policy,budget} from '../tools/operator/policy.mjs';
const banner='RichAudio shared output: synthetic endpoint. Maximum 120 seconds; gain 0.2';
test('startup evidence cannot change origin, accept malformed banner, or rearm at/after cutoff',()=>{
 for(const at of [25000,25001]){const p=new Policy();p.line(banner,at);assert.equal(p.visible,false);assert.equal(p.state,'aborted');}
 const p=new Policy();p.line(banner.replace('gain 0.2','gain 0.3'),300);assert.equal(p.visible,false);p.line(banner,400);p.line(banner,500);assert.equal(p.events.filter(x=>x.code==='host-startup-observed').length,1);assert.equal(p.tick(25000).includes('stop'),true);p.line(banner,25001);assert.equal(p.state,'aborted');assert.deepEqual(p.limits,budget);
});
for(const mode of ['startup-delayed','startup-duplicate','startup-missing','startup-late'])test('actual contained adapter startup ordering: '+mode,async()=>{
 const c=spawn(process.execPath,[fileURLToPath(new URL('../tools/Run-LaunchAdapter.mjs',import.meta.url)),'fixture',mode],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',err='';
 c.stdin.on('error',()=>{});c.stdin.write('frames\n');c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>err+=b);
 await new Promise((resolve,reject)=>{c.on('error',reject);c.on('exit',resolve);});assert.equal(err,'');
 const lines=output.trim().split(/\r?\n/),cues=lines.filter(l=>l.startsWith('CUE ')).map(l=>JSON.parse(l.slice(4))),r=JSON.parse(lines.find(l=>l.startsWith('ADAPTER_RESULT ')).slice(15));
 const launch=cues.filter(e=>e.code==='host-launch-boundary'),activation=cues.filter(e=>e.code==='bridge-activation-required');assert.equal(launch.length,1);assert.equal(launch[0].at,0);
 assert.equal(r.ownership.verifiedTreeExit,true);assert.ok(r.ownership.elapsedMs<2100);assert.ok(r.ownership.totalOwnedProcesses>=3);
 if(['startup-delayed','startup-duplicate'].includes(mode)){
  assert.equal(activation.length,1);assert.ok(activation[0].at>=320&&activation[0].at<600);assert.ok(cues.find(e=>e.code==='command-start').at>=activation[0].at);assert.equal(r.session.startCommandIssued,true);assert.equal(r.normalStop,true);
 }else{
  assert.equal(activation.length,0);assert.equal(r.session.startCommandIssued,false);const abort=r.session.events.find(e=>e.code==='readiness-deadline');assert.ok(abort.at>=600&&abort.at<700);assert.equal(r.session.state,'aborted');assert.equal(r.ownership.forcedTreeCleanup,true);if(mode==='startup-late')assert.ok(r.session.events.some(e=>e.code==='startup-evidence-rejected'&&e.at>=650));
 }
 console.log(JSON.stringify({mode,launchAt:launch[0].at,activationAt:activation[0]?.at??null,cleanupAt:r.ownership.elapsedMs,started:r.session.startCommandIssued}));
});
