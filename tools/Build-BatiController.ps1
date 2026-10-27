[CmdletBinding()]param([string]$SdkPath='',[switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\bati-controller';[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@((Join-Path $repo 'src\benchmark\BenchmarkMarkers.cs'))+@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\benchmark\Bati') -Filter '*.cs'|Where-Object Name -NotLike '*.Rph.cs'|ForEach-Object FullName)
$sources+=@(Join-Path $repo 'src\acoustics\observation\GeometryObservation.cs';Join-Path $repo 'src\benchmark\Survey\AirportSurvey.cs')
& $compiler /nologo /optimize+ /warnaserror+ /target:library /r:System.Runtime.Serialization.dll ('/out:'+(Join-Path $out 'RichAudio.Bati.Core.dll')) @sources
if($LASTEXITCODE){throw 'Bati core compilation failed'}
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $out 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $out 'Inspect-BatiReadiness.exe')) (Join-Path $repo 'tools\Inspect-BatiReadiness.cs')
if($LASTEXITCODE){throw 'Readiness tool compilation failed'}
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $out 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $out 'Inspect-FiveStopRoute.exe')) (Join-Path $repo 'tools\Inspect-FiveStopRoute.cs')
if($LASTEXITCODE){throw 'Five-stop inspector compilation failed'}
if(!$CoreOnly){
 if(!$SdkPath-or(Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Explicit pinned SDK required'}
 $adapters=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\benchmark\Bati') -Filter '*.Rph.cs'|ForEach-Object FullName)
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /r:System.Runtime.Serialization.dll /r:System.Drawing.dll ('/r:'+$SdkPath) ('/out:'+(Join-Path $out 'RichAudio.Bati.Rph.dll')) @sources @adapters
 if($LASTEXITCODE){throw 'Bati adapter SDK compilation failed'}
}
Write-Output 'Built offline Bati research; fresh bound approval required for experiment mode. No deployment or game execution.'
