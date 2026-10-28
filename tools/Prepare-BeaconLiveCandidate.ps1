[CmdletBinding()]
param([string]$Output='.local/beacon-live-match-new')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$build=Join-Path $repo 'build\beacon-offline';[IO.Directory]::CreateDirectory($build)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sink=Join-Path $build 'RichAudio.PcmGain.Offline.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 ('/out:'+$sink) (Join-Path $repo 'src\acoustics\host\Windows\PcmRing.cs') (Join-Path $repo 'tests\host\OfflinePcmGain.cs')
if($LASTEXITCODE-ne0){throw 'Device-free gain sink build failed'}
Push-Location $repo
try{& node tools/Measure-BeaconLiveCandidate.mjs $Output $sink;if($LASTEXITCODE-ne0){throw 'Audition-level matching failed'}}finally{Pop-Location}
