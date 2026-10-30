# Trace freshly exported installed metadata only. Never writes to a game/archive.
# Inspect-GameAudio.ps1 remains the .NET Framework/CodeWalker extraction workflow.
[CmdletBinding()]
param(
 [switch]$Refresh,
 [string]$GameRoot='',
 [string]$CodeWalkerRoot='',
 [string]$InspectionRoot='',
 [string]$MountRoot='',
 [string]$BaseBankRoot='',
 [string]$OutputPath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if(!$InspectionRoot){$InspectionRoot=Join-Path $repo '.local\stock-source-01\provenance\raw-confirmed'}
if(!$MountRoot){$MountRoot=Join-Path $repo '.local\stock-source-01\provenance\mount'}
if(!$BaseBankRoot){$BaseBankRoot=Join-Path $repo '.local\stock-source-01\provenance\base-bank-inventory'}
if(!$OutputPath){$OutputPath=Join-Path $repo 'evidence\stock-source-01-provenance.json'}
if($Refresh){
 if(!(Test-Path -LiteralPath $GameRoot -PathType Container)-or!(Test-Path -LiteralPath (Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll') -PathType Leaf)){throw 'Explicit installed game and supplied CodeWalker directories required'}
 $run=Join-Path $repo ('.local\stock-source-01\provenance\fresh-'+[guid]::NewGuid().ToString('N'))
 $InspectionRoot=Join-Path $run 'raw';$BaseBankRoot=Join-Path $run 'base-bank-inventory';$MountRoot=Join-Path $run 'mount'
 [IO.Directory]::CreateDirectory($run)|Out-Null
 function PsLiteral([string]$Value){"'"+$Value.Replace("'","''")+"'"}
 # Execute this trusted repository script as explicit commands under Framework
 # PowerShell. Execution-policy/security configuration is never changed.
 $frameworkCode='$ErrorActionPreference=''Stop'';$ProgressPreference=''SilentlyContinue'';'+
  '$game='+(PsLiteral ([IO.Path]::GetFullPath($GameRoot)))+';$cw='+(PsLiteral ([IO.Path]::GetFullPath($CodeWalkerRoot)))+';'+
  '$inspect=[ScriptBlock]::Create([IO.File]::ReadAllText('+(PsLiteral (Join-Path $PSScriptRoot 'Inspect-GameAudio.ps1'))+'));'+
  '& $inspect -GameRoot $game -CodeWalkerRoot $cw -OutputRoot '+(PsLiteral $InspectionRoot)+' -LoadKeys -AwcNamePattern ''(?!)'' -Archives @(''x64\audio\audio_rel.rpf'',''common.rpf'',''update\update.rpf'',''update\x64\dlcpacks\mpheist\dlc.rpf'',''update\x64\dlcpacks\mpapartment\dlc.rpf'',''update\x64\dlcpacks\mpexecutive\dlc.rpf'');'+
  '& $inspect -GameRoot $game -CodeWalkerRoot $cw -OutputRoot '+(PsLiteral $BaseBankRoot)+' -LoadKeys -AwcNamePattern ''(?!)'' -Archives @(''x64\audio\sfx\STREAMED_VEHICLES_GRANULAR.rpf'');'+
  '$mount='+(PsLiteral $MountRoot)+';'+@'
[IO.Directory]::CreateDirectory($mount)|Out-Null
$bindings=@()
foreach($relative in @('update\update.rpf','update\x64\dlcpacks\mpheist\dlc.rpf','update\x64\dlcpacks\mpapartment\dlc.rpf','update\x64\dlcpacks\mpexecutive\dlc.rpf')){
 $archive=New-Object CodeWalker.GameFiles.RpfFile((Join-Path $game $relative),$relative);$archive.ScanStructure($null,$null)
 foreach($entry in $archive.AllEntries){
  if($entry.Path-eq($relative+'\content.xml')-or$entry.Path-eq($relative+'\setup2.xml')-or$entry.Path-eq'update\update.rpf\common\data\dlclist.xml'-or$entry.Path-match'^update\\update.rpf\\dlc_patch\\(mpheist|mpapartment|mpexecutive)\\content.xml$'){
   $bytes=$archive.ExtractFile($entry);if(!$bytes){throw 'Mount resource extraction failed'}
   $name=($entry.Path-replace'[^a-zA-Z0-9_.-]','_')+'.xml';$target=Join-Path $mount $name;[IO.File]::WriteAllBytes($target,$bytes)
   $bindings+=[pscustomobject]@{Path=$entry.Path;File=$name;Bytes=$bytes.Length;SHA256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash}
  }
 }
}
$bindings|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $mount 'bindings.json') -Encoding UTF8
'@
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($frameworkCode))
 & powershell.exe -NoProfile -EncodedCommand $encoded *> (Join-Path $run 'inspection-console.txt')
 if($LASTEXITCODE-ne0){throw ('Read-only Framework inspection failed; private diagnostics at '+$run)}
 Write-Output ('Fresh private inspection: '+$run)
}
function Hash-Name([string]$Text){
 [uint32]$hash=0
 foreach($byte in [Text.Encoding]::UTF8.GetBytes($Text.ToLowerInvariant())){
  $hash=[uint32](($hash+[uint32]$byte)-band0xFFFFFFFFL)
  $hash=[uint32](($hash+([uint64]$hash-shl10))-band0xFFFFFFFFL)
  $hash=$hash-bxor($hash-shr6)
 }
 $hash=[uint32](($hash+([uint64]$hash-shl3))-band0xFFFFFFFFL)
 $hash=$hash-bxor($hash-shr11)
 $hash=[uint32](($hash+([uint64]$hash-shl15))-band0xFFFFFFFFL)
 'hash_'+$hash.ToString('X8')
}
function Read-Xml([string]$File){
 $settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null
 $reader=[Xml.XmlReader]::Create($File,$settings)
 try{$doc=[Xml.XmlDocument]::new();$doc.XmlResolver=$null;$doc.Load($reader);return ,$doc}finally{$reader.Dispose()}
}
function Resource-Export([string]$Relative){Join-Path $InspectionRoot (($Relative-replace'[^a-zA-Z0-9_.-]','_')+'.xml')}
function Mount-Export([string]$Relative){Join-Path $MountRoot (($Relative-replace'[^a-zA-Z0-9_.-]','_')+'.xml')}
function Record([Xml.XmlDocument]$Doc,[string]$Name){$Doc.SelectSingleNode("//Items/Item[Name='$Name']")}
function Value-Fields($Node,[string[]]$Names){$out=[ordered]@{};foreach($name in $Names){$item=$Node.SelectSingleNode($name);if($null-ne$item){$out[$name]=[string]$item.GetAttribute('value')}};return $out}
$summary=Get-Content -LiteralPath (Join-Path $InspectionRoot 'parse-summary.json') -Raw|ConvertFrom-Json
if(@($summary|Where-Object Error).Count){throw 'Fresh inspection must pass without parse errors'}
$archives=@(Get-Content -LiteralPath (Join-Path $InspectionRoot 'archive-integrity.json') -Raw|ConvertFrom-Json)+@(Get-Content -LiteralPath (Join-Path $BaseBankRoot 'archive-integrity.json') -Raw|ConvertFrom-Json)
if(@($archives|Where-Object{!$_.Unchanged-or$_.BeforeSHA256-ne$_.AfterSHA256-or$_.LastError-or@($_.Errors).Count}).Count){throw 'Archive preservation check failed'}
$inventory=@(Import-Csv -LiteralPath (Join-Path $InspectionRoot 'inventory.csv'))+@(Import-Csv -LiteralPath (Join-Path $BaseBankRoot 'inventory.csv'))
$awcMap=@{}
foreach($entry in $inventory){
 if($entry.Name-notlike'*.awc'){continue}
 $stem=[IO.Path]::GetFileNameWithoutExtension($entry.Name)
 # DLC AWCs can sit directly in an audio/sfx directory, not a named SFX RPF.
 $bank=if($entry.Path-match'\\sfx\\([^\\]+)\\[^\\]+\.awc$'){[IO.Path]::GetFileNameWithoutExtension($Matches[1])}else{[IO.Path]::GetFileNameWithoutExtension($entry.Archive)}
 foreach($candidate in @(($bank+'/'+$stem),$stem)){
  $key=Hash-Name $candidate
  if(!$awcMap.ContainsKey($key)){$awcMap[$key]=@()}
  $awcMap[$key]+=[ordered]@{path=$entry.Path;containerHashInput=$candidate}
 }
}
$metaRecords=@(foreach($entry in $summary|Where-Object Kind -EQ 'VehicleMeta'){
 $file=Resource-Export $entry.Path
 [pscustomobject]@{path=$entry.Path;file=$file;doc=Read-Xml $file}
})
$specs=@(
 @{model='bati';dlc=$null;game='update\update.rpf\x64\audio\config\game.dat151.rel';sounds='update\update.rpf\x64\audio\config\sounds.dat54.rel'},
 @{model='lectro';dlc='mpheist';game='update\x64\dlcpacks\mpheist\dlc.rpf\x64\audio\dlcmpheist_game.dat151.rel';sounds='update\x64\dlcpacks\mpheist\dlc.rpf\x64\audio\dlcmpheist_sounds.dat54.rel'},
 @{model='prototipo';dlc='mpexecutive';game='update\x64\dlcpacks\mpexecutive\dlc.rpf\x64\audio\dlcexec1_game.dat151.rel';sounds='update\x64\dlcpacks\mpexecutive\dlc.rpf\x64\audio\dlcexec1_sounds.dat54.rel'},
 @{model='schafter3';dlc='mpapartment';game='update\x64\dlcpacks\mpapartment\dlc.rpf\x64\audio\config\dlcapartment_game.dat151.rel';sounds='update\x64\dlcpacks\mpapartment\dlc.rpf\x64\audio\config\dlcapartment_sounds.dat54.rel'}
)
$dlcList=Read-Xml (Mount-Export 'update\update.rpf\common\data\dlclist.xml')
$dlcPaths=@($dlcList.SelectNodes('//Paths/Item')|ForEach-Object InnerText)
$mountBindings=@(Get-Content -LiteralPath (Join-Path $MountRoot 'bindings.json') -Raw|ConvertFrom-Json)
foreach($binding in $mountBindings){if((Get-FileHash -LiteralPath (Join-Path $MountRoot $binding.File) -Algorithm SHA256).Hash-ne$binding.SHA256){throw 'Mount configuration binding drift'}}
$models=@(foreach($spec in $specs){
 $model=$spec.model;$hash=Hash-Name $model
 $metas=@(foreach($meta in $metaRecords){$node=$meta.doc.SelectSingleNode("//InitDatas/Item[modelName='$model']");if($node){[ordered]@{path=$meta.path;modelName=[string]$node.modelName;audioNameHash=[string]$node.audioNameHash;gameName=[string]$node.gameName;vehicleClass=[string]$node.vehicleClass;xmlSHA256=(Get-FileHash -LiteralPath $meta.file -Algorithm SHA256).Hash}}})
 if(!$metas.Count){throw ('Installed model missing: '+$model)}
 if(@($metas|Where-Object audioNameHash).Count){throw 'Nonblank audioNameHash requires an explicit identifier trace'}
 $game=Read-Xml (Resource-Export $spec.game);$sounds=Read-Xml (Resource-Export $spec.sounds)
 $vehicle=Record $game $hash
 if(!$vehicle-or$vehicle.type-ne'Vehicle'){throw ('No exact Vehicle record: '+$model)}
 $engine=Record $game ([string]$vehicle.Engine);$granular=Record $game ([string]$vehicle.EngineGranular)
 if(!$engine-or!$granular-or$granular.type-ne'VehicleEngineGranular'){throw 'Missing linked engine/granular record'}
 $player=Record $sounds ([string]$granular.EngineAccel);$exhaust=Record $sounds ([string]$granular.ExhaustAccel)
 if($player.type-ne'GranularSound'){throw 'Expected independently resolved player GranularSound'}
 $channels=@(foreach($channel in $player.ChildNodes|Where-Object Name -Match '^Channel[0-5]$'){
  $key=[string]$channel.ContainerName;$containerCandidates=@($awcMap[$key])
  if(!$awcMap.ContainsKey($key)-or$containerCandidates.Count-ne1-or!$containerCandidates[0].path){throw ('Missing/ambiguous actual AWC: '+$model+' '+$key)}
  [ordered]@{channel=$channel.Name;containerHash=$key;stream=[string]$channel.FileName;awc=$containerCandidates[0].path;hashInput=$containerCandidates[0].containerHashInput}
 })
 if($channels.Count-ne6){throw 'All six independent player layers required'}
 $mount=$null
 if($spec.dlc){
  $setup=Read-Xml (Mount-Export ('update\x64\dlcpacks\'+$spec.dlc+'\dlc.rpf\setup2.xml'))
  $patch=Read-Xml (Mount-Export ('update\update.rpf\dlc_patch\'+$spec.dlc+'\content.xml'))
  $declarations=@($patch.SelectNodes('//*[fileType]')|Where-Object{$_.fileType-match'^AUDIO'-or$_.fileType-eq'VEHICLE_METADATA_FILE'}|ForEach-Object{[ordered]@{filename=[string]$_.filename;fileType=[string]$_.fileType;initialDisabled=[string]$_.disabled.value}})
  $mount=[ordered]@{pack=$spec.dlc;dlclistZeroBasedIndex=[Array]::IndexOf($dlcPaths,('dlcpacks:/'+$spec.dlc+'/'));device=[string]$setup.DocumentElement.deviceName;declaredOrder=[string]$setup.DocumentElement.order.value;updatePatchDeclarations=$declarations;interpretation='Declared metadata and audio wavepack routes verified; changeset activation and runtime registration not emulated. initialDisabled is not a claim that runtime audio is disabled.'}
 }
 $conventional=[ordered]@{}
 foreach($field in @('EngineLow','EngineHigh','ExhaustLow','ExhaustHigh','EngineIdleLoop','ExhaustIdleLoop','RevsOff','Transmission','Ignition','ShutDown','ExhaustPops')){if($engine.SelectSingleNode($field)){$conventional[$field]=[string]$engine.$field}}
 [ordered]@{model=$model;identifierVerified=$true;vehicleMetadata=$metas;
  selectionBasis='audioNameHash is empty in all inspected model declarations; model-hash fallback inferred, exact matching Vehicle record verified';
  gameMetadata=[ordered]@{path=$spec.game;sha256=(Get-FileHash -LiteralPath (Resource-Export $spec.game) -Algorithm SHA256).Hash;vehicleRecord=$hash;engineRecord=[string]$vehicle.Engine;granularRecord=[string]$vehicle.EngineGranular};
  soundMetadata=[ordered]@{path=$spec.sounds;sha256=(Get-FileHash -LiteralPath (Resource-Export $spec.sounds) -Algorithm SHA256).Hash;playerGranularSound=[string]$granular.EngineAccel;exhaustSound=[string]$granular.ExhaustAccel;exhaustType=[string]$exhaust.type;exhaustChannelID=[string]$exhaust.ChannelID.value;channelBinding='EnvironmentSound channel1 binding is parser-supported inference, not observed native voice routing'};
  channels=$channels;conventionalEngineFields=$conventional;
  rawGranularLevels=Value-Fields $granular @('MasterVolume','EngineVolume','ExhaustVolume','EngineIdleVolume','ExhaustIdleVolume','EngineAccelVolume','ExhaustAccelVolume');
  rawChannelLevels=Value-Fields $player @('ChannelVolume0','ChannelVolume1','ChannelVolume2','ChannelVolume3','ChannelVolume4','ChannelVolume5');
  granularClockRaw=([string]$player.GranularClock).Trim();metadataSemantics='Raw numeric fields are CodeWalker parser labels; gain units, GranularClock mapping and native granular playback schedule are not established and are not applied as invented dB/RPM values';
  mount=$mount;electricEngineReference=[string]$vehicle.ElectricEngine;
  kers=if($model-eq'lectro'){[ordered]@{verifiedSeparateAudio=$false;status='unsupported-unverified';basis='Conventional engine/exhaust references verified; ElectricEngine empty. No KERS/boost label or explicit reference to extra AWC hashes08894BE2/1B393DEA/1D64B840 found in this vehicle sound graph. Unknown fields are not assigned KERS semantics.'}}else{$null};
  runtimeSelectionObserved=$false
 }
})
$variantFile=($metaRecords|Where-Object path -Match 'update.rpf\\dlc_patch\\mpapartment\\').doc
$variantNames=@(foreach($doc in $variantFile){$doc.SelectNodes('//InitDatas/Item[starts-with(modelName,"schafter")]')|ForEach-Object{[ordered]@{model=[string]$_.modelName;gameName=[string]$_.gameName;vehicleClass=[string]$_.vehicleClass}}})
$result=[ordered]@{schemaVersion=1;milestone='STOCK-SOURCE-01';models=$models;schafterVariants=$variantNames;
 mountConfigurationBindings=@($mountBindings|ForEach-Object{[ordered]@{path=$_.Path;bytes=$_.Bytes;sha256=$_.SHA256}});
 inspection=[ordered]@{relFiles=@($summary|Where-Object Kind -EQ 'REL').Count;vehicleMetaFiles=@($summary|Where-Object Kind -EQ 'VehicleMeta').Count;parseErrors=0;declaredDlcPackCount=$dlcPaths.Count;archives=@($archives|ForEach-Object{[ordered]@{path=$_.Path;length=$_.Length;beforeSHA256=$_.BeforeSHA256;afterSHA256=$_.AfterSHA256;unchanged=$_.Unchanged}})};
 scope='Installed base/update plus the three owning DLC archives and update-patched vehicle metadata; all four unique player bank identities verified. Other DLC sound registries, arbitrary mod overrides and runtime mount selection are not claimed exhaustively resolved.';
 gameWrites=$false;gameLaunched=$false;audioEndpointOpened=$false;parser='Supplied CodeWalker30_dev46, no replacement runtime or undocumented game hooks'}
[IO.Directory]::CreateDirectory((Split-Path ([IO.Path]::GetFullPath($OutputPath))))|Out-Null
$result|ConvertTo-Json -Depth 18|Set-Content -LiteralPath $OutputPath -Encoding utf8
$models|ForEach-Object{[pscustomobject]@{Model=$_.model;Bank=$_.channels[0].hashInput;Layers=$_.channels.Count;RuntimeObserved=$_.runtimeSelectionObserved}}|Format-Table -AutoSize
