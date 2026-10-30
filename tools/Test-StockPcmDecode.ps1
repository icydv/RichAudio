# Focused numeric codec-boundary fixtures; not authentic-audio evidence.
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$out=Join-Path $repo ('.local\stock-pcm-tests-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
Add-Type -Path (Join-Path $PSScriptRoot 'StockPcmDecode.cs')
function Wav([int[]]$Samples,[int]$Rate=24000){
 $m=[IO.MemoryStream]::new();$w=[IO.BinaryWriter]::new($m)
 foreach($text in @('RIFF')){$w.Write([Text.Encoding]::ASCII.GetBytes($text))};$w.Write([int](36+$Samples.Length*2))
 $w.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '));$w.Write([int]16);$w.Write([int16]1);$w.Write([int16]1)
 $w.Write($Rate);$w.Write([int]($Rate*2));$w.Write([int16]2);$w.Write([int16]16)
 $w.Write([Text.Encoding]::ASCII.GetBytes('data'));$w.Write([int]($Samples.Length*2));foreach($s in $Samples){$w.Write([int16]$s)}
 $w.Flush();$bytes=$m.ToArray();$w.Dispose();$m.Dispose();return ,$bytes
}
$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
function Refuses([scriptblock]$Action){$threw=$false;try{& $Action|Out-Null}catch{$threw=$true};Check $threw 'Malformed or reused output was accepted'}
$wav=Wav @(-32768,-24576,-1,0,1,16384,32767)
$file=Join-Path $out 'exact.f32';$r=[StockPcmDecode]::Convert($wav,24000,7,$file)
Check ($r.Frames-eq7-and$r.SampleRate-eq24000-and$r.Channels-eq1) 'Native format not preserved'
Check ($r.PeakInt16-eq32768-and$r.FullScaleSamples-eq2-and$r.RoundTripMaximumInt16Error-eq0) 'Roundtrip or extreme sample metrics differ'
$raw=[IO.File]::ReadAllBytes($file)
Check ([BitConverter]::ToSingle($raw,0)-eq-1-and[BitConverter]::ToSingle($raw,20)-eq.5) 'PCM scale differs'
Refuses {[StockPcmDecode]::Convert($wav,24000,7,$file)}
Refuses {[StockPcmDecode]::Convert($wav,48000,7,(Join-Path $out 'bad-rate.f32'))}
Refuses {[StockPcmDecode]::Convert($wav,24000,8,(Join-Path $out 'bad-count.f32'))}
$stereo=[byte[]]$wav.Clone();$stereo[22]=2
Refuses {[StockPcmDecode]::Convert($stereo,24000,7,(Join-Path $out 'bad-channel.f32'))}
$truncated=[byte[]]$wav[0..($wav.Length-2)]
Refuses {[StockPcmDecode]::Convert($truncated,24000,7,(Join-Path $out 'truncated.f32'))}
$silent=Wav @(0,0,0,0)
Refuses {[StockPcmDecode]::Convert($silent,24000,4,(Join-Path $out 'silent.f32'))}
Write-Output ('PASS: '+$script:checks+' numeric PCM validation/conversion checks; no game or endpoint')
