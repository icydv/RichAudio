// Explicit substitution for the installed-world measurement/decoder workload in
// the copied rehearsal package. Never imports or opens game/vendor resources.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {prepareNormalOuterInvocation01} from './normal-readiness-wrapper01.mjs';
const repo=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--run-approved')throw Error('Actual entry arguments lost');
const config=JSON.parse(fs.readFileSync(args[1],'utf8').replace(/^\uFEFF/,''));
const folder=path.dirname(args[1]),literal=x=>"'"+x.replaceAll("'","''")+"'";
if(config.FixtureToken!=="quoted ' token with spaces")throw Error('External identity overwritten by import');
fs.writeFileSync(path.join(folder,'fixture-worker-reached.json'),JSON.stringify({pid:process.pid,token:config.FixtureToken,approvedPath:args[1],fixtureOnly:true}));
if(config.FixtureInnerDependencyDrift)fs.appendFileSync(path.join(repo,'src/acoustics/startup/CatalogLifecycle.psm1'),'\n# authored controlled drift after aggregate admission\n');
const worker=path.join(repo,'tests/fixtures/NormalReadinessWorker01.ps1');
const command='& '+literal(worker)+' -Output '+literal(path.join(folder,'worker.json'))+' -Token '+literal(config.FixtureToken)+' -WorkerExitCode '+config.FixtureWorkerExitCode+';exit $LASTEXITCODE';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const invocation=prepareNormalOuterInvocation01({repo,config,templateSHA256:process.env.RICHAUDIO_QUALIFICATION_TEMPLATE_SHA256,binding:{Software:[{Path:worker,SHA256:hash(worker)},config.AuthoredInstallation,config.AuthoredCache],CommandText:command,PrivateRoot:folder,StageOutput:path.join(folder,'inner-job'),CancellationPath:path.join(folder,'inner-cancel.request'),MaximumSeconds:20,MaximumMemoryMiB:3072,EpochUtc:new Date().toISOString(),ReceiptPath:path.join(folder,'inner-process.json'),IdentityReceiptPath:path.join(folder,'inner-identity.json')}});
const child=spawnSync(config.PowerShell.Path,invocation.args,{cwd:process.cwd(),windowsHide:true,encoding:'utf8'});
fs.writeFileSync(path.join(folder,'inner-host.stdout.log'),child.stdout??'');fs.writeFileSync(path.join(folder,'inner-host.stderr.log'),child.stderr??'');
process.exitCode=child.status===0?0:1;
