param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$private=Join-Path $repo '.local/native-suppression-10'
function Pin($p){$i=Get-Item -LiteralPath $p;@{path=$i.FullName;bytes=$i.Length;sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}}
function Read($p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json -AsHashtable}
if(!(Test-Path -LiteralPath (Split-Path $OutputPath))){[IO.Directory]::CreateDirectory((Split-Path $OutputPath))|Out-Null}
$cases=@{background='background-qualified-01';'wrong-capture'='background-final02';frozen='background-final02';blank='background-final02';'missing-audio'='background-final02';'lost-identity'='failures-final01';'stale-state'='failures-final02';'recording-stopped'='failures-final02';'startup-expiry'='expiry-final02'}
$receipts=@();foreach($name in $cases.Keys){$batch=Join-Path $private $cases[$name];$root=Join-Path $batch $name;$path=Join-Path $root 'result.json';$r=Read $path;$restoration=Read (Join-Path $batch 'restoration.json');$plan=Read (Join-Path $root 'operator-plan.json')
 if(!$r.passed-or!$r.productionWatchCliUnmodified-or$r.obsEverObservedForeground-or!$restoration.passed-or!$restoration.ownedProcessesClosed-or!$restoration.gameSettingsUntouched-or!$restoration.obsOriginalBytesAndMetadataRestored){throw 'Background entry or restoration qualification failed'}
 foreach($pin in $plan.Tools){if((Pin $pin.path).sha256-cne$pin.sha256){throw 'Executed production source or retained fixture changed'}}
 if($plan.OperatorSha256-cne(Pin (Join-Path $PSScriptRoot 'Operator10.py')).sha256){throw 'Executed operator changed'}
 if($name-ceq'background'){
  if(!$r.readinessAdmitted-or$r.operatorExitCode-ne0){throw 'Full positive path did not admit'}
  $final=Read (Join-Path $root 'finalized-review.json');if(!$final.Passed){throw 'Full production finalization failed'}
  $hidden=@($r.observations|Where-Object {$_.obsMainWindows.Count-and!@($_.obsMainWindows|Where-Object visible).Count});if(!$hidden.Count){throw 'Unavailable OBS foreground was not observed'}
 }elseif($r.readinessAdmitted-or$r.operatorExitCode-eq0){throw 'Negative case admitted'}
 $receipts+=@{case=$name;receipt=(Pin $path);restoration=(Pin (Join-Path $batch 'restoration.json'));plan=(Pin (Join-Path $root 'operator-plan.json'));fixtureBindings=(Pin (Join-Path $root 'fixture-bindings.json'))}
}
if(Get-Process obs64,BackgroundEntryHost10,GTA5_Enhanced -ErrorAction SilentlyContinue){throw 'Owned processes or game remain active'}
$result=@{passed=$true;schema='NativeSuppression10CompleteBackgroundPath';cases=$receipts;productionSources=@('Operator10.py','Readiness10.py','Recorder10.lua','Test-Background10.py','Test-Background10.ps1','Qualify-Background10.ps1')|ForEach-Object {Pin (Join-Path $PSScriptRoot $_)};gameObservations='Authored GTA API only; actual owned process/PID/creation/foreground, real WGC moving window/file audio, production watch CLI and OBS Lua start/state/stop, real compiled bridge/runner';gameLaunched=$false;gameInstalled=$false;liveGtaBehaviourQualified=$false;failedDevelopmentAttemptsPreserved=$true;successfulCasesAreIndependentRuns=$true}
if(Test-Path -LiteralPath $OutputPath){throw 'Fresh qualification output required'};[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath),($result|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
'PASS complete production background path and all nine intended outcomes; original configuration restored'
