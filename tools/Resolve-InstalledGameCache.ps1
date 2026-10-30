# CodeWalker-selected installation model, not observed GTA runtime mount state.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$GameRoot,
    [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
    [string]$OutputRoot='.local/resolved-game-cache',
    [ValidateRange(5,900)][int]$MaximumSeconds=300,
    [ValidateRange(256,4096)][int]$MaximumMemoryMiB=2048,
    [ValidatePattern('^(0x)?[A-Fa-f0-9]{8}$')][string]$TargetCollisionHash='1c0c33c3',
    [string]$ReferenceCatalogPath='',
    [switch]$VerifyBankStreams,
    [string]$CatalogScriptPath='',
    [string]$RunId='',
    [switch]$Worker
)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$scriptPath=if($CatalogScriptPath){[IO.Path]::GetFullPath($CatalogScriptPath)}else{$PSCommandPath}
$repo=Split-Path (Split-Path $scriptPath -Parent) -Parent
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\');$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$output=if([IO.Path]::IsPathRooted($OutputRoot)){[IO.Path]::GetFullPath($OutputRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))}
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
if(!$output.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Private workspace .local output required'}
foreach($inputRoot in @($game,$cw)){if($output -eq $inputRoot -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output/input overlap'}}
for($part=[IO.DirectoryInfo]::new($output);$null -ne $part;$part=$part.Parent){if($part.Exists -and ($part.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output unsupported'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
function Json([string]$Path,$Value,[int]$Depth=14){
    $temporary=$Path+'.pending-'+[Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($temporary,($Value|ConvertTo-Json -Depth $Depth -Compress),[Text.UTF8Encoding]::new($false))
    if([IO.File]::Exists($Path)){[IO.File]::Replace($temporary,$Path,[NullString]::Value)}else{[IO.File]::Move($temporary,$Path)}
}
function Hash([string]$Path){$stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}}
$status=Join-Path $output 'status.json';$cancel=Join-Path $output 'cancel.request'
if(!$Worker){
    $lease=[IO.File]::Open((Join-Path $output 'worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        if(Test-Path -LiteralPath $cancel){throw 'Private cancellation request exists; remove it explicitly before restarting'}
        $RunId=[Guid]::NewGuid().ToString('N')
        Json $status ([ordered]@{RunId=$RunId;State='starting';Completed=$false})
        function Literal([string]$Value){return "'"+$Value.Replace("'","''")+"'"}
        $command='$resolverPath='+(Literal $scriptPath)+'; & ([ScriptBlock]::Create([IO.File]::ReadAllText($resolverPath))) -CatalogScriptPath $resolverPath -Worker -RunId '+(Literal $RunId)+' -GameRoot '+(Literal $game)+' -CodeWalkerRoot '+(Literal $cw)+' -OutputRoot '+(Literal $output)+' -MaximumSeconds '+$MaximumSeconds+' -MaximumMemoryMiB '+$MaximumMemoryMiB+' -TargetCollisionHash '+(Literal $TargetCollisionHash)
        if($ReferenceCatalogPath){$command+=' -ReferenceCatalogPath '+(Literal $ReferenceCatalogPath)}
        if($VerifyBankStreams){$command+=' -VerifyBankStreams'}
        $framework=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $process=Start-Process -FilePath $framework -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'worker.stdout.log') -RedirectStandardError (Join-Path $output 'worker.stderr.log')
        $watch=[Diagnostics.Stopwatch]::StartNew();$stopped=$null
        try {
            while(!$process.HasExited){
                if(Test-Path -LiteralPath $cancel){$stopped='cancelled';break}
                if($watch.Elapsed.TotalSeconds -gt $MaximumSeconds){$stopped='deadline';break}
                if($process.PrivateMemorySize64 -gt $MaximumMemoryMiB*1MB){$stopped='memory-bound';break}
                Start-Sleep -Milliseconds 200;$process.Refresh()
            }
        } finally {if(!$process.HasExited){$process.Kill();$process.WaitForExit();if(!$stopped){$stopped='parent-interrupted'}}}
        $process.WaitForExit()
        if($stopped){Json $status ([ordered]@{RunId=$RunId;State=$stopped;Completed=$false;AcousticWorldImported=$false});throw ('Owned resolver worker '+$stopped)}
        if($process.ExitCode -ne 0){throw 'Resolver failed; inspect private worker.stderr.log'}
        Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw
    } finally {$lease.Dispose()}
    return
}

$helperPath=Join-Path $repo 'src\acoustics\startup\InstalledCatalog.psm1'
Import-Module (New-Module -Name RichAudioInstalledCatalog -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($helperPath)))) -Force
$clock=[Diagnostics.Stopwatch]::StartNew();$script:lastStatus=-1000
function Progress-Status([string]$Phase,[string]$Message){
    if((Test-Path -LiteralPath $cancel) -or $clock.Elapsed.TotalSeconds -gt $MaximumSeconds){throw 'Resolver cancellation/deadline'}
    if($clock.ElapsedMilliseconds-$script:lastStatus -ge 250){Json $status ([ordered]@{RunId=$RunId;State=$Phase;Detail=$Message;ElapsedSeconds=$clock.Elapsed.TotalSeconds;Completed=$false});$script:lastStatus=$clock.ElapsedMilliseconds}
}
function Relative-Path([string]$Value){if(!$Value){return $null};$p=$Value.Replace('/','\');if($p.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)){$p=$p.Substring($game.Length+1)};return $p.Replace('\','/')}
function Entry-Path($Entry){if(!$Entry){return $null};return Relative-Path ([string]$Entry.Path)}
function Rel-Origin($Record){if(!$Record -or !$Record.Rel){return $null};return Entry-Path $Record.Rel.RpfFileEntry}
function Name-Hash([string]$Text){
    [uint32]$value=0
    foreach($byte in [Text.Encoding]::UTF8.GetBytes($Text.ToLowerInvariant())){$value=[uint32](($value+[uint32]$byte)-band0xFFFFFFFFL);$value=[uint32](($value+([uint64]$value-shl10))-band0xFFFFFFFFL);$value=$value-bxor($value-shr6)}
    $value=[uint32](($value+([uint64]$value-shl3))-band0xFFFFFFFFL);$value=$value-bxor($value-shr11);return [uint32](($value+([uint64]$value-shl15))-band0xFFFFFFFFL)
}
function Find-Audio($Dictionary,[uint32]$Key){$meta=New-Object CodeWalker.GameFiles.MetaHash($Key);if($Dictionary.ContainsKey($meta)){return $Dictionary[$meta]};return $null}
$script:bankIndex=@{};$script:bankTables=@{};$script:soundProjections=@{}
function Bank-Table($Candidate){
    $path=Entry-Path $Candidate.Entry
    if($script:bankTables.ContainsKey($path)){return $script:bankTables[$path]}
    Progress-Status 'verifying-bank-stream-tables' $path
    try {
        $bytes=$Candidate.Entry.File.ExtractFile($Candidate.Entry)
        if(!$bytes -or $bytes.Length -gt 128MB){throw 'Bounded AWC metadata bytes required'}
        $awc=New-Object CodeWalker.GameFiles.AwcFile;$awc.Load($bytes,$Candidate.Entry)
        if($awc.ErrorMessage){throw 'AWC metadata parser error'}
        $streams=@($awc.Streams|ForEach-Object{[pscustomobject]@{StreamId=('0x{0:x8}' -f $_.Hash.Hash);RecoveredName=[string]$_.Name;NameBasis='CodeWalker-name-recovery-not-authoritative-ID';Frames=$_.SampleCount;SampleRate=$_.SamplesPerSecond;Codec=if($_.FormatChunk){[int]$_.FormatChunk.Codec}else{$null}}})
        $duplicates=@($streams|Group-Object StreamId|Where-Object Count -GT 1)
        $table=[pscustomobject]@{Path=$path;SourceArchive=Relative-Path $Candidate.Entry.File.Path;AwcSHA256=Get-CatalogByteHash $bytes;StreamCount=$streams.Count;Streams=$streams;MaskedIdCollisions=$duplicates.Count;State='parsed-stream-table';PcmDecoded=$false}
    } catch {$table=[pscustomobject]@{Path=$path;State='unsupported-stream-table';ErrorKind=$_.Exception.GetType().Name;Error=$_.Exception.Message;PcmDecoded=$false}}
    $script:bankTables[$path]=$table
    if($script:bankTables.Count % 16 -eq 0){[GC]::Collect()}
    return $table
}
function Audio-Summary($Record){
    if(!$Record){return $null}
    $key=$Record.GetType().Name+'|'+(Rel-Origin $Record)+'|'+$Record.NameHash.Hex
    if($script:soundProjections.ContainsKey($key)){return $script:soundProjections[$key]}
    $summary=[ordered]@{Hash=$Record.NameHash.Hex;ParserType=$Record.GetType().Name;SourceRel=Rel-Origin $Record}
    if($Record.PSObject.Properties['Channel0']){
        $channels=New-Object Collections.Generic.List[object]
        for($i=0;$i -lt 6;$i++){
            $channel=$Record.('Channel'+$i);[uint32]$container=$channel.ContainerName.Hash;[uint32]$fullStream=$channel.FileName.Hash;[uint32]$masked=$fullStream-band0x1FFFFFFF
            $candidates=@()
            if($script:bankIndex.ContainsKey($container)){$candidates=@($script:bankIndex[$container].Values)}
            $candidateRows=@($candidates|ForEach-Object{[pscustomobject]@{Path=Entry-Path $_.Entry;SourceArchive=Relative-Path $_.Entry.File.Path;ContainerHashInput=$_.HashInput}})
            $table=$null;$stream=$null;$state=if($container -eq 0 -or $fullStream -eq 0){'unused-channel'}elseif($candidates.Count -eq 1){'unique-installed-container-stream-unverified'}elseif($candidates.Count -gt 1){'ambiguous-installed-container'}else{'container-not-found'}
            if($VerifyBankStreams -and $candidates.Count -eq 1 -and $container -ne 0 -and $fullStream -ne 0){
                $table=Bank-Table $candidates[0]
                if($table.State -eq 'parsed-stream-table' -and $table.MaskedIdCollisions -eq 0){$match=@($table.Streams|Where-Object StreamId -EQ ('0x{0:x8}' -f $masked));if($match.Count -eq 1){$stream=$match[0];$state='verified-installed-container-and-stream'}else{$state='stream-id-not-found'}}else{$state='unsupported-or-colliding-stream-table'}
            }
            $channels.Add([pscustomobject]@{Index=$i;ContainerHash=('0x{0:x8}' -f $container);FullRelStreamHash=('0x{0:x8}' -f $fullStream);MaskedAwcStreamId=('0x{0:x8}' -f $masked);StreamIdMask='0x1fffffff';RawChannelVolume=[int]$Record.('ChannelVolume'+$i);RawVolumeUnits='unverified-not-applied';State=$state;CandidateCount=$candidates.Count;Candidates=$candidateRows;AwcSHA256=if($table -and $table.State -eq 'parsed-stream-table'){$table.AwcSHA256}else{$null};Stream=$stream;PcmDecoded=$false})
        }
        $summary.ChannelLinks=$channels.ToArray()
    }
    $script:soundProjections[$key]=$summary
    return $summary
}
function Hash-Value($Value){if($null -eq $Value){return [uint32]0};if($Value.PSObject.Properties['Hash']){return [uint32]$Value.Hash};return [uint32]$Value}
function Vector-Value($Value){if($null -eq $Value){return $null};return @([double]$Value.X,[double]$Value.Y,[double]$Value.Z)}
try {
    $core=Join-Path $cw 'CodeWalker.Core.dll';$exe=Join-Path $game 'GTA5_Enhanced.exe'
    $binding=[ordered]@{GameVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe).FileVersion;GameExecutableSHA256=Hash $exe;CodeWalkerCoreSHA256=Hash $core;ScriptSHA256=Hash $scriptPath;HelperSHA256=Hash $helperPath}
    foreach($dll in Get-ChildItem -LiteralPath $cw -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
    [CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null)
    $mods=Test-Path -LiteralPath (Join-Path $game 'mods') -PathType Container
    $listArchive=if($mods -and (Test-Path -LiteralPath (Join-Path $game 'mods\update\update.rpf'))){'mods\update\update.rpf'}else{'update\update.rpf'}
    $rpf=New-Object CodeWalker.GameFiles.RpfFile((Resolve-CatalogArchivePath $game $listArchive),$listArchive)
    $rpf.ScanStructure($null,$null)
    $list=@($rpf.AllEntries|Where-Object{$_.Path.Replace('\','/') -match '(?i)/common/data/dlclist\.xml$'})
    if($rpf.LastError -or $list.Count -ne 1){throw 'Unique current CodeWalker dlclist source unavailable'}
    $listBytes=$rpf.ExtractFile($list[0]);$dlcs=@(Get-CatalogDlcDeclarations (Read-CatalogXml $listBytes))
    $supported=@($dlcs|Where-Object SupportedPath)
    if(!$supported.Count){throw 'No supported declared DLC to select'}
    $selected=$supported[-1].Pack
    $type=[CodeWalker.GameFiles.GameFileCache];$constructors=@($type.GetConstructors());$gen9=$false;$cache=$null
    foreach($ctor in $constructors){$parameters=$ctor.GetParameters();if($parameters.Count -eq 7 -and $parameters[3].ParameterType -eq [bool]){$gen9=$true;$cache=$ctor.Invoke(@([long](256MB),[double]10,$game,$true,'',[bool]$mods,''));break}}
    if(!$cache){foreach($ctor in $constructors){if($ctor.GetParameters().Count -eq 6){$cache=$ctor.Invoke(@([long](256MB),[double]10,$game,'',[bool]$mods,''));break}}}
    if(!$cache){throw 'Supplied GameFileCache constructor unsupported'}
    $cache.LoadPeds=$false;$cache.LoadVehicles=$true;$cache.LoadAudio=$true;$cache.LoadArchetypes=$true
    # CodeWalker orders setup manifests by setup.order. The final raw dlclist
    # declaration can be an earlier patch level and must not truncate newer DLC.
    $cache.EnableDlc=$true
    $cache.DoFullStringIndex=$false;$cache.BuildExtendedJenkIndex=$false
    $messages=New-Object Collections.Generic.List[string];$script:errorCount=0
    $onStatus=[Action[string]]{param($message)Progress-Status 'initializing-codewalker' $message}
    $onError=[Action[string]]{param($message)$script:errorCount++;if($messages.Count -lt 256){$messages.Add($message)}}
    Progress-Status 'initializing-codewalker' 'Beginning read-only metadata/index initialization'
    $cache.Init($onStatus,$onError)
    if(!$cache.IsInited){throw 'CodeWalker initialization did not complete'}
    if(!$cache.DlcNameList.Count){throw 'Supplied parser did not resolve any declared DLC'}
    $highest=$cache.DlcNameList[$cache.DlcNameList.Count-1]
    if($cache.SelectedDlc -ne $highest){[void]$cache.SetDlcLevel($highest,$true)}
    if($cache.SelectedDlc -ne $highest -or !$cache.EnableDlc){throw 'Highest CodeWalker setup-ordered DLC level not selected'}
    # Resolve actual installed container identities; never substitute a bank from
    # a similarly named model. Multiple exact hash matches remain ambiguous.
    foreach($archive in $cache.AllRpfs){foreach($entry in $archive.AllEntries){
        if(!$entry.Name.EndsWith('.awc',[StringComparison]::OrdinalIgnoreCase)){continue}
        $stem=[IO.Path]::GetFileNameWithoutExtension($entry.Name).ToLowerInvariant()
        $entryPath=Entry-Path $entry
        $bank=if($entryPath -match '/sfx/([^/]+)/[^/]+\.awc$'){[IO.Path]::GetFileNameWithoutExtension($Matches[1]).ToLowerInvariant()}else{[IO.Path]::GetFileNameWithoutExtension($archive.Name).ToLowerInvariant()}
        foreach($hashInput in @(($bank+'/'+$stem),$stem)){
            [uint32]$containerHash=Name-Hash $hashInput
            if(!$script:bankIndex.ContainsKey($containerHash)){$script:bankIndex[$containerHash]=@{}}
            $script:bankIndex[$containerHash][(Entry-Path $entry)]=[pscustomobject]@{Entry=$entry;HashInput=$hashInput}
        }
    }}
    $resources=New-Object Collections.Generic.List[object]
    foreach($kind in @('Ybn','Ymap','Ytyp')){
        $dictionary=$cache.($kind+'Dict')
        foreach($pair in $dictionary.GetEnumerator()){
            $entry=if($kind -eq 'Ytyp'){$pair.Value.RpfFileEntry}else{$pair.Value}
            $resources.Add([pscustomobject]@{Hash=('0x{0:x8}' -f [uint32]$pair.Key);Kind=$kind.ToLowerInvariant();Name=$entry.Name;Path=Entry-Path $entry;SourceArchive=if($entry.File){Relative-Path $entry.File.Path}else{$null};ResolutionBasis='CodeWalker.GameFileCache selected dictionary';ContentSHA256=$null;GeometryImported=$false})
        }
    }
    if($resources.Count -gt 500000 -or $cache.VehiclesInitDict.Count -gt 20000){throw 'Resolved resource/model bound exceeded'}
    $vehicles=New-Object Collections.Generic.List[object]
    foreach($pair in $cache.VehiclesInitDict.GetEnumerator()){
        $vehicle=$pair.Value;$model=[string]$vehicle.modelName;$alias=[string]$vehicle.audioNameHash
        $identifier=if($alias){$alias}else{$model};$audioHash=Name-Hash $identifier
        $record=Find-Audio $cache.AudioGameDict $audioHash
        $engine=$null;$granular=$null
        if($record -and $record.PSObject.Properties['Engine']){$engine=Find-Audio $cache.AudioGameDict $record.Engine.Hash}
        if($record -and $record.PSObject.Properties['EngineGranular']){$granular=Find-Audio $cache.AudioGameDict $record.EngineGranular.Hash}
        $sounds=[ordered]@{}
        foreach($field in @('EngineAccel','ExhaustAccel','EngineAccelNPC','ExhaustAccelNPC')){if($granular -and $granular.PSObject.Properties[$field]){$sounds[$field]=Audio-Summary (Find-Audio $cache.AudioSoundsDict $granular.$field.Hash)}}
        $vehicles.Add([pscustomobject]@{Model=$model;ModelHash=$pair.Key.Hex;AudioNameHash=$alias;AudioIdentifier=$identifier;AudioIdentifierHash=('0x{0:x8}' -f $audioHash);AudioSelectionBasis=if($alias){'declared-audioNameHash'}else{'model-name-fallback-inferred'};VehicleClass=[string]$vehicle.vehicleClass;VehicleType=[string]$vehicle.type;VehicleAudioRecord=Audio-Summary $record;EngineRecord=Audio-Summary $engine;GranularRecord=Audio-Summary $granular;Sounds=$sounds;ResolutionBasis='CodeWalker.GameFileCache.VehiclesInitDict';VehicleMetadataSource='winning metadata source not exposed by public vehicle dictionary';RuntimeSelectionObserved=$false;PcmDecoded=$false})
    }
    $active=@($cache.ActiveMapRpfFiles.GetEnumerator()|ForEach-Object{[pscustomobject]@{VirtualPath=$_.Key;Archive=Relative-Path $_.Value.Path}})
    $patches=@($cache.DlcPatchedPaths.GetEnumerator()|ForEach-Object{[pscustomobject]@{Original=$_.Key;Replacement=$_.Value}})
    $referenceCoverage=$null
    if($ReferenceCatalogPath){
        $referencePath=if([IO.Path]::IsPathRooted($ReferenceCatalogPath)){[IO.Path]::GetFullPath($ReferenceCatalogPath)}else{[IO.Path]::GetFullPath((Join-Path $repo $ReferenceCatalogPath))}
        if(!$referencePath.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Reference catalogue must remain private to this workspace'}
        $reference=Get-Content -LiteralPath $referencePath -Raw|ConvertFrom-Json
        if($reference.Schema -ne 1 -or $reference.InputBinding.GameExecutableSHA256 -ne $binding.GameExecutableSHA256){throw 'Reference catalogue game binding differs'}
        $resolvedNames=@{};foreach($v in $vehicles){$resolvedNames[$v.Model.ToLowerInvariant()]=$true}
        $declaredNames=@{};foreach($v in $reference.Models){$declaredNames[$v.Model.ToLowerInvariant()]=$true}
        $missing=@($reference.Models|Where-Object{!$resolvedNames.ContainsKey($_.Model.ToLowerInvariant())}|Select-Object Model,Sources)
        $extra=@($vehicles|Where-Object{!$declaredNames.ContainsKey($_.Model.ToLowerInvariant())}|ForEach-Object Model)
        $referenceCoverage=[ordered]@{ReferenceCatalogSHA256=Hash $referencePath;DeclaredModels=$reference.Models.Count;ResolvedModels=$vehicles.Count;DeclaredMissingFromResolved=$missing;ResolvedMissingFromReference=$extra;DeclaredModelCoverageComplete=($missing.Count -eq 0);RuntimeCoverageObserved=$false}
    }
    $target=[Convert]::ToUInt32(($TargetCollisionHash -replace '^0x',''),16)
    $interiorByHash=@{};$mapByHash=@{};$boundsByHash=@{};$projectionGaps=0
    function Add-HashRow($Dictionary,[uint32]$HashValue,$Row){$hashKey=('0x{0:x8}' -f $HashValue);if(!$Dictionary.ContainsKey($hashKey)){$Dictionary[$hashKey]=New-Object Collections.Generic.List[object]};$Dictionary[$hashKey].Add($Row)}
    foreach($manifest in $cache.AllManifests){
        if(!$manifest.PSObject.Properties['Interiors'] -or !$manifest.PSObject.Properties['MapDataGroups']){$projectionGaps++;continue}
        foreach($interior in $manifest.Interiors){
            if(!$interior.PSObject.Properties['Bounds']){$projectionGaps++;continue}
            foreach($bound in $interior.Bounds){$h=Hash-Value $bound;Add-HashRow $interiorByHash $h ([pscustomobject]@{Manifest=Entry-Path $manifest.RpfFileEntry;InteriorName=[string]$interior.Interior.Name;BoundsHash=('0x{0:x8}' -f $h)})}
        }
        foreach($group in $manifest.MapDataGroups){
            if(!$group.PSObject.Properties['Bounds']){$projectionGaps++;continue}
            foreach($bound in $group.Bounds){$h=Hash-Value $bound;Add-HashRow $mapByHash $h ([pscustomobject]@{Manifest=Entry-Path $manifest.RpfFileEntry;DataGroupName=[string]$group.DataGroup.Name;Name=[string]$group.Name;BoundsHash=('0x{0:x8}' -f $h);HoursOnOff=[string]$group.DataGroup.HoursOnOff;WeatherTypes=@($group.WeatherTypes|ForEach-Object{[string]$_})})}
        }
    }
    foreach($cacheFile in $cache.AllCacheFiles){
        if(!$cacheFile.PSObject.Properties['AllBoundsStoreItems']){$projectionGaps++;continue}
        $cacheEntry=$cacheFile.FileEntry
        $metadataHash=if($cacheEntry -and $cacheEntry.File){Get-CatalogByteHash ($cacheEntry.File.ExtractFile($cacheEntry))}else{$null}
        if(!$metadataHash){$projectionGaps++}
        foreach($item in $cacheFile.AllBoundsStoreItems){$h=Hash-Value $item.Name;Add-HashRow $boundsByHash $h ([pscustomobject]@{CacheFile=Entry-Path $cacheEntry;CacheMetadataSHA256=$metadataHash;NameHash=('0x{0:x8}' -f $h);Min=Vector-Value $item.Min;Max=Vector-Value $item.Max;Layer=[string]$item.Layer})}
    }
    $placementIndex=[ordered]@{IndexComplete=($projectionGaps -eq 0 -and $script:errorCount -eq 0 -and @($cache.AllManifests).Count -gt 0 -and @($cache.AllCacheFiles).Count -gt 0);ManifestFilesVisited=@($cache.AllManifests).Count;CacheFilesVisited=@($cache.AllCacheFiles).Count;ProjectionSchemaGaps=$projectionGaps;InteriorBoundsMembershipByHash=$interiorByHash;MapGroupMembershipByHash=$mapByHash;BoundsStoreItemsByHash=$boundsByHash;ResolutionBasis='complete CodeWalker selected manifest/cache metadata model; not observed GTA state';ManifestPayloadHashesComputed=$false}
    $targetKey=('0x{0:x8}' -f $target)
    $targetEvidence=[ordered]@{Hash=$targetKey;ManifestFilesVisited=$placementIndex.ManifestFilesVisited;CacheFilesVisited=$placementIndex.CacheFilesVisited;ProjectionSchemaGaps=$projectionGaps;InteriorBoundsMembership=if($interiorByHash.ContainsKey($targetKey)){$interiorByHash[$targetKey].ToArray()}else{@()};MapGroupMembership=if($mapByHash.ContainsKey($targetKey)){$mapByHash[$targetKey].ToArray()}else{@()};BoundsStoreItems=if($boundsByHash.ContainsKey($targetKey)){$boundsByHash[$targetKey].ToArray()}else{@()};SelectedYbn=@($resources|Where-Object{$_.Kind -eq 'ybn' -and $_.Hash -eq $targetKey});RuntimeSpaceObserved=$false;WorldGeometryImported=$false;Classification='consumer must evaluate complete manifest/cache evidence; no automatic coordinate promotion'}
    $result=[ordered]@{Schema=1;Stage='codewalker-resolved-installation-model';GeneratedUtc=[DateTime]::UtcNow.ToString('o');InputBinding=$binding;SelectedDlc=$cache.SelectedDlc;SelectedDlcBasis='highest setup.order-sorted CodeWalker DlcNameList level';LastRawDlcDeclaration=$selected;DlcListSource=$listArchive;DlcListSHA256=Get-CatalogByteHash $listBytes;DlcNames=@($cache.DlcNameList);ReferenceCoverage=$referenceCoverage;ModsFolderResolutionEnabled=[bool]$mods;Gen9SelectorAvailable=$gen9;Resources=@($resources.ToArray()|Sort-Object Kind,Hash);Vehicles=@($vehicles.ToArray()|Sort-Object Model);ActiveMapArchives=$active;PatchedPaths=$patches;TargetCollisionEvidence=$targetEvidence;ParserErrors=$messages.ToArray();ParserErrorCount=$script:errorCount;AcousticWorldImported=$false;RuntimeReplacementImplemented=$false;RuntimeMountStateObserved=$false;Limitations=@('Selected dictionaries model CodeWalker mount/patch rules; they are not observed GTA runtime state','No world-space placement/triangle/portal/acoustic-material assembly','Legacy six-argument parser has no explicit Gen9 mode; capability is reported rather than inferred','Vehicle metadata winning-source paths are not exposed by the public dictionary','Resource identifiers and output/input bindings are hashed; resource payload content hashes are not computed','No audio PCM extraction or native suppression')}
    $result.CollisionPlacementIndex=$placementIndex
    $result.AudioBankTables=@($script:bankTables.Values|Sort-Object Path)
    $result.AudioBankVerificationRequested=[bool]$VerifyBankStreams
    $catalogPath=Join-Path $output 'resolved-catalog.json';Json $catalogPath $result 15
    $summary=[ordered]@{Schema=1;State='codewalker-resolved-model';GameVersion=$binding.GameVersion;GameExecutableSHA256=$binding.GameExecutableSHA256;CodeWalkerCoreSHA256=$binding.CodeWalkerCoreSHA256;ResolvedCatalogSHA256=Hash $catalogPath;SelectedDlc=$cache.SelectedDlc;Gen9SelectorAvailable=$gen9;ModsFolderResolutionEnabled=[bool]$mods;VehicleModels=$vehicles.Count;ModelsWithVehicleAudioRecord=@($vehicles|Where-Object VehicleAudioRecord).Count;ModelsWithGranularRecord=@($vehicles|Where-Object GranularRecord).Count;YbnEntries=$cache.YbnDict.Count;YmapEntries=$cache.YmapDict.Count;YtypEntries=$cache.YtypDict.Count;ActiveMapArchives=$active.Count;PatchedPaths=$patches.Count;ReferenceDeclaredModels=if($referenceCoverage){$referenceCoverage.DeclaredModels}else{$null};ReferenceMissingFromResolvedModels=if($referenceCoverage){$referenceCoverage.DeclaredMissingFromResolved.Count}else{$null};ParserErrorCount=$script:errorCount;ElapsedSeconds=[Math]::Round($clock.Elapsed.TotalSeconds,3);RuntimeMountStateObserved=$false;AcousticWorldImported=$false;RuntimeReplacementImplemented=$false;GameWrites=$false;PcmDecoded=$false;EndpointOpened=$false}
    $channelRows=@($script:soundProjections.Values|ForEach-Object{$_.ChannelLinks})
    $summary.AudioBankVerificationRequested=[bool]$VerifyBankStreams
    $summary.AwcTablesParsed=@($script:bankTables.Values|Where-Object State -EQ 'parsed-stream-table').Count
    $summary.VerifiedBankStreamChannels=@($channelRows|Where-Object State -EQ 'verified-installed-container-and-stream').Count
    $summary.AmbiguousBankChannels=@($channelRows|Where-Object State -EQ 'ambiguous-installed-container').Count
    $summary.CollisionPlacementIndexComplete=$placementIndex.IndexComplete
    $summary.CollisionBoundsKeys=$boundsByHash.Count
    Json (Join-Path $output 'summary.json') $summary
    Json $status ([ordered]@{RunId=$RunId;State='complete';Completed=$true;AcousticWorldImported=$false})
} catch {Json $status ([ordered]@{RunId=$RunId;State='failed';Completed=$false;AcousticWorldImported=$false});throw}
