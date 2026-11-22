#requires -Version 7.0
# Original-only inherited controls plus held owned-process deadline comparisons.
[CmdletBinding()]
param([string]$OutputRoot,[switch]$SkipProcessingProfile,[ValidateRange(1,3)][int]$ProfileRepetitions=2)
$ErrorActionPreference='Stop'
if(!$IsWindows){throw 'WORLD11 owned process-affinity controls require Windows'}
$repo11=Split-Path $PSScriptRoot -Parent
$run11=[guid]::NewGuid().ToString('N')
if(!$OutputRoot){$OutputRoot=Join-Path $repo11 ('.local/world11-offline-'+$run11)}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo11 $OutputRoot}
$out11=[IO.Path]::GetFullPath($OutputRoot);$local11=[IO.Path]::GetFullPath((Join-Path $repo11 '.local'))
if(!$out11.StartsWith($local11+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out11)){throw 'Fresh current-checkout local output required'}
for($at11=$out11;$at11;$at11=[IO.Path]::GetDirectoryName($at11)){if((Test-Path -LiteralPath $at11)-and((Get-Item -LiteralPath $at11 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked offline result path refused'}}
[IO.Directory]::CreateDirectory($out11)|Out-Null
$artifact11=Join-Path $out11 'artifact';[IO.Directory]::CreateDirectory($artifact11)|Out-Null
function Hash11([string]$file11){(Get-FileHash -LiteralPath $file11 -Algorithm SHA256).Hash.ToLowerInvariant()}
function Clean11([string]$text11){
 foreach($pair11 in @(@{prefix=$repo11;replacement='<repo>'},@{prefix=$env:USERPROFILE;replacement='<user>'})){
  if(!$pair11.prefix){continue};$parts11=[regex]::Split($pair11.prefix,'[\\/]+')|ForEach-Object{[regex]::Escape($_)}
  $text11=[regex]::Replace($text11,($parts11-join'[\\/]+')+'(?=$|[\\/\s"''<>])',$pair11.replacement,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
 };return $text11
}
function Stage11([string]$name11,[scriptblock]$work11){
 $log11=Join-Path $out11 ($name11+'.log');Write-Output ('WORLD11 '+$name11)
 try{& $work11 *> $log11;if(!$?){throw ('Stage failed: '+$name11)}}
 finally{if(Test-Path -LiteralPath $log11){$clean11=Clean11 (Get-Content -LiteralPath $log11 -Raw);[IO.File]::WriteAllText((Join-Path $artifact11 ($name11+'.tap')),$clean11,[Text.UTF8Encoding]::new($false));Write-Output $clean11}}
}
$saved11=@{}
$inputNames11=@('PLAYABLE01_CANDIDATE','RICHAUDIO_INSTALLED_CATALOG','RICHAUDIO_STOCK_SOURCE05_REPORT','RICHAUDIO_NPC_MANIFEST','RICHAUDIO_CODEWALKER_ROOT','RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES','RICHAUDIO_XML05_SUPERVISOR','RICHAUDIO_XML05_RUNTIME','RICHAUDIO_NG041_SUPERVISOR','RICHAUDIO_NG041_RUNTIME','NODE_OPTIONS','NODE_PATH','DOTNET_STARTUP_HOOKS','COR_ENABLE_PROFILING','COR_PROFILER','CORECLR_ENABLE_PROFILING','CORECLR_PROFILER')
foreach($name11 in $inputNames11){$saved11[$name11]=@{exists=Test-Path -LiteralPath ('Env:'+$name11);value=[Environment]::GetEnvironmentVariable($name11,'Process')};[Environment]::SetEnvironmentVariable($name11,$null,'Process')}
$result11=[ordered]@{schema=1;kind='RichAudioOffline11Validation';createdUtc=[DateTime]::UtcNow.ToString('o');passed=$false;stage='starting';runnerSha256=Hash11 $PSCommandPath;optionalInputsIsolated=@($inputNames11|Where-Object{$saved11[$_].exists});inherited=$null;portable11Counts=$null;performance=@{ran=$false;processingDeadlinePassed=$null};gameFilesRead=$false;privateInputsRead=$false;endpointOpened=$false;deviceUnderflowMeasured=$false;gameLaunched=$false;deployed=$false;merged=$false}
$failure11=$null
Push-Location $repo11
try{
 $node11=(Get-Command node -CommandType Application|Select-Object -First 1).Source
 $result11.runtime=@{node=(& $node11 --version);executableSha256=Hash11 $node11}
 $result11.stage='inherited-original-controls'
 $inherited11=Join-Path $out11 'inherited-world10'
 Stage11 'inherited-original-controls' {& (Join-Path $PSScriptRoot 'Test-Offline10.ps1') -OutputRoot $inherited11 -SkipProcessingProfile}
 $prior11=Get-Content -LiteralPath (Join-Path $inherited11 'result.json') -Raw|ConvertFrom-Json
 if(!$prior11.passed-or!$prior11.inheritedOriginalSuitePassed-or$prior11.performance.ran-or$prior11.coreBuilt-or$prior11.gameFilesRead-or$prior11.privateInputsRead-or$prior11.endpointOpened){throw 'Inherited original-only controls did not qualify'}
 $result11.inherited=@{passed=$true;inheritedNodeCounts=$prior11.inheritedNodeCounts;portableCounts=$prior11.portableCounts;originalMetadataControls=$prior11.originalMetadataControls;exclusions=$prior11.exclusions;resultSha256=Hash11 (Join-Path $inherited11 'result.json')}
 foreach($file11 in Get-ChildItem -LiteralPath (Join-Path $inherited11 'artifact') -File){Copy-Item -LiteralPath $file11.FullName -Destination (Join-Path $artifact11 ('inherited10-'+$file11.Name))}
 $result11.stage='processing11-controls'
 $cases11=@(Get-ChildItem -LiteralPath (Join-Path $repo11 'tests') -File -Filter 'Test-*11.mjs'|Sort-Object Name|ForEach-Object FullName)
 if($cases11.Count-lt3){throw 'Expected WORLD11 processing, synthesis and renderer controls missing'}
 $result11.testFiles=@($cases11|ForEach-Object{[IO.Path]::GetFileName($_)})
 Stage11 'processing11-controls' {& $node11 --test --test-reporter=tap --test-concurrency=1 @cases11;if($LASTEXITCODE-ne0){throw 'WORLD11 original process, closure, synthesis, renderer or lifecycle controls failed'}}
 $tap11=Get-Content -LiteralPath (Join-Path $out11 'processing11-controls.log') -Raw;$counts11=[ordered]@{}
 foreach($label11 in @('tests','pass','fail','cancelled','skipped')){$match11=[regex]::Match($tap11,('(?m)^# '+$label11+' ([0-9]+)\s*$'));if(!$match11.Success){throw ('Missing WORLD11 TAP count: '+$label11)};$counts11[$label11]=[int]$match11.Groups[1].Value}
 if($counts11.tests-lt5-or$counts11.fail-ne0-or$counts11.cancelled-ne0-or$counts11.skipped-ne0-or$counts11.pass-ne$counts11.tests){throw 'Complete WORLD11 functional test totals required'}
 $result11.portable11Counts=$counts11
 if(!$SkipProcessingProfile){
  $result11.stage='frozen-processing11-comparisons'
  $parent11='world11-baseline-ci-'+$run11;$current11='world11-current-ci-'+$run11
  Stage11 'processing11-source-freeze' {
   & $node11 (Join-Path $PSScriptRoot 'Freeze-Processing11.mjs') $parent11 parent;if($LASTEXITCODE-ne0){throw 'Owned parent Git source freeze failed'}
   & $node11 (Join-Path $PSScriptRoot 'Freeze-Processing11.mjs') $current11 candidate;if($LASTEXITCODE-ne0){throw 'Owned candidate source freeze failed'}
  }
  $main11='world11-ci-main-'+$run11+'.json';$warm11='world11-ci-warm-control-'+$run11+'.json'
  $matrix11=@{snapshots=@($parent11,$current11);selectedPreparations=@('authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0,2);repetitions=$ProfileRepetitions;topologies=@('plain','texture');scenes=@('direct','walls')}|ConvertTo-Json -Compress
  Stage11 'processing11-main-matrix' {& $node11 (Join-Path $PSScriptRoot 'Profile-Processing11.mjs') --run --out (Join-Path $local11 $main11) $matrix11;if($LASTEXITCODE-ne0){throw 'WORLD11 matched processing matrix failed; raw attempt retained'}}
  $control11=@{snapshots=@($current11);selectedPreparations=@('data-prepared','authored-jit');instrumentation=@($false,$true);affinities=@('normal','restricted4');contentionCounts=@(0);repetitions=1;topologies=@('plain','texture');scenes=@('walls')}|ConvertTo-Json -Compress
  Stage11 'processing11-authored-warm-control' {& $node11 (Join-Path $PSScriptRoot 'Profile-Processing11.mjs') --run --out (Join-Path $local11 $warm11) $control11;if($LASTEXITCODE-ne0){throw 'WORLD11 same-implementation warm control failed; raw attempt retained'}}
  Stage11 'processing11-summary' {& $node11 (Join-Path $PSScriptRoot 'Summarize-Processing11.mjs') --out (Join-Path $artifact11 'performance.json') $main11 $warm11;if($LASTEXITCODE-ne0){throw 'WORLD11 retained comparison summary failed'}}
  $performance11=Get-Content -LiteralPath (Join-Path $artifact11 'performance.json') -Raw|ConvertFrom-Json
  if(!$performance11.functionalPassed-or!$performance11.pcmPassed){throw 'WORLD11 exact authored PCM, lifecycle or process controls failed'}
  $candidate11=@($performance11.experiments[0].groups|Where-Object{$_.implementation-eq'candidate'})
  $candidateMisses11=[int](($candidate11|ForEach-Object{$_.all.overBudget}|Measure-Object -Sum).Sum)
  $candidateBlocks11=[int](($candidate11|ForEach-Object{$_.blocks}|Measure-Object -Sum).Sum)
  $result11.performance=@{ran=$true;functionalPassed=$true;pcmPassed=$true;processingDeadlinePassed=$candidateMisses11-eq0;parentAndCandidateDeadlinePassed=[bool]$performance11.processingDeadlinePassed;candidateBlocks=$candidateBlocks11;candidateMisses=$candidateMisses11;blockBudgetMs=512000.0/48000;repetitions=$ProfileRepetitions;mainTrials=$performance11.experiments[0].trials;warmControlTrials=$performance11.experiments[1].trials;summarySha256=Hash11 (Join-Path $artifact11 'performance.json');functionalAndTimingGatesSeparate=$true;allMissesRetained=$true;runtimePopulationsSeparate=$true}
  if($candidateMisses11-ne0){Write-Warning 'WORLD11 deadline misses remain findings. Functional success does not pass the processing deadline or qualify a device endpoint.'}
 }
 & git diff --check;if($LASTEXITCODE-ne0){throw 'Whitespace validation failed'}
 $result11.stage='complete';$result11.passed=$true
}catch{$failure11=$_;$result11.failure=Clean11 $_.Exception.Message;$result11.stage='failed:'+ $result11.stage}
finally{
 $result11.finishedUtc=[DateTime]::UtcNow.ToString('o');$bytes11=($result11|ConvertTo-Json -Depth 16)+"`n"
 [IO.File]::WriteAllText((Join-Path $out11 'result.json'),$bytes11,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact11 'result.json'),$bytes11,[Text.UTF8Encoding]::new($false))
 foreach($name11 in $saved11.Keys){if($saved11[$name11].exists){[Environment]::SetEnvironmentVariable($name11,$saved11[$name11].value,'Process')}else{[Environment]::SetEnvironmentVariable($name11,$null,'Process')}};Pop-Location
}
if($failure11){throw $failure11}
Write-Output ('PASS WORLD11 original functional controls; separate timing gate retained in '+(Join-Path $out11 'result.json'))
