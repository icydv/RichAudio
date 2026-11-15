param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh bounded fixture directory required'}
if(@(& git -C $repo status --porcelain).Count){throw 'Commit source before final transaction fixtures'}
$head=(& git -C $repo rev-parse HEAD).Trim();New-Item -ItemType Directory -Path $out|Out-Null
function Pin($p){$i=Get-Item $p;@{path=$i.FullName;bytes=$i.Length;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}}
function Write($p,$s){[IO.Directory]::CreateDirectory((Split-Path $p))|Out-Null;[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false));return $p}
function Json($p,$v){Write $p ($v|ConvertTo-Json -Depth 30)|Out-Null}
$checks=[Collections.Generic.List[string]]::new()
function Check($b,$s){if(!$b){throw $s};$checks.Add($s);Write-Output ('PASS '+$s)}
$realGame='D:\Games\steamapps\common\Grand Theft Auto V Enhanced';$realObs='C:\Users\Libby\AppData\Roaming\obs-studio';$realSettings='C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced'
$protected=@((Join-Path $realGame 'GTA5_Enhanced.exe'),(Join-Path $realGame 'TrainerV.asi'),(Join-Path $realObs 'user.ini'),(Join-Path $realObs 'global.ini'))|ForEach-Object {Pin $_}
foreach($case in 'positive','source-drift','old-approval','extra-root','corrupt-backup','changed-install'){
 $root=Join-Path $out $case;$game=Join-Path $root 'game';$obs=Join-Path $root 'obs';$settings=Join-Path $root 'settings';$runs=Join-Path $root 'transactions';$run=Join-Path $runs 'execution-07';$prepared=Join-Path $root 'installation'
 foreach($p in @($root,$game,$obs,$settings,$runs,$prepared)){[IO.Directory]::CreateDirectory($p)|Out-Null}
 $scopePath=Join-Path $root 'scope.json';$relativeRoot=[IO.Path]::GetRelativePath($repo,$root)
 $adapt=@{}
 foreach($pair in @(@('Install-Automatic07.ps1','Install-Execution07.ps1'),@('Restore-Automatic07.ps1','Restore-Execution.ps1'),@('Preflight07.ps1','Preflight07.ps1'),@('Verify-Restoration07.ps1','Verify-Restoration07.ps1'))){
  $source=Join-Path $PSScriptRoot $pair[0];$text=Get-Content $source -Raw
  # Only fixed filesystem roots are substituted. No approval, state, hash,
  # inventory, metadata, or rollback guard is removed for these disposable files.
  $text=$text.Replace($realGame,$game).Replace($realObs,$obs).Replace($realSettings,$settings).Replace('C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01',$runs)
  $text=$text.Replace('.local\native-suppression-01\candidate-07\scope.json',(Join-Path $relativeRoot 'scope.json')).Replace('.local\native-suppression-01\candidate-07\installation',(Join-Path $relativeRoot 'installation'))
  $target=Join-Path $prepared $pair[1];Write $target $text|Out-Null;$adapt[$pair[1]]=@{production=(Pin $source);fixture=(Pin $target);onlyFixedRootsSubstituted=$true}
 }
 $inventory=@();foreach($n in 'TrainerV.asi','fixture-original.dll'){$inventory+=@(Pin (Write (Join-Path $game $n) ('fixture-original-'+$n)))}
 $originalSettings=@();foreach($n in 'user.ini','global.ini'){$originalSettings+=@(Pin (Write (Join-Path $obs $n) ('fixture-original-'+$n)))}
 $gameSettings=@();foreach($n in 'settings.xml','Profiles\DEADBEEF\cfg.dat','Profiles\DEADBEEF\pc_settings.bin'){$gameSettings+=@(Pin (Write (Join-Path $settings $n) ('fixture-original-'+$n)))}
 $logs=@();foreach($n in 'asiloader.log','ScriptHookV.log','OpenRPF.log','ScriptHookVDotNet.log'){$exists=$n-in@('asiloader.log','ScriptHookV.log');$item=@{path=(Join-Path $game $n);exists=$exists};if($exists){$item.original=Pin (Write $item.path ('fixture-original-'+$n))};$logs+=@($item)}
 $gameNames=@('ScriptHookVDotNet.asi','ScriptHookVDotNet2.dll','ScriptHookVDotNet3.dll','MinHook.x64.dll','ScriptHookVDotNet.ini','scripts\RichAudio.NativeSuppression07.dll','scripts\RichAudio.NativeSuppression07.ini','mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf','mods\update\update.rpf');$installs=@();$i=0
 foreach($n in $gameNames){$source=Write (Join-Path $root ('sources\game-'+$i)) ('AUTOMATED FIXTURE payload '+$i);$installs+=@{destination=(Join-Path $game $n);source=(Pin $source);requiredAbsent=$true};$i++}
 $obsInstalls=@();foreach($n in 'basic\profiles\NativeSuppression01Live07\basic.ini','basic\scenes\NativeSuppression01Live07.json'){$source=Write (Join-Path $root ('sources\obs-'+$i)) ('AUTOMATED FIXTURE recorder '+$i);$obsInstalls+=@{destination=(Join-Path $obs $n);source=(Pin $source);requiredAbsent=$true};$i++}
 $extra=@();foreach($n in 'Recorder07.lua','operator-plan.json'){$extra+=@{name=$n;source=(Pin (Write (Join-Path $root ('sources\'+$n)) 'AUTOMATED FIXTURE; never loaded by OBS'))}}
 $pin=Pin (Write (Join-Path $root 'protected\original.rpf') 'AUTOMATED bounded original archive fixture')
 $s=@{schema='RichAudioNativeSuppression01Scope';candidateName='candidate-07';repository=$repo;sourceCommit=$head;sourceClean=$true;authorized=$false;executed=$false;gameLaunches=1;offlineStoryModeOnly=$true;game=(Pin (Write (Join-Path $game 'GTA5_Enhanced.exe') 'AUTOMATED inert game fixture'));gameInstall=$installs;parkAndRestore=($inventory|Where-Object {$_.path.EndsWith('TrainerV.asi')});unchangedRootBinaryInventory=$inventory;gameSettingsBackups=$gameSettings;logBackupsRequired=$logs;originalBaseArchive=$pin;originalGranularArchive=$pin;originalResidentArchive=$pin;procedureAddendum=$pin;registrationProcedure=$pin;builds=@($pin);operator=@{executionFiles=$extra;dependencies=@()};capture=@{executable=(Pin (Write (Join-Path $obs 'obs64.exe') 'AUTOMATED inert recorder fixture'));install=$obsInstalls;originalSettingsToBackup=$originalSettings;recordingDirectory=(Join-Path $run 'capture')};installation=@{executionDirectory=$run;installerScript=(Pin (Join-Path $prepared 'Install-Execution07.ps1'));rollbackScript=(Pin (Join-Path $prepared 'Restore-Execution.ps1'));requiredAbsentDirectories=@((Join-Path $game 'scripts'),(Join-Path $game 'mods'),(Join-Path $obs 'basic\profiles\NativeSuppression01Live07'));additionalRequiredAbsent=@((Join-Path $game 'scripts\RichAudio.NativeSuppression07.Evidence'),(Join-Path $obs 'basic\scenes\NativeSuppression01Live07.json.bak'),$run)}}
 Json $scopePath $s;$scope=Pin $scopePath
 $approval=Join-Path $root 'approval.json';Json $approval @{schema='NativeSuppression01Candidate07Approval';candidate='candidate-07';scopeSha256=$scope.sha256;sourceCommit=$head;userApprovalText='AUTOMATED DISPOSABLE TRANSACTION FIXTURE. This is not human consent or live approval.';userPresentConfirmed=$true;oneRunApproved=$true;approvedUtc=[DateTime]::UtcNow.AddSeconds(-1).ToString('o')}
 if($case-eq'source-drift'){Add-Content $installs[0].source.path 'changed'}
 if($case-eq'extra-root'){Write (Join-Path $game 'unexpected.dll') 'unexpected'|Out-Null}
 if($case-eq'old-approval'){$a=Get-Content $approval -Raw|ConvertFrom-Json;$a.schema='NativeSuppression01Candidate06Approval';Json $approval $a}
 $preflight=Join-Path $root 'preflight.json'
 if($case-in@('source-drift','extra-root')){
  $rejected=$false;try{& (Join-Path $prepared 'Preflight07.ps1') -ScopeSha256 $scope.sha256 -OutputPath $preflight|Out-Null}catch{$rejected=$true}
  Check ($rejected-and!(Test-Path $run)) ('read-only refusal '+$case);continue
 }
 & (Join-Path $prepared 'Preflight07.ps1') -ScopeSha256 $scope.sha256 -OutputPath $preflight|Out-Null
 $rejected=$false;try{& (Join-Path $prepared 'Install-Execution07.ps1') -ScopeSha256 $scope.sha256 -ApprovalReceiptPath $approval -FreshPreflightReceiptPath $preflight -FreshPreflightSha256 (Pin $preflight).sha256|Out-Null}catch{if($case-ne'old-approval'){throw};$rejected=$true}
 if($case-eq'old-approval'){Check ($rejected-and!(Test-Path $run)) 'consumed older approval rejected before mutation';continue}
 Check ((Get-Content (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json).status-eq'installed-verified') ('exact temporary install '+$case)
 Write (Join-Path $obs 'logs\fixture.txt') 'AUTOMATED fixture final recorder log; no OBS ran'|Out-Null
 foreach($f in $originalSettings+$gameSettings){Write $f.path 'AUTOMATED rewritten setting fixture'|Out-Null}
 Write $obsInstalls[1].destination 'AUTOMATED OBS serialization fixture'|Out-Null
 Write (Join-Path $obs 'basic\scenes\NativeSuppression01Live07.json.bak') 'AUTOMATED backup fixture'|Out-Null
 $t=Get-Content (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json
 if($case-eq'corrupt-backup'){Add-Content $t.backups[0].backup 'corrupt'}
 if($case-eq'changed-install'){Add-Content $installs[0].destination 'changed'}
 $rejected=$false;try{& (Join-Path $run 'Restore-Execution.ps1')|Out-Null}catch{if($case-eq'positive'){throw};$rejected=$true}
 if($case-ne'positive'){Check ($rejected-and(Test-Path $installs[0].destination)) ('rollback preserves unproven state '+$case);continue}
 & (Join-Path $prepared 'Verify-Restoration07.ps1')|Out-Null
 Check ((Get-Content (Join-Path $run 'cleanup-verification.json') -Raw|ConvertFrom-Json).passed) 'independent exact bytes/metadata restoration, new paths absent'
 $reused=$false;try{& (Join-Path $prepared 'Install-Execution07.ps1') -ScopeSha256 $scope.sha256 -ApprovalReceiptPath $approval -FreshPreflightReceiptPath $preflight -FreshPreflightSha256 (Pin $preflight).sha256|Out-Null}catch{$reused=$true}
 Check $reused 'installation cannot reuse the same attempt'
 Json (Join-Path $root 'adaptation.json') $adapt
}
foreach($f in $protected){Check ((Pin $f.path).sha256-ceq$f.sha256) ('actual original unchanged '+[IO.Path]::GetFileName($f.path))}
Json (Join-Path $out 'result.json') @{schema='NativeSuppression07InstallationFixtures';passed=$true;checks=@($checks);scope='Disposable files, path-only script substitution; no live approval, game/OBS writes or launches';sourceCommit=$head;productionSources=@('Install-Automatic07.ps1','Restore-Automatic07.ps1','Preflight07.ps1','Verify-Restoration07.ps1')|ForEach-Object {Pin (Join-Path $PSScriptRoot $_)}}
