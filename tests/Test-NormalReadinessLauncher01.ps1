#requires -Version 7.0
# Full actual wrapper processes, copied declared package, original inert worker.
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.local/street01-launcher-rehearsal-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
function Hash01($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Json01($p,$v){$v|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $p -Encoding utf8}
$pwsh=(Get-Process -Id $PID).Path;$node=(Get-Command node).Source
$files=@('tools/Invoke-NormalReadinessQualification01.ps1','tools/Invoke-NormalReadinessOuter01.ps1','tools/normal-readiness-wrapper01.mjs','src/acoustics/startup/CatalogLifecycle.psm1','src/acoustics/integration/PreparationCoordinator.psm1','tests/fixtures/NormalReadinessWorker01.ps1')
$results=@()
foreach($case in @('project-context','different-cwd','worker-failure','missing-dependency','changed-dependency','missing-pin','inner-dependency-drift')){
 $package=Join-Path $root ($case+" package ' copied");[IO.Directory]::CreateDirectory($package)|Out-Null
 foreach($relative in $files){$to=Join-Path $package $relative;[IO.Directory]::CreateDirectory((Split-Path $to -Parent))|Out-Null;Copy-Item -LiteralPath (Join-Path $repo $relative) -Destination $to}
 # Declared replacement of the protected installed-world workload, not a
 # replacement of either wrapper, coordinator, dependency or binding helper.
 Copy-Item -LiteralPath (Join-Path $repo 'tests/fixtures/NormalReadinessLauncher01.mjs') -Destination (Join-Path $package 'tools/Measure-NormalWorldReadiness01.mjs')
 $folder=Join-Path $package '.local/proposal';[IO.Directory]::CreateDirectory($folder)|Out-Null
 $fixtureGame=Join-Path $folder 'authored-installation';$fixtureCache=Join-Path $folder 'authored-cache';[IO.Directory]::CreateDirectory($fixtureGame)|Out-Null;[IO.Directory]::CreateDirectory($fixtureCache)|Out-Null
 $fixtureInstallFile=Join-Path $fixtureGame 'identity.inert';[IO.File]::WriteAllText($fixtureInstallFile,'original authored inert installation identity; not executable or vendor material')
 $fixtureCacheFile=Join-Path $fixtureCache 'manifest.json';Json01 $fixtureCacheFile @{Schema=1;fixtureOnly=$true;resources=@();origin='original-authored-cache-fixture'}
 $pins=@(($files+@('tools/Measure-NormalWorldReadiness01.mjs'))|ForEach-Object{@{Path=$_;SHA256=(Hash01 (Join-Path $package $_))}})
 $proposal=[ordered]@{Schema=1;Kind='RichAudioNormalReadinessQualification01';ProposalIdentity=('authored-'+$case);ApprovedReadOnly=$false;ApprovedStartUtc=$null;ApprovedStopUtc=$null;MaximumSeconds=1800;MaximumMemoryMiB=3072;AggregateJobMemoryMiB=4096;Node=@{Path=$node;SHA256=(Hash01 $node)};PowerShell=@{Path=$pwsh;SHA256=(Hash01 $pwsh)};SourcePins=$pins;FixtureToken="quoted ' token with spaces";FixtureWorkerExitCode=$(if($case-eq'worker-failure'){23}else{0});FixtureInnerDependencyDrift=($case-eq'inner-dependency-drift')}
 $proposal.AuthoredInstallation=@{Path=$fixtureInstallFile;SHA256=(Hash01 $fixtureInstallFile)};$proposal.AuthoredCache=@{Path=$fixtureCacheFile;SHA256=(Hash01 $fixtureCacheFile)}
 if($case-eq'missing-pin'){$proposal.SourcePins=@($pins|Where-Object Path -CNE 'src/acoustics/startup/CatalogLifecycle.psm1')}
 $template=Join-Path $folder 'qualification-template.json';Json01 $template $proposal;$templateSha=Hash01 $template
 $approved=Join-Path $folder 'approved-fixture-only.json';$proposal.ApprovedReadOnly=$true;$proposal.ApprovedStartUtc=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');$proposal.ApprovedStopUtc=[DateTimeOffset]::UtcNow.AddSeconds(90).ToString('o');Json01 $approved $proposal
 $dependency=Join-Path $package 'src/acoustics/startup/CatalogLifecycle.psm1'
 if($case-eq'missing-dependency'){Remove-Item -LiteralPath $dependency}
 if($case-eq'changed-dependency'){Add-Content -LiteralPath $dependency -Value '# authored drift'}
 $wrapper=Join-Path $package 'tools/Invoke-NormalReadinessQualification01.ps1';$wrapperSha=Hash01 $wrapper
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$pwsh;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.WorkingDirectory=if($case-eq'different-cwd'){$env:TEMP}else{$package}
 foreach($arg in @('-NoProfile','-NonInteractive','-File',$wrapper,'-ApprovedConfigurationPath',$approved,'-TemplatePath',$template,'-ExpectedTemplateSHA256',$templateSha,'-ExpectedWrapperSHA256',$wrapperSha)){$info.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;[void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 if(!$process.WaitForExit(45000)){$process.Kill($true);[void]$process.WaitForExit(3000);throw ('Authored launcher rehearsal exceeded bound: '+$case)}
 $exit=$process.ExitCode;$process.Dispose();$stdout.Result|Set-Content -LiteralPath (Join-Path $folder 'entry.stdout.log');$stderr.Result|Set-Content -LiteralPath (Join-Path $folder 'entry.stderr.log')
 $success=$case-in@('project-context','different-cwd');if(($exit-eq0)-ne$success){throw ('Unexpected actual entry outcome: '+$case+'; '+$folder)}
 $reached=Test-Path -LiteralPath (Join-Path $folder 'worker.json');if($reached-ne($success-or$case-eq'worker-failure')){throw ('Wrong worker admission: '+$case)}
 $aggregate=$null;$inner=$null
 if(Test-Path -LiteralPath (Join-Path $folder 'aggregate-process.json')){
  $aggregate=Get-Content -LiteralPath (Join-Path $folder 'aggregate-process.json') -Raw|ConvertFrom-Json
  if(!$aggregate.process.ControlJoined-or$aggregate.process.UnknownClosure-or$aggregate.identity.templateSha256-cne$templateSha-or$aggregate.identity.wrapperSha256-cne$wrapperSha-or$wrapperSha-ceq$templateSha-or$aggregate.identity.proposalIdentity-cne$proposal.ProposalIdentity){throw 'Aggregate closure or exact receipt identities lost'}
 }elseif(Test-Path -LiteralPath (Join-Path $folder 'aggregate-job')){throw 'Rejected dependency created Job output'}
 if($reached){
  $worker=Get-Content -LiteralPath (Join-Path $folder 'worker.json') -Raw|ConvertFrom-Json
  foreach($processId in @($worker.pid,$worker.childPid)){if(Get-Process -Id $processId -ErrorAction SilentlyContinue){throw 'Authored child remains after cleanup'}}
  $inner=Get-Content -LiteralPath (Join-Path $folder 'inner-identity.json') -Raw|ConvertFrom-Json
  if(!$inner.process.ControlJoined-or$inner.process.UnknownClosure-or$inner.templateSha256-cne$templateSha-or$inner.wrapperSha256-cne(Hash01 (Join-Path $package 'tools/Invoke-NormalReadinessOuter01.ps1'))-or$inner.process.ExitCode-ne$proposal.FixtureWorkerExitCode){throw 'Inner receipt/worker exit not observed correctly'}
 }
 $results+=@{case=$case;exitCode=$exit;workerReached=$reached;aggregate=$aggregate;inner=$inner;fixtureOnly=$true;package=$package;actualOuterSHA256=$wrapperSha;templateSHA256=$templateSha;noChildrenRemain=$true}
}
Json01 (Join-Path $root 'validation.json') @{passed=$true;cases=$results;fixtureOnly=$true;gameAccessed=$false;substitution='Original-authored measurement/decoder worker at declared package tools/Measure-NormalWorldReadiness01.mjs; both actual PowerShell wrapper entrypoints, shared invocation writer and both modules copied unchanged';root=$root}
'PASS actual qualification entry points: '+(Join-Path $root 'validation.json')
