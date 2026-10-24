# Read-only game/runtime inspection. Reports only; no install, launch or security changes.
[CmdletBinding()]
param(
    [string]$GameRoot='__GAME_ROOT__',
    [string]$RuntimeDirectory='',
    [string]$OutputRoot='evidence\phase2.1'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\','/')
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\','/')
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo $OutputRoot}
$output=[IO.Path]::GetFullPath($OutputRoot).TrimEnd('\','/')
function Within([string]$Path,[string]$Root){
    return $Path.Equals($Root,[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)
}
if(!(Within $output $repo) -or (Within $output $game)){throw 'Reports must stay in the separate RichAudio workspace, outside the game.'}
foreach($protected in @('__USER_HOME__\Desktop\CodeWalker30_dev46','__USER_HOME__\Downloads\6d0158-OpenRPF')){
    if(Within $output ([IO.Path]::GetFullPath($protected))){throw 'Protected input directory cannot be used for reports.'}
}
for($parent=New-Object IO.DirectoryInfo($output);$null -ne $parent;$parent=$parent.Parent){
    if($parent.Exists -and ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point report paths are unsupported.'}
}
if(!(Test-Path -LiteralPath $game -PathType Container)){throw 'Game directory not found; no report was written.'}
if(!$RuntimeDirectory -and (Test-Path -LiteralPath (Join-Path $repo '.local\rph\runtime-9695-1158.16'))){$RuntimeDirectory=Join-Path $repo '.local\rph\runtime-9695-1158.16'}
if($RuntimeDirectory){
    $RuntimeDirectory=[IO.Path]::GetFullPath($RuntimeDirectory).TrimEnd('\','/')
    if(!(Within $RuntimeDirectory (Join-Path $repo '.local')) -or (Within $RuntimeDirectory $game)){
        throw 'Extract the authentic runtime package under RichAudio\.local, never into GTA.'
    }
    if(!(Test-Path -LiteralPath $RuntimeDirectory -PathType Container)){throw 'Runtime directory not found.'}
    for($parent=New-Object IO.DirectoryInfo($RuntimeDirectory);$null -ne $parent;$parent=$parent.Parent){
        if($parent.Exists -and ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point runtime paths are unsupported.'}
    }
    if(Within $output $RuntimeDirectory){throw 'Reports must not change the extracted runtime package.'}
}
function Artifact([string]$Path){
    $file=Get-Item -LiteralPath $Path
    $row=[ordered]@{Path=$file.FullName;Bytes=$file.Length;SHA256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
    if($file.Extension -in '.dll','.exe','.asi'){
        $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($file.FullName)
        $row.FileVersion=$version.FileVersion;$row.ProductVersion=$version.ProductVersion
        # AssemblyName reads metadata; it does not execute package code or load plugins.
        try{$row.AssemblyIdentity=[Reflection.AssemblyName]::GetAssemblyName($file.FullName).FullName}catch{$row.AssemblyIdentity=$null}
        $sig=Get-AuthenticodeSignature -LiteralPath $file.FullName
        $row.SignatureStatus=[string]$sig.Status
        $row.Signer=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null}
        $row.SignerThumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{$null}
    }
    return [pscustomobject]$row
}
$blockers=New-Object 'Collections.Generic.List[string]'
$gameExe=Join-Path $game 'GTA5_Enhanced.exe'
$gameBinary=if(Test-Path -LiteralPath $gameExe){Artifact $gameExe}else{$null}
if(!$gameBinary -or $gameBinary.FileVersion -ne '1.0.1158.16'){$blockers.Add('Exact supported game build 1.0.1158.16 was not established.')}
$sdkPath=Join-Path $repo '.local\rph\sdk\RagePluginHookSDK.dll'
$sdk=if(Test-Path -LiteralPath $sdkPath){Artifact $sdkPath}else{$null}
if(!$sdk -or $sdk.SHA256 -ne '5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){$blockers.Add('Reviewed compile-time SDK is missing or changed.')}
$pins=Get-Content (Join-Path $repo 'evidence\phase2\compiled-assemblies.json') -Raw | ConvertFrom-Json
$pluginPath=Join-Path $repo 'build\telemetry\RichAudio.Telemetry.Rph.dll'
$plugin=if(Test-Path -LiteralPath $pluginPath){Artifact $pluginPath}else{$null}
if(!$plugin -or $plugin.SHA256 -ne ($pins | Where-Object File -eq 'RichAudio.Telemetry.Rph.dll').SHA256){$blockers.Add('Compiled plugin differs from the P2-01 audited artifact.')}
foreach($pin in (Get-Content (Join-Path $repo 'evidence\phase2\source-fingerprints.json') -Raw | ConvertFrom-Json)){
    if((Get-FileHash -LiteralPath (Join-Path $repo $pin.File) -Algorithm SHA256).Hash -ne $pin.SHA256){$blockers.Add('Telemetry source changed since its recorded audit.');break}
}
$configPath=Join-Path $repo 'config\RichAudio.Telemetry.Rph.json'
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if($config.StoryModeAcknowledged -or $config.CaptureEnabled){$blockers.Add('Default capture/Story Mode acknowledgement must remain disabled pending approval.')}
$gameFiles=@(Get-ChildItem -LiteralPath $game -File | Where-Object {$_.Extension -ne '.rpf'} | Sort-Object Name | ForEach-Object {Artifact $_.FullName})
$loaderNames=@('RAGEPluginHook.exe','RagePluginHook.dll','OpenRPF.asi','OpenIV.asi','dinput8.dll','dsound.dll','xinput1_4.dll','ScriptHookV.dll','RAGEPluginHook.ini')
$loaders=@($gameFiles | Where-Object {[IO.Path]::GetFileName($_.Path) -in $loaderNames})
$runtime=@();$sdkComparisons=@()
if($RuntimeDirectory){
    # Inspect directories explicitly, rejecting junctions before descending.
    $pending=New-Object 'Collections.Generic.Queue[string]';$pending.Enqueue($RuntimeDirectory)
    $files=New-Object 'Collections.Generic.List[object]';$directories=0
    while($pending.Count){
        $directories++;if($directories -gt 4096){throw 'Runtime directory bound exceeded.'}
        foreach($item in (Get-ChildItem -LiteralPath $pending.Dequeue() -Force)){
            if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Runtime package contains a reparse point.'}
            if($item.PSIsContainer){$pending.Enqueue($item.FullName)}else{$files.Add($item)}
            if($files.Count -gt 4096 -or $pending.Count -gt 4096){throw 'Runtime inventory bound exceeded.'}
        }
    }
    $runtime=@($files | Sort-Object FullName | ForEach-Object {Artifact $_.FullName})
    $sdkComparisons=@($runtime | Where-Object {[IO.Path]::GetFileName($_.Path) -eq 'RagePluginHookSDK.dll'} | ForEach-Object {
        [pscustomobject]@{Path=$_.Path;SHA256=$_.SHA256;AssemblyIdentity=$_.AssemblyIdentity;SameBytesAsCompiledSdk=($sdk -and $_.SHA256 -eq $sdk.SHA256);SameAssemblyIdentity=($sdk -and $_.AssemblyIdentity -eq $sdk.AssemblyIdentity)}
    })
    $blockers.Add('Runtime public-member binding cannot be proved by the standard metadata reader; SDK 1.124 vs runtime 1.132 requires an authorised load test. No bundled SDK exists in this official archive.')
}else{$blockers.Add('Authentic 9695 / Enhanced 1158.16 runtime package is missing; official download returned HTTP 403 on 24 October 2026.')}
$blockers.Add('Supported Story Mode launch must satisfy the no-security-changes constraint. No antivirus, anti-cheat, exclusions or launcher protections are changed by this tool.')
$blockers.Add('Standalone RPH startup, DirectStorage/proxy compatibility and all in-game A-E tests remain unexecuted.')
$blockers.Add('Explicit user approval for system prerequisite installation and exact game-file additions is still required.')
if(@('MSVCR100.dll','MSVCP100.dll') | Where-Object {!(Test-Path -LiteralPath (Join-Path "$env:WINDIR\System32" $_))}){
    $blockers.Add('Bundled x64 SlimDX imports VC2010 libraries absent from the checked System32 paths; resolve the signed prerequisite before deployment. See host-prerequisites.json for additional probes.')
}
$proposed=@()
if($plugin){$proposed+= [pscustomobject]@{Source=$pluginPath;Destination=(Join-Path $game 'Plugins\RichAudio.Telemetry.Rph.dll');SHA256=$plugin.SHA256;Bytes=$plugin.Bytes;Action='Add only after approval; if destination exists, back up and review first.'}}
$configArtifact=Artifact $configPath
$proposed+=[pscustomobject]@{Source=$configPath;Destination=(Join-Path $game 'Plugins\RichAudio.Telemetry.Rph.json');SHA256=$configArtifact.SHA256;Bytes=$configArtifact.Bytes;Action='Candidate only: acknowledgements/capture remain false; final approved test configuration needs its own exact hash.'}
$manifest=[ordered]@{
    SchemaVersion=1;GeneratedUtc=[DateTime]::UtcNow.ToString('o');AdapterBaseCommit='648199c57f4da3f19efb17880211fac8ba59e8a4'
    State='BLOCKED';FinalDeploymentManifest=$false;InstallationAuthorised=$false;GameWritesPerformed=$false;GameLaunched=$false
    ExpectedGameVersion='1.0.1158.16';Game=$gameBinary;CompileSdk=$sdk;Plugin=$plugin
    ProposedRichAudioFiles=$proposed;SelectedRuntimeFiles=@();RuntimeInventory=$runtime;BundledSdkComparison=$sdkComparisons
    ExistingGameFiles=$gameFiles;ExistingLoaders=$loaders;Blockers=@($blockers)
    DependencyEvidence='Real package inventoried; native/delay imports and readable CLR references are in pe-dependencies.json. Dynamic dependency closure and runtime public-member ABI remain unverified; no runtime code executed.'
    BackupProcedure='Before authorised replacement, copy each exact existing destination to a separate timestamped development backup; verify matching SHA256; journal originally absent paths and configuration. Stop on drift.'
    RollbackProcedure='Exit game/RPH. Remove only unchanged files introduced by the approved final manifest; restore verified pre-existing files and configuration. Preserve edited files and captures. Recheck baseline hashes. Never restore/delete original RPF archives.'
}
[IO.Directory]::CreateDirectory($output) | Out-Null
$manifest | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $output 'deployment-candidate.json') -Encoding utf8
# An exact, reviewable proposal for the first standalone load. It never authorises installation.
if($RuntimeDirectory -and (Test-Path -LiteralPath (Join-Path $repo 'evidence\phase2.1\package-inspection.json'))){
    $package=Get-Content (Join-Path $repo 'evidence\phase2.1\package-inspection.json') -Raw | ConvertFrom-Json
    if(!$RuntimeDirectory.Equals($package.StageDirectory,[StringComparison]::OrdinalIgnoreCase)){throw 'Only the reviewed official staging directory can generate the file proposal.'}
    if((Get-FileHash -LiteralPath $package.SourcePath).Hash -ne $package.SHA256){throw 'Package drift: inspect the package again.'}
    if($package.StagedArtifacts.Count -ne $runtime.Count){throw 'Runtime stage membership drift; repeat official package inspection.'}
    foreach($pin in $package.StagedArtifacts){
        $match=@($runtime | Where-Object Path -eq (Join-Path $RuntimeDirectory $pin.Name))
        if($match.Count -ne 1 -or $match[0].SHA256 -ne $pin.SHA256){throw 'Runtime stage fingerprint drift.'}
    }
    $install=@()
    foreach($file in $runtime | Where-Object { (Split-Path -Parent $_.Path).Equals($RuntimeDirectory,[StringComparison]::OrdinalIgnoreCase) }){
        $install+=[pscustomobject]@{Source=$file.Path;Destination=(Join-Path $game (Split-Path $file.Path -Leaf));SHA256=$file.SHA256;Bytes=$file.Bytes;Role='Vendor-prescribed runtime root file; not a proven minimum dependency closure'}
    }
    if($plugin){$install+=[pscustomobject]@{Source=$plugin.Path;Destination=(Join-Path $game 'Plugins\RichAudio.Telemetry.Rph.dll');SHA256=$plugin.SHA256;Bytes=$plugin.Bytes;Role='Telemetry-only plugin; manually load after standalone RPH baseline'}}
    $testConfig=Artifact (Join-Path $repo 'config\phase2.1\StoryMode-test.json')
    $install+=[pscustomobject]@{Source=$testConfig.Path;Destination=(Join-Path $game 'Plugins\RichAudio.Telemetry.Rph.json');SHA256=$testConfig.SHA256;Bytes=$testConfig.Bytes;Role='Prepared Story Mode test config; capture disabled; deployment requires operator acknowledgement'}
    foreach($file in $install){
        $prior=if(Test-Path -LiteralPath $file.Destination){Artifact $file.Destination}else{$null}
        $file | Add-Member -NotePropertyName PriorState -NotePropertyValue $(if($prior){'EXISTS: stop and review backup/replacement'}else{'ABSENT'})
        $file | Add-Member -NotePropertyName PriorSHA256 -NotePropertyValue $(if($prior){$prior.SHA256}else{$null})
    }
    $missingVc=@('MSVCR100.dll','MSVCP100.dll') | Where-Object {!(Test-Path -LiteralPath (Join-Path "$env:WINDIR\System32" $_))}
    [ordered]@{
        SchemaVersion=1;GeneratedUtc=[DateTime]::UtcNow.ToString('o');Scope='Exact proposed first standalone-load file set, not a validated runtime installation'
        State='AWAITING_PREREQUISITE_REVIEW_AND_EXPLICIT_APPROVAL';InstallationAuthorised=$false;GameWritesPerformed=$false;ReadyForGameplay=$false
        ExpectedGameVersion='1.0.1158.16';ExpectedGameSHA256=$gameBinary.SHA256
        ExpectedRuntimeVersion='1.132.1428.17748';PackageSHA256=$package.SHA256
        GameRoot=$game;Files=$install;GameFileCount=$install.Count;TotalCopyBytes=($install | Measure-Object Bytes -Sum).Sum
        Excluded='All lspdfr/ and plugins/ archive entries; SDK; OpenRPF; ASI loaders; audio/geometry archives. licenses/ remains beside the authentic package in the development workspace, per RPH readme.'
        PrerequisiteReport=(Join-Path $repo 'evidence\phase2.1\vc2010-prerequisite.json');MissingCheckedVc100Libraries=@($missingVc)
        PrerequisiteInstaller=(Get-Content (Join-Path $repo 'evidence\phase2.1\vc2010-prerequisite.json') -Raw | ConvertFrom-Json)
        LaunchProcedure='Only after approval and confirmed supported Story Mode environment: run the installed RAGEPluginHook.exe normally, select no startup plugins, stop for any security/DirectStorage/version warning. Establish standalone baseline; F4/help; LoadPlugin RichAudio.Telemetry.Rph.dll; RichAudioStatus; RichAudioMark urban_TestA; RichAudioStart; RichAudioStop; graceful UnloadPlugin using runtime help.'
        KnownConflicts=@('Existing zero-byte OpenIV.asi stays untouched; any loader/ASI error is a stop condition.','No co-installation test with supplied OpenRPF 0.1.0; do not add it.','Bundled XInput1_4.dll must not overwrite another proxy. NVMe DirectStorage warning requires separate author-supported dependency review.','Do not change antivirus, exclusions, launcher security or anti-cheat settings. No Online.','No LSPDFR gameplay assets or plugins are included; standalone startup and runtime API binding remain unverified.')
        BackupProcedure=$manifest.BackupProcedure
        RollbackProcedure=$manifest.RollbackProcedure
        RuntimeGeneratedFiles='RPH may create logs/settings on first launch. Snapshot root/Plugins before launch; preserve and review new paths separately. Never recursively delete directories or assume every new path belongs to RPH.'
        ValidationChecklist=@('Re-hash source, game executable and every destination immediately before copying; abort on drift/reparse points.','Resolve/approve the separately signed VC2010 x64 prerequisite before copying game files.','Confirm supported Story Mode setup without changing protections.','No unexpected startup plugins; no security/DirectStorage/version warnings.','Standalone RPH baseline first; then validate command registration and runtime API binding.','Run A-E with quantitative acceptance in docs/PHASE2_1_READINESS.md; valid JSONL header/footer and writer status.','Measure matched baseline/RPH-only/capture-off/capture-on runs; no game-performance claim from offline tests.')
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'deployment-manifest.json') -Encoding utf8
}
[pscustomobject]@{State=$manifest.State;FinalDeploymentManifest=$false;RuntimeFiles=$runtime.Count;Report=(Join-Path $output 'deployment-candidate.json');Installed=$false} | ConvertTo-Json
