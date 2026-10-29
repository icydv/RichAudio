[CmdletBinding()]
param([string]$SdkPath='',[switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\acoustics07\transport'
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
    $binary=Join-Path $output 'RichAudio.Beacon.Rph.dll'
    $geometry=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
    $geometry+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
    & $compiler @base '/r:System.Web.Extensions.dll' ('/r:'+$SdkPath) ('/out:'+$binary) @transport @geometry @adapter
    if($LASTEXITCODE -ne 0){throw 'Listener RPH adapter build failed.'}
    [ordered]@{schema=1;sdkSha256=$hash;sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;pluginSha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash;targetGta='1.0.1158.16';targetRph='1.132.1428.17748';scope='compiled-only; not deployed or live validated';dependencies='Windows .NET Framework; authentic private RPH SDK'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'bridge-build-receipt.json') -Encoding UTF8
}
Write-Output 'ACOUSTICS-07 listener bridge built locally; no game files deployed.'
