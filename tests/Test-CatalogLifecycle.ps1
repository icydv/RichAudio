param([string]$LifecycleTestScriptPath='')
$ErrorActionPreference='Stop'
$testScript=if($LifecycleTestScriptPath){[IO.Path]::GetFullPath($LifecycleTestScriptPath)}else{$PSCommandPath}
$repo=Split-Path (Split-Path $testScript -Parent) -Parent
$modulePath=Join-Path $repo 'src\acoustics\startup\CatalogLifecycle.psm1'
Import-Module (New-Module -Name RichAudioCatalogLifecycleTests -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($modulePath)))) -Force
function Assert($Value,[string]$Message){if(!$Value){throw $Message}}
function Reject([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert $failed $Message}
$testRoot=Join-Path $repo ('.local\catalog-lifecycle-tests\'+[Guid]::NewGuid().ToString('N'))
$private=Join-Path $testRoot 'private';$outside=Join-Path $testRoot 'outside'
[IO.Directory]::CreateDirectory($private)|Out-Null
[IO.Directory]::CreateDirectory($outside)|Out-Null
$path=Join-Path $private 'archive-cache\bound.json'
[void](Write-CatalogAtomicJson $private $path ([ordered]@{Schema=1;Fingerprint='bound';Value='original'}))
$original=[IO.File]::ReadAllBytes($path)
$cached=Read-CatalogCacheJson $private $path -ExpectedFingerprint 'bound'
Assert ($cached.Value -eq 'original') 'Valid cache must roundtrip'
Reject {Write-CatalogAtomicJson $private $path ([ordered]@{Schema=1;Fingerprint='bound';Value='replacement'}) -BeforePublish {param($pending)throw 'injected pre-publish fault'}} 'Injected publication failure must surface'
Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -eq [Convert]::ToBase64String($original)) 'Pre-publish failure must preserve published bytes exactly'
$pending=@(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -File -Filter '*.pending-*')
Assert ($pending.Count -eq 1) 'Complete interrupted pending evidence must remain'
[void](Write-CatalogAtomicJson $private $path ([ordered]@{Schema=1;Fingerprint='bound';Value='replaced'}))
Assert ((Read-CatalogCacheJson $private $path -ExpectedFingerprint 'bound').Value -eq 'replaced') 'Atomic replacement must publish complete new JSON'
$broken=Join-Path (Split-Path $path -Parent) 'broken.json'
$truncated='{"Schema":1,"Fingerprint":"bound","Value":'
[IO.File]::WriteAllText($broken,$truncated)
Assert ($null -eq (Read-CatalogCacheJson $private $broken -ExpectedFingerprint 'bound')) 'Truncated cache must return missing'
Assert (![IO.File]::Exists($broken)) 'Corrupt cache must leave its original lookup path'
$quarantine=@(Get-ChildItem -LiteralPath (Split-Path $broken -Parent) -File -Filter 'broken.json.invalid-*.json')
Assert ($quarantine.Count -eq 1 -and [IO.File]::ReadAllText($quarantine[0].FullName) -eq $truncated) 'Quarantine must preserve corrupt bytes beside the cache'
[void](Write-CatalogAtomicJson $private $broken ([ordered]@{Schema=1;Fingerprint='bound';Value='rebuilt'}))
Assert ((Read-CatalogCacheJson $private $broken -ExpectedFingerprint 'bound').Value -eq 'rebuilt') 'A quarantined cache must be rebuildable'
Reject {Write-CatalogAtomicJson $private (Join-Path $outside 'escape.json') @{Schema=1}} 'Outside-root publication must reject'
Reject {Read-CatalogCacheJson $private (Join-Path $outside 'escape.json')} 'Outside-root cache reading must reject'
Reject {Write-CatalogAtomicJson $private (Join-Path $private 'oversized.json') @{Schema=1;Data=('x'*100)} -MaximumBytes 10} 'Bounded JSON publication must reject excessive bytes'
Assert (![IO.File]::Exists((Join-Path $private 'oversized.json'))) 'Oversized input must not publish a file'
$junction=Join-Path $private 'linked'
New-Item -ItemType Junction -Path $junction -Target $outside|Out-Null
Reject {Write-CatalogAtomicJson $private (Join-Path $junction 'escape.json') @{Schema=1}} 'Reparse ancestor must reject'
Assert (![IO.File]::Exists((Join-Path $outside 'escape.json'))) 'Rejected link must not write outside private root'
$now=[DateTime]::Parse('2026-10-30T12:00:00Z').ToUniversalTime()
$run=New-CatalogRunStatus -NowUtc $now
Assert ($run.State -eq 'launching' -and $run.RunId.Length -eq 32) 'Fresh run status must carry a unique launching identity'
$old=[pscustomobject]@{State='scanning';RunId='prior';ArchiveStartedUtc=$now.AddHours(-1).ToString('o')}
Assert (!(Test-CatalogArchiveDeadline $old $run.RunId -MaximumArchiveSeconds 10 -NowUtc $now)) 'Stale prior-run timestamps must be ignored'
$current=[pscustomobject]@{State='scanning';RunId=$run.RunId;ArchiveStartedUtc=$now.AddSeconds(-11).ToString('o')}
Assert (Test-CatalogArchiveDeadline $current $run.RunId -MaximumArchiveSeconds 10 -NowUtc $now) 'Current blocked archive must time out'
$current.ArchiveStartedUtc=$now.AddSeconds(-9).ToString('o')
Assert (!(Test-CatalogArchiveDeadline $current $run.RunId -MaximumArchiveSeconds 10 -NowUtc $now)) 'Current in-budget archive must continue'
$entries=Add-CatalogEntryWork 0 1250000
$entries=Add-CatalogEntryWork $entries 750000
Assert ($entries -eq 2000000) 'Fresh and resumed cached entries must both count against the aggregate bound'
Reject {Add-CatalogEntryWork $entries 1} 'A cache hit exceeding aggregate work must reject'
foreach($bad in @(-1,1.5,[double]::NaN,[double]::PositiveInfinity,$true)){
    Reject {Add-CatalogEntryWork 0 $bad} 'Invalid entry counts must reject'
}
Write-Output 'Catalogue lifecycle checks passed; private pending/quarantine evidence retained. No game, vendor parser or audio endpoint used.'
