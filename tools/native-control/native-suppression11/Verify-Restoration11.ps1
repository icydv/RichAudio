$ErrorActionPreference='Stop'
$run='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-11'
$t=Get-Content (Join-Path $run 'transaction.json') -Raw|ConvertFrom-Json -DateKind String
$s=Get-Content (Join-Path $run 'scope.json') -Raw|ConvertFrom-Json -DateKind String
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Game or recorder active'}
if($t.status-cne'restored-awaiting-independent-verification'){throw 'Unexpected restoration state'}
$absent=@($t.files.destination)+@($t.createdDirectories)+@($s.logBackupsRequired|Where-Object {!$_.exists}|ForEach-Object path)+@($s.installation.additionalRequiredAbsent|Where-Object {$_-cne$run})
$absent=@($absent|Sort-Object -Unique)
foreach($p in $absent){if(Test-Path -LiteralPath $p){throw "Temporary path remains: $p"}}
$metadata=@()
foreach($b in @($t.backups)+@(@{path=$t.trainer.original;sha256=$t.trainer.sha256;creationUtc=$t.trainer.creationUtc;lastWriteUtc=$t.trainer.lastWriteUtc;attributes=$t.trainer.attributes})){
 $item=Get-Item -LiteralPath $b.path
 $r=[ordered]@{path=$b.path;sha256=(HashFile $b.path);creationUtc=$item.CreationTimeUtc.ToString('o');lastWriteUtc=$item.LastWriteTimeUtc.ToString('o');attributes=[int]$item.Attributes}
 if($r.sha256-cne$b.sha256-or$item.CreationTimeUtc.Ticks-ne([DateTimeOffset]::Parse($b.creationUtc).UtcTicks)-or$item.LastWriteTimeUtc.Ticks-ne([DateTimeOffset]::Parse($b.lastWriteUtc).UtcTicks)-or$r.attributes-ne$b.attributes){throw "Restored bytes or metadata differ: $($b.path)"}
 $metadata+=@($r)
}
$pins=@($s.game,$s.originalBaseArchive,$s.originalGranularArchive,$s.originalResidentArchive)+@($s.unchangedRootBinaryInventory)
$checked=@()
foreach($f in $pins){if((Get-Item -LiteralPath $f.path).Length-ne$f.bytes-or(HashFile $f.path)-cne$f.sha256){throw "Original drift: $($f.path)"};$checked+=@{path=$f.path;bytes=$f.bytes;sha256=$f.sha256}}
$game=Split-Path $s.game.path
$actual=@(Get-ChildItem -LiteralPath $game -File -Force|Where-Object Extension -in '.dll','.asi'|ForEach-Object FullName|Sort-Object)
if(@(Compare-Object (@($s.unchangedRootBinaryInventory.path)|Sort-Object) $actual).Count){throw 'Root binary set differs'}
$r=[ordered]@{schema='NativeSuppression11IndependentRestoration';utc=[DateTime]::UtcNow.ToString('o');passed=$true;scopeSha256=$t.scopeSha256;sourceCommit=$t.sourceCommit;processes=@();verifiedAbsent=$absent;restoredMetadata=$metadata;checkedOriginalIdentities=$checked;rootBinaryInventoryExact=$true;vehicleRetirement='Separate runner and journal result; not established by disk restoration';audibleReturn='Separate listening observation; not inferred from disk restoration'}
$r|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $run 'cleanup-verification.json') -Encoding utf8
$t.status='restored-independently-verified'
$t|Add-Member -NotePropertyName independentlyVerifiedUtc -NotePropertyValue $r.utc -Force
$t|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $run 'transaction.json') -Encoding utf8
[pscustomobject]@{passed=$true;absentPaths=$absent.Count;restoredMetadata=$metadata.Count;checkedOriginals=$checked.Count}|ConvertTo-Json
