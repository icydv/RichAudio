[CmdletBinding()]
param([string]$SdkPath='',[switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\traffic-calibration'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$core=@((Join-Path $repo 'src\benchmark\TrafficCalibration.cs'),(Join-Path $repo 'src\benchmark\PoolSelection.cs'))
& $compiler /nologo /optimize+ /warnaserror+ /target:library /r:System.Runtime.Serialization.dll ('/out:'+(Join-Path $out 'RichAudio.Traffic.Core.dll')) @core
if($LASTEXITCODE-ne0){throw 'Traffic core build failed'}
if(!$CoreOnly){
 if(!$SdkPath-or(Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Explicit pinned authentic SDK required'}
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /r:System.Runtime.Serialization.dll /r:System.Drawing.dll ('/r:'+$SdkPath) ('/out:'+(Join-Path $out 'RichAudio.Traffic.Rph.dll')) @core (Join-Path $repo 'src\benchmark\TrafficObserver.Rph.cs')
 if($LASTEXITCODE-ne0){throw 'Authentic-SDK traffic adapter build failed'}
}
Write-Output 'Built bounded traffic calibration only; no deployment, launch, native execution or spawning.'
