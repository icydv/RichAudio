#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/street-01/continuity-'+[Guid]::NewGuid().ToString('N'))
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture path refused.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/bridge/Rph/Playable.Rph.cs','src/acoustics/bridge/Rph/CameraSampler.Rph.cs','tests/host/TestStreetContinuity01.cs')|ForEach-Object{Join-Path $repo $_}
$pins=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $output 'RichAudio.StreetContinuity01.Tests.exe'
$log=@(& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Runtime.Serialization.dll /r:Microsoft.CSharp.dll /main:TestStreetContinuity01 ('/out:'+$binary) @sources 2>&1)
$log|Set-Content -LiteralPath (Join-Path $output 'build.log') -Encoding utf8
if($LASTEXITCODE-ne0){throw ('Actual product capture fixture compilation failed: '+($log-join[Environment]::NewLine))}
$raw=@(& $binary);if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw ('Product continuity fixture failed; retained '+$output)}
$result=$raw[0]|ConvertFrom-Json
if(!$result.passed-or$result.gameLaunched-or$result.endpointOpened-or$result.nativeMuting){throw 'Unexpected fixture boundary.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed while fixture ran.'}}
[ordered]@{schema=1;profile='STREET-01';passed=$true;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins;binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();sdkValues='authored';actualProductCaptureCompiled=$true;actualCameraTrackerCompiled=$true;actualGameplayWireCompiled=$true;gameLaunched=$false;endpointOpened=$false;nativeMuting=$false;limits='Actual product source and wire tested with authored SDK responses; does not qualify installed RPH getters, native camera association, metres-per-unit or audible playback.'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('PASS '+$result.cases+' product continuity cases / '+$result.assertions+' assertions; '+(Join-Path $output 'validation.json'))
