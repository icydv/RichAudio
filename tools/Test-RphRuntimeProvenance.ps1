[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-10/provenance-units-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Existing .NET Framework x64 C# compiler required; nothing is installed.'}
$relative=@('src/acoustics/host/Handoff/RphRuntimeProvenance.cs','tests/rph-provenance/ProvenanceUnitTests.cs','tests/rph-provenance/RuntimeA.cs','tests/rph-provenance/RuntimeB.cs','tests/rph-provenance/Launcher.cs')
$pins=@($relative|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
foreach($item in @(@('Launcher','LauncherFixture.dll'),@('RuntimeA','RuntimeA.dll'),@('RuntimeB','RuntimeB.dll'))){
    $source=Join-Path $repo ('tests/rph-provenance/'+$item[0]+'.cs')
    & $compiler /nologo /target:library /optimize+ /warnaserror+ /langversion:5 /platform:x64 ('/out:'+(Join-Path $out $item[1])) $source
    if($LASTEXITCODE-ne0){throw ('Fixture compile failed: '+$item[0])}
}
Copy-Item -LiteralPath (Join-Path $repo 'tests/rph-provenance/RuntimeA.cs') -Destination (Join-Path $out 'RuntimeA.source.cs')
# A private junction is a denial fixture; no game/runtime directory is targeted.
New-Item -ItemType Junction -Path (Join-Path $out 'junction') -Target $out|Out-Null
$binary=Join-Path $out 'RichAudio.RuntimeProvenance.UnitTests.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /main:ProvenanceUnitTests ('/out:'+$binary) (Join-Path $repo $relative[0]) (Join-Path $repo $relative[1])
if($LASTEXITCODE-ne0){throw 'Typed provenance unit compile failed.'}
$raw=@(& $binary $out)
if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw 'Typed provenance unit execution failed; private output retained.'}
$result=$raw[0]|ConvertFrom-Json
if(!$result.passed-or!$result.fixtureOnly-or$result.actualRphRuntimeExecuted-or$result.actualRphApiUsed-or$result.gameLaunched-or$result.gameFilesWritten-or$result.sourceAttached-or$result.sourceOpened-or$result.sourceBegan-or$result.gameplayPublished-or$result.endpointOpened-or$result.audioPlayed){throw 'Fixture boundary failed.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Source changed during validation.'}}
$artifacts=@('LauncherFixture.dll','RuntimeA.dll','RuntimeB.dll','RichAudio.RuntimeProvenance.UnitTests.exe')|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $out $_)).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath (Join-Path $out $_)).Length}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-10';kind='standalone-provenance-typed-fixtures';passed=$true;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins;artifacts=@($artifacts)
 compiler=[ordered]@{path=$compiler;sha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();fileVersion=(Get-Item -LiteralPath $compiler).VersionInfo.FileVersion};runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
 fixtureOnly=$true;actualRphRuntimeExecuted=$false;actualRphApiUsed=$false;gameLaunched=$false;gameFilesWritten=$false;sourceAttached=$false;sourceOpened=$false;sourceBegan=$false;gameplayPublished=$false;endpointOpened=$false;audioPlayed=$false
 reviewedApiPositiveIsFixtureOnly=$true;observedRuntimeAuthenticated=$false;limits='Harmless separately compiled launcher/API fixtures only. A matching fixture is not authentic installed RPH API-runtime provenance or live compatibility. Filesystem/CLR/flush calls are not hard-time-bounded; no runtime or endpoint is activated.'}
$path=Join-Path $out 'validation.json'
$receipt|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$result.cases+' cases / '+$result.assertions+' assertions; '+$path)
