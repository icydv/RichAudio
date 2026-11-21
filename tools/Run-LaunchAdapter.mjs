// Outer UI/coordinator: timed control and owned process cleanup run elsewhere.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import {readFileSync,writeFileSync} from 'node:fs';
import {preflight} from './operator/adapter.mjs';
import {approval,consume} from './operator/approval-gate.mjs';
import {StopEvidence} from './operator/stop-evidence.mjs';
const [mode,value,approvalFile]=process.argv.slice(2),root=fileURLToPath(new URL('..',import.meta.url));
if(mode==='preflight'){preflight(value);console.log('PASS device-free bindings; REVIEW_ONLY, no launch');}
else if(mode==='reconcile'){
 const aggregate=JSON.parse(readFileSync(value,'utf8')),r=aggregate.session,confirmation=JSON.parse(readFileSync(approvalFile,'utf8'));
 if(confirmation.evidenceSha256){const {hash}=await import('./operator/adapter.mjs');if(hash(confirmation.evidenceFile)!==confirmation.evidenceSha256.toUpperCase())throw Error('Retained evidence hash differs');}
 const e=new StopEvidence();e.receiver=r.stopEvidence.receiver;e.sender=r.stopEvidence.sender;e.confirmSender(confirmation);
 console.log(JSON.stringify({...aggregate,session:{...r,stopEvidence:e.result()},normalStop:r.state==='complete'&&e.result().onTimeAcknowledgedStop&&aggregate.ownership?.verifiedTreeExit===true&&!aggregate.ownership?.forcedTreeCleanup}));
}else if(mode==='fixture'||mode==='live'){
 let p=null;if(mode==='fixture'){if(!['normal','orphan','unresponsive','producer-stuck'].includes(value))throw Error('Explicit disposable fixture required');}
 else {p=preflight(value);approval(value,p,approvalFile);consume(p,'launch-consumed.json');}
 const broker=p?.broker??path.join(root,'.local/operator/OwnedTree.exe');
 const workerArgs=[mode==='fixture'?'1400':'65000',mode==='fixture'?'2000':'70000',process.execPath,path.join(root,'tools/operator/adapter-worker.mjs'),mode==='fixture'?'fixture':'approved-live',value];if(p)workerArgs.push(approvalFile);
 const child=spawn(broker,workerArgs,{cwd:root,env:p?.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='';child.stdout.on('data',b=>{output+=b;if(output.length>2097152)output=output.slice(-2097152);process.stdout.write(b);});child.stderr.pipe(process.stderr);
 child.stdin.on('error',()=>{});
 // These local inputs never deliver RPH commands. Human uses the RPH console.
 readline.createInterface({input:process.stdin}).on('line',line=>{if(['frames','sender-stop','abort'].includes(line)||/^frames [0-9]+ [0-9]+$/.test(line))child.stdin.write(line+'\n');}).on('close',()=>child.stdin.end());
 child.on('close',code=>{const lines=output.split(/\r?\n/),read=prefix=>{const line=lines.find(x=>x.startsWith(prefix));return line?JSON.parse(line.slice(prefix.length)):null;};const session=read('SESSION_RESULT '),ownership=read('OWNER_RESULT ');const result={session,ownership,normalStop:!!(session?.normalStop&&ownership?.verifiedTreeExit&&!ownership?.forcedTreeCleanup),cleanup:ownership?.verifiedTreeExit?'verified':'unverified'};if(p){writeFileSync(path.join(p.packageDirectory,'operator-result.txt'),output,{flag:'wx'});writeFileSync(path.join(p.packageDirectory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});}console.log('ADAPTER_RESULT '+JSON.stringify(result));process.exit(code??94);});
}else throw Error('Use preflight <candidate>, fixture <explicit-mode>, reconcile <session-json> <evidence-json>, or live <candidate> <fresh-approval>');
