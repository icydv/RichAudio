[CmdletBinding()]param([string]$SdkPath='',[switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\airport-survey'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
# Explicit allowlist excludes the Bati controller and every mutating runtime adapter.
$sources=@('src\benchmark\BenchmarkMarkers.cs','src\benchmark\Bati\BatiData.cs','src\benchmark\Bati\StopBoundaryDiagnostics.cs','src\benchmark\Bati\ModKitDiagnostics.cs','src\benchmark\Bati\SpeedAnalysis.cs','src\acoustics\observation\GeometryObservation.cs','src\benchmark\Survey\AirportSurvey.cs')|ForEach-Object {Join-Path $repo $_}
& $compiler /nologo /optimize+ /warnaserror+ /target:library /r:System.Runtime.Serialization.dll ('/out:'+(Join-Path $out 'RichAudio.Survey.Core.dll')) @sources
if($LASTEXITCODE){throw 'Survey core compilation failed'}
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $out 'RichAudio.Survey.Core.dll')) ('/out:'+(Join-Path $out 'Inspect-AirportSurvey.exe')) (Join-Path $repo 'tools\Inspect-AirportSurvey.cs')
if($LASTEXITCODE){throw 'Survey read-only inspector compilation failed'}
if(!$CoreOnly){
 if(!$SdkPath-or(Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Explicit pinned authentic SDK required'}
 & $compiler /nologo /optimize+ /warnaserror+ /target:library /platform:x64 /r:System.Runtime.Serialization.dll /r:System.Drawing.dll ('/r:'+$SdkPath) ('/out:'+(Join-Path $out 'RichAudio.Survey.Rph.dll')) @sources (Join-Path $repo 'src\benchmark\Survey\SurveyAdapter.Rph.cs')
 if($LASTEXITCODE){throw 'Survey adapter SDK compilation failed'}
}
Write-Output 'Offline survey build only; no deployment or GTA execution.'
