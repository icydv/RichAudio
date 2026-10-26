[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ObservationPath)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$file=[IO.Path]::GetFullPath($ObservationPath)
$local=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$file.StartsWith($local,[StringComparison]::OrdinalIgnoreCase)){throw 'Private local observation input required'}
for($p=[IO.FileInfo]::new($file);$null-ne$p;){if($p.Exists-and($p.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input rejected'};if($p-is[IO.FileInfo]){$p=$p.Directory}else{$p=$p.Parent}}
if((Get-Item -LiteralPath $file).Length-gt65536){throw 'One-observation file bound'}
& (Join-Path $PSScriptRoot 'Build-GeometryObserver.ps1') -CoreOnly
Add-Type -Path (Join-Path $repo 'build\geometry-observation\RichAudio.Geometry.Core.dll')
$serializer=[Runtime.Serialization.Json.DataContractJsonSerializer]::new([RichAudio.GeometryResearch.GeometryObservation])
$stream=[IO.File]::OpenRead($file);try{$r=$serializer.ReadObject($stream)}finally{$stream.Dispose()}
$v=[RichAudio.GeometryResearch.ObservationRules]::Validate($r)
# Deliberately excludes session IDs, positions, normals and local paths.
[ordered]@{RecordValid=$v.RecordValid;SurfaceValid=$v.SurfaceValid;Reasons=$v.Reasons;TraceCalls=$r.TraceCalls;Completion=$r.Completion;GameVersion=$r.GameVersion;FrameworkVersion=$r.FrameworkVersion;TraceDurationMs=$r.TraceDurationMs;ConversionDurationMs=$r.ConversionDurationMs;OfflineValidationNote='Historical record; no shared live cache clock';NormalLength=$v.NormalLength;NormalOrientation=$v.NormalOrientation;WallLike=$v.WallLike;NonGrazing=$v.NonGrazing;OffSegmentDistance=$v.OffSegmentDistance;PositionTolerance=$v.PositionTolerance;EntityStatus=$r.EntityStatus;TargetIdentity=$v.TargetIdentity;ExtentKnown=$false;AcousticMaterialKnown=$false}|ConvertTo-Json -Depth 4
if(!$v.SurfaceValid){exit 2}
