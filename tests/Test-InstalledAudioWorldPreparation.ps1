$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($PSVersionTable.PSEdition -ne 'Core'){throw 'Preparation supervisor tests require PowerShell 7'}
$repo=Split-Path $PSScriptRoot -Parent
foreach($relative in @('src\acoustics\startup\CatalogLifecycle.psm1','src\acoustics\integration\PreparationCoordinator.psm1')){Import-Module (Join-Path $repo $relative) -Force}
function Assert($Value,[string]$Message){if(!$Value){throw $Message}}
$root=Join-Path $repo ('.local\preparation-coordinator-tests\'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$catalog=[pscustomobject]@{Schema=1;State='reference-catalog-complete-with-explicit-gaps'}
$verified=[pscustomobject]@{Index=0;State='verified-installed-container-and-stream';AwcSHA256=('a'*64);Stream=[pscustomobject]@{Id=1}}
$candidate=[pscustomobject]@{Index=1;State='unique-container-candidate';AwcSHA256=$null;Stream=$null}
$resolved=[pscustomobject]@{Schema=1;Stage='codewalker-resolved-installation-model';Vehicles=@([pscustomobject]@{Model='arbitrary-aircraft';VehicleAudioRecord=@{Hash='one'};GranularRecord=@{Hash='two'};Sounds=@{EngineAccel=@{Hash='ABCDEF01';ChannelLinks=@($verified,$candidate)}}})}
$geometry=[pscustomobject]@{Schema=1;ProcessedResources=2;PendingResources=1;BlockedResources=3;AllSelectedExteriorImported=$false}
$ready=Get-InstalledPreparationReadiness $catalog $resolved $geometry -InputsStable $true -StagesCompleted $true
Assert $ready.PreparationCompleted 'Complete preparation stages and stable inputs must be acknowledged'
Assert ($ready.VehicleModels -eq 1 -and $ready.ChannelLinks -eq 2 -and $ready.VerifiedBankStreamLinks -eq 1 -and $ready.UnresolvedBankStreamLinks -eq 1) 'Stream table evidence must stay distinct from a unique bank candidate'
Assert (!$ready.ReadyForGameLaunch -and !$ready.RuntimeReplacementImplemented -and !$ready.DecodedSourcesReady -and !$ready.LiveGainChainVerified -and !$ready.AcousticWorldComplete) 'Metadata preparation must never promote runtime/source/gain/world acceptance'
Assert (!(Get-InstalledPreparationReadiness $catalog $resolved $geometry -InputsStable $false -StagesCompleted $true).PreparationCompleted) 'Stale installation identity must invalidate preparation'
$shared=[pscustomobject]@{Schema=1;Stage=$resolved.Stage;Vehicles=@($resolved.Vehicles[0],$resolved.Vehicles[0])}
$sharedReady=Get-InstalledPreparationReadiness $catalog $shared $geometry -InputsStable $true -StagesCompleted $true
Assert ($sharedReady.ChannelLinks -eq 2 -and $sharedReady.ModelChannelLinkOccurrences -eq 4 -and $sharedReady.VerifiedBankStreamLinks -eq 1) 'Shared source graphs must not multiply verified stream-table counts across models'
$artifact=Join-Path $root 'artifact.json';[IO.File]::WriteAllText($artifact,'original')
$receipt=[pscustomobject]@{Schema=1;Fingerprint='current';Completed=$true;Artifacts=@([pscustomobject]@{RelativePath='artifact.json';SHA256=Get-PreparationHash $artifact})}
Assert (Test-PreparationReceipt $root $receipt 'current') 'Matching artifact receipt must be reusable'
Assert (!(Test-PreparationReceipt $root $receipt 'changed-map-fingerprint')) 'Changed custom-map fingerprint must prevent reuse'
[IO.File]::WriteAllText($artifact,'modified')
Assert (!(Test-PreparationReceipt $root $receipt 'current')) 'Artifact digest mismatch must prevent reuse'
$one=Get-PreparationFingerprint ([ordered]@{Archives=@(@{Path='custom-map.rpf';Bytes=10;WriteUtc='old'})})
$two=Get-PreparationFingerprint ([ordered]@{Archives=@(@{Path='custom-map.rpf';Bytes=10;WriteUtc='new'})})
Assert ($one -ne $two) 'Changed archive metadata must change preparation identity'
$executable=(Get-Process -Id $PID).Path
$cancel=Join-Path $root 'cancel.request'
$success=Invoke-PreparationProcess -Executable $executable -CommandText 'exit 0' -PrivateRoot $root -StageOutput (Join-Path $root 'success') -CancellationPath $cancel -MaximumSeconds 10
Assert ($success.Completed -and $success.State -eq 'complete' -and $success.ExitCode -eq 0) 'Real owned PowerShell stage must complete normally'
$timeout=Invoke-PreparationProcess -Executable $executable -CommandText 'Start-Sleep -Seconds 60' -PrivateRoot $root -StageOutput (Join-Path $root 'timeout') -CancellationPath $cancel -MaximumSeconds .5
Assert (!$timeout.Completed -and $timeout.State -eq 'deadline' -and $timeout.ElapsedSeconds -lt 5) 'Independent deadline must stop a blocked owned stage'
$childMarker=Join-Path $root 'orphan-child.pid'
$sleepEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 60'))
$childCommand='$child=Start-Process -FilePath '+(ConvertTo-PreparationLiteral $executable)+' -ArgumentList @(''-NoProfile'',''-NonInteractive'',''-EncodedCommand'','+(ConvertTo-PreparationLiteral $sleepEncoded)+') -WindowStyle Hidden -PassThru;[IO.File]::WriteAllText('+(ConvertTo-PreparationLiteral $childMarker)+',[string]$child.Id);exit 0'
$early=Invoke-PreparationProcess -Executable $executable -CommandText $childCommand -PrivateRoot $root -StageOutput (Join-Path $root 'early-parent-exit') -CancellationPath $cancel -MaximumSeconds 10
Assert ($early.Completed -and [IO.File]::Exists($childMarker)) 'Early-parent fixture must actually create its child'
$childId=[int][IO.File]::ReadAllText($childMarker)
$ended=$false
for($i=0;$i -lt 20;$i++){$remaining=Get-Process -Id $childId -ErrorAction SilentlyContinue;if(!$remaining){$ended=$true;break};Start-Sleep -Milliseconds 50}
Assert $ended 'Closing the owned job must stop descendants even after their parent exits'
[IO.File]::WriteAllText($cancel,'focused cancellation fixture')
$cancelled=Invoke-PreparationProcess -Executable $executable -CommandText 'Start-Sleep -Seconds 60' -PrivateRoot $root -StageOutput (Join-Path $root 'cancelled') -CancellationPath $cancel -MaximumSeconds 10
Assert (!$cancelled.Completed -and $cancelled.State -eq 'cancelled' -and $cancelled.ElapsedSeconds -lt 5) 'Cancellation must stop the owned job without waiting for its work'
Write-Output 'Installed audio/world preparation checks passed: readiness, stale/tampered receipts, real completion, deadline, orphan cleanup and cancellation. No game/vendor parser/audio endpoint used.'
