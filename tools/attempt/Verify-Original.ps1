param([string]$Plan=(Join-Path $PSScriptRoot 'attempt.json'),[switch]$BaselineOnly,[switch]$Fixture)
. (Join-Path $PSScriptRoot 'LaunchOnly.Common.ps1')
$c=Read-Attempt $Plan ([bool]$Fixture)
Assert-ProcessesAbsent $c;Assert-Original $c $true
foreach($f in $c.Manifest.Files){if(Test-Path -LiteralPath $f.Destination){throw 'Introduced path remains'}}
if(Test-Path -LiteralPath $c.Manifest.RenameDestination){throw 'Temporary alias remains'}
if($BaselineOnly){Write-Output 'PASS: read-only original baseline; no restoration result written';return}
$journal=$c.Plan.Paths.Journal
if(!(Test-Path -LiteralPath $journal)){throw 'This attempt has no journal'}
$j=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json
if($j.AttemptSHA256-ne$c.PlanHash-or$j.ManifestSHA256-ne$c.Plan.ManifestSHA256-or$j.State-ne'ROOT_RESTORED_PENDING_INDEPENDENT_ARCHIVE_CHECK'){throw 'This attempt is not restored'}
$result=[ordered]@{Pass=$true;AttemptSHA256=$c.PlanHash;ManifestSHA256=$c.Plan.ManifestSHA256;JournalSHA256=(Get-SHA $journal);BaselineDirectory=$c.Manifest.BaselineDirectory;Utc=[datetime]::UtcNow.ToString('o');RootFiles=$c.Root.Count;Directories=$c.Dirs.Count;IntroducedPathsAbsent=$true;AliasAbsent=$true;RelevantProcessesAbsent=$true;ArchiveMetadataAndSampledHashes='Match';FixtureOnly=[bool]$Fixture}
Write-NewJson $c.Plan.Paths.RestorationResult $result
Write-Output 'PASS: independent restoration verification retained in this attempt only'
