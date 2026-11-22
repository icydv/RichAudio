#requires -Version 7.0
# Original-only regression. The default never prepares upstream CodeWalker
# source, builds Core, copies a research DLL or packages the research application.
[CmdletBinding()]
param([string]$OutputRoot,[string]$RetainedResearchCoreRoot,[switch]$SkipProcessingProfile)
$ErrorActionPreference='Stop'
$repo10=Split-Path $PSScriptRoot -Parent
if(!$IsWindows){throw 'WORLD10 inherited host/containment controls require Windows'}
$run10=[guid]::NewGuid().ToString('N')
if(!$OutputRoot){$OutputRoot=Join-Path $repo10 ('.local/world10-offline-'+$run10)}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo10 $OutputRoot}
$out10=[IO.Path]::GetFullPath($OutputRoot)
$local10=[IO.Path]::GetFullPath((Join-Path $repo10 '.local'))
if(!$out10.StartsWith($local10+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out10)){throw 'Fresh current-checkout .local output required'}
for($at10=$out10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Test-Path -LiteralPath $at10)-and((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked offline result path refused'}}
[IO.Directory]::CreateDirectory($out10)|Out-Null
$artifact10=Join-Path $out10 'artifact';[IO.Directory]::CreateDirectory($artifact10)|Out-Null
function Hash10([string]$file10){(Get-FileHash -LiteralPath $file10 -Algorithm SHA256).Hash.ToLowerInvariant()}
function Sanitize10([string]$text10){
 foreach($binding10 in @(@{prefix=$repo10;replacement='<repo>'},@{prefix=$env:USERPROFILE;replacement='<user>'})){
  if(!$binding10.prefix){continue}
  $components10=[regex]::Split($binding10.prefix,'[\\/]+')|ForEach-Object{[regex]::Escape($_)}
  $pattern10=($components10-join'[\\/]+')+'(?=$|[\\/\s"''<>])'
  $text10=[regex]::Replace($text10,$pattern10,$binding10.replacement,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
 }
 return $text10
}
function Stage10([string]$name10,[scriptblock]$work10){
 $log10=Join-Path $out10 ($name10+'.log')
 Write-Output ('WORLD10 '+$name10)
 try{& $work10 *> $log10;if(!$?){throw ('Stage failed: '+$name10)}}
 finally{if(Test-Path -LiteralPath $log10){$clean10=Sanitize10 (Get-Content -LiteralPath $log10 -Raw);[IO.File]::WriteAllText((Join-Path $artifact10 ($name10+'.tap')),$clean10,[Text.UTF8Encoding]::new($false));Write-Output $clean10}}
}
function Tap10([string]$file10){
 $text10=[regex]::Replace((Get-Content -LiteralPath $file10 -Raw),'\x1b\[[0-?]*[ -/]*[@-~]','')
 $values10=[ordered]@{}
 foreach($label10 in @('tests','pass','fail','cancelled','skipped')){
  $matches10=[regex]::Matches($text10,('(?m)^(?:#|\u2139\uFE0F?)\s+'+$label10+' ([0-9]+)\s*$'))
  $values10[$label10]=[int](($matches10|ForEach-Object{[int]$_.Groups[1].Value}|Measure-Object -Sum).Sum)
 }
 $values10.skippedCases=@([regex]::Matches($text10,'(?m)^([^\r\n]+?)[ \t]+# SKIP[^\r\n]*\r?$')|ForEach-Object{
  $line10=$_.Groups[1].Value
  if($line10-match'^\s*(?:ok|not ok) [0-9]+ - (.+)$'){$Matches[1]}
  else{([regex]::Replace($line10,'^\s*[^\p{L}\p{N}]+\s*','')-replace'\s+\([0-9.]+(?:ms|s)\)$','')}
 })
 $values10.parser='node-tap-or-spec-summary-v1';$values10.scope='Node summary footers only; standalone native/PowerShell assertions are reported separately'
 $values10.skippedCasesComplete=$values10.skippedCases.Count-eq$values10.skipped
 return $values10
}
# A developer shell may carry optional private candidates or research packages.
# Remove only these known test inputs before ANY test, and restore them in finally.
$inputNames10=@('PLAYABLE01_CANDIDATE','RICHAUDIO_INSTALLED_CATALOG','RICHAUDIO_STOCK_SOURCE05_REPORT','RICHAUDIO_NPC_MANIFEST','RICHAUDIO_CODEWALKER_ROOT','RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES','RICHAUDIO_XML05_SUPERVISOR','RICHAUDIO_XML05_RUNTIME','RICHAUDIO_NG041_SUPERVISOR','RICHAUDIO_NG041_RUNTIME','NODE_OPTIONS','NODE_PATH','DOTNET_STARTUP_HOOKS','COR_ENABLE_PROFILING','COR_PROFILER','CORECLR_ENABLE_PROFILING','CORECLR_PROFILER')
$environment10=@{}
foreach($name10 in $inputNames10){$environment10[$name10]=@{exists=Test-Path -LiteralPath ('Env:'+$name10);value=[Environment]::GetEnvironmentVariable($name10,'Process')};[Environment]::SetEnvironmentVariable($name10,$null,'Process')}
$result10=[ordered]@{schema=1;kind='RichAudioOffline10Validation';passed=$false;createdUtc=[DateTime]::UtcNow.ToString('o');stage='starting';inheritedOriginalSuitePassed=$false;portableCounts=$null;inheritedNodeCounts=$null;standardCoreApiQualified=$false;distributionQualified=$false;genuineEnhancedGeometryQualified=$false;coreSourcePrepared=$false;coreBuilt=$false;researchDllCopied=$false;researchPackageBuilt=$false;optionalInputsIsolated=@($inputNames10|Where-Object{$environment10[$_].exists});researchProbeRequested=[bool]$RetainedResearchCoreRoot;researchProbe=$null;performance=@{ran=$false;processingDeadlinePassed=$null};exclusions=@('Upstream-source and modified-Core preparation/reference runners are excluded.','Research/native WORLD08 and WORLD09 Core cases are explicitly skipped without supplied package/fixtures; their TAP names/counts remain visible.','WORLD04.2/05 actual Core XML exporters/oracles and WORLD08/09 research package integration are excluded.','A standard precompiled CodeWalker.Core DLL and its genuine Enhanced compatibility remain unqualified.');gameFilesRead=$false;privateInputsRead=$false;endpointOpened=$false;gameLaunched=$false;deployed=$false;merged=$false}
$failed10=$null
Push-Location $repo10
try{
 $result10.stage='inherited-original-suite'
 Stage10 'inherited-original-suite' {& (Join-Path $PSScriptRoot 'Test-Offline.ps1') -SkipCodeWalkerSourceResearch}
 $result10.inheritedOriginalSuitePassed=$true
 $result10.inheritedNodeCounts=Tap10 (Join-Path $out10 'inherited-original-suite.log')
 $result10.stage='original-xml-containment'
 $xmlBuild10=Join-Path $out10 'xml-supervisor';$xmlRuntime10=Join-Path $out10 'xml-runtime'
 Stage10 'original-xml-containment-build' {
  & (Join-Path $PSScriptRoot 'world05-build-contained.ps1') -OutputRoot $xmlBuild10
  & (Join-Path $PSScriptRoot 'Prepare-NgRuntime041.ps1') -OutputRoot $xmlRuntime10
 }
 $env:RICHAUDIO_XML05_SUPERVISOR=Join-Path $xmlBuild10 'world05-contained.exe';$env:RICHAUDIO_XML05_RUNTIME=Join-Path $xmlRuntime10 'node.exe'
 $result10.stage='portable-world042-through10'
 $cases10=@(foreach($pattern10 in @('Test-*042.mjs','Test-*05.mjs','Test-*06.mjs','Test-*07.mjs','Test-*08.mjs','Test-*09.mjs','Test-*10.mjs')){Get-ChildItem -LiteralPath (Join-Path $repo10 'tests') -File -Filter $pattern10|ForEach-Object FullName})|Sort-Object -Unique
 if($cases10.Count-lt30){throw 'Expected additive WORLD042/05/06/08/09/10 test files are missing'}
 $result10.testFiles=@($cases10|ForEach-Object{[IO.Path]::GetFileName($_)})
 Stage10 'portable-world042-through10' {& node --test --test-reporter=tap --test-concurrency=1 @cases10;if($LASTEXITCODE-ne0){throw 'Additive original-only controls failed'}}
 $counts10=Tap10 (Join-Path $out10 'portable-world042-through10.log')
 if($counts10.tests-lt1-or$counts10.fail-ne0-or$counts10.cancelled-ne0-or$counts10.pass+$counts10.skipped-ne$counts10.tests){throw 'Complete measured Node TAP totals required'}
 $result10.portableCounts=$counts10
 Stage10 'runner-evidence-controls' {& (Join-Path $repo10 'tests/Test-OfflineEvidence10.ps1') -OutputRoot (Join-Path $out10 'runner-evidence-controls')}
 $result10.stage='original-tool-metadata'
 Stage10 'original-tool-metadata' {
  & (Join-Path $PSHOME 'pwsh.exe') -NoProfile -NonInteractive -File (Join-Path $repo10 'tests/Test-ToolMetadata05.ps1') -OutputRoot (Join-Path $out10 'tool-metadata')
  if($LASTEXITCODE-ne0){throw 'Original synthetic PE metadata controls failed'}
 }
 $metadata10=@(Get-Content -LiteralPath (Join-Path $out10 'tool-metadata/result.json') -Raw|ConvertFrom-Json)
 if($metadata10.Count-lt1-or@($metadata10|Where-Object{!$_.passed-or!$_.sourceOnlyOriginalFixture-or$_.gameFilesRead-or$_.audioEndpointOpened}).Count-ne0){throw 'Original-only metadata receipts required'}
 $result10.originalMetadataControls=$metadata10.Count
 if($RetainedResearchCoreRoot){
  $result10.stage='explicit-retained-research-api-probe'
  Stage10 'explicit-retained-research-api-probe' {& (Join-Path $PSScriptRoot 'Test-CodeWalkerPublicApi10.ps1') -ResearchCoreRoot $RetainedResearchCoreRoot -OutputRoot (Join-Path $out10 'research-api-probe')}
  $probe10=Get-Content -LiteralPath (Join-Path $out10 'research-api-probe/result.json') -Raw|ConvertFrom-Json
  if(!$probe10.passed-or$probe10.coreBuilt-or$probe10.standardBinaryQualified-or$probe10.distributionQualified){throw 'Retained research probe must not claim standard Core/distribution qualification'}
  $result10.researchProbe=@{passed=$true;controls=$probe10.controls;binaryRole=$probe10.binaryRole;standardBinaryQualified=$false;distributionQualified=$false;resultSHA256=Hash10 (Join-Path $out10 'research-api-probe/result.json')}
 }
 if(!$SkipProcessingProfile){
  $result10.stage='independent-processing-profile'
  $baseline10=Join-Path $local10 'world10-baseline-8a995c8';$archive10=$baseline10+'.zip'
  if(!(Test-Path -LiteralPath $baseline10)-and!(Test-Path -LiteralPath $archive10)){
   $paths10=@(& git ls-tree -r --name-only 8a995c8c8f5e7ab1461af64e756f30eafb7667a3 src/acoustics|Where-Object{$_-like'*.mjs'})
   if($LASTEXITCODE-ne0-or$paths10.Count-lt100){throw 'Original parent source closure unavailable'}
   $paths10+=@('tools/Profile-Processing09.mjs','tools/Profile-AcousticBudget042.mjs','tests/fixtures/AcousticBudget042.mjs','tests/fixtures/Processing09.mjs')
   & git archive --format=zip ('--output='+$archive10) 8a995c8c8f5e7ab1461af64e756f30eafb7667a3 -- @paths10
   if($LASTEXITCODE-ne0){throw 'Original authored baseline archive failed'}
   Expand-Archive -LiteralPath $archive10 -DestinationPath $baseline10
  }elseif(!(Test-Path -LiteralPath $baseline10)-or!(Test-Path -LiteralPath $archive10)){throw 'Incomplete prior baseline is retained; no automatic replacement'}
  foreach($path10 in @($baseline10,$archive10)){if((Get-Item -LiteralPath $path10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked baseline refused'}}
  # Verify every retained authored member against its immutable archive before reuse.
  $zip10=[IO.Compression.ZipFile]::OpenRead($archive10)
  try{foreach($entry10 in $zip10.Entries){if($entry10.FullName.EndsWith('/')){continue};if($entry10.FullName-notmatch'^(src/acoustics/[\w/-]+|tools/[\w-]+|tests/fixtures/[\w-]+)\.mjs$'){throw 'Baseline archive contains a non-authored member'}
   $member10=Join-Path $baseline10 $entry10.FullName
   for($at10=$member10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Test-Path -LiteralPath $at10)-and((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked baseline member refused'}}
   $stream10=$entry10.Open();try{$sha10=[Security.Cryptography.SHA256]::Create();try{$expected10=[Convert]::ToHexString($sha10.ComputeHash($stream10)).ToLowerInvariant()}finally{$sha10.Dispose()}}finally{$stream10.Dispose()}
   if((Hash10 $member10)-cne$expected10){throw 'Retained baseline member changed'}
  }}finally{$zip10.Dispose()}
  $snapshot10='world10-current-ci-'+$run10
  Stage10 'processing-snapshot' {& node (Join-Path $PSScriptRoot 'Freeze-Processing10.mjs') $snapshot10;if($LASTEXITCODE-ne0){throw 'Processing input closure freeze failed'}}
  $profiles10=@()
  foreach($textured10 in @($false,$true)){
   $name10='world10-ci-'+$run10+$(if($textured10){'-texture'}else{'-plain'})
   $profileName10=$name10+'.json';$profiles10+=$profileName10
   $config10=@{selectedModes=@('baseline-cold','current-prepared-jit');selectedProfiles=@('fixed-cpu-balanced');repetitions=2;contentionCounts=@(0,2);snapshot=$snapshot10;instrumented=$true}
   if($textured10){$config10.texture=$true;$config10.lifecycle=$true;$config10.blocks=192}
   $configJson10=$config10|ConvertTo-Json -Depth 4 -Compress
   Stage10 $name10 {& node (Join-Path $PSScriptRoot 'Profile-Processing10.mjs') --run --out (Join-Path $local10 $profileName10) $configJson10;if($LASTEXITCODE-ne0){throw 'Processing diagnostic failed; raw evidence retained'}}
  }
  Stage10 'processing-summary' {& node (Join-Path $PSScriptRoot 'Summarize-Processing10.mjs') --out (Join-Path $artifact10 'performance.json') @profiles10;if($LASTEXITCODE-ne0){throw 'Processing comparison summary failed'}}
  $performance10=Get-Content -LiteralPath (Join-Path $artifact10 'performance.json') -Raw|ConvertFrom-Json
  if(!$performance10.pcmPassed){throw 'Independent original PCM/lifecycle comparisons failed'}
  $candidate10=@($performance10.experiments|ForEach-Object{$_.modes}|Where-Object{$_.mode-eq'current-prepared-jit'})
  $deadline10=@($candidate10|Where-Object{!$_.processingDeadlinePassed}).Count-eq0
  $result10.performance=@{ran=$true;diagnosticPassed=$true;pcmPassed=$true;processingDeadlinePassed=$deadline10;blockBudgetMs=512000.0/48000;candidateCalls=[int](($candidate10|Measure-Object blocks -Sum).Sum);candidateOverruns=[int](($candidate10|Measure-Object overBudget -Sum).Sum);summarySHA256=Hash10 (Join-Path $artifact10 'performance.json');overrunsRetained=$true;functionalAndTimingGatesSeparate=$true}
  if(!$deadline10){Write-Warning 'Measured processing deadline misses remain in performance.json; functional success is separate from real-time performance success.'}
 }
 & git diff --check;if($LASTEXITCODE-ne0){throw 'Whitespace validation failed'}
 $result10.passed=$true;$result10.stage='complete'
}catch{$failed10=$_;$result10.failure=Sanitize10 $_.Exception.Message;$result10.stage='failed:'+ $result10.stage}
finally{
 $result10.finishedUtc=[DateTime]::UtcNow.ToString('o')
 $json10=($result10|ConvertTo-Json -Depth 10)+"`n"
 [IO.File]::WriteAllText((Join-Path $out10 'result.json'),$json10,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact10 'result.json'),$json10,[Text.UTF8Encoding]::new($false))
 foreach($name10 in $environment10.Keys){if($environment10[$name10].exists){[Environment]::SetEnvironmentVariable($name10,$environment10[$name10].value,'Process')}else{[Environment]::SetEnvironmentVariable($name10,$null,'Process')}}
 Pop-Location
}
if($failed10){throw $failed10}
Write-Output ('PASS WORLD10 original functional suite; native research exclusions and timing findings are explicit in '+(Join-Path $out10 'result.json'))
