#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){
    for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
        if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build/input path refused.'}
    }
}
function WriteNew([string]$Path,[string]$Text){
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes($Text)
    $file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
}
function Pin([string]$Path){[ordered]@{path=$Path;bytes=(Get-Item -LiteralPath $Path).Length;sha256=(Hash $Path)}}
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.local/menu02-candidate-01'}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo $OutputRoot}
$out=[IO.Path]::GetFullPath($OutputRoot)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$out.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'MENU-02 output must be a new repository .local directory.'}
Unlinked $out
if(Test-Path -LiteralPath $out){throw 'MENU-02 output already exists; builds and failed attempts are never overwritten.'}
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'}
$SdkPath=[IO.Path]::GetFullPath($SdkPath)
# A compilation reference copied into the development workspace, never an
# installed game/runtime image. The SDK itself is not included in the payload.
$sdkPrefix=[IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk')).TrimEnd('\')+'\'
if(!$SdkPath.StartsWith($sdkPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Use the existing non-installed private SDK reference directory.'}
Unlinked $SdkPath
if((Hash $SdkPath)-cne'5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'){throw 'Authentic pinned compilation SDK required; no substitution or download.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
Unlinked $compiler
if(!(Test-Path -LiteralPath $compiler -PathType Leaf)){throw '.NET Framework x64 compiler not found.'}
$sources=@(
    Join-Path $repo 'src/acoustics/bridge/Menu02/Menu02Entry.Rph.cs'
    Join-Path $repo 'src/acoustics/bridge/Rph/InGameMenu.Rph.cs'
)
$sources+=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/settings/InGame') -Filter '*.cs' | Sort-Object Name | ForEach-Object FullName)
$sources+=@('AcousticSettings.cs','InGameSettingsBridge.cs','InGameRecordingBridge.cs','MenuDiagnostic.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/host/Windows/'+$_)}
foreach($source in $sources){Unlinked $source}
$sourcePins=@($sources|ForEach-Object{Pin $_})
$builderPin=Pin $PSCommandPath
$sdkPin=Pin $SdkPath
$compilerPin=Pin $compiler
$head=(& git -C $repo rev-parse HEAD).Trim()
if($LASTEXITCODE-ne0){throw 'Cannot identify source checkout.'}
$payload=Join-Path $out 'payload'
$runtime=Join-Path $out 'runtime'
$settings=Join-Path $runtime '.local/preferences.json'
$sidecar=Join-Path $payload 'RichAudio.Menu.json'
$binary=Join-Path $payload 'RichAudio.Menu02.Rph.dll'
[IO.Directory]::CreateDirectory($payload)|Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($settings))|Out-Null
# This new workspace has no status or recorder descriptor. The unchanged
# recorder bridge therefore remains unavailable and performs no HTTP request.
$seed=[ordered]@{schemaVersion=1;revision=1;acousticQuality='auto';acousticAcceleration='auto';richAudioEnabled=$false;outputLevel=1;earlyReflections=$true;diagnosticsOverlay=$false;integrationMode='stock-fallback';soundMapVisible=$false;menuToggleKey='F10'}
WriteNew $settings ($seed|ConvertTo-Json)
WriteNew $sidecar ([ordered]@{schemaVersion=1;workspaceRoot=$runtime;settingsPath='.local/preferences.json';toggleKey='F10';controllerEnabled=$true}|ConvertTo-Json)
$options=@('/nologo','/target:library','/platform:x64','/langversion:5','/optimize+','/warnaserror+','/define:PLAYABLE_PRODUCT','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:Microsoft.CSharp.dll',('/r:'+$SdkPath),('/out:'+$binary))
WriteNew (Join-Path $out 'compiler-arguments.json') ([ordered]@{compiler=$compiler;arguments=@($options)+@($sources)}|ConvertTo-Json -Depth 5)
& $compiler @options @sources *> (Join-Path $out 'compiler.log')
$compilerExit=$LASTEXITCODE
WriteNew (Join-Path $out 'compiler-exit.json') ([ordered]@{exitCode=$compilerExit;completedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json)
if($compilerExit-ne0){throw 'MENU-02 compilation failed. Its new output and raw compiler log are retained; no retry was performed.'}
foreach($pin in @($sourcePins)+@($builderPin,$sdkPin,$compilerPin)){
    if((Hash $pin.path)-cne$pin.sha256-or(Get-Item -LiteralPath $pin.path).Length-ne$pin.bytes){throw 'Build input changed during compilation.'}
}
foreach($absent in @('.local/soundmap/service.json','.local/preferences.status.json')){
    if(Test-Path -LiteralPath (Join-Path $runtime $absent)){throw 'Isolated workspace unexpectedly contains service or host state.'}
}
$receipt=[ordered]@{
    schema=1;profile='MENU-02';builtUtc=[DateTime]::UtcNow.ToString('o');sourceHead=$head
    runtimeMenuUnmodified=$true;defines=@('PLAYABLE_PRODUCT');sources=$sourcePins;builder=$builderPin;sdk=$sdkPin;compiler=$compilerPin
    compilerFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($compiler).FileVersion
    sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion
    options=$options;compilerExitCode=$compilerExit;binary=(Pin $binary);sidecar=(Pin $sidecar);initialPreferences=(Pin $settings)
    isolatedWorkspace=$runtime;requiredAbsent=@('.local/soundmap/service.json','.local/preferences.status.json')
    proposedInstall=@([ordered]@{source=$binary;relativeTarget='Plugins/RichAudio.Menu02.Rph.dll'},[ordered]@{source=$sidecar;relativeTarget='Plugins/RichAudio.Menu.json'})
    reproducibility='Exact source/SDK/compiler/options recipe retained. Legacy .NET Framework compiler embeds fresh PE timestamp/MVID; independent rebuild byte identity is not claimed.'
    requiredProcessName='GTA5_Enhanced.exe';requiredGameFileVersion='1.0.1158.16';requiredLoadedApiFileVersion='1.132.1428.17748'
    compatibilityPolicy='Historical-only fail-closed runtime guard; matching versions do not authenticate the launcher/API or prove compatibility.'
    installedGtaVersion=$null;installedRphVersion=$null;runtimeCompatibilityEstablished=$false;independentlyReviewed=$false
    deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingStarted=$false
    limits='Menu plus existing preference/recorder-availability workers only. No gameplay/audio host, native producer, listener, world warmup or SoundMap service linked. Runtime/installation must be separately inspected and approved. Reset may save enabled defaults but no audio engine exists in this image.'
}
WriteNew (Join-Path $out 'candidate-receipt.json') ($receipt|ConvertTo-Json -Depth 10)
Write-Output ('PASS compiled isolated MENU-02 candidate; not deployed or live validated: '+(Join-Path $out 'candidate-receipt.json'))
