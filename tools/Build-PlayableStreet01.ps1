#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RetainedBuildReceipt,[string]$SdkPath='',[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked prototype input/output refused.'}}}
function Check([string]$p,[string]$sha){Unlinked $p;if((Hash $p)-cne$sha){throw ('Prototype input differs: '+$p)}}
function WriteNew([string]$p,$v){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($v|ConvertTo-Json -Depth 30));$s=[IO.File]::Open($p,[IO.FileMode]::CreateNew);try{$s.Write($bytes);$s.Flush($true)}finally{$s.Dispose()}}
function CopyNew([string]$from,[string]$to,[string]$sha){Check $from $sha;Unlinked $to;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))|Out-Null;[IO.File]::Copy($from,$to,$false);Check $to $sha}
# Read retained private assets, never game archives or a consumed coordinator.
Check $RetainedBuildReceipt '2c13ab8fffd84e58b35f70071f06c82bb85da2d74f3d6c845890aef39cdc0156'
$old=Get-Content -LiteralPath $RetainedBuildReceipt -Raw|ConvertFrom-Json
Check $old.baselinePath $old.baselineSha256;$baseline=Get-Content -LiteralPath $old.baselinePath -Raw|ConvertFrom-Json
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256}
Check $old.package.manifestPath $old.package.manifestSha256;$previous=Get-Content -LiteralPath $old.package.manifestPath -Raw|ConvertFrom-Json
foreach($pin in $previous.bindings){Check (Join-Path $old.package.root $pin.file) $pin.sha256}
Check $old.producer.path '05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
$retainedRepo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $old.baselinePath))
foreach($pin in $old.producer.sources){Check (Join-Path $retainedRepo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'}
Check $SdkPath '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/build-street-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=Join-Path $repo '.local/playable-15'
if(![IO.Path]::GetDirectoryName($output).Equals($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New direct private PLAYABLE-15 output required.'};Unlinked $output
[IO.Directory]::CreateDirectory($output)|Out-Null
$pluginDir=Join-Path $output 'audible';[IO.Directory]::CreateDirectory($pluginDir)|Out-Null
$policySource=Join-Path ([IO.Path]::GetDirectoryName($old.audible.pluginPath)) 'ShvHandoffBuildPolicy.generated.cs'
Check $policySource $old.audible.policySourceSha256
$policy=Join-Path $pluginDir 'ShvHandoffBuildPolicy.generated.cs'
$policyText=[IO.File]::ReadAllText($policySource).Replace('internal const string WorkspaceRoot = @"C:\Users\Libby\Documents\RichAudio-Playable01";','internal const string WorkspaceRoot = @"'+$repo+'";')
if(!$policyText.Contains('internal const string WorkspaceRoot = @"'+$repo+'";')){throw 'Expected reviewed workspace policy.'}
[IO.File]::WriteAllText($policy,$policyText,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $SdkPath -Output $pluginDir -ShvHandoff -ShvHandoff15 -ShvHandoffPolicySource $policy -BatiPlayback
if($LASTEXITCODE-ne0){throw 'Prototype bridge build failed.'}
$hostDir=Join-Path $output 'host'; & (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory $hostDir
if($LASTEXITCODE-ne0){throw 'Prototype host build failed.'}
$package=Join-Path $output 'package';[IO.Directory]::CreateDirectory($package)|Out-Null
foreach($pin in $previous.bindings){
 if($pin.file.EndsWith('.mjs',[StringComparison]::Ordinal)-or$pin.file-ceq'runtime/RichAudio.Acoustics.Host.exe'){continue}
 CopyNew (Join-Path $old.package.root $pin.file) (Join-Path $package $pin.file) $pin.sha256
}
# Copy the full current module closure, including asynchronous world modules.
$modules=@(Get-ChildItem (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.mjs')+@(Get-Item (Join-Path $repo 'tools/Run-Gameplay.mjs'))+@(Get-ChildItem (Join-Path $repo 'tools/soundmap') -Recurse -File -Filter '*.mjs')
foreach($file in $modules){$relative=[IO.Path]::GetRelativePath($repo,$file.FullName);CopyNew $file.FullName (Join-Path $package $relative) (Hash $file.FullName)}
$hostBinary=Join-Path $hostDir 'RichAudio.Acoustics.Host.exe';CopyNew $hostBinary (Join-Path $package 'runtime/RichAudio.Acoustics.Host.exe') (Hash $hostBinary)
$manifest=[ordered]@{};foreach($property in $previous.PSObject.Properties){if($property.Name-cne'bindings'){$manifest[$property.Name]=$property.Value}}
$manifest.geometryCoverage='conditional direct sound only; genuine installed environment disabled for this closed Bati demonstration'
$manifest.bindings=@(Get-ChildItem $package -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($package,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
if($manifest.bindings.Count-gt512){throw 'Prototype manifest binding limit.'}
WriteNew (Join-Path $package 'playable.json') $manifest
Check $old.package.isolatedSettingsPath $old.package.initialIsolatedSettingsSha256
$settings=Get-Content -LiteralPath $old.package.isolatedSettingsPath -Raw|ConvertFrom-Json
$settings|Add-Member -NotePropertyName airflowEnabled -NotePropertyValue $true -Force
$settings|Add-Member -NotePropertyName airflowLevel -NotePropertyValue 1 -Force
# Keep all existing gains, timing, acceleration and output settings.
[IO.Directory]::CreateDirectory((Join-Path $package '.local'))|Out-Null;WriteNew (Join-Path $package '.local/acoustic-settings.json') $settings
$plugin=Join-Path $pluginDir 'RichAudio.Beacon.Rph.dll';$native=Join-Path $output 'RichAudio.OperatingState.ShvHandoff.asi';CopyNew $old.producer.path $native $old.producer.sha256
$pointer=Join-Path $output 'RichAudio.Bati13.json';WriteNew $pointer ([ordered]@{schema=1;packageRoot=$package;manifestSha256=(Hash (Join-Path $package 'playable.json'))})
Check $old.audible.leaseTemplatePath $old.audible.leaseTemplateSha256
$lease=Get-Content -LiteralPath $old.audible.leaseTemplatePath -Raw|ConvertFrom-Json
$lease.callerAssemblySha256=Hash $plugin;$lease.recordingAllowed=$false;$lease.loopbackAllowed=$false;$lease.playablePointerSha256=Hash $pointer
WriteNew (Join-Path $output 'session-lease-template.json') $lease
$game=[IO.Path]::GetDirectoryName($manifest.gameExecutable)
$destinations=@([ordered]@{source=$plugin;destination=(Join-Path $game 'Plugins/RichAudio.dll');operation='temporary replacement; exact backup required'},[ordered]@{source=$native;destination=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');operation='create-only'},[ordered]@{source=$pointer;destination=(Join-Path $game 'Plugins/RichAudio.Bati13.json');operation='create-only'})
foreach($entry in $destinations){$entry.sha256=Hash $entry.source;$entry.bytes=(Get-Item -LiteralPath $entry.source).Length}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256}
foreach($pin in $manifest.bindings){Check (Join-Path $package $pin.file) $pin.sha256}
$sourceFiles=@($modules.FullName)+@(Get-ChildItem (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.cs'|ForEach-Object FullName)+@($policy,$PSCommandPath,(Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1'),(Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1'))
$sourcePins=@($sourceFiles|Sort-Object -Unique|ForEach-Object{[ordered]@{path=$_;sha256=(Hash $_)}})
$receipt=[ordered]@{schema=1;kind='PLAYABLE-STREET01-private-Bati';builtUtc=[DateTime]::UtcNow.ToString('o');sourceBaseCommit=(& git -C $repo rev-parse HEAD);sourceDiffSHA256=([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes((& git -C $repo diff --no-ext-diff|Out-String))))).Replace('-','').ToLowerInvariant();retainedBuildReceipt=$RetainedBuildReceipt;retainedBuildSHA256=(Hash $RetainedBuildReceipt);package=$package;manifestSHA256=(Hash (Join-Path $package 'playable.json'));bindings=$manifest.bindings.Count;destinations=$destinations;baselinePath=$old.baselinePath;baselineSHA256=$old.baselineSha256;leaseTemplate=(Join-Path $output 'session-lease-template.json');leaseTemplateSHA256=(Hash (Join-Path $output 'session-lease-template.json'));gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;recordingAllowed=$false;environmentalGeometryEnabled=$false;nativeSuppression=$false;approved=$false}
$receipt.builderSHA256=Hash $PSCommandPath;$receipt.sources=$sourcePins;$receipt.reusedNativeSourcePins=$old.producer.sources;$receipt.sdkSHA256=Hash $SdkPath
WriteNew (Join-Path $output 'build-receipt.json') $receipt
Write-Output ('Prepared private Bati build: '+$output)
