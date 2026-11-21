#requires -Version 7.0
param([Parameter(Mandatory)][string]$Scope,[Parameter(Mandatory)][string]$ScopeSHA256,
 [Parameter(Mandatory)][string]$Approval,[Parameter(Mandatory)][string]$ApprovalSHA256)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Prepare-StreetTrackedCandidate01.ps1') -FunctionsOnly
Import-StreetTrackedTransaction01
function Read-PinnedQualificationJson([string]$File,[string]$Hash){
 Assert-Menu02UnlinkedPath $File
 if($Hash -cnotmatch '^[a-f0-9]{64}$' -or (Get-Item -LiteralPath $File).Length -gt 512KB -or (Digest $File) -cne $Hash){throw 'Exact bounded qualification JSON pin required'}
 return Get-Content -LiteralPath $File -Raw | ConvertFrom-Json -DateKind String
}
$s=Read-PinnedQualificationJson $Scope $ScopeSHA256
$a=Read-PinnedQualificationJson $Approval $ApprovalSHA256
$begin=[DateTimeOffset]::Parse($a.startUtc);$end=[DateTimeOffset]::Parse($a.stopByUtc);$now=[DateTimeOffset]::UtcNow
if($s.approvedReadOnly -ne $false -or $a.approvedReadOnly -ne $true -or $a.readScopeSha256 -cne $ScopeSHA256 -or
 $now -lt $begin -or $now -ge $end -or ($end-$begin).TotalMinutes -gt 25){throw 'Fresh exact installed baseline read approval required'}
$b=Read-PinnedQualificationJson $s.historicalBaseline.path $s.historicalBaseline.sha256
$inventory=Read-PinnedQualificationJson $s.historicalAsi.path $s.historicalAsi.sha256
$restored=Read-PinnedQualificationJson $s.lastPluginRestoration.path $s.lastPluginRestoration.sha256
$destination=Assert-StreetTrackedLocal01 $s.baselineReceipt
Write-StreetTrackedNew01 ($destination+'.intent') @{scope=$ScopeSHA256;approval=$ApprovalSHA256;started=$now}
$root=$b.gameRoot
function Sample-QualificationClosure {
 $p=@(Get-StreetTrackedActiveProcesses01 @{baseline=$b})
 if($p.Count){throw 'Relevant process still present'}
 return @{utc=[DateTimeOffset]::UtcNow;active=@()}
}
$closure1=Sample-QualificationClosure
Start-Sleep -Milliseconds 2100
$closure2=Sample-QualificationClosure
Assert-StreetTrackedIdentity01 $root $b.rootIdentity
Assert-StreetTrackedIdentity01 $b.launch.fileName $b.launch.cmdIdentity
$protected=@($b.protected)+@($b.settings)+@($b.dependencies)+@($b.quarantine.held)
$protected+=@([pscustomobject]@{path=$b.launch.fileName;bytes=$b.launch.cmdBytes;sha256=$b.launch.cmdSha256;permissionsSddl=$b.launch.cmdPermissionsSddl})
$seen=@{};$states=@()
foreach($pin in $protected){
 if($seen.ContainsKey($pin.path)){continue};$seen[$pin.path]=$true
 Assert-Menu02UnlinkedPath $pin.path
 $exists=$pin.exists -ne $false
 $item=Get-Item -LiteralPath $pin.path -Force -ErrorAction SilentlyContinue
 if([bool]$item -ne $exists -or ($item -and ($item.PSIsContainer -or $item.Length -ne $pin.bytes))){throw 'Protected presence or length changed'}
 $state=Get-Menu02RestoreFileState $pin.path
 if($item -and ($state.sha256 -cne $pin.sha256 -or $state.bytes -ne $pin.bytes -or
  ($pin.permissionsSddl -and $state.metadata.sddl -cne $pin.permissionsSddl))){throw 'Protected file identity drift'}
 if($item -and $pin.identityAfter){
  if($pin.role -ceq 'existing-richaudio-plugin'){
   $prior=@($restored.completedTargets|Where-Object target -CEQ $pin.path)
   if(!$restored.succeeded -or $prior.Count -ne 1 -or $prior[0].sha256 -cne $state.sha256 -or
      !$prior[0].originalBytes -or !$prior[0].timestamps -or !$prior[0].attributes -or !$prior[0].accessPermissions){
    throw 'Exact prior DLL restoration evidence required to observe a new file identity'
   }
   $state|Add-Member NoteProperty currentIdentity ([Menu02RecoveryLaunch.NativeIdentity]::ReadDirectory($pin.path))
  }else{Assert-StreetTrackedIdentity01 $pin.path $pin.identityAfter}
 }
 $states+=$state
}
if(Test-Path -LiteralPath $b.quarantine.originalPath){throw 'Quarantine path unexpectedly restored'}
$names=@($inventory.inventory|Sort-Object name|ForEach-Object name)
$present=@(Get-ChildItem -LiteralPath $root -File -Filter '*.asi'|Sort-Object Name)
if(($names-join '|') -cne ($present.Name-join '|')){throw 'Root ASI inventory changed'}
$asi=@()
foreach($pin in $inventory.inventory){
 $trainer=$pin.name -ceq 'TrainerV.asi'
 $limit=if($trainer){27073536}else{8388608}
 $item=$present|Where-Object Name -CEQ $pin.name
 $expected=if($trainer){27073536}elseif($null -ne $pin.bytes){$pin.bytes}else{$item.Length}
 if($null -ne $pin.bytes -and $pin.bytes -ne $expected){throw 'ASI retained length differs'}
 $row=Get-StreetTrackedBoundedAsi01 $item.FullName $expected $limit $pin.identityAfter
 if(!$row.complete -or $row.bytesRead -ne $expected -or ($pin.sha256 -and $row.sha256 -cne $pin.sha256)){throw 'ASI content or completeness differs'}
 $asi+=@{name=$pin.name;classification=$(if($pin.sha256){'retained-pin-match'}else{'fresh-environment-observation'});observation=$row}
}
$extra=@()
foreach($entry in @('Plugins/RichAudio.WorldWarmup.json','mods','mods/update','mods/update/update.rpf','mods/update/x64','mods/update/x64/dlcpacks','mods/update/x64/dlcpacks/raprobe_57223592','onigiri','rpf.cache','rpf.cache.disable')){
 $target=Safe-Path $root $entry;$item=Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
 $extra+=@{relative=$entry;exists=[bool]$item;directory=[bool]($item -and $item.PSIsContainer);bytes=$item.Length}
 if($entry -ceq 'Plugins/RichAudio.WorldWarmup.json' -and $item){
  if($item.PSIsContainer -or $item.Length -gt 65536){throw 'Unexpected warmup sidecar size'}
  $states+=Get-Menu02RestoreFileState $target
 }
}
$source=Safe-Path $root 'update/update.rpf'
$stream=[IO.File]::Open($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try{
 if($stream.Length -ne 3122239488){throw 'Base update archive length differs'}
 $head=[byte[]]::new(16);$stream.ReadExactly($head)
}finally{$stream.Dispose()}
if([DateTimeOffset]::UtcNow -ge $end){throw 'Read scope cutoff elapsed'}
Write-StreetTrackedNew01 $destination @{scope=$ScopeSHA256;approval=$ApprovalSHA256;protected=$states;asi=$asi;extra=$extra
 closure=@($closure1,$closure2);launcher=$b.launch;archiveHeader=[Convert]::ToHexString($head);installedWrites=$false;launches=0}
