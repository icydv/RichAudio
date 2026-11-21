param([string]$Output,[string]$Token,[int]$WorkerExitCode)
$ErrorActionPreference='Stop'
if($Token-cne"quoted ' token with spaces"){throw 'Fixture argument lost'}
$child=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-Command','Start-Sleep -Seconds 30') -WindowStyle Hidden -PassThru
@{fixtureOnly=$true;pid=$PID;childPid=$child.Id;token=$Token;requestedExitCode=$WorkerExitCode;gameAccessed=$false}|ConvertTo-Json|Set-Content -LiteralPath $Output
exit $WorkerExitCode
