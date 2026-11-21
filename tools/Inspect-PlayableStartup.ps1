#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$LaunchMarker,
 [ValidateRange(1,300)][int]$MaximumSeconds=180,
 [switch]$SnapshotOnly,
 [string]$OutputDirectory=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$privateRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-13')).TrimEnd('\')
$markerPath=[IO.Path]::GetFullPath($LaunchMarker)
if(!$markerPath.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Explicit local launch receipt path required.'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $privateRoot ('startup-observer-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputDirectory)
if(!$output.StartsWith($privateRoot+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'A new private PLAYABLE-13 observer directory is required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked observer output refused.'}}
if($SnapshotOnly-and!(Test-Path -LiteralPath $markerPath -PathType Leaf)){throw 'Snapshot requires an existing launch marker.'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$steam=Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -Name SteamPath
$steamRoot=[IO.Path]::GetFullPath([string]$steam.SteamPath)
$logs=[ordered]@{
 steamConsole=(Join-Path $steamRoot 'logs/console_log.txt')
 steamProcesses=(Join-Path $steamRoot 'logs/gameprocess_log.txt')
 rockstarLauncher=(Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rockstar Games/Launcher/launcher.log')
}
$watch=[Diagnostics.Stopwatch]::StartNew();$marker=$null;$markerHash=$null;$markerLocal=$null;$actionId=$null;$ambiguous=$false
$lastState='';$history=[Collections.Generic.List[object]]::new();$observedProcesses=@{};$finalTails=@{};$final=$null
function Tail([string]$File){
 if(!(Test-Path -LiteralPath $File -PathType Leaf)){return [ordered]@{available=$false;path=$File;text='';bytesAtRead=$null;tailBytes=0}}
 $stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite-bor[IO.FileShare]::Delete))
 try{
  $size=$stream.Length;$count=[int][Math]::Min($size,524288);$start=$size-$count;$stream.Position=$start
  $reader=[IO.StreamReader]::new($stream,[Text.UTF8Encoding]::new($false,$false))
  try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()}
  if($start-gt0){$newline=$text.IndexOf("`n");if($newline-ge0){$text=$text.Substring($newline+1)}}
  return [ordered]@{available=$true;path=$File;text=$text;bytesAtRead=$size;tailBytes=[Text.Encoding]::UTF8.GetByteCount($text)}
 }finally{$stream.Dispose()}
}
function SinceMarker([string]$Text){
 if(!$markerLocal){return @()}
 return @($Text -split "`r?`n"|Where-Object{$_-match'^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)' -and $Matches[1]-ge$markerLocal})
}
while($watch.Elapsed.TotalSeconds-lt$MaximumSeconds){
 if(!$marker-and(Test-Path -LiteralPath $markerPath -PathType Leaf)){
  $bytes=[IO.File]::ReadAllBytes($markerPath);if($bytes.Length-gt16384){throw 'Launch marker bound.'}
  $marker=[Text.UTF8Encoding]::new($false,$true).GetString($bytes)|ConvertFrom-Json
  if($marker.profile-notin@('PLAYABLE-12','PLAYABLE-13')-or$marker.maximumLaunches-ne1-or$marker.retry-ne$false){throw 'Single-launch marker contract required.'}
  # Recent ConvertFrom-Json versions may already return DateTime. Converting
  # that value to a locale-formatted string and reparsing can swap day/month.
  $markerUtc=if($marker.utc-is[DateTime]){$marker.utc.ToUniversalTime()}elseif($marker.utc-is[DateTimeOffset]){$marker.utc.UtcDateTime}else{[DateTimeOffset]::Parse([string]$marker.utc,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).UtcDateTime}
  $markerLocal=$markerUtc.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')
  $markerHash=(Get-FileHash -LiteralPath $markerPath).Hash.ToLowerInvariant()
  [IO.File]::WriteAllBytes((Join-Path $output 'launch-marker-copy.json'),$bytes)
 }
 $state='awaiting-launch-marker';$actions=@();$tracked=@();$rgl=@();$exactNow=$false
 if($marker){
  if((Get-FileHash -LiteralPath $markerPath).Hash.ToLowerInvariant()-cne$markerHash){throw 'Observed launch marker changed.'}
  foreach($key in $logs.Keys){$finalTails[$key]=Tail $logs[$key]}
  $allActions=@(SinceMarker $finalTails.steamConsole.text|Where-Object{$_-match'GameAction \[AppID 3240220, ActionID (\d+)\] : LaunchApp'})
  $ids=@($allActions|ForEach-Object{if($_-match'ActionID (\d+)'){[int]$Matches[1]}}|Select-Object -Unique)
  if($ids.Count-gt1){$ambiguous=$true}
  if(!$actionId-and$ids.Count-eq1){$actionId=$ids[0]}
  $actions=@($allActions|Where-Object{$_-match("ActionID "+$actionId+'\]')})
  $tracked=@(SinceMarker $finalTails.steamProcesses.text|Where-Object{$_-match'AppID 3240220 (adding PID|no longer tracking PID)|Remove 3240220 from running list'})
  $rgl=@(SinceMarker $finalTails.rockstarLauncher.text|Where-Object{$_-match'Creating Steam min mode launch|Re-routed the launch request|shutdown required|Launching|Game exited|Exit code|ERROR|FATAL'})
  $argsWaiting=@($actions|Where-Object{$_-match'waiting for user response to ShowGameArgs'}).Count-gt0
  $argsContinued=@($actions|Where-Object{$_-match'continues with user response "ShowGameArgs"'}).Count-gt0
  $interstitialWaiting=@($actions|Where-Object{$_-match'waiting for user response to ShowInterstitials'}).Count-gt0
  $interstitialContinued=@($actions|Where-Object{$_-match'continues with user response "ShowInterstitials"'}).Count-gt0
  $creatingProcess=@($actions|Where-Object{$_-match'changed task to CreatingProcess'}).Count-gt0
  $steamCompleted=@($actions|Where-Object{$_-match'changed task to Completed'}).Count-gt0
  foreach($process in @(Get-Process -Name GTA5_Enhanced,GTA5,PlayGTAV,RAGEPluginHook,Launcher -ErrorAction SilentlyContinue)){
   $record=[ordered]@{name=$process.ProcessName;pid=$process.Id;observedUtc=[DateTime]::UtcNow.ToString('o');path=$null;startUtc=$null;readError=$null;exactEnhanced=$false}
   try{$record.path=$process.MainModule.FileName;$record.startUtc=$process.StartTime.ToUniversalTime().ToString('o')
    $record.exactEnhanced=$process.ProcessName-ceq'GTA5_Enhanced'-and[String]::Equals($record.path,(Join-Path (Split-Path -Parent $marker.route) 'GTA5_Enhanced.exe'),[StringComparison]::OrdinalIgnoreCase)-and$process.StartTime.ToUniversalTime()-ge$markerUtc
   }catch{$record.readError=$_.Exception.GetType().Name}
   if($record.exactEnhanced){$exactNow=$true};$observedProcesses[$process.Id]=$record
  }
  $state=if($ambiguous){'multiple-steam-actions-observed'}elseif($exactNow){'exact-enhanced-process-observed'}elseif($creatingProcess-or$steamCompleted-or$tracked.Count){'platform-progress-awaiting-exact-enhanced'}elseif($interstitialWaiting-and!$interstitialContinued){'steam-interstitial-awaiting-acceptance'}elseif($argsWaiting-and!$argsContinued){'steam-custom-arguments-awaiting-acceptance'}elseif($argsContinued){'steam-arguments-accepted-awaiting-next-step'}else{'waiting-for-new-steam-action'}
 }
 $final=[ordered]@{schema=1;profile='PLAYABLE-13';kind='read-only-startup-observer';state=$state;observedUtc=[DateTime]::UtcNow.ToString('o');elapsedSeconds=$watch.Elapsed.TotalSeconds;
  markerSha256=$markerHash;markerLocalTime=$markerLocal;windowsTimeZone=[TimeZoneInfo]::Local.Id;steamActionId=$actionId;multipleSteamActionsObserved=$ambiguous;
  steamGameArgsWaiting=$(if($marker){$argsWaiting}else{$null});steamGameArgsContinued=$(if($marker){$argsContinued}else{$null});
  steamInterstitialWaiting=$(if($marker){$interstitialWaiting}else{$null});steamInterstitialContinued=$(if($marker){$interstitialContinued}else{$null});
  creatingProcessRecorded=$(if($marker){$creatingProcess}else{$null});steamCompletedRecorded=$(if($marker){$steamCompleted}else{$null});
  steamActionLines=$actions;steamTrackedProcessLines=$tracked;rockstarStageLines=$rgl;observedProcesses=@($observedProcesses.Values);
  observerStartedNoProcess=$true;gameOrFrameworkCallsMade=$false;leaseWritten=$false;inputInjected=$false;settingsChanged=$false;launchRetry=$false;
  limits='Read-only log/process observations. A returned UI click is not proof of Steam acceptance. Missing lines or missed short processes remain unobserved; timeout is a bound, not a root cause. This tool neither launches nor continues a launcher, approves a test, writes a lease, attaches a plugin, calls a game API nor starts audio.'}
 if($state-cne$lastState){$history.Add([ordered]@{state=$state;utc=$final.observedUtc;elapsedSeconds=$final.elapsedSeconds;steamActionId=$actionId});$lastState=$state}
 $json=$final|ConvertTo-Json -Depth 10
 [IO.File]::WriteAllText((Join-Path $output 'status.json'),$json,[Text.UTF8Encoding]::new($false))
 if($SnapshotOnly-or$exactNow-or$ambiguous){break}
 Start-Sleep -Milliseconds 500
}
if(!$final){throw 'Observer ended before a snapshot.'}
foreach($key in $finalTails.Keys){
 $tail=$finalTails[$key];if($tail.available){$target=Join-Path $output ($key+'.tail.txt');[IO.File]::WriteAllText($target,$tail.text,[Text.UTF8Encoding]::new($false))}
}
$final['finishedUtc']=[DateTime]::UtcNow.ToString('o');$final['snapshotOnly']=[bool]$SnapshotOnly;$final['maximumSeconds']=$MaximumSeconds
$final['maximumObservationBoundReached']=!$SnapshotOnly-and!@($observedProcesses.Values|Where-Object exactEnhanced).Count-and!$ambiguous
$final['stateHistory']=@($history);$final['observerSha256']=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
$final|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8
Write-Output ('READ-ONLY '+$final.state+'; '+(Join-Path $output 'result.json'))
