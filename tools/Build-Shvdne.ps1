#requires -Version 7.0
[CmdletBinding()]
param([string]$ApiPath='',[string]$OutputRoot='',[switch]$IncludeProbe)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$ApiPath){$ApiPath=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'}
if((Get-FileHash -LiteralPath $ApiPath -Algorithm SHA256).Hash -cne '1E4D0BC4D34D05A6038FC87EEDE492D3DC4265522DE473EC19CDF6746B5B0E48'){throw 'Pinned authentic SHVDNE v1.1.0.6 API3 required.'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/migration-shvdne-01/build-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/migration-shvdne-01'))+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private migration output required; deployment is not performed.'}
foreach($path in @($output,$ApiPath)){for($at=[IO.Path]::GetFullPath($path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build path rejected.'}}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('src/acoustics/host/Transport','src/acoustics/bridge/Integration','src/acoustics/bridge/Shvdne','src/acoustics/settings/InGame')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GameplayRuntime.cs','AcousticSettings.cs','InGameSettingsBridge.cs','InGameRecordingBridge.cs','MenuDiagnostic.cs','PassiveSoundMapBridge.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/host/Windows/'+$_)}
$sources+=Join-Path $repo 'src/acoustics/integration/WorldWarmupSupervisor.cs'
$options=@('/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:library','/r:System.Runtime.Serialization.dll','/r:System.Web.Extensions.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll',('/r:'+$ApiPath))
$binary=Join-Path $output 'RichAudio.Shvdne.dll'
& $compiler @options ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'SHVDNE integration compilation failed.'}
# Reflection-only inspection never instantiates scripts or invokes game APIs.
$identity=[Reflection.AssemblyName]::GetAssemblyName($binary)
$hostOutput=Join-Path $repo ('.local/street01/migration-host-'+[Guid]::NewGuid().ToString('N'))
& (Join-Path $repo 'tools/Build-AcousticsHost.ps1') -OutputDirectory $hostOutput
if($LASTEXITCODE-ne0){throw 'Existing audio host build failed.'}
Copy-Item -LiteralPath (Join-Path $hostOutput 'RichAudio.Acoustics.Host.exe') -Destination $output
$probe=$null
if($IncludeProbe){
    $probe=Join-Path $output 'RichAudio.GateAProfile01.Shvdne.dll'
    $probeSources=@('tools/native-control/ProfileAssignmentController.cs','tools/native-control/GateAProfile01.Shvdne.cs')|ForEach-Object{Join-Path $repo $_}
    & $compiler @options ('/out:'+$probe) @probeSources
    if($LASTEXITCODE-ne0){throw 'Isolated SHVDNE profile probe compilation failed.'}
    $sources+=$probeSources
}
$sources+=@('src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sources+=@($PSCommandPath,(Join-Path $repo 'tools/Build-AcousticsHost.ps1'),(Join-Path $repo 'config/shvdne/integration.json'))
$receipt=[ordered]@{schema=1;kind='MIGRATION-SHVDNE-01-offline-build';baseCommit=(& git -C $repo rev-parse HEAD);framework='.NET Framework 4.8';targetGame='1.0.1158.16';shvdne='1.1.0.6';apiAssemblyVersion='3.9.0.0';apiSha256=(Get-FileHash $ApiPath).Hash.ToLowerInvariant();assembly=$identity.FullName;integration=$binary;host=(Join-Path $output 'RichAudio.Acoustics.Host.exe');probe=$probe;gameLaunched=$false;installed=$false;liveCompatibilityEstablished=$false;nativeOwnershipEnabled=$false;sources=@($sources|Sort-Object -Unique|ForEach-Object{[ordered]@{path=[IO.Path]::GetRelativePath($repo,$_).Replace('\','/');sha256=(Get-FileHash $_).Hash.ToLowerInvariant()}});outputs=@(Get-ChildItem $output -File|ForEach-Object{[ordered]@{file=$_.Name;sha256=(Get-FileHash $_.FullName).Hash.ToLowerInvariant()}})}
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'build-receipt.json') -Encoding utf8
Write-Output $output
