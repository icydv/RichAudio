# Windows PowerShell 5.1: supplied CodeWalker dev46 targets .NET Framework.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$BankManifest,
 [string]$CodeWalkerRoot=(Join-Path ([Environment]::GetFolderPath('Desktop')) 'CodeWalker30_dev46'),
 [string]$OutputRoot='', [string]$EvidencePath='', [switch]$Npc, [string]$DecoderScriptPath='')
$ErrorActionPreference='Stop'
$decoderRoot=if($DecoderScriptPath){Split-Path ([IO.Path]::GetFullPath($DecoderScriptPath)) -Parent}else{$PSScriptRoot}
$repo=Split-Path $decoderRoot -Parent
if(!$OutputRoot){$OutputRoot=Join-Path $repo $(if($Npc){'.local\world-vehicle-02\npc-assets'}else{'.local\stock-source-01\assets'})}
if(!$EvidencePath){$EvidencePath=Join-Path $repo $(if($Npc){'.local\world-vehicle-02\decode-evidence.json'}else{'evidence\stock-source-01-decode.json'})}
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\');$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$out=[IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
if(!$out.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Private workspace .local output required'}
foreach($inputRoot in @($game,$cw)){if($out-eq$inputRoot-or$out.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output/input overlap'}}
if(Test-Path -LiteralPath (Join-Path $out 'manifest.json')){throw 'Fresh decoder manifest required; preserve previous evidence'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$banks=Get-Content -LiteralPath $BankManifest -Raw|ConvertFrom-Json
if($banks.banks){$banks=$banks.banks}
if(!$banks-or@($banks).Count-gt4){throw 'One to four explicit vehicle bank requests required'}
foreach($bank in $banks){if($bank.model-notin@('bati','lectro','prototipo','schafter3')-or!$bank.archive-or!$bank.entry){throw 'Explicit supported model/archive/entry required'}}
if($Npc -and (@($banks).Count -ne 1 -or $banks.model -ne 'bati')){throw 'This representative NPC decode is limited to one explicit Bati bank'}
$requiredStates=if($Npc){@('idle','accel')}else{@('idle','accel','decel')}
foreach($dll in Get-ChildItem -LiteralPath $cw -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null)
Add-Type -Path (Join-Path $decoderRoot 'StockPcmDecode.cs')
function FileHash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function JsonFile([string]$p,$value,[int]$depth){[IO.File]::WriteAllText($p,($value|ConvertTo-Json -Depth $depth),[Text.UTF8Encoding]::new($false))}
function Records($rpf){foreach($entry in $rpf.AllEntries){[pscustomobject]@{rpf=$rpf;entry=$entry}};foreach($child in $rpf.Children){Records $child}}
function FormatFields($format){if(!$format){return $null};[ordered]@{samples=[int]$format.Samples;sampleRate=[int]$format.SamplesPerSecond;codec=[int]$format.Codec;
 headroomRaw=[int]$format.Headroom;loopPointRaw=[int]$format.LoopPoint;loopBeginRaw=[int]$format.LoopBegin;loopEndRaw=[int]$format.LoopEnd;
 playBeginRaw=[int]$format.PlayBegin;playEndRaw=[int]$format.PlayEnd;peakRaw=[int]$format.PeakVal}}
$vehicles=New-Object Collections.Generic.List[object];$public=New-Object Collections.Generic.List[object];$archiveBindings=New-Object Collections.Generic.List[object]
foreach($bank in $banks){
 $model=[string]$bank.model;$relative=([string]$bank.archive).Replace('/','\');$path=[IO.Path]::GetFullPath((Join-Path $game $relative))
 if([IO.Path]::IsPathRooted($relative)-or!$path.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)-or$relative-match'(^|[\\/])\.\.([\\/]|$)'){throw 'Archive escaped game root'}
 $before=FileHash $path
 try{
  $rpf=New-Object CodeWalker.GameFiles.RpfFile($path,$relative);$errors=New-Object Collections.Generic.List[string]
  $rpf.ScanStructure($null,[Action[string]]{param($m)$errors.Add($m)})
  if($rpf.LastError-or$errors.Count){throw 'Archive scan failed'}
  $wanted=([string]$bank.entry).Replace('\','/').ToLowerInvariant()
  $matches=@(Records $rpf|Where-Object{if($wanted.Contains('/')){$actual=$_.entry.Path.Replace('\','/').ToLowerInvariant();$actual-eq$wanted-or$actual.EndsWith('/'+$wanted)}else{$_.entry.Name.ToLowerInvariant()-eq$wanted}})
  if($matches.Count-ne1){throw 'AWC entry must resolve uniquely within explicit archive'}
  $found=$matches[0];$bytes=$found.rpf.ExtractFile($found.entry);if(!$bytes){throw 'AWC extraction returned no bytes'}
  $awc=New-Object CodeWalker.GameFiles.AwcFile;$awc.Load($bytes,$found.entry)
  if($awc.ErrorMessage){throw 'AWC parser reported error'}
  if($Npc -and (!$bank.awcSha256 -or [StockPcmDecode]::Hash($bytes) -ne $bank.awcSha256)){throw 'Exact cached NPC AWC payload binding required'}
  $modelDir=Join-Path $out $model;if(Test-Path -LiteralPath $modelDir){throw 'Fresh model output directory required'};[IO.Directory]::CreateDirectory($modelDir)|Out-Null
  $layers=[ordered]@{engine=[ordered]@{};exhaust=[ordered]@{}};$streamReport=New-Object Collections.Generic.List[object];$privateStreams=New-Object Collections.Generic.List[object]
  foreach($stream in $awc.Streams){
   $name=[string]$stream.Name
   if($name-notmatch'^(engine|exhaust)_(idle|accel|decel)$'){continue}
   $role=$Matches[1];$state=$Matches[2];$format=FormatFields $stream.FormatChunk
   if($Npc -and $state -eq 'decel'){throw 'Four-state NPC contract must not conceal extra deceleration material'}
   if(!$format-or$format.sampleRate-lt8000-or$format.sampleRate-gt192000-or$format.codec-notin@(0,4)){throw 'Unsupported or missing verified stream format'}
   $raw=$stream.GetRawData();$pcm=$stream.GetPcmData();$wav=$stream.GetWavFile()
   if($format.codec-eq0-and[StockPcmDecode]::Hash($raw)-ne[StockPcmDecode]::Hash($pcm)){throw 'PCM codec changed raw source bytes'}
   if($pcm.Length-ne[long]$stream.SampleCount*2){throw 'Decoded PCM count differs from stream sample count'}
   $floatFile=Join-Path $modelDir ($name+'.f32');$wavFile=Join-Path $modelDir ($name+'.wav')
   $metrics=[StockPcmDecode]::Convert($wav,[int]$stream.SamplesPerSecond,[int]$stream.SampleCount,$floatFile)
   if($metrics.Pcm16Sha256-ne[StockPcmDecode]::Hash($pcm)){throw 'Canonical WAV does not preserve decoded PCM'}
   [IO.File]::WriteAllBytes($wavFile,$wav)
   $grains=@($stream.GranularGrainsChunk.GranularGrains|ForEach-Object{if($_){[ordered]@{UnkUint1=[uint32]$_.UnkUint1;UnkFloat1=[double]$_.UnkFloat1;UnkUshort1=[int]$_.UnkUshort1;UnkUshort2=[int]$_.UnkUshort2}}})
   $loops=@($stream.GranularLoopsChunk.GranularLoops|ForEach-Object{if($_){[ordered]@{unknownType=[uint32]$_.UnkUint1;identifier=[string]$_.Identifier.Hex;grainIndices=@($_.Grains)}}})
   $asset=[ordered]@{file=($model+'/'+$name+'.f32');wavFile=($model+'/'+$name+'.wav');format='f32le';sampleRate=$metrics.SampleRate;channels=1;frames=$metrics.Frames;
    sha256=$metrics.FloatSha256;sourceCodec=$format.codec;sourceBitsPerSample=16;sourceWavSha256=[StockPcmDecode]::Hash($wav);sourcePcmSha256=$metrics.Pcm16Sha256;
    sourceFormat=$format;metrics=$metrics;granular=[ordered]@{semantics='parser-unknown fields; not measured RPM or a confirmed playback algorithm';grains=$grains;loops=$loops}}
   $layers[$role][$state]=$asset
   $privateStreams.Add([ordered]@{name=$name;hash=[string]$stream.Hash.Hex;asset=$asset})
   $streamReport.Add([ordered]@{name=$name;streamHash=[string]$stream.Hash.Hex;frames=$metrics.Frames;sampleRate=$metrics.SampleRate;channels=1;codec=$format.codec;
    sourcePcmSha256=$metrics.Pcm16Sha256;floatSha256=$metrics.FloatSha256;peak=$metrics.Peak;rms=$metrics.Rms;dc=$metrics.Dc;fullScaleSamples=$metrics.FullScaleSamples;
    directWrapJump=$metrics.DirectWrapJump;maximumAdjacentStep=$metrics.MaximumAdjacentStep;floatRoundTripMaximumInt16Error=$metrics.RoundTripMaximumInt16Error;
    rawPcmEqualsDecoded=($format.codec-eq0);wavPcmEqualsDecoded=$true;rawPeakValEqualsObservedInt16=($format.peakRaw-eq$metrics.PeakInt16);
    grainCount=$grains.Count;loopCount=$loops.Count;loopPointRaw=$format.loopPointRaw})
  }
  $missing=@(foreach($role in @('engine','exhaust')){foreach($state in $requiredStates){if(!$layers[$role].Contains($state)){$role+'_'+$state}}})
  $status=if($missing.Count){'partial'}elseif($Npc){'decoded-four-source-layers'}else{'decoded-six-source-layers'}
  $provenance=[ordered]@{archive=$relative.Replace('\','/');entry=$found.entry.Path.Replace('\','/');archiveSha256=$before;awcSha256=[StockPcmDecode]::Hash($bytes);parser='supplied CodeWalker dev46';bankMapping=$bank.provenance}
  $vehicleRecord=[ordered]@{model=$model;status=$status;provenance=$provenance;layers=$layers;missing=$missing;streams=$privateStreams.ToArray()}
  if($Npc){$vehicleRecord.audioContext='npc';$vehicleRecord.sourceContract='npc-four-state-v1'}
  $vehicles.Add($vehicleRecord)
  $publicProvenance=[ordered]@{archive=$provenance.archive;entry=$provenance.entry;archiveSha256=$provenance.archiveSha256;awcSha256=$provenance.awcSha256;parser=$provenance.parser}
  $public.Add([ordered]@{model=$model;status=$status;provenance=$publicProvenance;streams=$streamReport.ToArray();missing=$missing;
   limitations=@('Offline source extraction, not live GTA audio behavior','Native granular field/RPM semantics unverified','Headroom/PeakVal units unverified; raw fields are not gain calibration','Direct full-file wrapping is not certified seamless; measured wrap jump is diagnostic')})
 }catch{
  $failure=[ordered]@{model=$model;status='blocked';blocker=$_.Exception.Message;exceptionType=$_.Exception.GetType().Name;layers=$null}
  $vehicles.Add($failure)
  $public.Add([ordered]@{model=$model;status='blocked';blocker='Source extraction or decoded-format validation failed; exact private diagnostic is in asset manifest';exceptionType=$failure.exceptionType})
 }finally{
  $after=FileHash $path;$same=$before-eq$after
  $archiveBindings.Add([ordered]@{archive=$relative.Replace('\','/');beforeSha256=$before;afterSha256=$after;unchanged=$same})
  if(!$same){throw 'Game archive changed during extraction'}
 }
}
$manifest=[ordered]@{schema=1;format='mono-f32le-native-rate-no-normalisation';sampleRateBasis='native rate on each asset; no resampling';privateRoot=$out;vehicles=$vehicles.ToArray();sourceAssemblies=@{CodeWalkerCoreSha256=FileHash (Join-Path $cw 'CodeWalker.Core.dll')};archiveBindings=$archiveBindings.ToArray()}
if($Npc){$manifest.gameExecutableSha256=FileHash (Join-Path $game 'GTA5_Enhanced.exe')}
JsonFile (Join-Path $out 'manifest.json') $manifest 22
$report=[ordered]@{schema=1;scope='STOCK-SOURCE-01 actual installed archive source decoding';gameWrites=$false;endpointOpened=$false;normalisation=$false;
 CodeWalkerCoreSha256=$manifest.sourceAssemblies.CodeWalkerCoreSha256;vehicles=$public.ToArray();archiveBindings=$archiveBindings.ToArray();
 decodeValidation='Canonical Int16 mono WAV/count/rate; PCM codec raw identity; exact reversible Int16/32768 Float32 conversion. Headroom/PeakVal fields retained without assuming amplitude units.';
 complete=(@($vehicles|Where-Object status -ne $(if($Npc){'decoded-four-source-layers'}else{'decoded-six-source-layers'})).Count-eq0)}
JsonFile $EvidencePath $report 14
$public|ForEach-Object{[pscustomobject]@{Model=$_.model;Status=$_.status;Streams=@($_.streams).Count;Missing=($_.missing-join',');Blocker=$_.blocker}}|Format-Table -AutoSize
Write-Output ('Private manifest: '+(Join-Path $out 'manifest.json'))
