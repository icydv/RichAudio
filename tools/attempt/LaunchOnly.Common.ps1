# Filesystem-only adaptation of the sealed session helpers. No launch entry point.
$ErrorActionPreference='Stop'
function Get-SHA([string]$Path) {(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
function Assert-Unlinked([string]$Path) {
 for($d=[IO.FileInfo]::new([IO.Path]::GetFullPath($Path));$null-ne$d;){
  if((Test-Path -LiteralPath $d.FullName)-and((Get-Item -LiteralPath $d.FullName -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path rejected'}
  $parent=Split-Path $d.FullName -Parent;if(!$parent-or$parent-eq$d.FullName){break};$d=[IO.FileInfo]::new($parent)
 }
}
function Write-NewJson([string]$Path,$Value) {
 Assert-Unlinked $Path;[IO.Directory]::CreateDirectory((Split-Path $Path))|Out-Null
 $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$b=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 12));$stream.Write($b,0,$b.Length)}finally{$stream.Dispose()}
}
function Read-Attempt([string]$Plan,[bool]$Fixture) {
 $planPath=[IO.Path]::GetFullPath($Plan);Assert-Unlinked $planPath
 $a=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json
 if($a.Schema-ne1-or$a.State-ne'REVIEW_ONLY'-or$a.Scope-ne'RPH_LAUNCH_ONLY'){throw 'Attempt schema/scope differs'}
 $package=[IO.Path]::GetFullPath($a.PackageDirectory)
 if($package-ne(Split-Path $planPath)-or$planPath-ne(Join-Path $package 'attempt.json')-or$package-ne$PSScriptRoot){throw 'Helper/attempt directory differs'}
 foreach($pair in @(@('Journal','state\deployment-journal.json'),@('Quarantine','quarantine'),@('Observations','observations'),@('RestorationResult','restoration\independent.json'),@('FreshApproval','fresh-approval.json'),@('ShellEvidence','observations\shell-check.txt'))){
  if($a.Paths.($pair[0])-ne(Join-Path $package $pair[1])){throw 'Attempt output routing differs'};Assert-Unlinked $a.Paths.($pair[0])
 }
 if($Fixture){
  $fixtureRoot=[IO.Path]::GetFullPath($a.FixtureRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if($a.FixtureOnly-ne$true-or(Split-Path $fixtureRoot)-ne$temp.TrimEnd('\')-or(Split-Path $fixtureRoot -Leaf)-notmatch'^RichAudio-attempt-fixture-[a-f0-9]{32}$'-or!$package.StartsWith($fixtureRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Explicit disposable fixture required'}
 }elseif($a.FixtureOnly){throw 'Fixture requires explicit switch'}
 if((Get-SHA $a.OriginalCandidatePath)-ne$a.OriginalCandidateSHA256-or(Get-SHA $a.ManifestPath)-ne$a.ManifestSHA256){throw 'Original candidate/manifest drift'}
 $candidate=Get-Content -LiteralPath $a.OriginalCandidatePath -Raw|ConvertFrom-Json
 $m=Get-Content -LiteralPath $a.ManifestPath -Raw|ConvertFrom-Json
 if(!$Fixture-and($a.OriginalCandidateSHA256-ne'D8E07531B2C80F9F322940A6770B462E7FEDC28DCAF870DFEDA7A13E38981C41'-or$a.ManifestSHA256-ne'64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA'-or$m.GameRoot-ne'D:\Games\steamapps\common\Grand Theft Auto V Enhanced')){throw 'Sealed scope differs'}
 if($m.Files.Count-ne26){throw '26-file scope required'}
 $game=[IO.Path]::GetFullPath($m.GameRoot);Assert-Unlinked $game
 if($Fixture){foreach($path in @($game,$a.OriginalCandidatePath,$a.ManifestPath,$m.BaselineDirectory,$m.ExecutableBackupDirectory)+@($m.Files.Source)){
  if(!([IO.Path]::GetFullPath($path)).StartsWith($fixtureRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture escaped disposable root'}
 }}
 if($package.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)-or$game.StartsWith($package+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Attempt/game overlap'}
 $helpers=@('Invoke-Session.ps1','Verify-Original.ps1','LaunchOnly.Common.ps1')|ForEach-Object{Join-Path $package $_}
 if(Compare-Object @($helpers|Sort-Object) @($a.HelperBindings.Path|Sort-Object)){throw 'Helper bindings incomplete'}
 $baselines=@('root-baseline.json','directory-baseline.json','archive-metadata-before.json','archive-hashes-before.json')|ForEach-Object{Join-Path $m.BaselineDirectory $_}
 $baselines+=@('GTA5.exe','GTA5_Enhanced.exe')|ForEach-Object{Join-Path $m.ExecutableBackupDirectory $_}
 if(Compare-Object @($baselines|Sort-Object) @($a.BaselineBindings.Path|Sort-Object)){throw 'Baseline bindings incomplete'}
 foreach($b in @($a.HelperBindings)+@($a.BaselineBindings)+@($candidate.bindings)){Assert-Unlinked $b.Path;if((Get-SHA $b.Path)-ne$b.SHA256){throw 'Bound input changed'}}
 $root=@(Get-Content (Join-Path $m.BaselineDirectory 'root-baseline.json') -Raw|ConvertFrom-Json)
 $dirs=@(Get-Content (Join-Path $m.BaselineDirectory 'directory-baseline.json') -Raw|ConvertFrom-Json)
 foreach($f in $m.Files){$dest=[IO.Path]::GetFullPath($f.Destination);if($dest-ne(Join-Path $game $f.RelativeDestination)-or!$dest.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)-or$f.RelativeDestination-match'\.\.'-or$dest-in$root.Path){throw 'Unsafe destination'};Assert-Unlinked $dest}
 if($m.RenameSource-ne(Join-Path $game 'GTA5.exe')-or$m.RenameDestination-ne(Join-Path $game '_GTA5.exe')){throw 'Rename scope differs'}
 foreach($name in $m.GeneratedFiles){$dest=[IO.Path]::GetFullPath((Join-Path $game $name));if(!$dest.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)-or$dest-in$root.Path){throw 'Unsafe generated scope'}}
 return @{Plan=$a;PlanPath=$planPath;PlanHash=(Get-SHA $planPath);Manifest=$m;Game=$game;Root=$root;Dirs=$dirs;Candidate=$candidate;Fixture=$Fixture}
}
function Assert-ProcessesAbsent($Context) {
 if($Context.Fixture){return}
 if(@(Get-Process GTA5*,RAGEPluginHook,RichAudio.Acoustics.Host,CaptureConsole -ErrorAction SilentlyContinue).Count){throw 'Relevant processes remain; close normally'}
 $producerRoot=$Context.Candidate.cwd
 if(@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.CommandLine-like('*'+$producerRoot+'*')-and$_.CommandLine-like'*Run-Acoustics07*'}).Count){throw 'Selected producer remains'}
}
function Assert-Original($Context,[bool]$Archives=$false) {
 $game=$Context.Game;$m=$Context.Manifest
 $actual=@(Get-ChildItem -LiteralPath $game -File|Where-Object Extension -ne '.rpf')
 if(Compare-Object @($Context.Root.Path) @($actual.FullName)){throw 'Original root membership differs'}
 foreach($r in $Context.Root){Assert-Unlinked $r.Path;if((Get-SHA $r.Path)-ne$r.SHA256){throw 'Original root hash differs'}}
 if(Compare-Object @($Context.Dirs) @(Get-ChildItem -LiteralPath $game -Directory|ForEach-Object FullName)){throw 'Original directories differ'}
 if(!$Context.Fixture){foreach($n in @('GTA5.exe','GTA5_Enhanced.exe')){if((Get-AuthenticodeSignature (Join-Path $game $n)).Status-ne'Valid'){throw 'Original signature differs'}}}
 if($Archives){
  $all=[Collections.Generic.List[object]]::new();$stack=[Collections.Generic.Stack[string]]::new();$stack.Push($game)
  while($stack.Count){foreach($e in Get-ChildItem -LiteralPath ($stack.Pop()) -Force){Assert-Unlinked $e.FullName;if($e.PSIsContainer){$stack.Push($e.FullName)}elseif($e.Extension-eq'.rpf'){$all.Add($e)}}}
  $before=@(Get-Content (Join-Path $m.BaselineDirectory 'archive-metadata-before.json') -Raw|ConvertFrom-Json)
  if($all.Count-ne$before.Count){throw 'Archive count differs'}
  foreach($r in $before){$f=Get-Item -LiteralPath (Join-Path $game $r.Path);if($f.Length-ne$r.Bytes-or$f.LastWriteTimeUtc.Ticks-ne([datetime]$r.LastWriteUtc).ToUniversalTime().Ticks){throw 'Archive metadata differs'}}
  foreach($r in @(Get-Content (Join-Path $m.BaselineDirectory 'archive-hashes-before.json') -Raw|ConvertFrom-Json)){if((Get-SHA (Join-Path $game $r.Path))-ne$r.SHA256){throw 'Sampled archive hash differs'}}
 }
}
function Assert-FreshOutputs($Context) {
 foreach($path in @($Context.Plan.Paths.Journal,$Context.Plan.Paths.Quarantine,$Context.Plan.Paths.RestorationResult)){if(Test-Path -LiteralPath $path){throw 'Attempt journal/quarantine/result already exists'}}
}
function Read-ShellEvidence([string]$Path) {
 $raw=Get-Content -LiteralPath $Path -Raw
 $pidMatch=[regex]::Matches($raw,'(?m)^PowerShell PID:\s*([1-9][0-9]*)\s*$')
 $integrity=@([regex]::Matches($raw,'S-1-16-([0-9]+)')|ForEach-Object {$_.Groups[1].Value}|Select-Object -Unique)
 $booleans=@([regex]::Matches($raw,'(?mi)^\s*(True|False)\s*$')|ForEach-Object {$_.Groups[1].Value})
 if($pidMatch.Count-ne1-or$integrity.Count-ne1-or$integrity[0]-ne'8192'-or$booleans.Count-ne1-or$booleans[0]-ne'False'-or$raw.Trim()-notmatch'(?i)False$'){throw 'Non-elevated human-shell evidence missing or ambiguous'}
 return [int]$pidMatch[0].Groups[1].Value
}
function Assert-FreshApproval($Context) {
 if($Context.Fixture){return} # Only explicit temp-root fixtures can reach this bypass.
 $a=Get-Content -LiteralPath $Context.Plan.Paths.FreshApproval -Raw|ConvertFrom-Json
 $shellPID=Read-ShellEvidence $Context.Plan.Paths.ShellEvidence
 if($a.Approved-isnot[bool]-or$a.Approved-ne$true-or$a.MaximumAttempts-ne1-or$a.Scope-ne'RPH_LAUNCH_ONLY'-or$a.AttemptSHA256-ne$Context.PlanHash-or$a.CandidateSHA256-ne$Context.Plan.OriginalCandidateSHA256-or$a.ManifestSHA256-ne$Context.Plan.ManifestSHA256-or$a.ShellPID-ne$shellPID-or$a.ShellEvidenceSHA256-ne(Get-SHA $Context.Plan.Paths.ShellEvidence)-or!$a.ExpiresUtc-or([datetime]$a.ExpiresUtc)-le[datetime]::UtcNow){throw 'Fresh attempt-bound launch-only approval required'}
}
