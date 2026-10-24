# Boundary tests for the development-only inspectors; never writes to GTA.
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$checks=[Collections.Generic.List[object]]::new()
function Check([bool]$Condition,[string]$Name){$checks.Add([pscustomobject]@{Name=$Name;Passed=$Condition});if(!$Condition){throw $Name}}
$root='__GAME_ROOT__'
$before=@(Get-ChildItem -LiteralPath $root -File | Where-Object Extension -ne '.rpf' | ForEach-Object {[pscustomobject]@{Name=$_.Name;SHA256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
$probe=Join-Path $repo '.local\readiness-boundary-tests'
[IO.Directory]::CreateDirectory($probe) | Out-Null
$bad=Join-Path $probe 'wrong-package.zip';[IO.File]::WriteAllText($bad,'authored invalid archive')
$rejected=$false;try{& (Join-Path $repo 'tools\Inspect-RuntimePackage.ps1') -PackagePath $bad | Out-Null}catch{$rejected=$_.Exception.Message -like '*does not match*'}
Check $rejected 'Reject unverified archive before extraction'
$rejected=$false;try{& (Join-Path $repo 'tools\Prepare-RuntimeReadiness.ps1') -OutputRoot (Join-Path $root 'RichAudio-test-probe') | Out-Null}catch{$rejected=$_.Exception.Message -like '*Reports must stay*'}
Check $rejected 'Reject game-root report output before any write'
$rejected=$false;try{& (Join-Path $repo 'tools\Prepare-RuntimeReadiness.ps1') -RuntimeDirectory '__USER_HOME__\Downloads\6d0158-OpenRPF' | Out-Null}catch{$rejected=$_.Exception.Message -like '*Extract the authentic*'}
Check $rejected 'Reject protected source folder as runtime stage'
$package=Get-Content (Join-Path $repo 'evidence\phase2.1\package-inspection.json') -Raw | ConvertFrom-Json
Check ($package.PublisherChecksumMatched -and $package.Entries.Count -eq 1134) 'Authentic package checksum and complete ZIP directory recorded'
Check (@($package.StagedFiles | Where-Object {$_ -match '^(plugins|lspdfr)/'}).Count -eq 0) 'LSPDFR assets/plugins excluded from extraction'
Check (@($package.StagedFiles | Where-Object {$_ -match 'SDK'}).Count -eq 0) 'No bundled SDK claimed where none exists'
foreach($f in $package.StagedArtifacts){Check ((Get-FileHash -LiteralPath (Join-Path $package.StageDirectory $f.Name)).Hash -eq $f.SHA256) ('Staged bytes match: '+$f.Name)}
$manifest=Get-Content (Join-Path $repo 'evidence\phase2.1\deployment-manifest.json') -Raw | ConvertFrom-Json
Check (!$manifest.InstallationAuthorised -and !$manifest.GameWritesPerformed -and !$manifest.ReadyForGameplay) 'Proposal never reports approval, installation or gameplay validation'
Check ($manifest.Files.Count -eq 26 -and @($manifest.Files | Where-Object PriorState -ne 'ABSENT').Count -eq 0) '26 proposed destinations were absent at inspection'
Check (@($manifest.Files | Group-Object Destination | Where-Object Count -gt 1).Count -eq 0) 'No duplicate install destinations'
$config=Get-Content (Join-Path $repo 'config\phase2.1\StoryMode-test.json') -Raw | ConvertFrom-Json
Check (!$config.CaptureEnabled -and $config.SourceLimit -eq 8 -and $config.SampleHz -eq 20) 'Prepared test starts capture-disabled with bounded eight-source configuration'
$after=@(Get-ChildItem -LiteralPath $root -File | Where-Object Extension -ne '.rpf' | ForEach-Object {[pscustomobject]@{Name=$_.Name;SHA256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
Check ((Compare-Object $before $after -Property Name,SHA256).Count -eq 0) 'Game-root non-archive file set and hashes unchanged across boundary tests'
[ordered]@{ExecutedUtc=[DateTime]::UtcNow.ToString('o');Passed=$true;Assertions=$checks.Count;Scope='Inspector boundaries and staged/manifest integrity; not runtime execution';Tests=@($checks)} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $repo 'evidence\phase2.1\readiness-tests.json') -Encoding utf8
Write-Output ('PASS: '+$checks.Count+' readiness assertions; game unchanged.')
