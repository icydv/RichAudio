#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('Functional','Processing')][string]$Mode,[string]$OutputRoot,[ValidateRange(1,3)][int]$ProfileRepetitions=2)
$ErrorActionPreference='Stop'
if(!$IsWindows){throw 'WORLD13 Windows offline controls required'}
$repo13=Split-Path $PSScriptRoot -Parent;$run13=[guid]::NewGuid().ToString('N')
if(!$OutputRoot){$OutputRoot=Join-Path $repo13 ('.local/world13-'+$Mode.ToLowerInvariant()+'-'+$run13)}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo13 $OutputRoot}
$out13=[IO.Path]::GetFullPath($OutputRoot);$local13=[IO.Path]::GetFullPath((Join-Path $repo13 '.local'))
if(!$out13.StartsWith($local13+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out13)){throw 'Fresh owned local output required'}
for($at13=[IO.Path]::GetDirectoryName($out13);$at13;$at13=[IO.Path]::GetDirectoryName($at13)){if((Test-Path -LiteralPath $at13)-and((Get-Item -LiteralPath $at13 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked result parent refused'}}
[IO.Directory]::CreateDirectory($out13)|Out-Null;$artifact13=Join-Path $out13 'artifact';[IO.Directory]::CreateDirectory($artifact13)|Out-Null
function Hash13([string]$file13){(Get-FileHash -LiteralPath $file13 -Algorithm SHA256).Hash.ToLowerInvariant()}
function Clean13([string]$text13){foreach($prefix13 in @($repo13,$env:USERPROFILE)){if($prefix13){$parts13=[regex]::Split($prefix13,'[\\/]+')|ForEach-Object{[regex]::Escape($_)};$text13=[regex]::Replace($text13,($parts13-join'[\\/]+')+'(?=$|[\\/\s"''<>])','<owned>',[Text.RegularExpressions.RegexOptions]::IgnoreCase)}};return $text13}
$stages13=[Collections.Generic.List[object]]::new()
function Stage13([string]$name13,[scriptblock]$work13){
 $log13=Join-Path $out13 ($name13+'.log');$entry13=[ordered]@{name=$name13;startedUtc=[DateTime]::UtcNow.ToString('o');passed=$false;failure=$null}
 Write-Host ('WORLD13 '+$Mode+' '+$name13)
 try{& $work13 *> $log13;if(!$?){throw ('Stage failed: '+$name13)};$entry13.passed=$true}
 catch{$entry13.failure=Clean13 $_.Exception.Message}
 finally{$entry13.finishedUtc=[DateTime]::UtcNow.ToString('o');if(Test-Path -LiteralPath $log13){$entry13.originalLogSha256=Hash13 $log13;$clean13=Clean13 (Get-Content -LiteralPath $log13 -Raw);[IO.File]::WriteAllText((Join-Path $artifact13 ($name13+'.tap')),$clean13,[Text.UTF8Encoding]::new($false));Write-Host $clean13};$stages13.Add([pscustomobject]$entry13)}
 return [bool]$entry13.passed
}
$saved13=@{};$names13=@('PLAYABLE01_CANDIDATE','RICHAUDIO_INSTALLED_CATALOG','RICHAUDIO_STOCK_SOURCE05_REPORT','RICHAUDIO_NPC_MANIFEST','RICHAUDIO_CODEWALKER_ROOT','RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES','RICHAUDIO_XML05_SUPERVISOR','RICHAUDIO_XML05_RUNTIME','RICHAUDIO_NG041_SUPERVISOR','RICHAUDIO_NG041_RUNTIME','NODE_OPTIONS','NODE_PATH','DOTNET_STARTUP_HOOKS','COR_ENABLE_PROFILING','COR_PROFILER','CORECLR_ENABLE_PROFILING','CORECLR_PROFILER')
foreach($name13 in $names13){$saved13[$name13]=@{exists=Test-Path -LiteralPath ('Env:'+$name13);value=[Environment]::GetEnvironmentVariable($name13,'Process')};[Environment]::SetEnvironmentVariable($name13,$null,'Process')}
$result13=[ordered]@{kind='RichAudioOffline13Validation';schema=1;mode=$Mode;createdUtc=[DateTime]::UtcNow.ToString('o');runnerSha256=Hash13 $PSCommandPath;passed=$false;stages=$null;processing=@{ran=$false;hardDeadlinePassed=$null;headroomPassed=$null};gameFilesRead=$false;privateInputsRead=$false;endpointOpened=$false;deviceUnderflowsMeasured=$false;gameLaunched=$false;deployed=$false;merged=$false}
$controllerMembers13=@('tools/Test-Offline13.ps1','tools/Processing-Verdict13.mjs','tools/ci-gates13.mjs','tools/Publish-Processing13.mjs','.github/workflows/offline.yml')
$result13.controllerBindings=@($controllerMembers13|ForEach-Object{@{path=$_;sha256=Hash13 (Join-Path $repo13 $_)}})
function PublicationNames13 {@(Get-ChildItem -LiteralPath $local13 -File|Where-Object{$_.Name-match'^(?:world13-ci-(?:main|warm)-[\w-]+|world1[0-3]-(?:retention|lifecycle)-control-[\w-]+)\.json$'}|ForEach-Object Name)}
$previousPublic13=@(PublicationNames13)
Push-Location $repo13
try{
 $node13=(Get-Command node -CommandType Application|Select-Object -First 1).Source;$result13.runtime=@{node=(& $node13 --version);executableSha256=Hash13 $node13}
 if($Mode-eq'Functional'){
  $legacy13=Join-Path $out13 'inherited-world12'
  $legacyPass13=Stage13 'inherited-controls' {try{& (Join-Path $PSScriptRoot 'Test-Offline12.ps1') -OutputRoot $legacy13 -SkipProcessingProfile}finally{if(Test-Path -LiteralPath (Join-Path $legacy13 'artifact')){foreach($file13 in Get-ChildItem -LiteralPath (Join-Path $legacy13 'artifact') -File){Copy-Item -LiteralPath $file13.FullName -Destination (Join-Path $artifact13 ('inherited12-'+$file13.Name))}}}}
  $cleanupPass13=Stage13 'independent-cleanup-controls' {$helper13=Join-Path $out13 'cleanup-helper';& (Join-Path $PSScriptRoot 'Build-RuntimeCleanup13.ps1') -OutputRoot $helper13;& (Join-Path $PSScriptRoot 'Test-RuntimeCleanup13.ps1') -HelperRoot $helper13 -OutputLog (Join-Path $out13 'cleanup-controls-original.log')}
  $result13.passed=([bool]$legacyPass13-and[bool]$cleanupPass13)
 }else{
  $result13.processing=[ordered]@{ran=$false;mainCompleted=$false;preparationCompleted=$false;summaryCompleted=$false;hardDeadlinePassed=$null;headroomPassed=$null;requestedMainTrials=64*$ProfileRepetitions;requestedPreparationTrials=16}
  $focusedPass13=Stage13 'processing-preconditions' {$cases13=@(Get-ChildItem -LiteralPath (Join-Path $repo13 'tests') -Filter 'Test-*13.mjs' -File|Where-Object{$_.Name-ne'Test-RuntimeCleanup13.mjs'}|Sort-Object Name|ForEach-Object FullName);if($cases13.Count-lt4){throw 'Processing/Git/summary/CI controls missing'};& $node13 --test --test-reporter=tap --test-concurrency=1 @cases13;if($LASTEXITCODE-ne0){throw 'Focused exact-state/measurement preconditions failed'}}
  if($focusedPass13){
   $parent13='world13-baseline-ci-'+$run13;$current13='world13-current-ci-'+$run13
   $freezePass13=Stage13 'source-freeze' {& $node13 (Join-Path $PSScriptRoot 'Freeze-Processing13.mjs') $parent13 parent;if($LASTEXITCODE-ne0){throw 'Parent freeze failed'};& $node13 (Join-Path $PSScriptRoot 'Freeze-Processing13.mjs') $current13 candidate;if($LASTEXITCODE-ne0){throw 'Candidate freeze failed'}}
   if($freezePass13){
    $main13='world13-ci-main-'+$run13+'.json';$warm13='world13-ci-warm-'+$run13+'.json'
    $matrix13=@{snapshots=@($parent13,$current13);selectedPreparations=@('authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0,2);repetitions=$ProfileRepetitions;topologies=@('plain','texture');scenes=@('direct','walls')}|ConvertTo-Json -Compress
    $result13.processing.ran=$true;$result13.processing.mainReport=$main13;$result13.processing.preparationReport=$warm13
    $mainPass13=Stage13 'main-matrix' {& $node13 (Join-Path $PSScriptRoot 'Profile-Processing13.mjs') --run --out (Join-Path $local13 $main13) $matrix13;if($LASTEXITCODE-ne0){throw 'Terminal main-matrix failure; no retry'}}
    $result13.processing.mainCompleted=$mainPass13
    if($mainPass13){
     $control13=@{snapshots=@($current13);selectedPreparations=@('data-prepared','authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0);repetitions=1;topologies=@('plain','texture');scenes=@('walls')}|ConvertTo-Json -Compress
     $warmPass13=Stage13 'preparation-control' {& $node13 (Join-Path $PSScriptRoot 'Profile-Processing13.mjs') --run --out (Join-Path $local13 $warm13) $control13;if($LASTEXITCODE-ne0){throw 'Terminal preparation-control failure; no retry'}}
     $result13.processing.preparationCompleted=$warmPass13
     if($warmPass13){
      $summaryPass13=Stage13 'processing-summary' {& $node13 (Join-Path $PSScriptRoot 'Summarize-Processing13.mjs') --out (Join-Path $out13 'performance.json') $main13 $warm13;if($LASTEXITCODE-ne0){throw 'Retained report summary failed'}}
      $result13.processing.summaryCompleted=$summaryPass13
      if($summaryPass13){$verdictPass13=Stage13 'required-processing-verdict' {& $node13 (Join-Path $PSScriptRoot 'Processing-Verdict13.mjs') (Join-Path $out13 'performance.json') (Join-Path $out13 'processing-verdict.json');if($LASTEXITCODE-ne0){throw 'Required functional/deadline/headroom gate failed; all measurements retained'}};if(Test-Path -LiteralPath (Join-Path $out13 'processing-verdict.json')){$verdict13=Get-Content -LiteralPath (Join-Path $out13 'processing-verdict.json') -Raw|ConvertFrom-Json;foreach($property13 in $verdict13.psobject.Properties){$result13.processing[$property13.Name]=$property13.Value}};$result13.passed=[bool]$verdictPass13}
     }
    }
   }
  }
 }
 & git diff --check;if($LASTEXITCODE-ne0){$result13.passed=$false;throw 'Whitespace validation failed'}
}catch{$result13.failure=Clean13 $_.Exception.Message;$result13.passed=$false}
finally{
 try{
  foreach($name13 in @('performance.json','processing-verdict.json')){$file13=Join-Path $out13 $name13;if(Test-Path -LiteralPath $file13){[IO.File]::WriteAllText((Join-Path $artifact13 $name13),(Clean13 (Get-Content -LiteralPath $file13 -Raw)),[Text.UTF8Encoding]::new($false))}}
  $newPublic13=@(PublicationNames13|Where-Object{$_-notin$previousPublic13});$result13.publication=@{selectedNames=$newPublic13;passed=$false}
  & $node13 --max-old-space-size=1536 (Join-Path $PSScriptRoot 'Publish-Processing13.mjs') $artifact13 (ConvertTo-Json -Compress -InputObject @($newPublic13)) *> (Join-Path $out13 'publication.log')
  if($LASTEXITCODE-ne0){throw 'Bounded sanitized report publication failed; original reports retained privately'};$result13.publication.passed=$true
 }catch{$result13.passed=$false;$result13.publicationFailure=Clean13 $_.Exception.Message}
 $result13.controllerBindingsStable=$true;try{foreach($binding13 in $result13.controllerBindings){if((Hash13 (Join-Path $repo13 $binding13.path))-ne$binding13.sha256){$result13.controllerBindingsStable=$false;$result13.passed=$false}}}catch{$result13.controllerBindingsStable=$false;$result13.passed=$false;$result13.controllerBindingFailure=Clean13 $_.Exception.Message}
 $result13.stages=$stages13.ToArray();$result13.finishedUtc=[DateTime]::UtcNow.ToString('o');$json13=($result13|ConvertTo-Json -Depth 18)+"`n";[IO.File]::WriteAllText((Join-Path $out13 'result.json'),$json13,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact13 'result.json'),$json13,[Text.UTF8Encoding]::new($false))
 foreach($name13 in $saved13.Keys){if($saved13[$name13].exists){[Environment]::SetEnvironmentVariable($name13,$saved13[$name13].value,'Process')}else{[Environment]::SetEnvironmentVariable($name13,$null,'Process')}};Pop-Location
}
if(!$result13.passed){throw ('WORLD13 required '+$Mode+' validation failed; exact results retained')}
Write-Output ('PASS WORLD13 '+$Mode+' required validation')
