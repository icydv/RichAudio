#requires -Version 7.0
# Pure observer policy: no filesystem, process, game, UI or clock calls.
function ConvertTo-HandoffUtc {
 param($Value)
 if($Value-is[DateTimeOffset]){return $Value.UtcDateTime}
 if($Value-is[DateTime]){if($Value.Kind-eq[DateTimeKind]::Unspecified){return [DateTime]::SpecifyKind($Value,[DateTimeKind]::Utc)};return $Value.ToUniversalTime()}
 return [DateTimeOffset]::Parse([string]$Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).UtcDateTime
}
function Get-HandoffBytesHash {
 param([byte[]]$Bytes)
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return [Convert]::ToHexString($sha.ComputeHash($Bytes)).ToLowerInvariant()}finally{$sha.Dispose()}
}
function New-HandoffLogBaseline {
 param([byte[]]$Bytes,[Parameter(Mandatory)]$CapturedUtc)
 if($Bytes.Length-gt8388608){throw 'Observer log byte bound exceeded.'}
 [pscustomobject]@{Bytes=$Bytes.Length;Sha256=(Get-HandoffBytesHash $Bytes);CapturedUtc=(ConvertTo-HandoffUtc $CapturedUtc).ToString('o');EndsWithNewline=($Bytes.Length-eq0-or$Bytes[-1]-eq10)}
}
function Select-CurrentHandoffLog {
 [CmdletBinding()]
 param([byte[]]$CurrentBytes,[Parameter(Mandatory)]$Baseline,[Parameter(Mandatory)]$Launch,$Owner,[byte[]]$LeaseBytes,$CurrentProcess,
  [Parameter(Mandatory)][string]$ExpectedGamePath,[Parameter(Mandatory)]$ObservedUtc,[Parameter(Mandatory)][TimeZoneInfo]$LogTimeZone)
 $result=[pscustomobject]@{Admitted=$false;ScopeValidated=$false;Reason='current-process-or-session-unavailable';LogMode=$null;Content='';EntryUtc=$null;Ready=$false;Active=$false;TerminalLine=$null}
 if($CurrentBytes.Length-gt8388608){throw 'Observer log byte bound exceeded.'}
 try{
  $launchUtc=ConvertTo-HandoffUtc $Launch.utc;$observed=ConvertTo-HandoffUtc $ObservedUtc
  if($Launch.profile-cne'PLAYABLE-14'-or$Launch.sessionId-notmatch'\A[a-f0-9]{32}\z'-or!$Owner-or!$CurrentProcess-or!$LeaseBytes.Length){return $result}
  $creationUtc=[DateTime]::FromFileTimeUtc([long]$Owner.processCreationFileTime)
  if($Owner.profile-cne$Launch.profile-or$Owner.sessionId-cne$Launch.sessionId-or$CurrentProcess.Alive-ne$true-or$CurrentProcess.Id-le0-or
   $CurrentProcess.Id-ne$Owner.gameProcessId-or[string]$CurrentProcess.CreationFileTime-cne[string]$Owner.processCreationFileTime-or
   ![string]::Equals($CurrentProcess.Path,$ExpectedGamePath,[StringComparison]::OrdinalIgnoreCase)-or
   $creationUtc-lt$launchUtc-or$creationUtc-gt$observed){$result.Reason='current-process-or-session-mismatch';return $result}
  if((Get-HandoffBytesHash $LeaseBytes)-cne$Owner.sha256){$result.Reason='current-lease-hash-mismatch';return $result}
  $lease=[Text.UTF8Encoding]::new($false,$true).GetString($LeaseBytes)|ConvertFrom-Json
  if(@($lease.PSObject.Properties).Count-ne21-or$lease.schema-ne1-or$lease.profile-cne$Launch.profile-or$lease.sessionId-cne$Launch.sessionId-or
   $lease.gameProcessId-ne$CurrentProcess.Id-or[string]$lease.gameProcessCreationFileTime-cne[string]$CurrentProcess.CreationFileTime-or
   ![string]::Equals($lease.gamePath,$ExpectedGamePath,[StringComparison]::OrdinalIgnoreCase)-or$lease.passiveOnly-ne$true-or$lease.audioPlaybackAllowed-ne$false-or$lease.fixtureOnly-ne$false){$result.Reason='current-lease-scope-mismatch';return $result}
  $result.ScopeValidated=$true
  if((ConvertTo-HandoffUtc $Baseline.CapturedUtc)-gt$launchUtc-or$Baseline.Bytes-lt0-or$Baseline.Bytes-gt8388608-or$Baseline.Sha256-notmatch'\A[a-f0-9]{64}\z'){$result.Reason='invalid-prelaunch-baseline';return $result}
  $offset=0;$result.LogMode='truncated-or-replaced'
  if($CurrentBytes.Length-ge$Baseline.Bytes){$prefix=[byte[]]::new([int]$Baseline.Bytes);[Array]::Copy($CurrentBytes,0,$prefix,0,$prefix.Length)
   if((Get-HandoffBytesHash $prefix)-ceq$Baseline.Sha256){$offset=[int]$Baseline.Bytes;$result.LogMode='unchanged-or-appended'}}
  if($offset-ge$CurrentBytes.Length){$result.Reason='no-new-log-bytes';return $result}
  if($offset-gt0-and!$Baseline.EndsWithNewline){while($offset-lt$CurrentBytes.Length-and$CurrentBytes[$offset]-ne10){$offset++};$offset++}
  $end=$CurrentBytes.Length-1;while($end-ge$offset-and$CurrentBytes[$end]-ne10){$end--}
  if($end-lt$offset){$result.Reason='no-complete-new-log-line';return $result}
  $text=[Text.UTF8Encoding]::new($false,$true).GetString($CurrentBytes,$offset,$end-$offset+1)
  $rows=[Collections.Generic.List[object]]::new()
  foreach($line in $text-split"`r?`n"){
   if($line-notmatch'^\[(?<stamp>[^\]]+)\]\s+(?<message>.*)$'){continue};$stamp=[DateTime]::MinValue
   if(![DateTime]::TryParseExact($Matches.stamp,[string[]]@('M/d/yyyy h:mm:ss tt.fff','M/d/yyyy h:mm:ss tt','M/d/yyyy H:mm:ss.fff'),[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$stamp)){continue}
   if($LogTimeZone.IsInvalidTime($stamp)-or$LogTimeZone.IsAmbiguousTime($stamp)){continue}
   $utc=[TimeZoneInfo]::ConvertTimeToUtc([DateTime]::SpecifyKind($stamp,[DateTimeKind]::Unspecified),$LogTimeZone)
   if($utc-lt$creationUtc-or$utc-gt$observed){continue}
   $rows.Add([pscustomobject]@{Line=$line;Message=$Matches.message;Utc=$utc})
  }
  $entries=@($rows|Where-Object{$_.Message.StartsWith('RichAudio PLAYABLE-14 passive fresh-context handoff only;',[StringComparison]::Ordinal)})
  if($entries.Count-gt1){$result.Reason='ambiguous-current-profile-entries';return $result}
  if(!$entries.Count){
   $early=@($rows|Where-Object{$_.Message.StartsWith('RichAudio passive compatibility/lifecycle failure:',[StringComparison]::Ordinal)})
   if($early.Count-eq1){$result.Admitted=$true;$result.Reason='current-lifecycle-terminal';$result.EntryUtc=$early[0].Utc.ToString('o');$result.Content=$early[0].Line;$result.TerminalLine=$early[0].Line;return $result}
   $result.Reason='no-current-profile-entry';return $result
  }
  $entry=$entries[0];$selected=@($rows|Where-Object{$_.Utc-ge$entry.Utc});$result.Admitted=$true;$result.Reason='current-process-session-log-epoch';$result.EntryUtc=$entry.Utc.ToString('o')
  $result.Content=($selected.Line-join"`n");$result.Ready=$result.Content.Contains('RichAudio handoff READY:');$result.Active=$result.Content.Contains('RichAudio passive handoff ACTIVE (120 seconds maximum)')
  $terminal=@($selected|Where-Object{$_.Message-match'^RichAudio passive handoff (stopped:|RETIRED:)|^RichAudio passive compatibility/lifecycle failure:'}|Select-Object -Last 1)
  if($terminal.Count){$result.TerminalLine=$terminal[0].Line};return $result
 }catch{$result.Admitted=$false;$result.Content='';$result.Ready=$false;$result.Active=$false;$result.TerminalLine=$null;$result.Reason='invalid-current-scope-or-log';return $result}
}
function Get-HandoffObserverDecision {
 # The original monotonic anchors are inputs; log rewrites never re-anchor them.
 param([long]$LaunchTicks,[long]$Frequency,[long]$NowTicks,[Nullable[long]]$StartupAtTicks=$null,[Nullable[long]]$ActiveAtTicks=$null,
  [string]$PriorFailure='',$ScopedLog,[bool]$ProcessGone=$false)
 if($Frequency-le0-or$NowTicks-lt$LaunchTicks){throw 'Invalid monotonic observer domain.'}
 $r=[pscustomobject]@{State=$(if($null-ne$ActiveAtTicks){'active'}else{'waiting'});Reason=$null;Failure=$PriorFailure;ActiveAtTicks=$ActiveAtTicks;StopRequired=$false}
 $elapsed=([decimal]$NowTicks-$LaunchTicks)/$Frequency
 if($PriorFailure){$r.State='observer-stop-required';$r.Reason=$PriorFailure;$r.StopRequired=$true;return $r}
 if($null-eq$StartupAtTicks-and$elapsed-ge120){$r.Failure='startup-deadline-no-exact-enhanced-observed'}
 elseif($null-eq$ActiveAtTicks-and$elapsed-ge300){$r.Failure='conservative-launch-waiting-deadline'}
 elseif($ProcessGone){$r.State='process-exited';$r.Reason='owned-game-process-exit-observed';$r.StopRequired=$true;return $r}
 elseif($ScopedLog.Admitted){
  if($ScopedLog.Active-and$null-eq$ActiveAtTicks){$r.ActiveAtTicks=$NowTicks}
  if($ScopedLog.TerminalLine){$r.State='terminal';$r.Reason=$ScopedLog.TerminalLine;$r.StopRequired=$true;return $r}
  if($null-ne$r.ActiveAtTicks){$r.State='active'}elseif($ScopedLog.Ready){$r.State='ready-for-operator'}
 }
 if(!$r.Failure-and$null-ne$r.ActiveAtTicks-and([decimal]$NowTicks-[long]$r.ActiveAtTicks)/$Frequency-ge120){$r.Failure='active-deadline-observed-without-terminal'}
 if($r.Failure){$r.State='observer-stop-required';$r.Reason=$r.Failure;$r.StopRequired=$true}
 return $r
}
