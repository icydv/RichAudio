param(
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,48}$')][string]$Case,
 [ValidateSet('normal','stop-only')][string]$Mode='normal',
 [switch]$Fixture,[switch]$Staged,[switch]$Headless,[switch]$Synthetic,
 [string]$Fault,[double]$ExitDelay=1.5,
 [ValidatePattern('^build-[0-9]+$')][string]$Build='build-06'
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskPackage=Join-Path $taskRoot '.local/gate-a-shvdne-private-03i'
$taskTarget=Join-Path $taskPackage ('fixtures/'+$Case)
if(Test-Path -LiteralPath $taskTarget){throw 'Existing disposable case is immutable'}
if($Staged -and -not $Fixture){throw 'Staged failure uses fixture build only'}
$taskBinary=Join-Path $taskPackage ($(if($Fixture){'fixtures'}else{'supervisor'})+'/'+$Build+'/RichAudio.Private03D.Supervisor.exe')
$taskArgs=@('-I','-S','-B',(Join-Path $taskRoot 'tests/PrivateNoticeFixture03I.py'),$taskTarget,$Mode,$taskBinary,'--exit-delay',$ExitDelay.ToString([Globalization.CultureInfo]::InvariantCulture))
if($Staged){$taskArgs+='--staged'}
if($Headless){$taskArgs+='--headless'}
if($Synthetic){$taskArgs+='--synthetic'}
if($Fault){$taskArgs+=@('--fault',$Fault)}
$taskLogs=Join-Path $taskPackage 'integration-logs';New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskProcess=Start-Process -FilePath (Join-Path $taskRoot '.local/toolchains/private03f-01/python/python.exe') -ArgumentList $taskArgs -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs ($Case+'.stdout')) -RedirectStandardError (Join-Path $taskLogs ($Case+'.stderr')) -PassThru
@{pid=$taskProcess.Id;root=$taskTarget;binary=$taskBinary;humanHandoffQualified=$false}|ConvertTo-Json -Compress
