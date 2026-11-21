#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-14/console-contract-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$names=@('src/acoustics/bridge/Rph/RphHandoffCompatibility.Rph.cs','tests/rph-compatibility/FakeRph.cs','tests/rph-compatibility/FixtureHarness.cs','tests/rph-compatibility/FixtureLoader.cs')
$pins=@($names|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$loader=Join-Path $out 'FixtureLoader.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /langversion:5 /platform:x64 ('/out:'+$loader) (Join-Path $repo $names[3])
if($LASTEXITCODE-ne0){throw 'Existing fixture loader compilation failed.'}
$runs=@()
foreach($case in @(@{name='console-supported';define=''},@{name='reject-console-missing';define='MISSING_CONSOLE_OPEN'},@{name='reject-console-wrong-type';define='WRONG_CONSOLE_OPEN'})){
 $dir=Join-Path $out $case.name;[IO.Directory]::CreateDirectory($dir)|Out-Null
 $api=Join-Path $dir 'RageFixture.dll';$harness=Join-Path $dir 'FixtureHarness.dll'
 $apiCompilerArguments=@('/nologo','/target:library','/optimize+','/warnaserror+','/langversion:5','/platform:x64',('/out:'+$api))
 if($case.define){$apiCompilerArguments+=('/define:'+$case.define)}
 & $compiler @apiCompilerArguments (Join-Path $repo $names[1])
 if($LASTEXITCODE-ne0){throw 'Console facade compile failed.'}
 & $compiler /nologo /target:library /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /define:SHV_HANDOFF_09,SHV_HANDOFF_14 ('/r:'+$api) ('/out:'+$harness) (Join-Path $repo $names[0]) (Join-Path $repo $names[2])
 if($LASTEXITCODE-ne0){throw 'Actual functional checker compile failed.'}
 $raw=@(& $loader $api $harness $case.name)
 if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw 'Console functional contract fixture failed.'}
 $result=$raw[0]|ConvertFrom-Json
 if(!$result.passed-or!$result.fixtureOnly-or$result.gameLaunched-or$result.endpointOpened){throw 'Fixture scope changed.'}
 [IO.File]::WriteAllText((Join-Path $dir 'result.json'),$raw[0])
 $runs+=[ordered]@{scenario=$case.name;cases=$result.cases;assertions=$result.assertions;apiSha256=(Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant();result=$result}
}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Console checker source changed during validation.'}}
$report=[ordered]@{schema=1;profile='PLAYABLE-14';kind='new-console-open-functional-contract-only';passed=$true;scenarios=$runs;cases=($runs.cases|Measure-Object -Sum).Sum;assertions=($runs.assertions|Measure-Object -Sum).Sum;sources=$pins;runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;limits='Actual shape checker against existing harmless CLR facades; no API getter/native is invoked by inspection. Does not establish live Console.IsOpen behavior.'}
$path=Join-Path $out 'validation.json';$report|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS console contract '+$report.cases+' cases / '+$report.assertions+' assertions; '+$path)
