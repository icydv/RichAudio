$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('RichAudio-attempt-fixture-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null
function Put-Json([string]$Path,$Value){$Value|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Path}
function SHA([string]$Path){(Get-FileHash -LiteralPath $Path).Hash}
function Need([bool]$Condition,[string]$Message){if(!$Condition){throw $Message}}
function Reject([scriptblock]$Code,[string]$Pattern){$failed=$false;try{& $Code|Out-Null}catch{if($_.Exception.Message-notmatch$Pattern){throw};$failed=$true};Need $failed 'Expected rejection missing'}
function New-Fixture([string]$Name){
 $root=Join-Path $fixtureRoot $Name;$game=Join-Path $root 'game';$pkg=Join-Path $root 'attempt';$sources=Join-Path $root 'sources';$baseline=Join-Path $root 'baseline';$backup=Join-Path $root 'backup'
 foreach($p in @($game,$pkg,$sources,$baseline,$backup,(Join-Path $game 'data'))){[IO.Directory]::CreateDirectory($p)|Out-Null}
 foreach($name in @('GTA5.exe','GTA5_Enhanced.exe','original.txt')){[IO.File]::WriteAllText((Join-Path $game $name),'fixture-only '+$name)}
 foreach($name in @('GTA5.exe','GTA5_Enhanced.exe')){[IO.File]::Copy((Join-Path $game $name),(Join-Path $backup $name))}
 $archive=Join-Path $game 'data\original.rpf';[IO.File]::WriteAllText($archive,'fixture archive bytes')
 Put-Json (Join-Path $baseline 'root-baseline.json') @(Get-ChildItem $game -File|ForEach-Object {[ordered]@{Path=$_.FullName;SHA256=SHA $_.FullName}})
 Put-Json (Join-Path $baseline 'directory-baseline.json') @((Join-Path $game 'data'))
 $info=Get-Item $archive
 Put-Json (Join-Path $baseline 'archive-metadata-before.json') @([ordered]@{Path='data\original.rpf';Bytes=$info.Length;LastWriteUtc=$info.LastWriteTimeUtc.ToString('o')})
 Put-Json (Join-Path $baseline 'archive-hashes-before.json') @([ordered]@{Path='data\original.rpf';SHA256=SHA $archive})
 $files=@(foreach($i in 1..26){$name=if($i-eq26){'Plugins\Bridge.dll'}else{'addition-'+$i+'.bin'};$source=Join-Path $sources ('file-'+$i);[IO.File]::WriteAllText($source,'addition fixture '+$i);[ordered]@{RelativeDestination=$name;Source=$source;Destination=Join-Path $game $name;SHA256=SHA $source}})
 $manifest=[ordered]@{GameRoot=$game;Files=$files;BaselineDirectory=$baseline;ExecutableBackupDirectory=$backup;RenameSource=Join-Path $game 'GTA5.exe';RenameDestination=Join-Path $game '_GTA5.exe';RenameSHA256=SHA (Join-Path $game 'GTA5.exe');GeneratedFiles=@('RagePluginHook.log','ExecuteCode\Code1.cs')}
 $manifestPath=Join-Path $root 'manifest.json';Put-Json $manifestPath $manifest
 $original=Join-Path $root 'original-candidate.json';Put-Json $original ([ordered]@{state='REVIEW_ONLY';bindings=@();cwd=$root})
 foreach($name in @('Invoke-Session.ps1','Verify-Original.ps1','LaunchOnly.Common.ps1')){[IO.File]::Copy((Join-Path $repo ('tools\attempt\'+$name)),(Join-Path $pkg $name))}
 $baselinePaths=@(Get-ChildItem $baseline -File|ForEach-Object FullName)+@(Get-ChildItem $backup -File|ForEach-Object FullName)
 $plan=[ordered]@{Schema=1;State='REVIEW_ONLY';Scope='RPH_LAUNCH_ONLY';FixtureOnly=$true;FixtureRoot=$fixtureRoot;PackageDirectory=$pkg;OriginalCandidatePath=$original;OriginalCandidateSHA256=SHA $original;ManifestPath=$manifestPath;ManifestSHA256=SHA $manifestPath;Paths=[ordered]@{Journal=Join-Path $pkg 'state\deployment-journal.json';Quarantine=Join-Path $pkg 'quarantine';Observations=Join-Path $pkg 'observations';RestorationResult=Join-Path $pkg 'restoration\independent.json';FreshApproval=Join-Path $pkg 'fresh-approval.json';ShellEvidence=Join-Path $pkg 'observations\shell-check.txt'};HelperBindings=@(Get-ChildItem $pkg -File|ForEach-Object{[ordered]@{Path=$_.FullName;SHA256=SHA $_.FullName}});BaselineBindings=@($baselinePaths|ForEach-Object{[ordered]@{Path=$_;SHA256=SHA $_}})}
 $planPath=Join-Path $pkg 'attempt.json';Put-Json $planPath $plan
 return @{Root=$root;Game=$game;Package=$pkg;Plan=$plan;PlanPath=$planPath;Manifest=$manifest;Invoke=Join-Path $pkg 'Invoke-Session.ps1';Verify=Join-Path $pkg 'Verify-Original.ps1'}
}
$history=Join-Path $fixtureRoot 'historical';[IO.Directory]::CreateDirectory($history)|Out-Null
[IO.File]::WriteAllText((Join-Path $history 'old-journal.json'),'historical journal');[IO.File]::WriteAllText((Join-Path $history 'old-quarantine.bin'),'historical quarantine')
$historyHashes=@(Get-ChildItem $history -File|ForEach-Object{[ordered]@{Path=$_.FullName;Hash=SHA $_.FullName}})
$passed=[Collections.Generic.List[string]]::new()
$f=New-Fixture 'fresh'; & $f.Invoke -Fixture -Action Verify; & $f.Verify -Fixture -BaselineOnly
Need (!(Test-Path $f.Plan.Paths.Journal)) 'Read-only check wrote journal'
& $f.Invoke -Fixture -Action Deploy
[IO.Directory]::CreateDirectory((Join-Path $f.Game 'ExecuteCode'))|Out-Null
[IO.File]::WriteAllText((Join-Path $f.Game 'RagePluginHook.log'),'fixture log');[IO.File]::WriteAllText((Join-Path $f.Game 'ExecuteCode\Code1.cs'),'fixture generated')
& $f.Invoke -Fixture -Action Restore; & $f.Verify -Fixture
$result=Get-Content $f.Plan.Paths.RestorationResult -Raw|ConvertFrom-Json
Need ($result.Pass-and$result.AttemptSHA256-eq(SHA $f.PlanPath)-and$result.BaselineDirectory-eq$f.Manifest.BaselineDirectory) 'Wrong independent result routing'
Need (@(Get-ChildItem $f.Plan.Paths.Quarantine -File -Recurse).Count-eq28) 'Quarantine scope differs'
$resultHash=SHA $f.Plan.Paths.RestorationResult;Reject {& $f.Verify -Fixture} 'already exists';Need ((SHA $f.Plan.Paths.RestorationResult)-eq$resultHash) 'Result overwritten'
$passed.Add('fresh-deploy-restore-and-independent-verifier')
$f=New-Fixture 'journal-collision';[IO.Directory]::CreateDirectory((Split-Path $f.Plan.Paths.Journal))|Out-Null;[IO.File]::WriteAllText($f.Plan.Paths.Journal,'existing journal');$hash=SHA $f.Plan.Paths.Journal
Reject {& $f.Invoke -Fixture -Action Deploy} 'already exists';Need ((SHA $f.Plan.Paths.Journal)-eq$hash) 'Journal overwritten';Need (Test-Path $f.Manifest.RenameSource) 'Collision mutated game';$passed.Add('journal-collision-rejected')
$f=New-Fixture 'quarantine-collision';[IO.Directory]::CreateDirectory($f.Plan.Paths.Quarantine)|Out-Null;[IO.File]::WriteAllText((Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin'),'existing quarantine');$hash=SHA (Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin')
Reject {& $f.Invoke -Fixture -Action Deploy} 'already exists';Need ((SHA (Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin'))-eq$hash) 'Quarantine overwritten';$passed.Add('quarantine-deploy-collision-rejected')
$f=New-Fixture 'restore-collision';& $f.Invoke -Fixture -Action Deploy;[IO.Directory]::CreateDirectory($f.Plan.Paths.Quarantine)|Out-Null;[IO.File]::WriteAllText((Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin'),'existing quarantine');$hash=SHA (Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin')
Reject {& $f.Invoke -Fixture -Action Restore} 'Existing quarantine';Need ((SHA (Join-Path $f.Plan.Paths.Quarantine 'addition-1.bin'))-eq$hash) 'Restore overwrote quarantine';Need (Test-Path $f.Manifest.RenameDestination) 'Restore collision caused mutation';$passed.Add('quarantine-restore-collision-rejected')
$f=New-Fixture 'partial';Reject {& $f.Invoke -Fixture -Action Deploy -FixtureFailAfterFiles 3} 'Injected partial';$journal=Get-Content $f.Plan.Paths.Journal -Raw|ConvertFrom-Json;Need ($journal.Files.Count-eq3) 'Partial journal lost completed copies'
& $f.Invoke -Fixture -Action Restore;& $f.Verify -Fixture;Need (@(Get-ChildItem $f.Plan.Paths.Quarantine -File -Recurse).Count-eq3) 'Partial restore scope differs';$passed.Add('partial-deployment-restored-from-own-journal')
$f=New-Fixture 'modified';& $f.Invoke -Fixture -Action Deploy;$modified=$f.Manifest.Files[0].Destination;[IO.File]::WriteAllText($modified,'unexpected modification');$hash=SHA $modified
Reject {& $f.Invoke -Fixture -Action Restore} 'Changed deployed';Need ((SHA $modified)-eq$hash) 'Modified bytes changed';Need (!(Test-Path $f.Plan.Paths.RestorationResult)) 'False success result';$passed.Add('modified-file-preserved-and-cleanup-unverified')
$f=New-Fixture 'unexpected';& $f.Invoke -Fixture -Action Deploy;$unexpected=Join-Path $f.Game 'unreviewed.txt';[IO.File]::WriteAllText($unexpected,'unexpected file');$hash=SHA $unexpected
Reject {& $f.Invoke -Fixture -Action Restore} 'Original root membership';Reject {& $f.Verify -Fixture} 'Original root membership';Need ((SHA $unexpected)-eq$hash) 'Unexpected file changed';Need (!(Test-Path $f.Plan.Paths.RestorationResult)) 'Unexpected state marked restored';$passed.Add('unexpected-file-preserved-and-independent-check-fails')
$f=New-Fixture 'wrong-attempt';Reject {& $f.Verify -Fixture} 'no journal';Reject {& $f.Invoke -Action Verify} 'Fixture requires';$f.Plan.Paths.Journal=Join-Path $history 'old-journal.json';Put-Json $f.PlanPath $f.Plan
Reject {& $f.Invoke -Fixture -Action Verify} 'routing differs';$passed.Add('verifier-cannot-use-another-attempt-and-fixture-is-explicit')
$f=New-Fixture 'baseline-drift';[IO.File]::AppendAllText((Join-Path $f.Manifest.BaselineDirectory 'root-baseline.json'),' ');Reject {& $f.Verify -Fixture -BaselineOnly} 'Bound input changed';$passed.Add('independent-baseline-binding-enforced')
. (Join-Path $repo 'tools\attempt\LaunchOnly.Common.ps1')
$shell=Join-Path $fixtureRoot 'synthetic-shell.txt';[IO.File]::WriteAllText($shell,"PowerShell PID: 4242`nMandatory Label\Medium Mandatory Level S-1-16-8192`nFalse`n");Need ((Read-ShellEvidence $shell)-eq4242) 'Medium shell rejected'
foreach($text in @("PowerShell PID: 4242`nS-1-16-12288`nFalse", "PowerShell PID: 4242`nS-1-16-8192`nTrue", "PowerShell PID: 4242`nFalse")){[IO.File]::WriteAllText($shell,$text);Reject {Read-ShellEvidence $shell} 'missing or ambiguous'}
$passed.Add('human-shell-evidence-requires-medium-and-false')
foreach($r in $historyHashes){Need ((SHA $r.Path)-eq$r.Hash) 'Historical records changed'}
[ordered]@{Suite='launch-only-attempt-routing';Passed=$passed.Count;Cases=@($passed);HistoricalRecordsUnchanged=$true;RealGameUsed=$false;ApprovalsCreated=$false;FixtureEvidenceRetained=$true}|ConvertTo-Json -Depth 4
