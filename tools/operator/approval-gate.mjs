import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {hash} from './adapter.mjs';
export function approval(planFile,p,approvalFile){
 const a=JSON.parse(readFileSync(approvalFile,'utf8').replace(/^\uFEFF/,''));
 if(a.Approved!==true||a.MaximumAttempts!==1||a.CandidateSHA256!==hash(planFile)||a.ManifestSHA256!==p.manifestSha256||!Number.isFinite(Date.parse(a.ExpiresUtc))||Date.parse(a.ExpiresUtc)<=Date.now())throw Error('Fresh candidate-bound human approval required');
 if(path.resolve(approvalFile)!==path.join(p.packageDirectory,'fresh-approval.json'))throw Error('New package approval only');
 return a;
}
export function consume(p,name){writeFileSync(path.join(p.packageDirectory,name),JSON.stringify({candidate:'07.11',utc:new Date().toISOString()}),{flag:'wx'});}
