#requires -Version 7.0
# Original-only inherited controls plus held owned-process deadline comparisons.
[CmdletBinding()]
param([string]$OutputRoot,[switch]$SkipProcessingProfile,[ValidateRange(1,3)][int]$ProfileRepetitions=2)
$ErrorActionPreference='Stop'
if(!$IsWindows){throw 'WORLD12 owned process-affinity controls require Windows'}
$repo12=Split-Path $PSScriptRoot -Parent
$run12=[guid]::NewGuid().ToString('N')
if(!$OutputRoot){$OutputRoot=Join-Path $repo12 ('.local/world12-offline-'+$run12)}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo12 $OutputRoot}
$out12=[IO.Path]::GetFullPath($OutputRoot);$local12=[IO.Path]::GetFullPath((Join-Path $repo12 '.local'))
if(!$out12.StartsWith($local12+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out12)){throw 'Fresh current-checkout local output required'}
for($at12=$out12;$at12;$at12=[IO.Path]::GetDirectoryName($at12)){if((Test-Path -LiteralPath $at12)-and((Get-Item -LiteralPath $at12 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked offline result path refused'}}
[IO.Directory]::CreateDirectory($out12)|Out-Null
$artifact12=Join-Path $out12 'artifact';[IO.Directory]::CreateDirectory($artifact12)|Out-Null
function Hash12([string]$file12){(Get-FileHash -LiteralPath $file12 -Algorithm SHA256).Hash.ToLowerInvariant()}
function Clean12([string]$text12){
 foreach($pair12 in @(@{prefix=$repo12;replacement='<repo>'},@{prefix=$env:USERPROFILE;replacement='<user>'})){
  if(!$pair12.prefix){continue};$parts12=[regex]::Split($pair12.prefix,'[\\/]+')|ForEach-Object{[regex]::Escape($_)}
  $text12=[regex]::Replace($text12,($parts12-join'[\\/]+')+'(?=$|[\\/\s"''<>])',$pair12.replacement,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
 };return $text12
}
function Stage12([string]$name12,[scriptblock]$work12){
 $log12=Join-Path $out12 ($name12+'.log');Write-Output ('WORLD12 '+$name12)
 try{& $work12 *> $log12;if(!$?){throw ('Stage failed: '+$name12)}}
 finally{if(Test-Path -LiteralPath $log12){$clean12=Clean12 (Get-Content -LiteralPath $log12 -Raw);[IO.File]::WriteAllText((Join-Path $artifact12 ($name12+'.tap')),$clean12,[Text.UTF8Encoding]::new($false));Write-Output $clean12}}
}
$saved12=@{}
$inputNames12=@('PLAYABLE01_CANDIDATE','RICHAUDIO_INSTALLED_CATALOG','RICHAUDIO_STOCK_SOURCE05_REPORT','RICHAUDIO_NPC_MANIFEST','RICHAUDIO_CODEWALKER_ROOT','RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES','RICHAUDIO_XML05_SUPERVISOR','RICHAUDIO_XML05_RUNTIME','RICHAUDIO_NG041_SUPERVISOR','RICHAUDIO_NG041_RUNTIME','NODE_OPTIONS','NODE_PATH','DOTNET_STARTUP_HOOKS','COR_ENABLE_PROFILING','COR_PROFILER','CORECLR_ENABLE_PROFILING','CORECLR_PROFILER')
foreach($name12 in $inputNames12){$saved12[$name12]=@{exists=Test-Path -LiteralPath ('Env:'+$name12);value=[Environment]::GetEnvironmentVariable($name12,'Process')};[Environment]::SetEnvironmentVariable($name12,$null,'Process')}
$result12=[ordered]@{schema=1;kind='RichAudioOffline12Validation';createdUtc=[DateTime]::UtcNow.ToString('o');passed=$false;stage='starting';runnerSha256=Hash12 $PSCommandPath;optionalInputsIsolated=@($inputNames12|Where-Object{$saved12[$_].exists});inherited=$null;portable12Counts=$null;performance=@{ran=$false;processingDeadlinePassed=$null};gameFilesRead=$false;privateInputsRead=$false;endpointOpened=$false;deviceUnderflowMeasured=$false;gameLaunched=$false;deployed=$false;merged=$false}
$failure12=$null
Push-Location $repo12
try{
 $node12=(Get-Command node -CommandType Application|Select-Object -First 1).Source
 $result12.runtime=@{node=(& $node12 --version);executableSha256=Hash12 $node12}
 $result12.stage='inherited-original-controls'
 $inherited12=Join-Path $out12 'inherited-world11'
 Stage12 'inherited-original-controls' {
  try{& (Join-Path $PSScriptRoot 'Test-Offline11.ps1') -OutputRoot $inherited12 -SkipProcessingProfile}
  finally{if(Test-Path -LiteralPath (Join-Path $inherited12 'artifact')){foreach($file12 in Get-ChildItem -LiteralPath (Join-Path $inherited12 'artifact') -File){Copy-Item -LiteralPath $file12.FullName -Destination (Join-Path $artifact12 ('inherited11-'+$file12.Name))}}}
 }
 $prior12=Get-Content -LiteralPath (Join-Path $inherited12 'result.json') -Raw|ConvertFrom-Json
 if(!$prior12.passed-or$prior12.performance.ran-or$prior12.gameFilesRead-or$prior12.privateInputsRead-or$prior12.endpointOpened){throw 'Inherited original-only controls did not qualify'}
 $result12.inherited=@{passed=$true;world11Controls=$prior12.portable11Counts;originalControls=$prior12.inherited;resultSha256=Hash12 (Join-Path $inherited12 'result.json')}
 $result12.stage='expiry12-diagnostic-controls'
 Stage12 'expiry12-diagnostic-controls' {& (Join-Path $repo12 'tests/Test-UnsentExpiry12.ps1')}
 $result12.stage='processing12-controls'
 $cases12=@(Get-ChildItem -LiteralPath (Join-Path $repo12 'tests') -File -Filter 'Test-*12.mjs'|Sort-Object Name|ForEach-Object FullName)
 if($cases12.Count-lt3){throw 'Expected WORLD12 processing, synthesis and renderer controls missing'}
 $result12.testFiles=@($cases12|ForEach-Object{[IO.Path]::GetFileName($_)})
 Stage12 'processing12-controls' {& $node12 --test --test-reporter=tap --test-concurrency=1 @cases12;if($LASTEXITCODE-ne0){throw 'WORLD12 original process, closure, synthesis, renderer or lifecycle controls failed'}}
 $tap12=Get-Content -LiteralPath (Join-Path $out12 'processing12-controls.log') -Raw;$counts12=[ordered]@{}
 foreach($label12 in @('tests','pass','fail','cancelled','skipped')){$match12=[regex]::Match($tap12,('(?m)^# '+$label12+' ([0-9]+)\s*$'));if(!$match12.Success){throw ('Missing WORLD12 TAP count: '+$label12)};$counts12[$label12]=[int]$match12.Groups[1].Value}
 if($counts12.tests-lt5-or$counts12.fail-ne0-or$counts12.cancelled-ne0-or$counts12.skipped-ne0-or$counts12.pass-ne$counts12.tests){throw 'Complete WORLD12 functional test totals required'}
 $result12.portable12Counts=$counts12
 if(!$SkipProcessingProfile){
  $result12.stage='frozen-processing12-comparisons'
  $parent12='world12-baseline-ci-'+$run12;$current12='world12-current-ci-'+$run12
  Stage12 'processing12-source-freeze' {
   & $node12 (Join-Path $PSScriptRoot 'Freeze-Processing12.mjs') $parent12 parent;if($LASTEXITCODE-ne0){throw 'Owned parent Git source freeze failed'}
   & $node12 (Join-Path $PSScriptRoot 'Freeze-Processing12.mjs') $current12 candidate;if($LASTEXITCODE-ne0){throw 'Owned candidate source freeze failed'}
  }
  $main12='world12-ci-main-'+$run12+'.json';$warm12='world12-ci-warm-control-'+$run12+'.json'
  $matrix12=@{snapshots=@($parent12,$current12);selectedPreparations=@('authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0,2);repetitions=$ProfileRepetitions;topologies=@('plain','texture');scenes=@('direct','walls')}|ConvertTo-Json -Compress
  Stage12 'processing12-main-matrix' {& $node12 (Join-Path $PSScriptRoot 'Profile-Processing12.mjs') --run --out (Join-Path $local12 $main12) $matrix12;if($LASTEXITCODE-ne0){throw 'WORLD12 matched processing matrix failed; raw attempt retained'}}
  $control12=@{snapshots=@($current12);selectedPreparations=@('data-prepared','authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0);repetitions=1;topologies=@('plain','texture');scenes=@('walls')}|ConvertTo-Json -Compress
  Stage12 'processing12-authored-warm-control' {& $node12 (Join-Path $PSScriptRoot 'Profile-Processing12.mjs') --run --out (Join-Path $local12 $warm12) $control12;if($LASTEXITCODE-ne0){throw 'WORLD12 same-implementation warm control failed; raw attempt retained'}}
  Stage12 'processing12-summary' {& $node12 (Join-Path $PSScriptRoot 'Summarize-Processing12.mjs') --out (Join-Path $artifact12 'performance.json') $main12 $warm12;if($LASTEXITCODE-ne0){throw 'WORLD12 retained comparison summary failed'}}
  $performance12=Get-Content -LiteralPath (Join-Path $artifact12 'performance.json') -Raw|ConvertFrom-Json
  if(!$performance12.functionalPassed-or!$performance12.pcmPassed){throw 'WORLD12 exact authored PCM, lifecycle or process controls failed'}
  $candidate12=@($performance12.experiments[0].groups|Where-Object{$_.implementation-eq'candidate'})
  $candidateMisses12=[int](($candidate12|ForEach-Object{$_.all.overBudget}|Measure-Object -Sum).Sum)
  $candidateBlocks12=[int](($candidate12|ForEach-Object{$_.blocks}|Measure-Object -Sum).Sum)
  $result12.performance=@{ran=$true;functionalPassed=$true;pcmPassed=$true;processingDeadlinePassed=$candidateMisses12-eq0;parentAndCandidateDeadlinePassed=[bool]$performance12.processingDeadlinePassed;candidateBlocks=$candidateBlocks12;candidateMisses=$candidateMisses12;blockBudgetMs=512000.0/48000;repetitions=$ProfileRepetitions;mainTrials=$performance12.experiments[0].trials;warmControlTrials=$performance12.experiments[1].trials;summarySha256=Hash12 (Join-Path $artifact12 'performance.json');functionalAndTimingGatesSeparate=$true;allMissesRetained=$true;runtimePopulationsSeparate=$true}
  if($candidateMisses12-ne0){Write-Warning 'WORLD12 deadline misses remain findings. Functional success does not pass the processing deadline or qualify a device endpoint.'}
 }
 & git diff --check;if($LASTEXITCODE-ne0){throw 'Whitespace validation failed'}
 $result12.stage='complete';$result12.passed=$true
}catch{$failure12=$_;$result12.failure=Clean12 $_.Exception.Message;$result12.stage='failed:'+ $result12.stage}
finally{
 $result12.finishedUtc=[DateTime]::UtcNow.ToString('o');$bytes12=($result12|ConvertTo-Json -Depth 16)+"`n"
 [IO.File]::WriteAllText((Join-Path $out12 'result.json'),$bytes12,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact12 'result.json'),$bytes12,[Text.UTF8Encoding]::new($false))
 foreach($name12 in $saved12.Keys){if($saved12[$name12].exists){[Environment]::SetEnvironmentVariable($name12,$saved12[$name12].value,'Process')}else{[Environment]::SetEnvironmentVariable($name12,$null,'Process')}};Pop-Location
}
if($failure12){throw $failure12}
Write-Output ('PASS WORLD12 original functional controls; separate timing gate retained in '+(Join-Path $out12 'result.json'))
