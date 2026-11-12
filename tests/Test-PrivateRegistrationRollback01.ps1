# Test-only file restoration fixtures. This is deliberately not a GTA installer.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$task=[IO.Path]::GetFullPath((Join-Path $repo '.local\gate-a-shvdne-private-01')).TrimEnd('\')
$out=[IO.Path]::GetFullPath($Output).TrimEnd('\')
if([IO.Path]::GetDirectoryName($out)-cne$task-or[IO.Path]::GetFileName($out)-cnotmatch'^rollback-fixtures-[0-9]{2}$'-or(Test-Path -LiteralPath $out)){
 throw 'Only a fresh task-local rollback-fixtures-NN directory is permitted; no game root is accepted'
}
function NoLink([string]$path){
 for($part=[IO.Path]::GetFullPath($path);$part;$part=[IO.Path]::GetDirectoryName($part)){
  if((Test-Path -LiteralPath $part)-and((Get-Item -LiteralPath $part -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture path refused'}
 }
}
NoLink $out
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
$realDlc=Join-Path $task 'registration\dlc-01\dlc.rpf'
$realDlcHash='ff7c1d818366df4571e9bb3c081c3199fca5709dfb8c74b0a44cb8017dc3cba1'
NoLink $realDlc
if((Hash $realDlc)-cne$realDlcHash-or(Get-Item -LiteralPath $realDlc).Length-ne271872){throw 'Exact prepared private DLC required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$fakeUpdate=Join-Path $out 'authored-update-stand-in.rpf'
[IO.File]::WriteAllBytes($fakeUpdate,[Text.Encoding]::UTF8.GetBytes('AUTHORED SMALL UPDATE ARCHIVE STAND-IN. NOT AN RPF. ROLLBACK FIXTURE ONLY.'))
$approvedRoots=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$results=New-Object 'System.Collections.Generic.List[object]'
$destinations=@('mods\update\update.rpf','mods\update\x64\dlcpacks\ra_private01_6a13f902\dlc.rpf')
function Under([string]$root,[string]$path){
 $full=[IO.Path]::GetFullPath($path);$root=[IO.Path]::GetFullPath($root).TrimEnd('\')
 if(!$approvedRoots.Contains($root)-or!$full.StartsWith(($root+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Mutation outside an approved fake installation refused'}
 NoLink $full
 return $full
}
function Fixture([string]$name){
 $case=Join-Path $out $name;$root=Join-Path $case 'fake-installation'
 [IO.Directory]::CreateDirectory($root)|Out-Null;[void]$approvedRoots.Add($root)
 return [pscustomobject]@{name=$name;directory=$case;root=$root;entries=@();createdDirectories=@()}
}
function Inventory([string]$root){
 $entries=@(foreach($item in Get-ChildItem -LiteralPath $root -Recurse -Force|Sort-Object FullName){
  $relative=$item.FullName.Substring($root.Length+1)
  if($item.PSIsContainer){[ordered]@{path=$relative;kind='directory'}}
  else{[ordered]@{path=$relative;kind='file';bytes=$item.Length;sha256=(Hash $item.FullName)}}
 })
 return (ConvertTo-Json -InputObject $entries -Depth 5 -Compress)
}
function InstallFixture($fixture){
 # The only destinations and payloads are fixed by this test; no external manifest is executable.
 $sources=@($fakeUpdate,$realDlc);$entries=@();$created=New-Object 'System.Collections.Generic.List[string]'
 $backup=Join-Path $fixture.directory 'original-backups';[IO.Directory]::CreateDirectory($backup)|Out-Null
 for($i=0;$i-lt2;$i++){
  $target=Under $fixture.root (Join-Path $fixture.root $destinations[$i])
  $missing=@();$parent=[IO.Path]::GetDirectoryName($target)
  while($parent-cne$fixture.root-and!(Test-Path -LiteralPath $parent)){$missing+=,$parent;$parent=[IO.Path]::GetDirectoryName($parent)}
  [Array]::Reverse($missing)
  foreach($directory in $missing){[IO.Directory]::CreateDirectory((Under $fixture.root $directory))|Out-Null;$created.Add($directory)}
  $prior=Test-Path -LiteralPath $target -PathType Leaf
  $saved=Join-Path $backup ($i.ToString()+'.original')
  $before=if($prior){Hash $target}else{$null}
  if($prior){Copy-Item -LiteralPath $target -Destination $saved -ErrorAction Stop;if((Hash $saved)-cne$before){throw 'Fixture backup mismatch'}}
  Copy-Item -LiteralPath $sources[$i] -Destination $target -ErrorAction Stop
  $installed=Hash $sources[$i]
  if((Hash $target)-cne$installed){throw 'Fixture installation readback mismatch'}
  $entries+=[pscustomobject]@{target=$target;originalExisted=$prior;originalHash=$before;backup=$saved;installedHash=$installed}
 }
 $fixture.entries=$entries;$fixture.createdDirectories=$created.ToArray()
 $entries|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $fixture.directory 'fixture-installation.json') -Encoding UTF8
}
function RollbackFixture($fixture,[bool]$FakeProcessExited){
 if(!$FakeProcessExited){throw 'Still-running state: restoration refused before mutation'}
 # Complete preflight occurs before the first restoration/deletion. A bad second
 # file or backup must not leave the first file partially restored.
 foreach($entry in $fixture.entries){
  $target=Under $fixture.root $entry.target
  if(!(Test-Path -LiteralPath $target -PathType Leaf)-or(Hash $target)-cne$entry.installedHash){throw 'Changed installed fixture: restoration refused before mutation'}
  if($entry.originalExisted){
   $expectedBackup=Join-Path $fixture.directory 'original-backups'
   if(![IO.Path]::GetFullPath($entry.backup).StartsWith(($expectedBackup+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Backup path escaped fixture'}
   NoLink $entry.backup
   if(!(Test-Path -LiteralPath $entry.backup -PathType Leaf)-or(Hash $entry.backup)-cne$entry.originalHash){throw 'Corrupt backup: restoration refused before mutation'}
  }
 }
 foreach($directory in $fixture.createdDirectories){[void](Under $fixture.root $directory)}
 foreach($entry in $fixture.entries){
  $target=Under $fixture.root $entry.target
  # Recheck at the individual operation as well as the complete preflight.
  if((Hash $target)-cne$entry.installedHash){throw 'Installed fixture changed during restoration'}
  if($entry.originalExisted){
   if((Hash $entry.backup)-cne$entry.originalHash){throw 'Backup changed during restoration'}
   Copy-Item -LiteralPath $entry.backup -Destination $target -ErrorAction Stop
   if((Hash $target)-cne$entry.originalHash){throw 'Restored fixture bytes differ'}
  }else{Remove-Item -LiteralPath $target -ErrorAction Stop}
 }
 # Only directories created by this test are candidates, deepest first. Unknown
 # files and nonempty directories survive. No recursive delete is used.
 foreach($directory in @($fixture.createdDirectories|Sort-Object Length -Descending)){
  [void](Under $fixture.root $directory)
  if((Test-Path -LiteralPath $directory -PathType Container)-and@(Get-ChildItem -LiteralPath $directory -Force).Count-eq0){Remove-Item -LiteralPath $directory -ErrorAction Stop}
 }
}
function ExactBytes([string]$path,[byte[]]$expected){
 if([Convert]::ToBase64String([IO.File]::ReadAllBytes($path))-cne[Convert]::ToBase64String($expected)){throw 'Original user fixture bytes not restored exactly'}
}
function Refused($fixture,[bool]$stopped,[string]$expected){
 $before=Inventory $fixture.root;$message=$null
 try{RollbackFixture $fixture $stopped}catch{$message=$_.Exception.Message}
 if(!$message-or$message-notlike('*'+$expected+'*')){throw ('Expected '+$expected+' refusal; observed '+$message)}
 $after=Inventory $fixture.root
 if($after-cne$before){throw 'Rejected restoration mutated fake installation'}
 $results.Add([pscustomobject]@{name=$fixture.name;passed=$true;installationUnchangedOnRefusal=$true;observed=$message;before=$before;after=$after})
}

$f=Fixture 'initially-absent';$before=Inventory $f.root;InstallFixture $f;RollbackFixture $f $true;$after=Inventory $f.root
if($before-cne$after){throw 'Initially absent installation did not return to exact empty inventory'}
$results.Add([pscustomobject]@{name=$f.name;passed=$true;before=$before;after=$after;exactRestoration=$true})

$f=Fixture 'preexisting-user-archives';$prior=@([Text.Encoding]::UTF8.GetBytes('USER UPDATE ARCHIVE FIXTURE 01'),[Text.Encoding]::UTF8.GetBytes('USER PREEXISTING DLC ARCHIVE FIXTURE 02'))
for($i=0;$i-lt2;$i++){$target=Under $f.root (Join-Path $f.root $destinations[$i]);[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;[IO.File]::WriteAllBytes($target,$prior[$i])}
$before=Inventory $f.root;InstallFixture $f;RollbackFixture $f $true;$after=Inventory $f.root
for($i=0;$i-lt2;$i++){ExactBytes (Join-Path $f.root $destinations[$i]) $prior[$i]}
if($before-cne$after){throw 'Preexisting user archive inventory changed after restoration'}
$results.Add([pscustomobject]@{name=$f.name;passed=$true;before=$before;after=$after;exactRestoration=$true})

$f=Fixture 'unknown-file-preserved';InstallFixture $f
$unknown=Under $f.root (Join-Path $f.root 'mods\update\x64\dlcpacks\ra_private01_6a13f902\unrelated-user-file.txt')
$unknownBytes=[Text.Encoding]::UTF8.GetBytes('UNRELATED FILE ADDED AFTER FIXTURE INSTALLATION');[IO.File]::WriteAllBytes($unknown,$unknownBytes)
RollbackFixture $f $true;ExactBytes $unknown $unknownBytes
foreach($relative in $destinations){if(Test-Path -LiteralPath (Join-Path $f.root $relative)){throw 'Hash-matched new fixture file was not removed'}}
if(!(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($unknown)) -PathType Container)){throw 'Nonempty unknown directory removed'}
$results.Add([pscustomobject]@{name=$f.name;passed=$true;unknownFilePreserved=$true;nonemptyDirectoriesPreserved=$true;after=(Inventory $f.root)})

$f=Fixture 'still-running';InstallFixture $f;Refused $f $false 'Still-running state'
$f=Fixture 'changed-new-file';InstallFixture $f
[IO.File]::WriteAllBytes((Join-Path $f.root $destinations[1]),[Text.Encoding]::UTF8.GetBytes('CHANGED NEW FILE MUST SURVIVE'))
Refused $f $true 'Changed installed fixture'
$f=Fixture 'corrupt-backup';$target=Under $f.root (Join-Path $f.root $destinations[1]);[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
[IO.File]::WriteAllBytes($target,[Text.Encoding]::UTF8.GetBytes('ORIGINAL USER DLC FIXTURE'));InstallFixture $f
[IO.File]::WriteAllBytes($f.entries[1].backup,[Text.Encoding]::UTF8.GetBytes('CORRUPTED BACKUP'))
Refused $f $true 'Corrupt backup'

if((Hash $realDlc)-cne$realDlcHash){throw 'Prepared private DLC source changed'}
$receipt=[ordered]@{
 schema=1;kind='test-only-private-registration-rollback';state='passed';count=$results.Count;cases=$results.ToArray()
 realDlc=[ordered]@{source=$realDlc;bytes=271872;sha256=$realDlcHash;unchanged=$true}
 updateArchive=[ordered]@{path=$fakeUpdate;sha256=(Hash $fakeUpdate);authoredStandIn=$true;validRpf=$false;completeShadowCopied=$false}
 scope='Fresh task-local fake installations only. Actual private DLC bytes plus an authored small update stand-in. Running/stopped state is authored fixture input, not observed GTA process state.'
 actualFileRestorationExercised=$true;gameFilesWritten=$false;gameLaunched=$false;runtimeResourceUnloadingQualified=$false;offlineRegistrationAdmitted=$false
 limitations=@('No real game installation or process exercised','No crash/power-loss atomicity or concurrent external writer guarantee','No resource unload or vehicle prior-profile recovery claim','No exact OpenRPF compatibility qualification')
}
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'rollback-results.json') -Encoding UTF8
Write-Output ('PASS '+$results.Count+' actual offline rollback cases: '+(Join-Path $out 'rollback-results.json'))
