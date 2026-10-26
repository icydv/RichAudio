[CmdletBinding()]
param([string]$SdkPath='', [switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\surface-observation'
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$core=@((Join-Path $repo 'src\acoustics\observation\GeometryObservation.cs'),(Join-Path $repo 'src\acoustics\observation\SurfaceAcquisition.cs'))
& $compiler /nologo /optimize+ /warnaserror+ /target:library /r:System.Runtime.Serialization.dll ('/out:'+(Join-Path $output 'RichAudio.Surface.Core.dll')) @core
if($LASTEXITCODE-ne0){throw 'Surface contract build failed'}
if(!$CoreOnly){
 if(!$SdkPath-or(Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Explicit pinned authentic SDK required'}
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /r:System.Runtime.Serialization.dll ('/r:'+$SdkPath) ('/out:'+(Join-Path $output 'RichAudio.Surface.Rph.dll')) @core (Join-Path $repo 'src\acoustics\observation\SurfaceObserver.Rph.cs')
 if($LASTEXITCODE-ne0){throw 'Authentic-SDK surface observer build failed'}
}
Write-Output 'Built bounded surface research only; no game deployment or launch.'
