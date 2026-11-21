# Execute the actual production checkpoint writer against original owned data.
# No game/archive/vendor process, native API, playback or endpoint is used.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$output=Join-Path $repo ('.local\continuation01-original-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $output 'geometry'))|Out-Null;[IO.Directory]::CreateDirectory((Join-Path $output 'resolved'))|Out-Null
$integration=Join-Path $repo 'src\acoustics\integration\PreparationCoordinator.psm1';Import-Module (New-Module -Name Continuation01OriginalHelpers -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($integration)))) -Force
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'tools\Prepare-InstalledAudioWorld.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Production preparation source must parse'}
$writer=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Continuation-Checkpoint'},$true)
if(!$writer){throw 'Production continuation checkpoint writer missing'}
. ([ScriptBlock]::Create($writer.Extent.Text))
$checks=0;function Assert($Value,[string]$Message){$script:checks++;if(!$Value){throw $Message}}
function Write-Original([string]$Relative,$Value){[IO.File]::WriteAllText((Join-Path $output $Relative),($Value|ConvertTo-Json -Depth 10 -Compress),[Text.UTF8Encoding]::new($false))}
$binding=[ordered]@{GameExecutableSHA256=('a'*64);CodeWalkerCoreSHA256=('b'*64);OriginalSourceRevision=1}
function Input-Binding {return $binding}
$fingerprint=Get-PreparationFingerprint $binding;$runId=[Guid]::NewGuid().ToString('N');$cancel=Join-Path $output 'cancel.request';$oldBatchId=$env:RICHAUDIO_WORLD_BATCH_ID;$env:RICHAUDIO_WORLD_BATCH_ID=[Guid]::NewGuid().ToString('N')
$receiptPath=Join-Path $output 'original-stage.json';$stageResults=[Collections.Generic.List[object]]::new();$stageResults.Add([pscustomobject]@{Stage='geometry';Receipt=$receiptPath})
$receipt=[ordered]@{Process=[ordered]@{State='deadline';ControlJoined=$true;UnknownClosure=$false}}
Write-Original 'resolved\resolved-catalog.json' @{kind='original-complete-catalogue'};$catalogHash=Get-PreparationHash (Join-Path $output 'resolved\resolved-catalog.json')
$manifest=[ordered]@{ResolvedCatalogSHA256=$catalogHash;InputBinding=$binding;Resources=@(@{Eligibility='eligible-exterior';Status='imported-exterior-incomplete-surfaces'},@{Eligibility='eligible-exterior';Status='deferred-resource-import-failed'},@{Eligibility='eligible-exterior';Status='pending-exterior-import'})}
function Reset-Original {Write-Original 'original-stage.json' $receipt;Write-Original 'geometry\manifest.json' $manifest;$view=[ordered]@{Schema=1;ManifestSHA256=Get-PreparationHash (Join-Path $output 'geometry\manifest.json');ResolvedCatalogSHA256=$manifest.ResolvedCatalogSHA256;InputBinding=$manifest.InputBinding;Resources=$manifest.Resources};Write-Original 'geometry\driver-plan01.json' $view}
try {
 Reset-Original;$value=Continuation-Checkpoint
 Assert ($value.Resumable -and $value.WorkerClosureVerified -and !$value.UnknownClosure) 'A joined typed deadline with exact source/catalogue and genuinely pending work must be resumable'
 Assert ($value.SupervisorBatchId -ceq $env:RICHAUDIO_WORLD_BATCH_ID -and $value.RunId -ceq $runId) 'Parent and child attempt identities must be retained separately'
 Assert ($value.PendingResources -eq 2 -and $value.FailedResources -eq 1 -and $value.ManifestSHA256 -eq (Get-PreparationHash (Join-Path $output 'geometry\manifest.json'))) 'Counts must derive from the exact durable manifest, not files scanned'
 [IO.File]::AppendAllText((Join-Path $output 'geometry\manifest.json'),' ');Assert (!(Continuation-Checkpoint).Resumable) 'An older compact view cannot supply counts for a newer manifest generation';Reset-Original
 Remove-Item -LiteralPath (Join-Path $output 'geometry\driver-plan01.json');Assert (!(Continuation-Checkpoint).Resumable) 'A missing compact view must stop continuation without materialising the full manifest';Reset-Original
 $receipt.Process.UnknownClosure=$true;Reset-Original;Assert (!(Continuation-Checkpoint).Resumable) 'Unknown owned-process closure must stop continuation';$receipt.Process.UnknownClosure=$false
 $receipt.Process.State='failed';Reset-Original;Assert (!(Continuation-Checkpoint).Resumable) 'A generic failed worker is not a budget terminal'
 $inner=[ordered]@{Schema=1;Kind='RichAudioInstalledGeometryContinuation01';ParentInvocationId=$runId;Cause='budget-deadline';CanContinue=$true;ControlJoined=$true;UnknownClosure=$false};Write-Original 'geometry\continuation-checkpoint.json' $inner
 Assert ((Continuation-Checkpoint).Resumable) 'A fresh joined inner budget-before-next-helper checkpoint can explain the outer exit'
 $inner.ParentInvocationId=[Guid]::NewGuid().ToString('N');Write-Original 'geometry\continuation-checkpoint.json' $inner;Assert (!(Continuation-Checkpoint).Resumable) 'An older inner attempt cannot authorise another automatic batch'
 $receipt.Process.State='deadline';Reset-Original;$binding.OriginalSourceRevision=2;Assert (!(Continuation-Checkpoint).Resumable) 'Changed current source bindings must stop automatic continuation';$binding.OriginalSourceRevision=1
 $manifest.ResolvedCatalogSHA256='f'*64;Reset-Original;Assert (!(Continuation-Checkpoint).Resumable) 'Changed catalogue identity must stop continuation';$manifest.ResolvedCatalogSHA256=$catalogHash
 $manifest.Resources=$manifest.Resources[0..1];Reset-Original;Assert (!(Continuation-Checkpoint).Resumable) 'Only same-source failures remaining must not be retried';$manifest.Resources+=@{Eligibility='eligible-exterior';Status='pending-exterior-import'}
 Reset-Original;[IO.File]::WriteAllText($cancel,'original manual cancellation');Assert (!(Continuation-Checkpoint).Resumable) 'A pending cancellation must never become continuation approval';Remove-Item -LiteralPath $cancel
 $env:RICHAUDIO_WORLD_BATCH_ID='';Assert (!(Continuation-Checkpoint).Resumable) 'Legacy or manually started configurations must not opt into automatic retries'
 Write-Output ('Production world continuation checkpoint original controls passed: '+$checks+' assertions; no installed inputs or process launched.')
}finally{
 $env:RICHAUDIO_WORLD_BATCH_ID=$oldBatchId;$absolute=[IO.Path]::GetFullPath($output);$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\continuation01-original-'
 if(!$absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Owned original checkpoint cleanup path escaped'}
 Remove-Item -LiteralPath $absolute -Recurse -Force
}
