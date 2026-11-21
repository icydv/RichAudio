# Private bounded fixture journal. Only Read-ExpiryStageJournal's allowlisted
# projection may enter console/hosted evidence; paths, nonce and identities stay private.
$script:ExpiryStages=@{
 1='parent-start-requested';2='parent-start-returned';3='parent-wait-begin';4='parent-wait-completed';5='parent-wait-expired';6='parent-kill-requested';7='parent-kill-verified';8='parent-exit-observed'
 32='child-entry';33='appdomain-create-before';34='appdomain-created';35='appdomain-activate-before';36='appdomain-activated';37='appdomain-run-before';38='sender-entry';39='codec-preparation-before';40='codec-prepared';41='sender-ready';42='sender-start-returned';43='transport-connected-observed';44='first-work-published';45='first-completion-observed';46='sender-stop-before';47='sender-stopped';48='sender-dispose-before';49='sender-disposed';50='appdomain-run-returned';51='appdomain-unload-before';52='appdomain-unloaded';53='terminal-record-before';54='terminal-record-written';55='child-return';56='receiver-entry';57='receiver-ready';58='receiver-connected-observed';59='receiver-completion-observed';60='receiver-finished';61='receiver-dispose-before';62='receiver-disposed';63='fixture-failed'
}
function New-ExpiryStageJournal([string]$Path,[string]$Role) {
 $file=$null;$mapping=$null;$view=$null
 try {
  $file=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::ReadWrite)
  $file.SetLength(2112)
  $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false)
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($sid)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))
  Set-Acl -LiteralPath $Path -AclObject $acl
  $mapping=[IO.MemoryMappedFiles.MemoryMappedFile]::CreateFromFile($file,[NullString]::Value,2112,[IO.MemoryMappedFiles.MemoryMappedFileAccess]::ReadWrite,[IO.HandleInheritability]::None,$true)
  $view=$mapping.CreateViewAccessor(0,2112,[IO.MemoryMappedFiles.MemoryMappedFileAccess]::ReadWrite)
  $owner=(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks;$nonce=[guid]::NewGuid();$bytes=$nonce.ToByteArray()
  $view.Write(0,[int]0x45585032);$view.Write(4,[int]1);$view.Write(8,[int]$PID);$view.Write(12,[int]$(if($Role -eq 'sender'){1}else{2}));$view.Write(16,[long]$owner);$view.Write(24,[long][Diagnostics.Stopwatch]::Frequency);$view.WriteArray(32,$bytes,0,16)
  [pscustomobject]@{Path=$Path;Role=$Role;Nonce=$nonce.ToString('N');OwnerPid=$PID;OwnerTicks=$owner;File=$file;Mapping=$mapping;View=$view;ParentEntries=0}
 } catch {if($view){$view.Dispose()};if($mapping){$mapping.Dispose()};if($file){$file.Dispose()};throw}
}
function Add-ExpiryParentStage($Journal,[int]$Stage) {
 if(!$Journal -or $Stage -lt 1 -or $Stage -gt 8 -or $Journal.ParentEntries -ge 16){throw 'Parent journal bound'}
 $index=$Journal.ParentEntries;$offset=64+$index*32;$Journal.ParentEntries++
 $Journal.View.Write($offset+4,[int]$Stage);$Journal.View.Write($offset+8,[int]$PID);$Journal.View.Write($offset+12,[int]0);$Journal.View.Write($offset+16,[long][Diagnostics.Stopwatch]::GetTimestamp());$Journal.View.Write($offset+24,[long]0);[Threading.Thread]::MemoryBarrier();$Journal.View.Write($offset,[int]($index+1))
}
function Read-ExpiryStageJournal($Journal,$Child) {
 $events=[Collections.Generic.List[object]]::new();$valid=$true;$childCount=0;$parentCount=0;$lastParent=$null;$lastChild=$null
 if(!$Journal){return [pscustomobject]@{State='missing';Events=@()}}
 $actualNonce=[byte[]]::new(16);$Journal.View.ReadArray(32,$actualNonce,0,16)|Out-Null
 if($Journal.View.ReadInt32(0) -ne 0x45585032 -or $Journal.View.ReadInt32(4) -ne 1 -or $Journal.View.ReadInt32(8) -ne $Journal.OwnerPid -or $Journal.View.ReadInt32(12) -ne $(if($Journal.Role -eq 'sender'){1}else{2}) -or $Journal.View.ReadInt64(16) -ne $Journal.OwnerTicks -or $Journal.View.ReadInt64(24) -ne [Diagnostics.Stopwatch]::Frequency -or ([guid]::new($actualNonce)).ToString('N') -cne $Journal.Nonce){return [pscustomobject]@{State='owner-mismatch';Events=@()}}
 $expectedChild=if($Child){$Child.Id}else{0}
 $parentGap=$false;$childGap=$false;$parentQpc=[long]0;$childQpc=[long]0
 for($slot=0;$slot -lt 64;$slot++){
  $offset=64+$slot*32;$commit=$Journal.View.ReadInt32($offset);if($commit -eq 0){if($slot -lt 16){$parentGap=$true}else{$childGap=$true};continue}
  $parent=$slot -lt 16;$expectedIndex=if($parent){$slot+1}else{$slot-15}
  $stage=$Journal.View.ReadInt32($offset+4);$writer=$Journal.View.ReadInt32($offset+8);$domain=$Journal.View.ReadInt32($offset+12);$qpc=$Journal.View.ReadInt64($offset+16)
  if($commit -ne $expectedIndex -or !$script:ExpiryStages.ContainsKey($stage) -or ($parent -and ($parentGap -or $stage -gt 8 -or $writer -ne $Journal.OwnerPid -or $domain -ne 0 -or $qpc -lt $parentQpc)) -or (!$parent -and ($childGap -or $stage -lt 32 -or $writer -ne $expectedChild -or $domain -le 0 -or $qpc -lt $childQpc)) -or $qpc -le 0){$valid=$false;continue}
  $name=$script:ExpiryStages[$stage];$events.Add(@($name,$qpc,$domain))
  if($parent){$parentCount++;$lastParent=$name;$parentQpc=$qpc}else{$childCount++;$lastChild=$name;$childQpc=$qpc}
 }
 [pscustomobject][ordered]@{State=$(if($valid){'qualified'}else{'invalid-entry'});ByteBound=2112;EntryLimit=64;ClockFrequency=[Diagnostics.Stopwatch]::Frequency;ParentEventCount=$parentCount;ChildEventCount=$childCount;LastParentStage=$lastParent;LastChildStage=$lastChild;Events=$events.ToArray();Limitation='Stage observations bracket fixture calls; connection/completion are polled, and missing stages do not establish a cause.'}
}
function Close-ExpiryStageJournal($Journal) {if($Journal){$Journal.View.Flush();$Journal.View.Dispose();$Journal.Mapping.Dispose();$Journal.File.Dispose()}}
function Get-ExpiryRemainingWaitMs([double]$ElapsedMs,[int]$LimitMs) {
 if($LimitMs -notin @(2000,5000,6000) -or [double]::IsNaN($ElapsedMs) -or [double]::IsInfinity($ElapsedMs) -or $ElapsedMs -lt 0){throw 'Invalid fixed wait budget'}
 # Round elapsed time upward so fixture bookkeeping cannot extend a fixed
 # monotonic budget. A zero remainder is a conservative deadline failure.
 return [int][Math]::Max(0.0,([double]$LimitMs-[Math]::Ceiling($ElapsedMs)))
}
