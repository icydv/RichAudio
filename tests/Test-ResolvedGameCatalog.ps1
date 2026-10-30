[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CatalogPath,[string]$EvidencePath='')
$ErrorActionPreference='Stop'
function Assert($Value,[string]$Message){if(!$Value){throw $Message}}
function Sha([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Jenkins([string]$Text){
    [uint64]$n=0
    foreach($b in [Text.Encoding]::UTF8.GetBytes($Text.ToLowerInvariant())){$n=($n+$b)-band4294967295L;$n=($n+($n-shl10))-band4294967295L;$n=$n-bxor($n-shr6)}
    $n=($n+($n-shl3))-band4294967295L;$n=$n-bxor($n-shr11);return [uint32](($n+($n-shl15))-band4294967295L)
}
Assert ((Jenkins 'bati') -eq 0xF9300CC5L) 'Independent Jenkins fixture must match the recorded stock identifier'
$path=[IO.Path]::GetFullPath($CatalogPath)
$data=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
$summary=Get-Content -LiteralPath (Join-Path (Split-Path $path -Parent) 'summary.json') -Raw|ConvertFrom-Json
Assert ($data.Schema -eq 1 -and $data.Stage -eq 'codewalker-resolved-installation-model') 'Actual resolved catalogue required'
Assert ($summary.ResolvedCatalogSHA256 -eq (Sha $path)) 'Summary must bind exact catalogue bytes'
Assert ($data.InputBinding.ScriptSHA256 -eq (Sha (Join-Path $PSScriptRoot '..\tools\Resolve-InstalledGameCache.ps1'))) 'Actual run must match current resolver source'
Assert (!$data.RuntimeMountStateObserved -and !$data.AcousticWorldImported -and !$data.RuntimeReplacementImplemented) 'Metadata preparation must not promote runtime, geometry or replacement readiness'
Assert ($data.SelectedDlc -eq $data.DlcNames[-1]) 'All setup-ordered declared DLC must be selected, including newer packs after a raw-list patch declaration'
Assert ($data.ReferenceCoverage.DeclaredModelCoverageComplete -and @($data.ReferenceCoverage.DeclaredMissingFromResolved).Count -eq 0) 'Every independently inventoried declared model must remain covered'
Assert (@($data.Vehicles).Count -gt 4 -and @($data.Vehicles).Count -le 20000) 'Registry must exceed the historical four-model set within its bound'
$models=@{};$verifiedUses=0;$candidateChecks=0
foreach($vehicle in $data.Vehicles){
    Assert (!$models.ContainsKey($vehicle.Model.ToLowerInvariant())) 'Model identities must be unique'
    $models[$vehicle.Model.ToLowerInvariant()]=$vehicle
    Assert ($vehicle.ModelHash.ToLowerInvariant() -eq ('{0:x8}' -f (Jenkins $vehicle.Model))) 'Selected model hash must match its actual metadata identity'
    Assert ($vehicle.AudioIdentifierHash -eq ('0x{0:x8}' -f (Jenkins $vehicle.AudioIdentifier))) 'Audio alias/fallback hash must preserve exact declared identity'
    Assert (!$vehicle.PcmDecoded -and !$vehicle.RuntimeSelectionObserved) 'Metadata mapping must not claim decoded source or runtime validation'
    foreach($sound in $vehicle.Sounds.PSObject.Properties.Value){
        if(!$sound){continue}
        Assert ($sound.Hash -match '^[a-fA-F0-9]{8}$' -and $sound.SourceRel -match '\.rel$') 'Sound graph references require real hash and REL provenance'
        foreach($channel in $sound.ChannelLinks){
            $candidateChecks++
            Assert ($channel.CandidateCount -eq @($channel.Candidates).Count) 'Zero/single/multiple container candidates must retain array cardinality'
            $full=[Convert]::ToUInt32(($channel.FullRelStreamHash-replace'^0x',''),16)
            Assert ($channel.MaskedAwcStreamId -eq ('0x{0:x8}' -f ($full-band0x1FFFFFFF))) 'AWC identity must use the independently verified 29-bit mask'
            Assert (!$channel.PcmDecoded -and $channel.RawVolumeUnits -eq 'unverified-not-applied') 'Stream table/raw volume metadata must not become PCM or a gain calibration'
            if($channel.State -eq 'verified-installed-container-and-stream'){
                $verifiedUses++
                Assert ($channel.CandidateCount -eq 1 -and $null -ne $channel.Stream -and $channel.AwcSHA256 -match '^[a-f0-9]{64}$') 'Verified routes need exactly one actual AWC and exact payload hash'
                Assert ($channel.Stream.StreamId -eq $channel.MaskedAwcStreamId) 'Verified AWC table must contain the referenced stream ID'
            }
            if($channel.CandidateCount -eq 1 -and $full -ne 0 -and $channel.ContainerHash -ne '0x00000000'){
                Assert ($channel.State -ne 'container-not-found') 'Single-item PowerShell collections must not be mistaken for absent banks'
            }
        }
    }
}
foreach($name in @('bati','lectro','prototipo','schafter3')){
    Assert ($models.ContainsKey($name)) 'Previously verified stock model must remain in the expanded registry'
    $channels=@($models[$name].Sounds.EngineAccel.ChannelLinks)
    Assert ($channels.Count -eq 6 -and @($channels|Where-Object State -NE 'verified-installed-container-and-stream').Count -eq 0) 'All six genuine player channels must resolve for each established base/DLC bank'
}
Assert ($verifiedUses -gt 24 -and $summary.AwcTablesParsed -gt 4) 'Actual expanded bank mapping must go beyond the historical four banks'
$placement=$data.CollisionPlacementIndex
Assert ($placement.IndexComplete -and $placement.ProjectionSchemaGaps -eq 0) 'Complete selected manifest/cache classification evidence required'
$boundsRows=0
foreach($property in $placement.BoundsStoreItemsByHash.PSObject.Properties){foreach($row in $property.Value){
    $boundsRows++
    Assert ($row.NameHash -eq $property.Name -and $row.CacheFile -and $row.CacheMetadataSHA256 -match '^[a-f0-9]{64}$') 'Every bounds-store row must retain matching hash and exact cache metadata provenance'
    Assert (@($row.Min).Count -eq 3 -and @($row.Max).Count -eq 3) 'Bounds store extents must remain three-dimensional metadata'
}}
Assert ($boundsRows -gt 1) 'Expanded collision index must contain actual installed bounds'
$allowed=@('Schema','State','GameVersion','GameExecutableSHA256','CodeWalkerCoreSHA256','ResolvedCatalogSHA256','SelectedDlc','Gen9SelectorAvailable','ModsFolderResolutionEnabled','VehicleModels','ModelsWithVehicleAudioRecord','ModelsWithGranularRecord','YbnEntries','YmapEntries','YtypEntries','ActiveMapArchives','PatchedPaths','ReferenceDeclaredModels','ReferenceMissingFromResolvedModels','ParserErrorCount','ElapsedSeconds','RuntimeMountStateObserved','AcousticWorldImported','RuntimeReplacementImplemented','GameWrites','PcmDecoded','EndpointOpened','AudioBankVerificationRequested','AwcTablesParsed','VerifiedBankStreamChannels','AmbiguousBankChannels','CollisionPlacementIndexComplete','CollisionBoundsKeys')
Assert (@($summary.PSObject.Properties|Where-Object{$_.Name -notin $allowed}).Count -eq 0) 'Public aggregate summary must use the reviewed path/asset-free whitelist'
Assert (!$summary.GameWrites -and !$summary.PcmDecoded -and !$summary.EndpointOpened) 'Catalogue construction must retain read-only/no-device evidence'
if($EvidencePath){
    $repo=Split-Path $PSScriptRoot -Parent;$destination=[IO.Path]::GetFullPath((Join-Path $repo $EvidencePath));$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo 'evidence'))+'\'
    Assert ($destination.StartsWith($evidenceRoot,[StringComparison]::OrdinalIgnoreCase)) 'Sanitized evidence must stay inside workspace evidence'
    $public=[ordered]@{Schema=1;Summary=$summary;Validation=[ordered]@{Passed=$true;ModelHashesChecked=$data.Vehicles.Count;ChannelUsesChecked=$candidateChecks;VerifiedChannelUses=$verifiedUses;BoundsRowsChecked=$boundsRows;PriorFourPlayerBanksRetained=$true};RuntimeReady=$false;NativeReplacementReady=$false}
    [IO.File]::WriteAllText($destination,($public|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
}
Write-Output ('Resolved catalogue validation passed: '+$models.Count+' models, '+$candidateChecks+' channel references, '+$verifiedUses+' verified uses, '+$boundsRows+' bound metadata rows; no game or endpoint accessed.')
