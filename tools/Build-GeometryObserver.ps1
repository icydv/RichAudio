[CmdletBinding()]
param([string]$SdkPath='', [switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\geometry-observation'
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$core=Join-Path $repo 'src\acoustics\observation\GeometryObservation.cs'
& $compiler /nologo /optimize+ /warnaserror+ /target:library /r:System.Runtime.Serialization.dll ('/out:'+(Join-Path $output 'RichAudio.Geometry.Core.dll')) $core
if($LASTEXITCODE -ne 0){throw 'Geometry contract build failed'}
if(!$CoreOnly){
 if(!$SdkPath){throw 'Explicit authentic local SDK path required; no stub or download fallback'}
 if((Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Unreviewed SDK'}
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /r:System.Runtime.Serialization.dll ('/r:'+$SdkPath) ('/out:'+(Join-Path $output 'RichAudio.Geometry.Rph.dll')) $core (Join-Path $repo 'src\acoustics\observation\GeometryObserver.Rph.cs')
 if($LASTEXITCODE -ne 0){throw 'Authentic-SDK geometry adapter compilation failed'}
}
Write-Output 'Built geometry research only; no deployment or game launch.'
