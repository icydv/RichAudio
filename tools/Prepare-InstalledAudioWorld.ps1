# Executable installation preparation only. No runtime plugin, native audio or endpoint actions.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,
      [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
      [string]$OutputRoot='.local/installed-audio-world',
      [ValidateRange(20,3600)][int]$MaximumSeconds=900,
      [ValidateRange(5,900)][int]$MaximumStageSeconds=300,
      [ValidateRange(256,4096)][int]$MaximumMemoryMiB=3072,
      [ValidateRange(1,128)][int]$MaximumGeometryResources=16,
      [switch]$ImportQualifiedGeometry,
      [switch]$ForceRefresh)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($PSVersionTable.PSEdition -ne 'Core'){throw 'Run with installed PowerShell 7 (pwsh)'}
$repo=Split-Path $PSScriptRoot -Parent
$lifecycle=Join-Path $repo 'src\acoustics\startup\CatalogLifecycle.psm1'
$integration=Join-Path $repo 'src\acoustics\integration\PreparationCoordinator.psm1'
foreach($module in @($lifecycle,$integration)){Import-Module (New-Module -Name ('Preparation'+[Guid]::NewGuid().ToString('N')) -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($module)))) -Force}
$private=Join-Path $repo '.local'
$output=if([IO.Path]::IsPathRooted($OutputRoot)){[IO.Path]::GetFullPath($OutputRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))}
[void](Assert-CatalogPrivatePath $private (Join-Path $output 'placeholder'))
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\');$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
foreach($inputRoot in @($game,$cw)){if($output -eq $inputRoot -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Preparation output/input overlap'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$cancel=Join-Path $output 'cancel.request'
if([IO.File]::Exists($cancel)){throw 'Preparation cancellation request exists; acknowledge it before resuming'}
$lockPath=Assert-CatalogPrivatePath $output (Join-Path $output 'preparation.lock')
$lease=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$watch=[Diagnostics.Stopwatch]::StartNew();$runId=[Guid]::NewGuid().ToString('N');$stageResults=New-Object Collections.Generic.List[object]
$catalogTool=Join-Path $repo 'tools\Build-InstalledAcousticCatalog.ps1';$resolverTool=Join-Path $repo 'tools\Resolve-InstalledGameCache.ps1';$geometryTool=Join-Path $repo 'tools\Prepare-InstalledCollisionWorld.ps1'
$executable=(Get-Process -Id $PID).Path
function Publish([string]$Path,$Value,[int]$Depth=20){[void](Write-CatalogAtomicJson -PrivateRoot $output -Path $Path -Value $Value -Depth $Depth)}
function Input-Binding {
    $exe=Join-Path $game 'GTA5_Enhanced.exe';$core=Join-Path $cw 'CodeWalker.Core.dll'
    foreach($file in @($exe,$core,$catalogTool,$resolverTool)){if(![IO.File]::Exists($file)){throw 'Required installed/parser/preparation input missing'}}
    $installedFiles=@(Get-ChildItem -LiteralPath $game -File -Recurse|Sort-Object FullName)
    if($installedFiles.Count -gt 100000){throw 'Installed file identity count bound exceeded'}
    $archives=@($installedFiles|Where-Object Extension -EQ '.rpf')
    if($archives.Count -gt 2048){throw 'Installed archive identity count bound exceeded'}
    $archiveIdentity=@($archives|ForEach-Object{if($_.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked archive identity unsupported'};[ordered]@{Path=$_.FullName.Substring($game.Length+1).Replace('\','/');Bytes=$_.Length;WriteUtc=$_.LastWriteTimeUtc.ToString('o')}})
    $looseIdentity=@($installedFiles|Where-Object{$_.Extension -in @('.ymap','.ytyp','.ybn','.meta','.xml','.ini','.json','.dll','.asi')}|ForEach-Object{if($_.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked loose resource identity unsupported'};[ordered]@{Path=$_.FullName.Substring($game.Length+1).Replace('\','/');Bytes=$_.Length;WriteUtc=$_.LastWriteTimeUtc.ToString('o')}})
    $loaders=@(Get-ChildItem -LiteralPath $game -File|Where-Object{$_.Extension -in @('.asi','.ini') -or $_.Name -in @('dinput8.dll','dsound.dll','xinput1_4.dll','RAGEPluginHook.exe')}|Sort-Object Name|ForEach-Object{[ordered]@{Name=$_.Name;SHA256=Get-PreparationHash $_.FullName}})
    $sourceFiles=@($PSCommandPath,$lifecycle,$integration,$catalogTool,$resolverTool)
    if([IO.File]::Exists($geometryTool)){$sourceFiles+=$geometryTool}
    foreach($area in @('src\acoustics\startup','src\acoustics\world')){if(Test-Path -LiteralPath (Join-Path $repo $area)){$sourceFiles+=@(Get-ChildItem -LiteralPath (Join-Path $repo $area) -File -Recurse|Where-Object{$_.Extension -in @('.ps1','.psm1','.mjs','.js','.cs','.json')}|ForEach-Object FullName)}}
    $sources=@($sourceFiles|Sort-Object -Unique|ForEach-Object{[ordered]@{Path=$_.Substring($repo.Length+1).Replace('\','/');SHA256=Get-PreparationHash $_}})
    return [ordered]@{GameVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe).FileVersion;GameExecutableSHA256=Get-PreparationHash $exe;CodeWalkerCoreSHA256=Get-PreparationHash $core;PowerShellSHA256=Get-PreparationHash $executable;Archives=$archiveIdentity;LooseResourceMetadata=$looseIdentity;RootLoaderBindings=$loaders;Sources=$sources;ModsDirectoryPresent=(Test-Path -LiteralPath (Join-Path $game 'mods') -PathType Container);PluginDirectoryPresent=(Test-Path -LiteralPath (Join-Path $game 'Plugins') -PathType Container);ArchiveContentHashesComplete=$false;CustomRuntimeMountsObserved=$false;GeometryPlanOnly=(!$ImportQualifiedGeometry);MaximumGeometryResources=$MaximumGeometryResources}
}
function Stage([string]$Name,[string]$Tool,[string]$Arguments,[string[]]$Artifacts,[string]$DependencyFingerprint='') {
    if([IO.File]::Exists($cancel)){throw 'Preparation cancelled'}
    $stageOutput=Join-Path $output $Name
    [void](Assert-CatalogPrivatePath $output (Join-Path $stageOutput 'placeholder'))
    [IO.Directory]::CreateDirectory($stageOutput)|Out-Null
    $stageFingerprint=Get-PreparationFingerprint ([ordered]@{Workflow=$fingerprint;Stage=$Name;Dependency=$DependencyFingerprint})
    $receiptPath=Join-Path $output ('receipts\'+$Name+'-'+$stageFingerprint+'.json')
    $receipt=Read-CatalogCacheJson -PrivateRoot $output -Path $receiptPath -ExpectedFingerprint $stageFingerprint
    if(!$ForceRefresh -and (Test-PreparationReceipt $output $receipt $stageFingerprint)){
        $stageResults.Add([pscustomobject]@{Stage=$Name;State='reused';Completed=$true;Receipt=$receiptPath});return
    }
    $remaining=$MaximumSeconds-$watch.Elapsed.TotalSeconds-3
    if($remaining -lt 5){throw 'Preparation workflow deadline before next stage'}
    $budget=[int][Math]::Floor([Math]::Min($MaximumStageSeconds,$remaining))
    if(![IO.File]::Exists($Tool)){$stageResults.Add([pscustomobject]@{Stage=$Name;State='unavailable';Completed=$false});throw 'Preparation stage driver is unavailable'}
    Publish (Join-Path $output 'status.json') ([ordered]@{RunId=$runId;State='running';Stage=$Name;ElapsedSeconds=$watch.Elapsed.TotalSeconds;ReadyForGameLaunch=$false})
    $command='& '+(ConvertTo-PreparationLiteral $Tool)+' -GameRoot '+(ConvertTo-PreparationLiteral $game)+' -CodeWalkerRoot '+(ConvertTo-PreparationLiteral $cw)+' -OutputRoot '+(ConvertTo-PreparationLiteral $stageOutput)+' -MaximumSeconds '+$budget+' '+$Arguments
    $process=Invoke-PreparationProcess -Executable $executable -CommandText $command -PrivateRoot $output -StageOutput $stageOutput -CancellationPath $cancel -MaximumSeconds $budget -MaximumMemoryMiB $MaximumMemoryMiB
    $artifactRows=@()
    if($process.Completed){foreach($relative in $Artifacts){$path=Assert-CatalogPrivatePath $output (Join-Path $stageOutput $relative);if(![IO.File]::Exists($path)){throw 'Completed stage omitted a required artifact'};$artifactRows+=[ordered]@{RelativePath=$path.Substring($output.Length+1).Replace('\','/');SHA256=Get-PreparationHash $path;Bytes=(Get-Item -LiteralPath $path).Length}}}
    $receipt=[ordered]@{Schema=1;Fingerprint=$stageFingerprint;WorkflowFingerprint=$fingerprint;DependencyFingerprint=$DependencyFingerprint;Stage=$Name;Completed=[bool]$process.Completed;GeneratedUtc=[DateTime]::UtcNow.ToString('o');Process=$process;Artifacts=$artifactRows}
    Publish $receiptPath $receipt
    $stageResults.Add([pscustomobject]@{Stage=$Name;State=$process.State;Completed=[bool]$process.Completed;Receipt=$receiptPath})
    if(!$process.Completed){throw ('Preparation stage '+$Name+' '+$process.State)}
}
$failure=$null;$readiness=$null
try {
    $binding=Input-Binding;$fingerprint=Get-PreparationFingerprint $binding
    Publish (Join-Path $output 'input-binding.json') ([ordered]@{Schema=1;Fingerprint=$fingerprint;Binding=$binding})
    Stage 'catalog' $catalogTool '' @('catalog.json','summary.json','current-input-binding.json')
    $catalogPath=Join-Path $output 'catalog\catalog.json'
    $catalogHash=Get-PreparationHash $catalogPath
    Stage 'resolved' $resolverTool ('-ReferenceCatalogPath '+(ConvertTo-PreparationLiteral $catalogPath)+' -VerifyBankStreams -MaximumMemoryMiB '+$MaximumMemoryMiB) @('resolved-catalog.json','summary.json') $catalogHash
    $resolvedPath=Join-Path $output 'resolved\resolved-catalog.json';$resolvedHash=Get-PreparationHash $resolvedPath
    $geometryArguments='-ResolvedCatalogPath '+(ConvertTo-PreparationLiteral $resolvedPath)+' -ResolvedCatalogSHA256 '+(ConvertTo-PreparationLiteral $resolvedHash)+' -MaximumResources '+$MaximumGeometryResources+' -MaximumMemoryMiB '+$MaximumMemoryMiB
    if(!$ImportQualifiedGeometry){$geometryArguments+=' -PlanOnly'}
    Stage 'geometry' $geometryTool $geometryArguments @('summary.json','manifest.json') $resolvedHash
    $stable=(Get-PreparationFingerprint (Input-Binding)) -ceq $fingerprint
    $catalog=Get-Content -LiteralPath (Join-Path $output 'catalog\summary.json') -Raw|ConvertFrom-Json
    $resolved=Get-Content -LiteralPath $resolvedPath -Raw|ConvertFrom-Json
    $geometry=Get-Content -LiteralPath (Join-Path $output 'geometry\summary.json') -Raw|ConvertFrom-Json
    $sameGame=$catalog.GameExecutableSHA256 -ceq $binding.GameExecutableSHA256 -and $resolved.InputBinding.GameExecutableSHA256 -ceq $binding.GameExecutableSHA256 -and $resolved.ReferenceCoverage.ReferenceCatalogSHA256 -ceq $catalogHash -and $geometry.ResolvedCatalogSHA256 -ceq $resolvedHash -and $geometry.InputBinding.GameExecutableSHA256 -ceq $binding.GameExecutableSHA256
    $readiness=Get-InstalledPreparationReadiness $catalog $resolved $geometry -InputsStable ($stable -and $sameGame) -StagesCompleted ($stageResults.Count -eq 3 -and @($stageResults|Where-Object{!$_.Completed}).Count -eq 0)
    if(!$readiness.PreparationCompleted){throw 'Preparation artifacts are incomplete or current input bindings changed'}
} catch {$failure=$_.Exception.Message}
finally {
    if(!$readiness){$readiness=Get-InstalledPreparationReadiness $null $null $null}
    Publish (Join-Path $output 'preparation.json') ([ordered]@{Schema=1;RunId=$runId;State=if($failure){'incomplete'}else{'prepared-with-explicit-gaps'};Failure=$failure;Stages=$stageResults.ToArray();Readiness=$readiness;GameWrites=$false;EndpointOpened=$false;GameLaunched=$false})
    Publish (Join-Path $output 'summary.json') ([ordered]@{Schema=1;State=if($failure){'incomplete'}else{'prepared-with-explicit-gaps'};PreparationCompleted=$readiness.PreparationCompleted;InputsStable=$readiness.InputsStable;VehicleModels=$readiness.VehicleModels;ChannelLinks=$readiness.ChannelLinks;VerifiedBankStreamLinks=$readiness.VerifiedBankStreamLinks;UnresolvedBankStreamLinks=$readiness.UnresolvedBankStreamLinks;GeometryProcessedResources=$readiness.GeometryProcessedResources;GeometryPendingResources=$readiness.GeometryPendingResources;GeometryBlockedResources=$readiness.GeometryBlockedResources;AllSelectedExteriorImported=$readiness.AllSelectedExteriorImported;FullArchiveContentFreshnessVerified=$false;CustomRuntimeMountsObserved=$false;DecodedSourcesReady=$false;AcousticWorldComplete=$false;StartupPluginHookImplemented=$false;NativeAudioSuppressionVerified=$false;LiveGainChainVerified=$false;RuntimeReplacementImplemented=$false;ReadyForGameLaunch=$false;GameWrites=$false;EndpointOpened=$false;GameLaunched=$false;Stages=@($stageResults|Select-Object Stage,State,Completed);ElapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds,3)})
    Publish (Join-Path $output 'status.json') ([ordered]@{RunId=$runId;State=if($failure){'incomplete'}else{'complete'};PreparationCompleted=$readiness.PreparationCompleted;ReadyForGameLaunch=$false})
    $lease.Dispose()
}
Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw
if($failure){throw $failure}
