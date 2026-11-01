[CmdletBinding()]
param([string]$SdkPath='',[switch]$CoreOnly,[switch]$Playable,[string]$Output='',[switch]$ShvHandoff,[string]$ShvHandoffPolicySource='',[switch]$ShvHandoff13,[switch]$BatiPlayback)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(($ShvHandoff13-and!$ShvHandoff)-or($BatiPlayback-and!$ShvHandoff13)){throw 'PLAYABLE-13 audio requires the explicit handoff13 profile.'}
if($ShvHandoff){
    if($CoreOnly -or !$ShvHandoffPolicySource -or !(Test-Path -LiteralPath $ShvHandoffPolicySource -PathType Leaf)){throw 'Passive handoff requires the generated reviewed policy source and actual SDK compilation.'}
    $Playable=$true
}elseif($ShvHandoffPolicySource){throw 'A handoff policy source requires explicit -ShvHandoff.'}
if(!$Output){$Output=Join-Path $repo 'build\acoustics07\transport'}
$output=[IO.Path]::GetFullPath($Output)
$allowed=@('build','.local')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
if(!@($allowed|Where-Object{$output.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Bridge build output must be inside repository build or .local, never the game installation.'}
for($cursor=$output;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){
    if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked bridge build output is not permitted.'}
}
if($ShvHandoff){
    $handoffRoots=@('build/playable-12-passive-bridge','.local/playable-12','.local/playable-13')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
    if(!@($handoffRoots|Where-Object{($output+'\').StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Handoff output must use a new private reviewed-profile directory.'}
    $policy=[IO.Path]::GetFullPath($ShvHandoffPolicySource)
    if(![IO.Path]::GetDirectoryName($policy).Equals($output,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($policy) -ne 'ShvHandoffBuildPolicy.generated.cs'){throw 'Passive bridge policy must be generated inside its new output directory.'}
    for($cursor=$policy;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked policy is not permitted.'}}
    foreach($name in @('RichAudio.Listener.Transport.dll','RichAudio.Beacon.Rph.dll','bridge-build-receipt.json','RichAudio.Menu.json')){if(Test-Path -LiteralPath (Join-Path $output $name)){throw 'Passive bridge output files must be new; existing builds are never overwritten.'}}
}
[IO.Directory]::CreateDirectory($output) | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework x64 compiler not found.'}
$transport=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs' | ForEach-Object FullName)
$base=@('/nologo','/target:library','/platform:x64','/langversion:5','/optimize+','/warnaserror+','/r:System.Runtime.Serialization.dll')
& $compiler @base ('/out:'+(Join-Path $output 'RichAudio.Listener.Transport.dll')) @transport
if($LASTEXITCODE -ne 0){throw 'Listener transport build failed.'}
if(!$CoreOnly)
{
    if(!$SdkPath -or !(Test-Path -LiteralPath $SdkPath -PathType Leaf)){throw 'Supply -SdkPath to the authentic private RPH SDK. No SDK is redistributed or substituted.'}
    $hash=(Get-FileHash -LiteralPath $SdkPath -Algorithm SHA256).Hash
    if($hash -ne '5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Unreviewed RPH SDK fingerprint.'}
    $adapter=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\bridge\Rph') -Filter '*.cs' | ForEach-Object FullName)
    # RPH can discover public convention entry methods. Never ship two Main/
    # OnUnload pairs and depend on attribute ordering to select the product.
    $excluded=if($Playable){'ListenerBridge.Rph.cs'}else{'Playable.Rph.cs'}
    $adapter=@($adapter|Where-Object{[IO.Path]::GetFileName($_)-ne $excluded})
    $adapter+=Join-Path $repo 'src\acoustics\integration\WorldWarmupSupervisor.cs'
    $binary=Join-Path $output 'RichAudio.Beacon.Rph.dll'
    $geometry=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
    $geometry+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
    $menu=@(Get-ChildItem (Join-Path $repo 'src\acoustics\settings\InGame') -Filter '*.cs'|ForEach-Object FullName)
    $menu+=@('AcousticSettings.cs','InGameSettingsBridge.cs','InGameRecordingBridge.cs','MenuDiagnostic.cs','PassiveSoundMapBridge.cs','GameplayRuntime.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\host\Windows\'+$_)}
    if($ShvHandoff){
        $defines='PLAYABLE_PRODUCT,SHV_HANDOFF_09';if($ShvHandoff13){$defines+=',SHV_HANDOFF_13'};if($BatiPlayback){$defines+=',SHV_PLAYABLE_13';$menu+=Join-Path $repo 'src/acoustics/host/Windows/BatiPlaybackSession.cs'}
        $base+='/define:'+$defines
        $adapter+=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Handoff') -Filter '*.cs'|Where-Object Name -ne 'RphRuntimeProvenance.cs'|ForEach-Object FullName)
        $adapter+=$policy
        $handoffPins=@(@($transport)+@($geometry)+@($menu)+@($adapter)|Sort-Object -Unique|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
    }elseif($Playable){$base+='/define:PLAYABLE_PRODUCT'}
    & $compiler @base '/r:System.Web.Extensions.dll' '/r:System.Drawing.dll' '/r:System.Windows.Forms.dll' '/r:Microsoft.CSharp.dll' ('/r:'+$SdkPath) ('/out:'+$binary) @transport @geometry @menu @adapter
    if($LASTEXITCODE -ne 0){throw 'Listener RPH adapter build failed.'}
    if($ShvHandoff){
        foreach($pin in $handoffPins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Passive bridge source changed while compiling.'}}
        [ordered]@{schema=1;profile=$(if($ShvHandoff13){'PLAYABLE-13'}else{'PLAYABLE-12'});runtimePolicy='functional-compatibility';sources=$handoffPins;passiveOnly=(!$BatiPlayback);audioPlaybackAllowed=[bool]$BatiPlayback;recordingRequiresPerRunApproval=$true;deployed=$false;gameExecuted=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'passive-build-source-manifest.json') -Encoding utf8
    }
    # Prepared application configuration only, outside the game. A future live
    # package must separately bind this opt-in sidecar and the changed plugin.
    $menuConfig=Join-Path $output 'RichAudio.Menu.json'
    if(!(Test-Path -LiteralPath $menuConfig)){
        [ordered]@{schemaVersion=1;workspaceRoot=$repo;settingsPath='.local/acoustic-settings.json';toggleKey='F10';controllerEnabled=$true} |
            ConvertTo-Json | Set-Content -LiteralPath $menuConfig -Encoding UTF8
    }
    [ordered]@{schema=1;sdkSha256=$hash;sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;pluginSha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash;targetGta='1.0.1158.16';targetRph='1.132.1428.17748';scope='compiled-only; not deployed or live validated';dependencies='Windows .NET Framework; authentic private RPH SDK'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'bridge-build-receipt.json') -Encoding UTF8
}
Write-Output 'ACOUSTICS-07 listener bridge built locally; no game files deployed.'
