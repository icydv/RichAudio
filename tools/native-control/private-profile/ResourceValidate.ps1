#requires -Version 7.0
param(
 [Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][string]$ResourceDirectory,
 [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedManifestSha256
)
$ErrorActionPreference='Stop'
function Pin([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function Word($v){return ('{0:x8}' -f [uint32]$v.Hash)}
$root=[IO.Path]::GetFullPath($ResourceDirectory)
for($dir=$root;$dir;$dir=[IO.Path]::GetDirectoryName($dir)){
 if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked resource refused'}
}
function Bound([string]$relative){
 $full=[IO.Path]::GetFullPath((Join-Path $root $relative))
 if(!$full.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Resource path escapes root'}
 for($part=$full;$part -and $part.Length -ge $root.Length;$part=[IO.Path]::GetDirectoryName($part)){
  if((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked resource refused'}
 }
 return $full
}
if((Pin $CodeWalkerCore) -cne '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Unpinned codec'}
$manifestPath=Bound 'resource-manifest.json'
if((Pin $manifestPath) -cne $ExpectedManifestSha256.ToLowerInvariant()){throw 'Manifest seal mismatch'}
$m=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($m.schema -cne 'RichAudioPrivateVehicleResource01' -or $m.profileName -cne 'ra_gapriv01_bati' -or $m.profileHash -cne 'dd89929d' -or !$m.disabledByDefault -or !$m.experimentalOnly -or $m.publicRedistributionAllowed){throw 'Fixed experimental profile contract mismatch'}
$expectedFiles=[ordered]@{'ra_private01_game.dat151.rel'='AUDIO_GAMEDATA';'ra_private01_sounds.dat54.rel'='AUDIO_SOUNDDATA';'ra_private01_marker.awc'='AUDIO_WAVEPACK'}
if($m.files.Count -ne 3 -or (@($m.files.path|Sort-Object -Unique)).Count -ne 3){throw 'Three unique resource files required'}
foreach($file in $m.files){
 if(!$expectedFiles.Contains($file.path) -or $file.role -cne $expectedFiles[$file.path]){throw 'Unexpected resource filename/role'}
 $p=Bound $file.path;if((Pin $p) -cne $file.sha256 -or (Get-Item -LiteralPath $p).Length -ne $file.bytes){throw 'Resource seal mismatch'}
}
foreach($audit in @('namespace','dependency')){
 $property=$audit+'AuditSha256';if((Pin (Bound ($audit+'-audit.json'))) -cne $m.validation.$property){throw 'Audit seal mismatch'}
}
if((Pin (Bound $m.markerManifest.path)) -cne $m.markerManifest.sha256 -or (Pin (Bound 'original-marker/marker.wav')) -cne $m.marker.wavSha256){throw 'Original marker seal mismatch'}
Add-Type -Path (Resolve-Path -LiteralPath $CodeWalkerCore)
function ReadRel([string]$name){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load([IO.File]::ReadAllBytes((Bound $name)),$null);return $r}
$g=ReadRel 'ra_private01_game.dat151.rel';$s=ReadRel 'ra_private01_sounds.dat54.rel'
if($g.RelDatas.Count -ne 1 -or $s.RelDatas.Count -ne 3){throw 'Unexpected private record count'}
$vehicle=$g.RelDatas[0]
if($vehicle.GetType().Name -cne 'Dat151Vehicle' -or (Word $vehicle.NameHash) -cne 'dd89929d' -or (Word $vehicle.Horns) -cne 'e6f4b317' -or (Word $vehicle.Engine) -cne 'a46d1b50' -or (Word $vehicle.EngineGranular) -cne '61f3bd06'){throw 'Bati engine retention/private horn link mismatch'}
$byHash=@{};foreach($r in $s.RelDatas){$byHash[(Word $r.NameHash)]=$r}
if(!$byHash.ContainsKey('e6f4b317') -or !$byHash.ContainsKey('a7d2e79c') -or !$byHash.ContainsKey('25624e72')){throw 'Private sound identity mismatch'}
$list=$byHash['e6f4b317'];$multi=$byHash['a7d2e79c'];$simple=$byHash['25624e72']
if($list.GetType().Name -cne 'Dat54SoundHashList' -or (@($list.SoundHashes|ForEach-Object {Word $_}) -join ',') -cne 'a7d2e79c,25624e72'){throw 'Private horn list closure mismatch'}
if($multi.GetType().Name -cne 'Dat54MultitrackSound' -or (@($multi.ChildSoundsHashes|ForEach-Object {Word $_}) -join ',') -cne '25624e72,27890bba'){throw 'Private/stock horn branch closure mismatch'}
if($simple.GetType().Name -cne 'Dat54SimpleSound' -or (Word $simple.ContainerName) -cne 'e6bea9d1' -or (Word $simple.FileName) -cne 'c33ff581' -or $simple.WaveSlotIndex -ne 0){throw 'Private wave closure mismatch'}
if($s.NameTable.Count -ne 1 -or $s.NameTable[0] -cne 'DLC_RA_PRIVATE01_6A13F902\RA_PRIVATE01_MARKER'){throw 'Private container path mismatch'}
foreach($r in @($g.RelDatas)+@($s.RelDatas)){
 $binding=@($m.records|Where-Object privateHash -CEQ (Word $r.NameHash))
 if($binding.Count -ne 1 -or (Digest $r.Data) -cne $binding[0].privateBodySha256){throw 'Record body binding mismatch'}
}
$awc=[CodeWalker.GameFiles.AwcFile]::new();$entry=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$entry.Name='ra_private01_marker.awc'
$awc.Load([IO.File]::ReadAllBytes((Bound $entry.Name)),$entry)
if($awc.Streams.Count -ne 1){throw 'One private wave stream required'}
$wave=$awc.Streams[0];$format=$wave.FormatChunk
if((Word $wave.Hash) -cne '033ff581' -or $format.Samples -ne 134400 -or $format.SamplesPerSecond -ne 48000 -or [int]$format.Codec -ne 0 -or $format.LoopPoint -ne -1){throw 'Original AWC format mismatch'}
$pcm=$wave.GetPcmData()
if($pcm.Length -ne 268800 -or (Digest $pcm) -cne $m.marker.pcmSha256){throw 'Original PCM identity mismatch'}
[double]$peak=0;for($i=0;$i -lt $pcm.Length;$i+=2){$peak=[Math]::Max($peak,[Math]::Abs([double][BitConverter]::ToInt16($pcm,$i)/32768))}
if($peak -gt 0.101 -or $peak -lt 0.09){throw 'Original PCM peak mismatch'}
[ordered]@{schema='RichAudioPrivateResourceValidation01';passed=$true;manifestSha256=$ExpectedManifestSha256.ToLowerInvariant();recordCount=4;linkRelocations=6;privateWaveStreams=1;originalPcmSha256=Digest $pcm;peak=$peak;runtimeLoadingVerified=$false}|ConvertTo-Json
