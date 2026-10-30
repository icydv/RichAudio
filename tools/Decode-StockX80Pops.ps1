# Narrow read-only bank decode of four graph-identified X80 exhaust-pop streams.
# Supplied CodeWalker dev46 requires Windows PowerShell5.1, not pwsh/.NET Core.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$VerifiedManifest,
 [Parameter(Mandatory=$true)][string]$GraphExport,
 [string]$CodeWalkerRoot=(Join-Path ([Environment]::GetFolderPath('Desktop')) 'CodeWalker30_dev46'),
 [string]$OutputRoot='', [string]$EvidencePath='')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.local\stock-source-03\x80-pops'}
if(!$EvidencePath){$EvidencePath=Join-Path $repo 'evidence\stock-source-03-x80-pops.json'}
$out=[IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
if(!$out.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'New checkout private output required'}
if(Test-Path -LiteralPath $out){throw 'Fresh output directory required; preserve existing artifacts'}
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
$baseline=Get-Content -LiteralPath $VerifiedManifest -Raw | ConvertFrom-Json
$bank=@($baseline.vehicles | Where-Object model -eq 'prototipo')
if($bank.Count-ne1){throw 'One verified X80 bank required'}
$bank=$bank[0]
$archiveRelative='update\x64\dlcpacks\mpexecutive\dlc.rpf'
if($bank.provenance.archive.Replace('/','\')-ne$archiveRelative){throw 'Unexpected baseline bank'}
$archive=Join-Path $game $archiveRelative
function HashFile([string]$file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
function JsonFile([string]$file,$value){[IO.File]::WriteAllText($file,($value | ConvertTo-Json -Depth 18),[Text.UTF8Encoding]::new($false))}
[xml]$graph=Get-Content -LiteralPath $GraphExport -Raw
function GraphNode([string]$name){$nodes=@($graph.SelectNodes("//Item[Name='$name']"));if($nodes.Count-ne1){throw 'Graph node must be unique'};$nodes[0]}
$wrapper=GraphNode 'hash_4DFBD9EB'
if($wrapper.type-ne'WrapperSound'-or$wrapper.ChildSound-ne'hash_518EC5DF'){throw 'Verified ExhaustPops wrapper differs'}
$random=GraphNode 'hash_518EC5DF'
if($random.type-ne'RandomizedSound'){throw 'Verified pop variation node differs'}
$bindings=@(
 [pscustomobject]@{sound='E8090ACE';file='87AAD300'},
 [pscustomobject]@{sound='1A7EEFB9';file='ECE29D6E'},
 [pscustomobject]@{sound='D284DFC6';file='1990F6CA'},
 [pscustomobject]@{sound='7D0734CC';file='CB4D5A44'})
foreach($binding in $bindings){
 if(@($random.Variations.Item | Where-Object name -eq ('hash_'+$binding.sound)).Count-ne1){throw 'Pop not in verified randomized graph'}
 $node=GraphNode ('hash_'+$binding.sound)
 if($node.type-ne'SimpleSound'-or$node.ContainerName-ne'hash_41CA753A'-or$node.FileName-ne('hash_'+$binding.file)){throw 'Verified pop terminal differs'}
}
$before=HashFile $archive
if($before-ne$bank.provenance.archiveSha256){throw 'Archive differs from verified source baseline'}
foreach($dll in Get-ChildItem -LiteralPath $CodeWalkerRoot -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null)
Add-Type -Path (Join-Path $PSScriptRoot 'StockPcmDecode.cs')
function Records($rpf){foreach($entry in $rpf.AllEntries){[pscustomobject]@{rpf=$rpf;entry=$entry}};foreach($child in $rpf.Children){Records $child}}
$streams=New-Object Collections.Generic.List[object]
try{
 $rpf=New-Object CodeWalker.GameFiles.RpfFile($archive,$archiveRelative)
 $errors=New-Object Collections.Generic.List[string]
 $rpf.ScanStructure($null,[Action[string]]{param($message)$errors.Add($message)})
 if($rpf.LastError-or$errors.Count){throw 'Read-only bank scan failed'}
 $found=@(Records $rpf | Where-Object {$_.entry.Name -eq 'prototipo.awc'})
 if($found.Count-ne1){throw 'X80 AWC must resolve uniquely'}
 $awcBytes=$found[0].rpf.ExtractFile($found[0].entry)
 $awcRawHash=[StockPcmDecode]::Hash($awcBytes)
 $awc=New-Object CodeWalker.GameFiles.AwcFile
 $awc.Load($awcBytes,$found[0].entry)
 if($awc.ErrorMessage){throw 'AWC parser error'}
 # Load can decrypt an encrypted container in-place. The existing Source01
 # manifest bound these in-memory bytes after Load, not the encrypted entry.
 $awcHash=[StockPcmDecode]::Hash($awcBytes)
 if($awcHash-ne$bank.provenance.awcSha256){throw 'Parsed AWC differs from verified source baseline'}
 [IO.Directory]::CreateDirectory($out)|Out-Null
 for($i=0;$i-lt$bindings.Count;$i++){
  $binding=$bindings[$i]
  # AWC stores29-bit stream IDs; DAT54 FileName is the full32-bit hash.
  # CodeWalker's AwcStreamInfo masks IDs with0x1FFFFFFF on read/write.
  $masked=[Convert]::ToUInt32($binding.file,16)-band[uint32]0x1FFFFFFF
  $matches=@($awc.Streams | Where-Object {[Convert]::ToUInt32([string]$_.Hash.Hex,16)-eq$masked})
  if($matches.Count-ne1){throw 'Graph pop must bind to one actual AWC stream'}
  $stream=$matches[0];$format=$stream.FormatChunk;$codec=[int]$format.Codec
  if(!$format-or$codec-notin@(0,4)){throw 'Unsupported or missing native pop codec'}
  $raw=$stream.GetRawData();$pcm=$stream.GetPcmData();$wav=$stream.GetWavFile()
  if($codec-eq0-and[StockPcmDecode]::Hash($raw)-ne[StockPcmDecode]::Hash($pcm)){throw 'PCM source bytes changed'}
  if($pcm.Length-ne[long]$stream.SampleCount*2){throw 'PCM count differs'}
  $name=('exhaust_pop_{0:d2}'-f($i+1))
  $metrics=[StockPcmDecode]::Convert($wav,[int]$stream.SamplesPerSecond,[int]$stream.SampleCount,(Join-Path $out ($name+'.f32')))
  if($metrics.Pcm16Sha256-ne[StockPcmDecode]::Hash($pcm)){throw 'Canonical WAV differs from decoded PCM'}
  [IO.File]::WriteAllBytes((Join-Path $out ($name+'.wav')),$wav)
  $streams.Add([ordered]@{name=$name;file=($name+'.f32');wavFile=($name+'.wav');format='f32le';channels=1;
   sampleRate=$metrics.SampleRate;frames=$metrics.Frames;sha256=$metrics.FloatSha256;
   sourceCodec=$codec;sourceRawSha256=[StockPcmDecode]::Hash($raw);sourcePcmSha256=$metrics.Pcm16Sha256;
   sourceWavSha256=[StockPcmDecode]::Hash($wav);graphSoundHash=$binding.sound;graphFileHash=$binding.file;
   awcMaskedStreamHash=('{0:X8}'-f$masked);metrics=$metrics;trigger='authored offline event only; native ECU/event conditions unverified'})
 }
}finally{
 $after=HashFile $archive
 if($after-ne$before){throw 'Game archive changed'}
}
$report=[ordered]@{schema=1;milestone='STOCK-SOURCE-03';model='prototipo';event='ExhaustPops';
 graph=[ordered]@{vehicleField='ExhaustPops';wrapperHash='4DFBD9EB';randomizedHash='518EC5DF';containerHash='41CA753A';graphExportSha256=HashFile $GraphExport};
 provenance=[ordered]@{archive=$archiveRelative.Replace('\','/');archiveSha256=$before;archiveUnchanged=$true;awcRawEntrySha256=$awcRawHash;awcPostParserSha256=$awcHash;
  awcHashBasis='LegacySource01AWC hash is post-Load memory; supplied parser may decrypt in-place. Raw entry hash is separately retained.';
  CodeWalkerCoreSha256=HashFile (Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll');streamsRequested=4;streamsDecoded=$streams.Count};
 variants=$streams.ToArray();gameWrites=$false;endpointOpened=$false;normalisation=$false;subjectiveListening='not performed';
 validation='Graph-bound29-bit AWC identity; declared native format/count; canonical mono Int16 WAV equals decoder PCM; exact reversible Int16/32768 Float32 conversion';
 limitations=@('Native graph supports X80 exhaust-pop identity, not observed ECU/throttle/shift trigger conditions',
  'Variants are one-shots, never sustain-loop material; no native metadata gain units inferred',
  'No Bati/Lectro/Schafter pop asset or KERS/intake event is established by this narrow decode')}
JsonFile (Join-Path $out 'manifest.json') $report
JsonFile $EvidencePath $report
$streams | ForEach-Object {[pscustomobject]@{Name=$_.name;Codec=$_.sourceCodec;Rate=$_.sampleRate;Frames=$_.frames;Peak=$_.metrics.Peak;Rms=$_.metrics.Rms;RoundTripError=$_.metrics.RoundTripMaximumInt16Error}} | Format-Table -AutoSize
