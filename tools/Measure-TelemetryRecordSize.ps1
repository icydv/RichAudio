#requires -Version 7.0
# Serializes owned mock data only. Projections, not physical-disk or game measurements.
[CmdletBinding()]
param([string]$FixturePath='.local\phase2.1-tests\paced.jsonl')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(![IO.Path]::IsPathRooted($FixturePath)){$FixturePath=Join-Path $repo $FixturePath}
[Reflection.Assembly]::LoadFrom((Join-Path $repo 'build\telemetry\RichAudio.Telemetry.Core.dll')) | Out-Null
$sample=Get-Content -LiteralPath $FixturePath | Where-Object {$_ -match '"Kind":"sample"'} | Select-Object -Last 1
if(!$sample){throw 'No authored paced sample found; run the offline test executable first.'}
$rows=foreach($n in @(1,8,16,32)){
    $r=[RichAudio.Telemetry.JsonLines]::Parse($sample)
    if($r.Vehicles.Count -lt $n){throw 'Mock sample lacks requested sources.'}
    $r.Vehicles.RemoveRange($n,$r.Vehicles.Count-$n)
    $bytes=[Text.Encoding]::UTF8.GetByteCount([RichAudio.Telemetry.JsonLines]::Serialize($r))+2
    [pscustomobject]@{Sources=$n;BytesPerSyntheticRecord=$bytes;ProjectedBytesPerSecondAt20Hz=$bytes*20;ProjectedMiBPerMinuteAt20Hz=[Math]::Round($bytes*20*60/1MB,2)}
}
$output=Join-Path $repo 'evidence\phase2.1'
for($d=[IO.DirectoryInfo]::new($output);$null -ne $d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point report path.'}}
[IO.Directory]::CreateDirectory($output) | Out-Null
[ordered]@{Scope='One authored 32-source paced mock record trimmed and serialized by the existing production serializer. Arithmetic projections, not GTA or physical disk throughput measurements; real sizes vary.';Rows=@($rows)} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $output 'logging-size-projection.json') -Encoding utf8
$rows
