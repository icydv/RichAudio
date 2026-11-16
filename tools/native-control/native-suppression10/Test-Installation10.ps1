param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh bounded fixture directory required'}
if(@(& git -C $repo status --porcelain).Count){throw 'Commit source before final transaction fixtures'}
$head=(& git -C $repo rev-parse HEAD).Trim();New-Item -ItemType Directory -Path $out|Out-Null
function Pin($p){$i=Get-Item $p;@{path=$i.FullName;bytes=$i.Length;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}}
function WriteFixture($p,$s){[IO.Directory]::CreateDirectory((Split-Path $p))|Out-Null;[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false));return $p}
function Json($p,$v){WriteFixture $p ($v|ConvertTo-Json -Depth 30)|Out-Null}
$checks=[Collections.Generic.List[string]]::new()
function Check($b,$s){if(!$b){throw $s};$checks.Add($s);Write-Output ('PASS '+$s)}
$realGame='D:\Games\steamapps\common\Grand Theft Auto V Enhanced';$realObs='C:\Users\Libby\AppData\Roaming\obs-studio';$realSettings='C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced'
$protected=@((Join-Path $realGame 'GTA5_Enhanced.exe'),(Join-Path $realGame 'TrainerV.asi'),(Join-Path $realObs 'user.ini'),(Join-Path $realObs 'global.ini'),(Join-Path $realSettings 'settings.xml'))|ForEach-Object {Pin $_}
foreach($case in 'positive','configuration-enabled','no-obs-startup-refusal','unexpected-configuration','interrupted-setting','source-drift','old-approval','extra-root','corrupt-backup','changed-install'){
 $root=Join-Path $out $case;$game=Join-Path $root 'game';$obs=Join-Path $root 'obs';$documents=Join-Path $root 'documents';$settings=Join-Path $documents 'Rockstar Games\GTAV Enhanced';$runs=Join-Path $root 'transactions';$run=Join-Path $runs 'execution-10';$prepared=Join-Path $root 'installation'
 foreach($p in @($root,$game,$obs,$settings,$runs,$prepared)){[IO.Directory]::CreateDirectory($p)|Out-Null}
 $scopePath=Join-Path $root 'scope.json';$relativeRoot=[IO.Path]::GetRelativePath($repo,$root)
 [IO.Directory]::CreateDirectory((Join-Path $obs 'logs'))|Out-Null
 $helperSource=Join-Path (Join-Path $PSScriptRoot '../native-suppression08') 'FocusConfiguration08.psm1';$helper=Join-Path $prepared 'FocusConfiguration08.psm1'
 $helperText=[IO.File]::ReadAllText($helperSource).Replace('[Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)',("'"+$documents+"'"))
 # Fixed Known Documents/registry roots only; no parser, state or hash guard is removed.
 $registry="[Environment]::ExpandEnvironmentVariables((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders').Personal)"
 $helperText=$helperText.Replace($registry,("'"+$documents+"'"));WriteFixture $helper $helperText|Out-Null
 $adapt=@{}
 foreach($pair in @(@('Install-Automatic10.ps1','Install-Execution10.ps1'),@('Restore-Automatic10.ps1','Restore-Execution.ps1'),@('Preflight10.ps1','Preflight10.ps1'),@('Verify-Restoration10.ps1','Verify-Restoration10.ps1'))){
  $source=Join-Path $PSScriptRoot $pair[0];$text=Get-Content $source -Raw
  # Only fixed filesystem roots are substituted. No approval, state, hash,
  # inventory, metadata, or rollback guard is removed for these disposable files.
  $text=$text.Replace($realGame,$game).Replace($realObs,$obs).Replace($realSettings,$settings).Replace('C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01',$runs)
  $text=$text.Replace('.local\native-suppression-01\candidate-10\scope.json',(Join-Path $relativeRoot 'scope.json')).Replace('.local\native-suppression-01\candidate-10\installation',(Join-Path $relativeRoot 'installation'))
  $target=Join-Path $prepared $pair[1];WriteFixture $target $text|Out-Null;$adapt[$pair[1]]=@{production=(Pin $source);fixture=(Pin $target);onlyFixedRootsSubstituted=$true}
 }
 $inventory=@();foreach($n in 'TrainerV.asi','fixture-original.dll'){$inventory+=@(Pin (WriteFixture (Join-Path $game $n) ('fixture-original-'+$n)))}
 $originalSettings=@();foreach($n in 'user.ini','global.ini'){$originalSettings+=@(Pin (WriteFixture (Join-Path $obs $n) ('fixture-original-'+$n)))}
 $gameSettings=@();foreach($n in 'settings.xml','Profiles\DEADBEEF\cfg.dat','Profiles\DEADBEEF\pc_settings.bin'){$payload=if($n-ceq'settings.xml'){'<Settings><video><PauseOnFocusLoss value="'+$(if($case-in@('configuration-enabled','interrupted-setting')){'1'}else{'0'})+'" /></video><unrelated>retain this</unrelated></Settings>'}else{'fixture-original-'+$n};$gameSettings+=@(Pin (WriteFixture (Join-Path $settings $n) $payload))}
 $logs=@();foreach($n in 'asiloader.log','ScriptHookV.log','OpenRPF.log','ScriptHookVDotNet.log'){$exists=$n-in@('asiloader.log','ScriptHookV.log');$item=@{path=(Join-Path $game $n);exists=$exists};if($exists){$item.original=Pin (WriteFixture $item.path ('fixture-original-'+$n))};$logs+=@($item)}
 $gameNames=@('ScriptHookVDotNet.asi','ScriptHookVDotNet2.dll','ScriptHookVDotNet3.dll','MinHook.x64.dll','ScriptHookVDotNet.ini','scripts\RichAudio.NativeSuppression10.dll','scripts\RichAudio.NativeSuppression10.ini','mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf','mods\update\update.rpf');$installs=@();$i=0
 foreach($n in $gameNames){$source=WriteFixture (Join-Path $root ('sources\game-'+$i)) ('AUTOMATED FIXTURE payload '+$i);$installs+=@{destination=(Join-Path $game $n);source=(Pin $source);requiredAbsent=$true};$i++}
 $obsInstalls=@();foreach($n in 'basic\profiles\NativeSuppression01Live10\basic.ini','basic\scenes\NativeSuppression01Live10.json'){$source=WriteFixture (Join-Path $root ('sources\obs-'+$i)) ('AUTOMATED FIXTURE recorder '+$i);$obsInstalls+=@{destination=(Join-Path $obs $n);source=(Pin $source);requiredAbsent=$true};$i++}
 $extra=@();foreach($n in 'Recorder10.lua','operator-plan.json'){$extra+=@{name=$n;source=(Pin (WriteFixture (Join-Path $root ('sources\'+$n)) 'AUTOMATED FIXTURE; never loaded by OBS'))}}
 $pin=Pin (WriteFixture (Join-Path $root 'protected\original.rpf') 'AUTOMATED bounded original archive fixture')
 $s=@{schema='RichAudioNativeSuppression01Scope';candidateName='candidate-10';repository=$repo;sourceCommit=$head;sourceClean=$true;authorized=$false;executed=$false;gameLaunches=1;offlineStoryModeOnly=$true;game=(Pin (WriteFixture (Join-Path $game 'GTA5_Enhanced.exe') 'AUTOMATED inert game fixture'));gameInstall=$installs;parkAndRestore=($inventory|Where-Object {$_.path.EndsWith('TrainerV.asi')});unchangedRootBinaryInventory=$inventory;gameSettingsBackups=$gameSettings;logBackupsRequired=$logs;originalBaseArchive=$pin;originalGranularArchive=$pin;originalResidentArchive=$pin;procedureAddendum=$pin;registrationProcedure=$pin;builds=@($pin);operator=@{executionFiles=$extra;dependencies=@()};capture=@{executable=(Pin (WriteFixture (Join-Path $obs 'obs64.exe') 'AUTOMATED inert recorder fixture'));install=$obsInstalls;originalSettingsToBackup=$originalSettings;recordingDirectory=(Join-Path $run 'capture')};installation=@{executionDirectory=$run;installerScript=(Pin (Join-Path $prepared 'Install-Execution10.ps1'));rollbackScript=(Pin (Join-Path $prepared 'Restore-Execution.ps1'));requiredAbsentDirectories=@((Join-Path $game 'scripts'),(Join-Path $game 'mods'),(Join-Path $obs 'basic\profiles\NativeSuppression01Live10'));additionalRequiredAbsent=@((Join-Path $game 'scripts\RichAudio.NativeSuppression10.Evidence'),(Join-Path $obs 'basic\scenes\NativeSuppression01Live10.json.bak'),$run)}}
 Import-Module $helper -Force
 $c=Get-CurrentFocusConfiguration08 'DEADBEEF';$parsed=Read-FocusBytes08 ([IO.File]::ReadAllBytes($c.path));$h=[Security.Cryptography.SHA256]::Create();try{$preparedHash=[Convert]::ToHexString($h.ComputeHash($parsed.bytes)).ToLowerInvariant()}finally{$h.Dispose()}
 $s.focusConfiguration=@{documents=$documents;root=$settings;path=$c.path;profile='DEADBEEF';originalValue=$c.value;originalSha256=$c.sha256;preparedSha256=$preparedHash;changeNeeded=$c.changeNeeded;helper=(Pin $helper)}
 $s.operator.dependencies=@((Pin $helper))
 Json $scopePath $s;$scope=Pin $scopePath
 $approval=Join-Path $root 'approval.json';Json $approval @{schema='NativeSuppression01Candidate10Approval';candidate='candidate-10';scopeSha256=$scope.sha256;sourceCommit=$head;userApprovalText='AUTOMATED DISPOSABLE TRANSACTION FIXTURE. This is not human consent or live approval.';userPresentConfirmed=$true;oneRunApproved=$true;approvedUtc=[DateTime]::UtcNow.AddSeconds(-1).ToString('o')}
 if($case-eq'source-drift'){Add-Content $installs[0].source.path 'changed'}
 if($case-eq'extra-root'){WriteFixture (Join-Path $game 'unexpected.dll') 'unexpected'|Out-Null}
 if($case-eq'old-approval'){$a=Get-Content $approval -Raw|ConvertFrom-Json;$a.schema='NativeSuppression01Candidate06Approval';Json $approval $a}
 $preflight=Join-Path $root 'preflight.json'
 if($case-in@('source-drift','extra-root')){
  $rejected=$false;try{& (Join-Path $prepared 'Preflight10.ps1') -ScopeSha256 $scope.sha256 -OutputPath $preflight|Out-Null}catch{$rejected=$true}
  Check ($rejected-and!(Test-Path $run)) ('read-only refusal '+$case);continue
 }
 & (Join-Path $prepared 'Preflight10.ps1') -ScopeSha256 $scope.sha256 -OutputPath $preflight|Out-Null
 $lock=$null;if($case-ceq'interrupted-setting'){$lock=[IO.File]::Open($c.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)}
 $rejected=$false;try{& (Join-Path $prepared 'Install-Execution10.ps1') -ScopeSha256 $scope.sha256 -ApprovalReceiptPath $approval -FreshPreflightReceiptPath $preflight -FreshPreflightSha256 (Pin $preflight).sha256|Out-Null}catch{if($case-notin@('old-approval','interrupted-setting')){throw};$rejected=$true}finally{if($lock){$lock.Dispose()}}
 if($case-ceq'interrupted-setting'){
  $partial=Get-Content -LiteralPath (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json
  Check ($rejected-and$partial.status-ceq'installation-failed-requires-ledger-rollback'-and$partial.focusConfiguration.state-ceq'prepared-write-pending'-and(Pin $c.path).sha256-ceq$c.sha256-and!$partial.files.Count-and(Test-Path -LiteralPath (Join-Path $game 'TrainerV.asi'))) 'interrupted setting write retains ledger/backups and does not mutate configuration or deploy files'
  foreach($b in $partial.backups){Check ((Pin $b.backup).sha256-ceq$b.sha256-and(Pin $b.path).sha256-ceq$b.sha256) ('interrupted original retained '+[IO.Path]::GetFileName($b.path))};continue
 }
 if($case-eq'old-approval'){Check ($rejected-and!(Test-Path $run)) 'consumed older approval rejected before mutation';continue}
 Check ((Get-Content (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json).status-eq'installed-verified') ('exact temporary install '+$case)
 Check ((Get-Content (Join-Path $run 'configured-focus.json') -Raw|ConvertFrom-Json).changed-eq($case-ceq'configuration-enabled')) ('correct no-op or one-byte configuration transaction '+$case)
 if($case-cne'no-obs-startup-refusal'){
  WriteFixture (Join-Path $obs 'logs\fixture.txt') 'AUTOMATED fixture final recorder log; no OBS ran'|Out-Null
  foreach($f in $originalSettings+$gameSettings|Where-Object {$_.path-cne$c.path}){WriteFixture $f.path 'AUTOMATED rewritten setting fixture'|Out-Null}
  WriteFixture $obsInstalls[1].destination 'AUTOMATED OBS serialization fixture'|Out-Null
  WriteFixture (Join-Path $obs 'basic\scenes\NativeSuppression01Live10.json.bak') 'AUTOMATED backup fixture'|Out-Null
 }
 if($case-ceq'unexpected-configuration'){[IO.File]::AppendAllText($c.path,'<!-- concurrent unrelated edit -->')}
 $t=Get-Content (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json
 if($case-eq'corrupt-backup'){Add-Content $t.backups[0].backup 'corrupt'}
 if($case-eq'changed-install'){Add-Content $installs[0].destination 'changed'}
 $positive=$case-in@('positive','configuration-enabled','no-obs-startup-refusal')
 $rejected=$false;try{& (Join-Path $run 'Restore-Execution.ps1')|Out-Null}catch{if($positive){throw};$rejected=$true}
 if(!$positive){Check ($rejected-and(Test-Path $installs[0].destination)) ('rollback preserves unproven state '+$case);continue}
 & (Join-Path $prepared 'Verify-Restoration10.ps1')|Out-Null
 Check ((Get-Content (Join-Path $run 'cleanup-verification.json') -Raw|ConvertFrom-Json).passed) 'independent exact bytes/metadata restoration, new paths absent'
 $reused=$false;try{& (Join-Path $prepared 'Install-Execution10.ps1') -ScopeSha256 $scope.sha256 -ApprovalReceiptPath $approval -FreshPreflightReceiptPath $preflight -FreshPreflightSha256 (Pin $preflight).sha256|Out-Null}catch{$reused=$true}
 Check $reused 'installation cannot reuse the same attempt'
 Json (Join-Path $root 'adaptation.json') $adapt
}
foreach($f in $protected){Check ((Pin $f.path).sha256-ceq$f.sha256) ('actual original unchanged '+[IO.Path]::GetFileName($f.path))}
Json (Join-Path $out 'result.json') @{schema='NativeSuppression10InstallationFixtures';passed=$true;checks=@($checks);scope='Disposable files, path-only script substitution; no live approval, game/OBS writes or launches';sourceCommit=$head;productionSources=@('Install-Automatic10.ps1','Restore-Automatic10.ps1','Preflight10.ps1','Verify-Restoration10.ps1')|ForEach-Object {Pin (Join-Path $PSScriptRoot $_)}}
