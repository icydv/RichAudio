#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[string]$RetainedManifest='',[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function NoLinks([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked package path rejected.'}}}
function Inside([string]$root,[string]$relative){if([IO.Path]::IsPathRooted($relative)){throw 'Relative payload path required.'};$path=[IO.Path]::GetFullPath((Join-Path $root $relative));if(!$path.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Payload escaped package.'};NoLinks $path;return $path}
function CopyNew([string]$source,[string]$target){NoLinks $source;NoLinks $target;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;[IO.File]::Copy($source,$target,$false)}
function WriteJson([string]$path,$value){$value|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $path -Encoding utf8}
NoLinks $BuildReceipt
$build=Get-Content -LiteralPath $BuildReceipt -Raw|ConvertFrom-Json
if($build.kind-cne'MIGRATION-SHVDNE-01-offline-build'-or$build.apiSha256-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Migration build receipt required.'}
$built=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($BuildReceipt))
foreach($pin in $build.outputs){if((Hash (Inside $built $pin.file))-cne$pin.sha256){throw 'Build output differs.'}}
function VerifiedBinary([string]$name,[string]$declared){
    $pins=@($build.outputs|Where-Object {$_.file-ceq$name})
    if($pins.Count-ne1-or!$declared-or![IO.Path]::IsPathRooted($declared)){throw 'Exactly one bound build binary required.'}
    $expected=Inside $built $name
    if(![String]::Equals([IO.Path]::GetFullPath($declared),$expected,[StringComparison]::OrdinalIgnoreCase)){throw 'Declared build binary differs from verified output.'}
    if((Hash $expected)-cne$pins[0].sha256){throw 'Required build binary differs.'}
    return $expected
}
$verifiedIntegration=VerifiedBinary 'RichAudio.Shvdne.dll' $build.integration
$verifiedHost=VerifiedBinary 'RichAudio.Acoustics.Host.exe' $build.host
$configPath=Join-Path $repo 'config/shvdne/integration.json'
$configPins=@($build.sources|Where-Object {$_.path-ceq'config/shvdne/integration.json'})
if($configPins.Count-ne1-or(Hash $configPath)-cne$configPins[0].sha256){throw 'Integration configuration differs from the build-bound source.'}
$candidateConfig=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
if($candidateConfig.schema-ne1){throw 'Schema-1 disabled candidate configuration required.'}
foreach($flag in @('enabled','allowMemoryTelemetry','useEnhancedNativeTelemetry','hostEnabled','soundMapEnabled','worldWarmupEnabled')){
    if($candidateConfig.$flag-isnot[bool]-or$candidateConfig.$flag){throw 'Only a disabled observation/host candidate can be packaged.'}
}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/migration-shvdne-01/package-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/migration-shvdne-01'))+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private migration package required; game installation is never written.'}
NoLinks $output
$scripts=Join-Path $output 'scripts';$integration=Join-Path $scripts 'RichAudio';$payload=Join-Path $integration 'payload'
[IO.Directory]::CreateDirectory($payload)|Out-Null
CopyNew $verifiedIntegration (Join-Path $scripts 'RichAudio.Shvdne.dll')
CopyNew $configPath (Join-Path $integration 'integration.json')
$manifest=$null;$retainedHash=$null
if($RetainedManifest){
    NoLinks $RetainedManifest;$RetainedManifest=[IO.Path]::GetFullPath($RetainedManifest);$retainedHash=Hash $RetainedManifest
    $old=Get-Content -LiteralPath $RetainedManifest -Raw|ConvertFrom-Json
    if($old.schema-ne1-or$old.gameVersion-cne'1.0.1158.16'-or$old.demoProfile-or$old.bindings.Count-gt512){throw 'Normal production manifest required; sealed demo packages cannot be converted.'}
    $oldRoot=[IO.Path]::GetDirectoryName($RetainedManifest)
    foreach($pin in $old.bindings){$source=Inside $oldRoot $pin.file;if((Hash $source)-cne$pin.sha256){throw ('Retained input differs: '+$pin.file)}}
    foreach($pin in $old.bindings){
        if($pin.file.EndsWith('.mjs',[StringComparison]::OrdinalIgnoreCase)-or$pin.file.StartsWith('tools/soundmap/',[StringComparison]::OrdinalIgnoreCase)-or$pin.file-ceq'config/vehicle-loudness-policy.json'-or$pin.file-ceq'runtime/RichAudio.Acoustics.Host.exe'-or$pin.file-ceq'plugin/RichAudio.dll'-or$pin.file-ceq'rph-prerequisite.json'){continue}
        if($pin.file-match'(?i)(\.asi$|\.dll$|(^|/)rph[^/]*$|(^|/)ragepluginhook[^/]*$)'){throw 'RPH, ASI and unreviewed native dependencies cannot enter this migration payload.'}
        CopyNew (Inside $oldRoot $pin.file) (Inside $payload $pin.file)
    }
    if(!(Test-Path -LiteralPath (Join-Path $payload 'runtime/NODE-LICENSE.txt'))){throw 'Retained private Node runtime requires its license.'}
    $manifest=[ordered]@{}
    foreach($p in $old.PSObject.Properties){if($p.Name-notin@('bindings','rphVersion','integrationFramework','integrationVersion','integrationAssemblySha256')){$manifest[$p.Name]=$p.Value}}
    $manifest.integrationFramework='shvdne';$manifest.integrationVersion='1.1.0.6';$manifest.integrationAssemblySha256=$build.apiSha256
}
CopyNew $verifiedHost (Join-Path $payload 'runtime/RichAudio.Acoustics.Host.exe')
$modules=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.mjs')+@(Get-Item -LiteralPath (Join-Path $repo 'tools/Run-Gameplay.mjs'))+@(Get-ChildItem -LiteralPath (Join-Path $repo 'tools/soundmap') -Recurse -File)
$modules+=@('config/vehicle-loudness-policy.json','tools/acoustics-06-scenes.mjs','tools/acoustics-08-2-scenes.mjs','tests/fixtures/acoustics-scenes.mjs')|ForEach-Object{Get-Item -LiteralPath (Join-Path $repo $_)}
foreach($module in $modules){$relative=[IO.Path]::GetRelativePath($repo,$module.FullName);CopyNew $module.FullName (Inside $payload $relative)}
if($manifest){
    $manifest.bindings=@(Get-ChildItem $payload -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
    if($manifest.bindings.Count-gt512){throw 'Existing immutable payload binding budget exceeded.'}
    WriteJson (Join-Path $payload 'playable.json') $manifest
}
WriteJson (Join-Path $integration 'package.json') ([ordered]@{schema=1;manifestSha256=$(if($manifest){Hash (Join-Path $payload 'playable.json')}else{$null});privateRetainedAssets=[bool]$manifest;exactBuildQualified=$false})
$guide=@'
RichAudio MIGRATION-SHVDNE-01 offline candidate. NOT APPROVED FOR INSTALLATION.

Prepared layout: scripts/RichAudio.Shvdne.dll and scripts/RichAudio/.
integration.json is disabled; host and memory telemetry remain disabled.
The separate profile probe, SHVDNE, Script Hook V, ASI loader, RPH, and third-party
game binaries are not bundled. See docs/MIGRATION_SHVDNE01_SMOKE.md in the source.
If privateRetainedAssets is true this folder contains private retained audio
and must not be published. Exact game identity is in payload/playable.json.
Runtime resolves local payload paths after a separately approved installation.
No executable installer, service, scheduled task or privileged component exists.
Rollback after a separately approved trial removes only manifest-owned new files
and restores exact backed-up originals. Never delete the shared scripts folder.
'@
[IO.File]::WriteAllText((Join-Path $output 'README.txt'),$guide,[Text.UTF8Encoding]::new($false))
$receipt=[ordered]@{schema=1;kind='MIGRATION-SHVDNE-01-private-package';buildReceiptSha256=(Hash $BuildReceipt);retainedManifestSha256=$retainedHash;privateRetainedAssets=[bool]$manifest;installed=$false;liveAuthorized=$false;probeIncluded=$false;thirdPartyLoaderBundled=$false;files=@(Get-ChildItem $output -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($output,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName);bytes=$_.Length}})}
WriteJson (Join-Path $output 'package-receipt.json') $receipt
Write-Output $output
