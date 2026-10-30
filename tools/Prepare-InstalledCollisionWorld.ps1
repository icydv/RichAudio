# Resumable offline preparation only. Never called from a game/audio callback.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
 [Parameter(Mandatory=$true)][string]$ResolvedCatalogPath,
 [Parameter(Mandatory=$true)][string]$ResolvedCatalogSHA256,
 [string]$OutputRoot='.local/installed-collision-world',
 [ValidateRange(5,3600)][int]$MaximumSeconds=300,
 [ValidateRange(1,256)][int]$MaximumResources=16,
 [ValidateRange(256,4096)][int]$MaximumMemoryMiB=2048,
 [string]$PrepareScriptPath='',
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
$clock=[Diagnostics.Stopwatch]::StartNew();$runId=[Guid]::NewGuid().ToString('N');$cancel=Join-Path $output 'cancel.request';$statusPath=Join-Path $output 'status.json';$script:phaseNumber=0
function Literal([string]$Text){return "'"+$Text.Replace("'","''")+"'"}
function Json([string]$Path,$Value){$pending=$Path+'.pending-'+$runId;[IO.File]::WriteAllText($pending,($Value|ConvertTo-Json -Depth 16 -Compress),(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($Path)){[IO.File]::Replace($pending,$Path,[NullString]::Value)}else{[IO.File]::Move($pending,$Path)}}
function Status([string]$State,[string]$Detail){Json $statusPath ([ordered]@{Schema=1;RunId=$runId;State=$State;Detail=$Detail;ElapsedSeconds=[Math]::Round($clock.Elapsed.TotalSeconds,3);Completed=$false;Resumable=$true;GameWrites=$false;EndpointOpened=$false;RuntimeReplacementImplemented=$false})}
function RunOwned([string]$Command,[string]$Phase){
 if(Test-Path -LiteralPath $cancel){throw 'World preparation cancelled; checkpoints retained.'}
 if($clock.Elapsed.TotalSeconds -ge $MaximumSeconds){throw 'World preparation deadline; checkpoints retained.'}
 Status $Phase 'Owned offline helper is running; no game or audio endpoint is open.'
 $script:phaseNumber++;$stageOutput=Join-Path $output ('phase-'+$runId+'-'+$script:phaseNumber)
 $framework=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $remaining=[Math]::Max(0.1,$MaximumSeconds-$clock.Elapsed.TotalSeconds)
 $commandWithLocation='Set-Location -LiteralPath '+(Literal $repo)+';'+$Command
 $result=Invoke-PreparationProcess -Executable $framework -CommandText $commandWithLocation -PrivateRoot $output -StageOutput $stageOutput -CancellationPath $cancel -MaximumSeconds $remaining -MaximumMemoryMiB $MaximumMemoryMiB -MaximumOwnedProcesses 8
 if(!$result.Completed){throw ('Owned '+$Phase+' helper '+$result.State+'; checkpoints retained. Inspect private phase stderr.')}
}
function RunNode([string[]]$Values,[string]$Phase){$parts=@('& node',(Literal (Join-Path $repo 'src\acoustics\world\world-warmup.mjs')));foreach($value in $Values){$parts+=Literal $value};RunOwned (($parts -join ' ')+'; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}') $Phase}
try{
 if($ResolvedCatalogSHA256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Pinned resolved catalogue SHA-256 required.'}
 $catalog=[IO.Path]::GetFullPath($ResolvedCatalogPath)
 if((Get-FileHash -LiteralPath $catalog -Algorithm SHA256).Hash -ne $ResolvedCatalogSHA256){throw 'Resolved catalogue content changed.'}
 $resolved=[IO.File]::ReadAllText($catalog)|ConvertFrom-Json
 if((Get-FileHash -LiteralPath (Join-Path $cw 'CodeWalker.Core.dll') -Algorithm SHA256).Hash -ne $resolved.InputBinding.CodeWalkerCoreSHA256){throw 'Trusted parser differs from resolved catalogue.'}
 if((Get-FileHash -LiteralPath (Join-Path $game 'GTA5_Enhanced.exe') -Algorithm SHA256).Hash -ne $resolved.InputBinding.GameExecutableSHA256){throw 'Game executable differs from resolved catalogue.'}
 RunNode @('plan',$catalog,$ResolvedCatalogSHA256,$output,$game) 'preindexing-all-selected-ybn'
 if($PlanOnly){Status 'planned-no-geometry-export' 'Every selected YBN is indexed; geometry export was not run.';Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw;return}
 $manifestPath=Join-Path $output 'manifest.json';$processedThisRun=0
 $plan=[IO.File]::ReadAllText($manifestPath)|ConvertFrom-Json
 $groups=@($plan.Resources|Where-Object Eligibility -EQ 'eligible-exterior'|Group-Object PhysicalArchive)
 foreach($group in $groups){
  if($processedThisRun -ge $MaximumResources){break}
  $archive=[string]$group.Name;$physical=Join-Path $game $archive
  $hashCommand='$stream=[IO.File]::OpenRead('+(Literal $physical)+');$sha=[Security.Cryptography.SHA256]::Create();try{$h=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace(''-'','''').ToLowerInvariant();[IO.File]::WriteAllText('+(Literal (Join-Path $output 'archive-hash.txt'))+',$h)}finally{$sha.Dispose();$stream.Dispose()}'
  RunOwned $hashCommand 'hashing-source-archive'
  $beforeHash=[IO.File]::ReadAllText((Join-Path $output 'archive-hash.txt')).Trim()
  RunNode @('revalidate',$manifestPath,$archive,$beforeHash,$catalog,$ResolvedCatalogSHA256) 'validating-private-geometry-cache'
  $plan=[IO.File]::ReadAllText($manifestPath)|ConvertFrom-Json
  $remaining=$MaximumResources-$processedThisRun
  $pending=@($plan.Resources|Where-Object { $_.PhysicalArchive -eq $archive -and $_.Status -eq 'pending-exterior-import' }|Select-Object -First $remaining)
  if($pending.Count){
   $batchRoot=Join-Path $output ('runs\'+$runId+'-'+$script:phaseNumber);[IO.Directory]::CreateDirectory($batchRoot)|Out-Null
   $listPath=Join-Path $batchRoot 'entry-list.json';Json $listPath @($pending|ForEach-Object EntryPath)
   $exportPath=Join-Path $repo 'tools\Export-InstalledCollision.ps1'
   $command='$exportPath='+(Literal $exportPath)+'; & ([ScriptBlock]::Create([IO.File]::ReadAllText($exportPath))) -ExportScriptPath $exportPath -GameRoot '+(Literal $game)+' -CodeWalkerRoot '+(Literal $cw)+' -Archive '+(Literal $archive)+' -EntryListPath '+(Literal $listPath)+' -OutputRoot '+(Literal $batchRoot)+' -LoadKeys -HashArchive'
   RunOwned $command 'converting-bounded-exterior-batch'
   RunNode @('accept',$manifestPath,(Join-Path $batchRoot 'batch-receipt.json'),$catalog,$ResolvedCatalogSHA256) 'qualifying-geometry-checkpoint'
   $processedThisRun+=$pending.Count
  }
  RunOwned $hashCommand 'verifying-source-archive-after-cache-work'
  $afterHash=[IO.File]::ReadAllText((Join-Path $output 'archive-hash.txt')).Trim()
  RunNode @('revalidate',$manifestPath,$archive,$afterHash,$catalog,$ResolvedCatalogSHA256) 'binding-checkpoints-to-current-archive'
  if($beforeHash -ne $afterHash){throw 'Source archive changed during preparation; affected checkpoints invalidated.'}
 }
 RunNode @('summarize',$manifestPath,'partial-or-selected-exterior-imported-with-explicit-gaps') 'saving-world-preparation-summary'
 Status 'bounded-preparation-finished' 'Check summary for pending resources, explicit gaps and runtime readiness.'
 Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw
}catch{Status 'interrupted-or-failed' $_.Exception.Message;throw}finally{$lease.Dispose()}
