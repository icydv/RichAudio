param([ValidateSet('Verify','Deploy','Restore')][string]$Action='Verify',[string]$Plan=(Join-Path $PSScriptRoot 'attempt.json'),[switch]$Fixture,[int]$FixtureFailAfterFiles=0)
. (Join-Path $PSScriptRoot 'LaunchOnly.Common.ps1')
$c=Read-Attempt $Plan ([bool]$Fixture);$m=$c.Manifest;$game=$c.Game;$journal=$c.Plan.Paths.Journal;$q=$c.Plan.Paths.Quarantine
if($FixtureFailAfterFiles-and!$Fixture){throw 'Fault injection is disposable-fixture-only'}
Assert-ProcessesAbsent $c
function Save-Journal {
 if((Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json).AttemptSHA256-ne$c.PlanHash){throw 'Journal ownership differs'}
 $j|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $journal
}
if($Action-ne'Restore'){
 Assert-FreshOutputs $c;Assert-Original $c
 if(Test-Path -LiteralPath $m.RenameDestination){throw 'Alias exists'}
 foreach($f in $m.Files){if((Test-Path -LiteralPath $f.Destination)-or(Get-SHA $f.Source)-ne$f.SHA256){throw 'Source/target drift'}}
 foreach($n in $m.GeneratedFiles){if(Test-Path -LiteralPath (Join-Path $game $n)){throw 'Existing generated target'}}
 foreach($n in @('GTA5.exe','GTA5_Enhanced.exe')){if((Get-SHA (Join-Path $game $n))-ne(Get-SHA (Join-Path $m.ExecutableBackupDirectory $n))){throw 'Backup mismatch'}}
 if($Action-eq'Verify'){Write-Output 'PASS: sealed inputs and fresh attempt paths; no deployment';return}
 Assert-FreshApproval $c
 $j=[ordered]@{Schema=1;AttemptSHA256=$c.PlanHash;ManifestSHA256=$c.Plan.ManifestSHA256;RenameIntent=$true;FileIntents=@();Files=@();CreatedDirectories=@();State='DEPLOYING'}
 Write-NewJson $journal $j
 [IO.File]::Move($m.RenameSource,$m.RenameDestination)
 foreach($f in $m.Files){
  $dir=Split-Path $f.Destination
  if(!(Test-Path -LiteralPath $dir)){$j.CreatedDirectories+=$dir;Save-Journal;[IO.Directory]::CreateDirectory($dir)|Out-Null}
  $j.FileIntents+=$f.RelativeDestination;Save-Journal
  $s=[IO.File]::OpenRead($f.Source)
  try{$d=[IO.File]::Open($f.Destination,[IO.FileMode]::CreateNew);try{$j.Files+=$f.RelativeDestination;Save-Journal;$s.CopyTo($d)}finally{$d.Dispose()}}finally{$s.Dispose()}
  if((Get-SHA $f.Destination)-ne$f.SHA256){throw 'Deployed hash differs'}
  if($FixtureFailAfterFiles-gt0-and$j.Files.Count-eq$FixtureFailAfterFiles){throw 'Injected partial fixture deployment failure'}
 }
 $j.State='DEPLOYED_NOT_LAUNCHED';Save-Journal;Write-Output 'PASS: 26 additions deployed; no launch performed';return
}
if(!(Test-Path -LiteralPath $journal)){throw 'No attempt journal'}
$j=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json
if($j.AttemptSHA256-ne$c.PlanHash-or$j.ManifestSHA256-ne$c.Plan.ManifestSHA256){throw 'Journal ownership differs'}
if(Test-Path -LiteralPath $c.Plan.Paths.RestorationResult){throw 'Restoration result already exists'}
# Check all moves before any restoration mutation. Modified/unexpected files stay in place.
foreach($name in $j.Files){
 $f=@($m.Files|Where-Object RelativeDestination -eq $name);if($f.Count-ne1){throw 'Unknown journal file'}
 if(Test-Path -LiteralPath $f[0].Destination){
  if((Get-SHA $f[0].Destination)-ne$f[0].SHA256){throw 'Changed deployed file: preserved in place for review'}
  if(Test-Path -LiteralPath (Join-Path $q $name)){throw 'Existing quarantine target rejected'}
 }
}
foreach($name in $m.GeneratedFiles){if((Test-Path -LiteralPath (Join-Path $game $name))-and(Test-Path -LiteralPath (Join-Path $q ('generated\'+$name)))){throw 'Existing generated quarantine target rejected'}}
function Preserve([string]$Source,[string]$Relative) {
 Assert-Unlinked $Source;$target=[IO.Path]::GetFullPath((Join-Path $q $Relative));Assert-Unlinked $target
 if(!$target.StartsWith($q+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $target)){throw 'Unsafe quarantine'}
 [IO.Directory]::CreateDirectory((Split-Path $target))|Out-Null;$hash=Get-SHA $Source;[IO.File]::Move($Source,$target);if((Get-SHA $target)-ne$hash){throw 'Preservation differs'}
}
if(Test-Path -LiteralPath $m.RenameDestination){if((Test-Path -LiteralPath $m.RenameSource)-or(Get-SHA $m.RenameDestination)-ne$m.RenameSHA256){throw 'Unsafe original rename'};[IO.File]::Move($m.RenameDestination,$m.RenameSource)}
foreach($name in $j.Files){$f=$m.Files|Where-Object RelativeDestination -eq $name;if(Test-Path -LiteralPath $f.Destination){Preserve $f.Destination $name}}
foreach($name in $m.GeneratedFiles){$path=Join-Path $game $name;if(Test-Path -LiteralPath $path){Preserve $path ('generated\'+$name)}}
foreach($dir in $j.CreatedDirectories){if($dir-ne(Join-Path $game 'Plugins')-or$dir-in$c.Dirs){throw 'Unknown directory'};if((Test-Path -LiteralPath $dir)-and@(Get-ChildItem -LiteralPath $dir -Force).Count-eq0){[IO.Directory]::Delete($dir,$false)}}
$extra=Join-Path $game 'ExecuteCode';if((Test-Path -LiteralPath $extra)-and$extra-notin$c.Dirs){Assert-Unlinked $extra;if(@(Get-ChildItem -LiteralPath $extra -Force).Count-eq0){[IO.Directory]::Delete($extra,$false)}}
Assert-Original $c
$j.State='ROOT_RESTORED_PENDING_INDEPENDENT_ARCHIVE_CHECK';Save-Journal
Write-Output 'Original root restored; independent verification still required'
