param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private output required'}
New-Item -ItemType Directory $out|Out-Null
function Pin($p){@{path=[IO.Path]::GetFullPath($p);sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}}
$checks=@();$pins=@()
foreach($pair in @(@('Operator10.py','Operator11.py'),@('Recorder10.lua','Recorder11.lua'),@('LocalBridge.cs','LocalBridge.cs'),@('Install-Automatic10.ps1','Install-Automatic11.ps1'),@('Restore-Automatic10.ps1','Restore-Automatic11.ps1'),@('Preflight10.ps1','Preflight11.ps1'),@('Verify-Restoration10.ps1','Verify-Restoration11.ps1'))){
 $old=Join-Path $repo ('tools/native-control/native-suppression10/'+$pair[0]);$new=Join-Path $PSScriptRoot $pair[1]
 $expected=[IO.File]::ReadAllText($old).Replace('candidate10','candidate11').Replace('Execution08 directory already exists','Execution11 directory already exists').Replace('candidate-10','candidate-11').Replace('execution-10','execution-11').Replace('NativeSuppression10','NativeSuppression11').Replace('Candidate10','Candidate11').Replace('Preflight10','Preflight11').Replace('Live10','Live11').Replace('Recorder10','Recorder11').Replace('Automatic10','Automatic11').Replace('Restoration10','Restoration11')
 if($expected-cne[IO.File]::ReadAllText($new)){throw ('Non-label change in preserved path '+$pair[1])}
 $checks+=@('Only reviewed candidate/execution labels changed: '+$pair[1]);$pins+=@(Pin $old);$pins+=@(Pin $new)
}
foreach($name in 'Readiness10.py','../native-suppression08/Capture08.py','../native-suppression08/Finalize08.py'){$pins+=@(Pin (Join-Path $repo ('tools/native-control/native-suppression10/'+$name)))}
@{schema='NativeSuppression11PreservedPaths';passed=$true;checks=$checks;productionSources=$pins;method='Exact text equality after the finite candidate/execution label substitutions shown in this script; existing background/capture/bridge qualification retained as historical evidence, not rerun';gameLaunched=$false;obsLaunched=$false}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $out 'result.json')
$checks|ForEach-Object{'PASS '+$_}
