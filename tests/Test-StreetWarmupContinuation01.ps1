# Actual supervisor/job fixtures with original inert identities and authored
# checkpoint writers. No CodeWalker/GTA load, native observation or audio.
#requires -Version 7.0
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
$root=Join-Path $repo ('.local/street01/continuation-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $root 'Supervisor.dll'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /warnaserror+ /r:System.Runtime.Serialization.dll ('/out:'+$binary) (Join-Path $repo 'src/acoustics/integration/WorldWarmupSupervisor.cs')
if($LASTEXITCODE){throw 'Actual continuation supervisor compilation failed'}
[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))|Out-Null
$game=Join-Path $root 'game';$parser=Join-Path $root 'parser';$tools=Join-Path $root 'tools';foreach($d in @($game,$parser,$tools)){[IO.Directory]::CreateDirectory($d)|Out-Null}
$exe=Join-Path $game 'GTA5_Enhanced.exe';$core=Join-Path $parser 'CodeWalker.Core.dll';[IO.File]::WriteAllText($exe,'inert authored game identity');[IO.File]::WriteAllText($core,'inert authored parser identity')
$power=(Get-Process -Id $PID).Path;$configuration=Join-Path $root 'warmup.json';$script=Join-Path $tools 'Prepare-InstalledAudioWorld.ps1';$checks=0;$results=@()
function Hash([string]$file){[RichAudio.Preparation.WorldWarmupSupervisor]::Hash($file)}
function Check([bool]$ok,[string]$why){$script:checks++;if(!$ok){throw $why}}
$body=@'
param($GameRoot,$CodeWalkerRoot,$OutputRoot,$MaximumSeconds,$MaximumStageSeconds,$MaximumMemoryMiB,$MaximumGeometryResources,[switch]$ImportQualifiedGeometry)
$ErrorActionPreference='Stop'
$scenario=[IO.File]::ReadAllText((Join-Path $OutputRoot 'scenario.txt'))
$attempt=Join-Path $OutputRoot 'attempt.txt';$n=if(Test-Path -LiteralPath $attempt){[int][IO.File]::ReadAllText($attempt)+1}else{1};[IO.File]::WriteAllText($attempt,[string]$n)
[IO.File]::WriteAllText((Join-Path $OutputRoot ('startup-epoch-'+$n+'.txt')),[string]$env:RICHAUDIO_WORLD_START_UTC)
if($n-gt1-and(Test-Path -LiteralPath (Join-Path $OutputRoot 'child.pid'))){$oldId=[int][IO.File]::ReadAllText((Join-Path $OutputRoot 'child.pid'));if(Get-Process -Id $oldId -ErrorAction SilentlyContinue){throw 'Previous owned descendant remained active at continuation'}}
if($n-eq1-and$scenario-eq'joined-before-resume'){$command=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 60'));$child=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$command) -WindowStyle Hidden -PassThru;[IO.File]::WriteAllText((Join-Path $OutputRoot 'child.pid'),[string]$child.Id)}
foreach($folder in @('resolved','geometry')){[IO.Directory]::CreateDirectory((Join-Path $OutputRoot $folder))|Out-Null}
$catalog=Join-Path $OutputRoot 'resolved/resolved-catalog.json';$manifest=Join-Path $OutputRoot 'geometry/manifest.json'
[IO.File]::WriteAllText($catalog,'{"original":"catalogue-shaped fixture"}');[IO.File]::WriteAllText($manifest,'{"original":"manifest-shaped fixture"}')
$fingerprint='a'*64;[IO.File]::WriteAllText((Join-Path $OutputRoot 'input-binding.json'),(@{Fingerprint=$fingerprint}|ConvertTo-Json))
function Digest($file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
$p=@{Schema=1;Kind='RichAudioWorldContinuation01';SupervisorBatchId=$env:RICHAUDIO_WORLD_BATCH_ID;RunId=[Guid]::NewGuid().ToString('N');Reason='budget-deadline';Resumable=$true;WorkerClosureVerified=$true;UnknownClosure=$false;PendingResources=2;FailedResources=1;EligibleResources=3;InputFingerprint=$fingerprint;GameExecutableSHA256=(Digest (Join-Path $GameRoot 'GTA5_Enhanced.exe'));CodeWalkerCoreSHA256=(Digest (Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll'));CatalogSHA256=(Digest $catalog);ManifestSHA256=(Digest $manifest);GeneratedUtc=[DateTime]::UtcNow.ToString('o')}
switch($scenario){
 'joined-before-resume' {if($n-ge2){$p.Resumable=$false;$p.PendingResources=1}}
 'wrong-attempt' {$p.SupervisorBatchId='0'*32}
 'structural-failure' {$p.Reason='decoder-structural-failure'}
 'unknown-closure' {$p.UnknownClosure=$true;$p.WorkerClosureVerified=$false}
 'failed-only' {$p.PendingResources=1}
 'stale-checkpoint' {$p.GeneratedUtc=[DateTime]::UtcNow.AddHours(-1).ToString('o')}
 'changed-catalogue' {$p.CatalogSHA256='0'*64}
 'manual-cancel' {[IO.File]::WriteAllText((Join-Path $OutputRoot 'cancel.request'),'manual-stop')}
 'changed-source' {[IO.File]::AppendAllText($PSCommandPath,'# changed after binding')}
 'no-checkpoint' {exit 1}
}
if($scenario-eq'heartbeat'){Start-Sleep -Milliseconds 2300;$p.Resumable=$false}
[IO.File]::WriteAllText((Join-Path $OutputRoot 'continuation-checkpoint.json'),($p|ConvertTo-Json -Depth 5))
if($scenario-eq'joined-before-resume'-and$n-ge2){exit 0};exit 1
'@
function RunCase([string]$name,[int]$expected,[bool]$legacy=$false){
 $out=Join-Path $root ('.local/'+$name);[IO.Directory]::CreateDirectory($out)|Out-Null;[IO.File]::WriteAllText((Join-Path $out 'scenario.txt'),$name);[IO.File]::WriteAllText($script,$body)
 $c=@{Schema=1;Enabled=$true;WorkspaceRoot=$root;GameRoot=$game;GameExecutableSHA256=(Hash $exe);CodeWalkerRoot=$parser;CodeWalkerCoreSHA256=(Hash $core);PowerShellPath=$power;PowerShellSHA256=(Hash $power);OutputRoot=$out;Sources=@(@{RelativePath='tools/Prepare-InstalledAudioWorld.ps1';SHA256=(Hash $script)});MaximumSeconds=20;MaximumStageSeconds=5;MaximumMemoryMiB=256;MaximumGeometryResources=262144;ImportQualifiedGeometry=$true}
 if(!$legacy){$c.MaximumBatches=2;$c.MaximumTotalSeconds=40}
 if($name-eq'cancel-during-revalidation'){
  # A bounded authored zero-file makes the real source hash window observable;
  # no fixture hook, decoder, game file or simulated validator is substituted.
  $large=Join-Path $root 'original-validation-zeros.bin';$stream=[IO.File]::Create($large);try{$stream.SetLength(268435456)}finally{$stream.Dispose()}
  $c.Sources+=@{RelativePath='original-validation-zeros.bin';SHA256=(Hash $large)}
 }
 [IO.File]::WriteAllText($configuration,($c|ConvertTo-Json -Depth 5));$worker=[RichAudio.Preparation.WorldWarmupSupervisor]::new();$calledBefore=[DateTimeOffset]::UtcNow;$worker.Start($configuration,$exe);$returnedAt=[DateTimeOffset]::UtcNow;$watch=[Diagnostics.Stopwatch]::StartNew();$heartbeats=@();$last=$null
 try{
  if($name-eq'cancel-during-revalidation'){while($worker.State-ne'validating-continuation'){if($watch.Elapsed.TotalSeconds-gt15){throw ('Actual resumed validation window not observed: '+$worker.State)};Start-Sleep -Milliseconds 1};$worker.Stop()}
  while($true){$path=Join-Path $out 'supervisor-status.json';if(Test-Path -LiteralPath $path){try{$status=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;if($status.RecordedUtc-cne$last){$heartbeats+=$status;$last=$status.RecordedUtc};if(!$status.Running-and$status.Batch-gt0){break}}catch{}}
   if($watch.Elapsed.TotalSeconds-gt20){throw ('Continuation fixture exceeded bound: '+$name+' '+$worker.State)};Start-Sleep -Milliseconds 30}
  $attempts=[int][IO.File]::ReadAllText((Join-Path $out 'attempt.txt'));Check ($attempts-eq$expected) ('Unexpected continuation count: '+$name)
  $epochText=[IO.File]::ReadAllText((Join-Path $out 'startup-epoch-1.txt'));$epoch=[DateTimeOffset]::Parse($epochText,[Globalization.CultureInfo]::InvariantCulture);Check ($epoch-ge$calledBefore-and$epoch-le$returnedAt) ('Initial observation epoch is captured synchronously in Start: '+$name)
  if($attempts-gt1){Check ([IO.File]::ReadAllText((Join-Path $out 'startup-epoch-2.txt'))-ceq$epochText) ('Bounded continuation preserves the original initial-observation epoch: '+$name)}
  Check ($heartbeats[-1].WorkerJoined) ('Final job closure must be observed: '+$name)
  if($name-eq'joined-before-resume'){Check ($worker.State-eq'preparation-finished-read-summary') 'Resumed success is reported after exact previous job closure'}
  if($name-eq'cancel-during-revalidation'){Check ($worker.State-eq'cancelled'-and$heartbeats[-1].Batch-eq1) 'Stop during real resumed source validation cannot launch a second worker';Remove-Item -LiteralPath $large}
  if($name-eq'heartbeat'){$running=@($heartbeats|Where-Object Running);Check ($running.Count-ge2) 'Indexing heartbeat remains visible before any geometry summary';for($i=1;$i-lt$running.Count;$i++){Check (([DateTime]$running[$i].RecordedUtc-[DateTime]$running[$i-1].RecordedUtc).TotalMilliseconds-ge950) 'Background heartbeat is bounded to one publication per second'};Check ($running[0].Stage-eq'preparing/indexing') 'No invented geometry counts/stage before initial summary'}
  $script:results+=@{scenario=$name;attempts=$attempts;legacy=$legacy;state=$worker.State;joined=$heartbeats[-1].WorkerJoined;heartbeats=$heartbeats.Count}
 }finally{$worker.Stop()}
}
RunCase 'joined-before-resume' 2
RunCase 'batch-bound' 2
RunCase 'legacy-one-batch' 1 $true
foreach($name in @('wrong-attempt','structural-failure','unknown-closure','failed-only','stale-checkpoint','changed-catalogue','manual-cancel','changed-source','no-checkpoint','heartbeat')){RunCase $name 1}
RunCase 'cancel-during-revalidation' 1
$c=Get-Content -LiteralPath $configuration -Raw|ConvertFrom-Json;$c.MaximumBatches=5;[IO.File]::WriteAllText($configuration,($c|ConvertTo-Json -Depth 5));$rejected=$false;try{[RichAudio.Preparation.WorldWarmupSupervisor]::ReadConfiguration($configuration,$exe)|Out-Null}catch{$rejected=$true};Check $rejected 'More than four new batches is rejected'
$receipt=[ordered]@{schema=1;checks=$checks;cases=$results;originalIdentitiesOnly=$true;vendorAssemblyLoaded=$false;gameLaunched=$false;endpointOpened=$false;automaticRetriesOfUnknownClosureOrStructuralFailure=$false}
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding utf8
Write-Output ('PASS '+$checks+' actual owned-job continuation/heartbeat checks; '+(Join-Path $root 'validation.json'))
