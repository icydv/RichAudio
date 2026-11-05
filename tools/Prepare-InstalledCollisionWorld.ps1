# Resumable offline preparation only. Never called from a game/audio callback.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
 [Parameter(Mandatory=$true)][string]$ResolvedCatalogPath,
 [Parameter(Mandatory=$true)][string]$ResolvedCatalogSHA256,
 [string]$OutputRoot='.local/installed-collision-world',
 [ValidateRange(5,3600)][int]$MaximumSeconds=300,
 [ValidateRange(1,262144)][int]$MaximumResources=262144,
 [ValidateRange(256,4096)][int]$MaximumMemoryMiB=2048,
 [string]$PrepareScriptPath='',
 [ValidatePattern('^[a-f0-9]{32}$')][string]$ParentInvocationId='',
 [string]$ObservationNotBeforeUtc='',
 [switch]$PlanOnly
)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($PSVersionTable.PSEdition -ne 'Core'){throw 'Run this supervised preparation driver with installed PowerShell 7.'}
$scriptFile=if($PrepareScriptPath){[IO.Path]::GetFullPath($PrepareScriptPath)}else{$PSCommandPath}
if(!$scriptFile){throw 'Supply PrepareScriptPath when loading this driver as a ScriptBlock.'}
$repo=Split-Path (Split-Path $scriptFile -Parent) -Parent
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\');$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$output=if([IO.Path]::IsPathRooted($OutputRoot)){[IO.Path]::GetFullPath($OutputRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))}
if(!$output.StartsWith((Join-Path $repo '.local\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Private checkout .local output required.'}
foreach($inputRoot in @($game,$cw)){if($output -eq $inputRoot -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'World output overlaps a read-only input root.'}}
for($part=New-Object IO.DirectoryInfo($output);$null -ne $part;$part=$part.Parent){if($part.Exists -and ($part.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked world output ancestors are unsupported.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
Import-Module (Join-Path $repo 'src\acoustics\startup\CatalogLifecycle.psm1') -Force
Import-Module (Join-Path $repo 'src\acoustics\integration\PreparationCoordinator.psm1') -Force
$lease=[IO.File]::Open((Join-Path $output 'worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$clock=[Diagnostics.Stopwatch]::StartNew();$runId=[Guid]::NewGuid().ToString('N');$cancel=Join-Path $output 'cancel.request';$statusPath=Join-Path $output 'status.json';$script:phaseNumber=0;$script:lastOwnedProcess=$null;$script:budgetExhausted=$false
if(!$ObservationNotBeforeUtc){$ObservationNotBeforeUtc=[DateTimeOffset]::UtcNow.ToString('o')}
$script:phaseMetrics=New-Object Collections.Generic.List[object]
function Metrics {Json (Join-Path $output 'startup-metrics01.json') ([ordered]@{Schema=1;Kind='RichAudioWorldStartupMetrics01';RunId=$runId;ElapsedSeconds=$clock.Elapsed.TotalSeconds;Phases=$script:phaseMetrics.ToArray();GameLaunched=$false;EndpointOpened=$false;PhysicalDiskIoMeasured=$false;FullWorldReady=$false})}
function Literal([string]$Text){return "'"+$Text.Replace("'","''")+"'"}
function Json([string]$Path,$Value){$pending=$Path+'.pending-'+$runId;[IO.File]::WriteAllText($pending,($Value|ConvertTo-Json -Depth 16 -Compress),(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($Path)){[IO.File]::Replace($pending,$Path,[NullString]::Value)}else{[IO.File]::Move($pending,$Path)}}
function Status([string]$State,[string]$Detail){Json $statusPath ([ordered]@{Schema=1;RunId=$runId;State=$State;Detail=$Detail;ElapsedSeconds=[Math]::Round($clock.Elapsed.TotalSeconds,3);Completed=$false;Resumable=$true;GameWrites=$false;EndpointOpened=$false;RuntimeReplacementImplemented=$false})}
function RunOwned([string]$Command,[string]$Phase){
 if(Test-Path -LiteralPath $cancel){throw 'World preparation cancelled; checkpoints retained.'}
 if($clock.Elapsed.TotalSeconds -ge $MaximumSeconds){$script:budgetExhausted=$true;throw 'World preparation deadline; checkpoints retained.'}
 Status $Phase 'Owned offline helper is running; no game or audio endpoint is open.'
 $script:phaseNumber++;$stageOutput=Join-Path $output ('phase-'+$runId+'-'+$script:phaseNumber)
 $framework=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $remaining=[Math]::Max(0.1,$MaximumSeconds-$clock.Elapsed.TotalSeconds)
 $commandWithLocation='Set-Location -LiteralPath '+(Literal $repo)+';'+$Command
 $result=Invoke-PreparationProcess -Executable $framework -CommandText $commandWithLocation -PrivateRoot $output -StageOutput $stageOutput -CancellationPath $cancel -MaximumSeconds $remaining -MaximumMemoryMiB $MaximumMemoryMiB -MaximumOwnedProcesses 8
 $script:lastOwnedProcess=$result
 $script:phaseMetrics.Add([ordered]@{Phase=$Phase;ElapsedSeconds=$result.ElapsedSeconds;PeakJobMemoryBytes=$result.PeakJobMemoryBytes;WorkMetrics01=$result.WorkMetrics01;ControlJoined=$result.ControlJoined;Completed=$result.Completed});Metrics
 if(!$result.Completed){throw ('Owned '+$Phase+' helper '+$result.State+'; checkpoints retained. Inspect private phase stderr.')}
}
function RunNode([string[]]$Values,[string]$Phase){$parts=@('& node',(Literal (Join-Path $repo 'src\acoustics\world\world-warmup.mjs')));foreach($value in $Values){$parts+=Literal $value};RunOwned (($parts -join ' ')+'; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}') $Phase}
try{
 if($ResolvedCatalogSHA256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Pinned resolved catalogue SHA-256 required.'}
 $catalog=[IO.Path]::GetFullPath($ResolvedCatalogPath)
 if((Get-FileHash -LiteralPath $catalog -Algorithm SHA256).Hash -ne $ResolvedCatalogSHA256){throw 'Resolved catalogue content changed.'}
 RunNode @('catalog-header',$catalog,$ResolvedCatalogSHA256,(Join-Path $output 'resolved-binding01.json')) 'reading-bounded-catalogue-binding'
 $resolved=[IO.File]::ReadAllText((Join-Path $output 'resolved-binding01.json'))|ConvertFrom-Json
 $refreshPath=Join-Path $output 'catalog-source-change01.json'
 if([IO.File]::Exists($refreshPath)){
  if((Get-Item -LiteralPath $refreshPath).Length-gt8192){throw 'Bounded source refresh marker required'}
  $refresh=Get-Content -LiteralPath $refreshPath -Raw|ConvertFrom-Json
  if($refresh.Schema-ne1-or$refresh.Kind-ne'RichAudioCatalogSourceChange01'-or$refresh.RefreshId-cne$resolved.SourceArchiveRefreshId-or$refresh.GameExecutableSHA256-cne$resolved.InputBinding.GameExecutableSHA256){throw 'Fresh normal catalogue/metadata initialization is required for the changed source archive.'}
 }
 if((Get-FileHash -LiteralPath (Join-Path $cw 'CodeWalker.Core.dll') -Algorithm SHA256).Hash -ne $resolved.InputBinding.CodeWalkerCoreSHA256){throw 'Trusted parser differs from resolved catalogue.'}
 if((Get-FileHash -LiteralPath (Join-Path $game 'GTA5_Enhanced.exe') -Algorithm SHA256).Hash -ne $resolved.InputBinding.GameExecutableSHA256){throw 'Game executable differs from resolved catalogue.'}
 RunNode @('plan',$catalog,$ResolvedCatalogSHA256,$output,$game,$ObservationNotBeforeUtc) 'preindexing-all-selected-ybn'
 if($PlanOnly){Status 'planned-no-geometry-export' 'Every selected YBN is indexed; geometry export was not run.';Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw;return}
 $manifestPath=Join-Path $output 'manifest.json';$processedThisRun=0
 $plan=[IO.File]::ReadAllText((Join-Path $output 'driver-plan01.json'))|ConvertFrom-Json
 $visitedArchives=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 while($true){
  RunNode @('queue',$manifestPath,(Join-Path $output 'initial-observation01.json'),$ObservationNotBeforeUtc) 'prioritizing-complete-world-queue'
  $queue=[IO.File]::ReadAllText((Join-Path $output 'queue.json'))|ConvertFrom-Json
  $next=@($queue.Resources|Where-Object { !$visitedArchives.Contains([string]$_.PhysicalArchive) }|Select-Object -First 1)
  if(!$next.Count){break}
  if($processedThisRun -ge $MaximumResources){break}
  $archive=[string]$next[0].PhysicalArchive;$physical=Join-Path $game $archive
  $hashCommand='$stream=[IO.File]::OpenRead('+(Literal $physical)+');$sha=[Security.Cryptography.SHA256]::Create();try{$h=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace(''-'','''').ToLowerInvariant();[IO.File]::WriteAllText('+(Literal (Join-Path $output 'archive-hash.txt'))+',$h)}finally{$sha.Dispose();$stream.Dispose()}'
  RunOwned $hashCommand 'hashing-source-archive'
  $beforeHash=[IO.File]::ReadAllText((Join-Path $output 'archive-hash.txt')).Trim()
  $plan=[IO.File]::ReadAllText((Join-Path $output 'driver-plan01.json'))|ConvertFrom-Json
  $priorHashes=@($plan.Resources|Where-Object{$_.PhysicalArchive-eq$archive}|ForEach-Object ResultArchiveSHA256|Where-Object{$_}|Sort-Object -Unique)
  RunNode @('revalidate',$manifestPath,$archive,$beforeHash,$catalog,$ResolvedCatalogSHA256,$ObservationNotBeforeUtc) 'validating-private-geometry-cache'
  if(@($priorHashes|Where-Object{$_-cne$beforeHash}).Count){
   $refreshPath=Join-Path $output 'catalog-source-change01.json';$refresh=$null;if([IO.File]::Exists($refreshPath)-and(Get-Item -LiteralPath $refreshPath).Length-le8192){$refresh=Get-Content -LiteralPath $refreshPath -Raw|ConvertFrom-Json}
   $refreshed=$refresh-and$refresh.Schema-eq1-and$refresh.Kind-eq'RichAudioCatalogSourceChange01'-and$refresh.GameExecutableSHA256-ceq$resolved.InputBinding.GameExecutableSHA256-and$refresh.Archive-ceq$archive-and$refresh.ArchiveSHA256-ceq$beforeHash-and$resolved.SourceArchiveRefreshId-ceq$refresh.RefreshId
   if(!$refreshed){Json $refreshPath ([ordered]@{Schema=1;Kind='RichAudioCatalogSourceChange01';RefreshId=$runId;Archive=$archive;ArchiveSHA256=$beforeHash;GameExecutableSHA256=$resolved.InputBinding.GameExecutableSHA256;GeneratedUtc=[DateTimeOffset]::UtcNow.ToString('o');State='fresh-catalogue-initialization-required'});throw 'Current archive content changed; affected cache withdrawn and a fresh normal catalogue/metadata pass is required before decoding.'}
  }
  $localAnalyticBudget=[int][Math]::Floor([Math]::Max(1,[Math]::Min(15000,($MaximumSeconds-$clock.Elapsed.TotalSeconds-20)*1000)))
  RunNode @('upgrade-analytic',$manifestPath,(Join-Path $repo '.local'),$catalog,$ResolvedCatalogSHA256,[string]$localAnalyticBudget,$archive,$beforeHash) 'upgrading-revalidated-local-analytic-models'
  $plan=[IO.File]::ReadAllText((Join-Path $output 'driver-plan01.json'))|ConvertFrom-Json
  $remaining=$MaximumResources-$processedThisRun
  $ranks=@{};for($qi=0;$qi -lt $queue.Resources.Count;$qi++){$ranks[$queue.Resources[$qi].Id]=$qi}
  $pending=@($plan.Resources|Where-Object { $_.PhysicalArchive -eq $archive -and ($_.Status -eq 'pending-exterior-import' -or $_.PotentialStatus -eq 'pending-import') }|Sort-Object {$ranks[$_.Id]}|Select-Object -First ([Math]::Min(256,$remaining)))
  while($pending.Count -and $processedThisRun -lt $MaximumResources){
   $batchRoot=Join-Path $output ('runs\'+$runId+'-'+$script:phaseNumber);[IO.Directory]::CreateDirectory($batchRoot)|Out-Null
   $listPath=Join-Path $batchRoot 'entry-list.json';Json $listPath @($pending|ForEach-Object EntryPath)
   $exportPath=Join-Path $repo 'tools\Export-InstalledCollision.ps1'
   $command='$exportPath='+(Literal $exportPath)+'; & ([ScriptBlock]::Create([IO.File]::ReadAllText($exportPath))) -ExportScriptPath $exportPath -GameRoot '+(Literal $game)+' -CodeWalkerRoot '+(Literal $cw)+' -Archive '+(Literal $archive)+' -EntryListPath '+(Literal $listPath)+' -OutputRoot '+(Literal $batchRoot)+' -LoadKeys -HashArchive'
   RunOwned $command 'converting-bounded-potential-geometry-batch'
   RunNode @('accept',$manifestPath,(Join-Path $batchRoot 'batch-receipt.json'),$catalog,$ResolvedCatalogSHA256) 'qualifying-geometry-checkpoint'
   $processedThisRun+=$pending.Count
   $plan=[IO.File]::ReadAllText((Join-Path $output 'driver-plan01.json'))|ConvertFrom-Json
   $remaining=$MaximumResources-$processedThisRun
   RunNode @('queue',$manifestPath,(Join-Path $output 'initial-observation01.json'),$ObservationNotBeforeUtc) 'refreshing-initial-observation-priority'
   $queue=[IO.File]::ReadAllText((Join-Path $output 'queue.json'))|ConvertFrom-Json;$ranks=@{};for($qi=0;$qi -lt $queue.Resources.Count;$qi++){$ranks[$queue.Resources[$qi].Id]=$qi}
   $pending=@($plan.Resources|Where-Object { $_.PhysicalArchive -eq $archive -and ($_.Status -eq 'pending-exterior-import' -or $_.PotentialStatus -eq 'pending-import') }|Sort-Object {$ranks[$_.Id]}|Select-Object -First ([Math]::Min(256,$remaining)))
   $preferred=@($queue.Resources|Where-Object{!$visitedArchives.Contains([string]$_.PhysicalArchive)}|Select-Object -First 1)
   if($pending.Count-and$preferred.Count-and$preferred[0].PhysicalArchive-cne$archive){break} # Preempt only after a bounded source-bound checkpoint.
  }
  RunOwned $hashCommand 'verifying-source-archive-after-cache-work'
  $afterHash=[IO.File]::ReadAllText((Join-Path $output 'archive-hash.txt')).Trim()
  RunNode @('revalidate',$manifestPath,$archive,$afterHash,$catalog,$ResolvedCatalogSHA256,$ObservationNotBeforeUtc) 'binding-checkpoints-to-current-archive'
  if($beforeHash -ne $afterHash){Json (Join-Path $output 'catalog-source-change01.json') ([ordered]@{Schema=1;Kind='RichAudioCatalogSourceChange01';RefreshId=$runId;Archive=$archive;ArchiveSHA256=$afterHash;GameExecutableSHA256=$resolved.InputBinding.GameExecutableSHA256;GeneratedUtc=[DateTimeOffset]::UtcNow.ToString('o');State='fresh-catalogue-initialization-required'});throw 'Source archive changed during preparation; affected checkpoints invalidated.'}
  if(!$pending.Count){[void]$visitedArchives.Add($archive)}
 }
 # Per-archive upgrades already cover validated resources. A global retained-
 # receipt requalification here could promote unvisited rows after a budget cap.
 RunNode @('summarize',$manifestPath,'partial-or-selected-exterior-imported-with-explicit-gaps') 'saving-world-preparation-summary'
 Status 'bounded-preparation-finished' 'Check summary for pending resources, explicit gaps and runtime readiness.'
 Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw
}catch{
 $controlled=$ParentInvocationId -and $script:lastOwnedProcess -and ($script:budgetExhausted -or $script:lastOwnedProcess.State -eq 'deadline') -and $script:lastOwnedProcess.ControlJoined -and !$script:lastOwnedProcess.UnknownClosure -and !(Test-Path -LiteralPath $cancel)
 $checkpoint=[ordered]@{Schema=1;Kind='RichAudioInstalledGeometryContinuation01';ParentInvocationId=$ParentInvocationId;RunId=$runId;Cause=if($controlled){'budget-deadline'}else{'not-resumable'};ControlJoined=[bool]($script:lastOwnedProcess -and $script:lastOwnedProcess.ControlJoined);UnknownClosure=[bool](!$script:lastOwnedProcess -or $script:lastOwnedProcess.UnknownClosure);CanContinue=$false}
 $manifestFile=Join-Path $output 'manifest.json'
 if($controlled -and [IO.File]::Exists($manifestFile) -and (Get-Item -LiteralPath $manifestFile).Length -le 67108864){
  $snapshot=Get-Content -LiteralPath (Join-Path $output 'driver-plan01.json') -Raw|ConvertFrom-Json
  $eligible=@($snapshot.Resources|Where-Object { $_.Eligibility -eq 'eligible-exterior' -or $_.GeometryEligibility -eq 'eligible-resource-root' });$prepared=@($eligible|Where-Object { $_.Status -eq 'imported-exterior-incomplete-surfaces' -or $_.PotentialStatus -eq 'imported-resource-root-incomplete-surfaces' }).Count;$failed=@($eligible|Where-Object { $_.Status -eq 'deferred-resource-import-failed' -or $_.PotentialStatus -eq 'failed-resource-import' }).Count
  $checkpoint.CanContinue=($snapshot.ResolvedCatalogSHA256 -ceq $ResolvedCatalogSHA256 -and $eligible.Count-$prepared -gt $failed)
  $checkpoint.CatalogSHA256=$ResolvedCatalogSHA256;$checkpoint.ManifestSHA256=Get-PreparationHash $manifestFile;$checkpoint.PendingResources=$eligible.Count-$prepared;$checkpoint.FailedResources=$failed;$checkpoint.EligibleResources=$eligible.Count
 }
 Json (Join-Path $output 'continuation-checkpoint.json') $checkpoint
 Status 'interrupted-or-failed' $_.Exception.Message;throw
}finally{Metrics;$lease.Dispose()}
