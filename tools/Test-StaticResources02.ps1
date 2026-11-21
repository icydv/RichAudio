# Run in Windows PowerShell5.1. Original in-memory resource fixtures only.
[CmdletBinding()]param([Parameter(Mandatory=$true)][string]$CodeWalkerRoot,[Parameter(Mandatory=$true)][string]$OutputRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition-eq'Core'){throw 'Use Windows PowerShell5.1 for the existing trusted parser.'}
$repo=Split-Path $PSScriptRoot -Parent;$output=[IO.Path]::GetFullPath($OutputRoot);$private=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-02'))
if(!$output.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private world-02 fixture output required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture directory refused.'}}
$source=@('src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs','tools/Test-StaticResources02.ps1','tests/Check-StaticResources02.mjs',
 'src/acoustics/world/resource-scene02.mjs','src/acoustics/world/collision-mesh.mjs','src/acoustics/world/placements.mjs','src/acoustics/world/contracts.mjs','src/acoustics/engine/contracts.mjs','src/acoustics/research/local-geometry.mjs')
$pins=@($source|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$parserPins=@('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll')|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $CodeWalkerRoot $_)).Hash.ToLowerInvariant()}}
if(($parserPins|Where-Object{$_.file-eq'CodeWalker.Core.dll'}).sha256-cne'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Reviewed parser identity differs.'}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $CodeWalkerRoot $name)))|Out-Null}
$runtime=[Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory();$facade=Join-Path $runtime 'Facades/netstandard.dll';if(!(Test-Path -LiteralPath $facade)){$facade=Join-Path $runtime 'netstandard.dll'}
$references=@((Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll'),(Join-Path $CodeWalkerRoot 'SharpDX.dll'),(Join-Path $CodeWalkerRoot 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll',$facade)
Add-Type -Path @((Join-Path $repo $source[0]),(Join-Path $repo $source[1])) -ReferencedAssemblies $references
[IO.Directory]::CreateDirectory($output)|Out-Null
$json=[RichAudio.World.CodeWalkerStaticResourceAdapter02]::OriginalRoundTrips();$result=$json|ConvertFrom-Json
foreach($item in $result.resources){$bytes=[Convert]::FromBase64String($item.base64);$file=Join-Path $output ('original.'+$item.kind);[IO.File]::WriteAllBytes($file,$bytes);if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()-cne$item.sha256){throw 'Original fixture digest differs.'};$item.PSObject.Properties.Remove('base64')}
[ordered]@{schema=1;passed=$true;result=$result;gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $output 'decoded-receipt.json') -Encoding utf8
$node=(Get-Command node).Source;$nodeHash=(Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant();$nodeVersion=(& $node --version)
& $node (Join-Path $repo 'tests/Check-StaticResources02.mjs') (Join-Path $output 'decoded-receipt.json')
if($LASTEXITCODE-ne0){throw 'Independent original binary placement/finite-support checks failed.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Adapter source drift.'}}
foreach($pin in $parserPins){if((Get-FileHash -LiteralPath (Join-Path $CodeWalkerRoot $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Parser drift.'}}
if((Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant()-cne$nodeHash){throw 'Executed Node changed.'}
[ordered]@{schema=1;passed=$true;sources=$pins;parser=$parserPins;node=@{version=$nodeVersion;sha256=$nodeHash};result=$result;independentCheckSha256=(Get-FileHash -LiteralPath (Join-Path $output 'independent-placement-check.json')).Hash.ToLowerInvariant();gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('PASS original binary YMAP/YTYP/YBN roundtrips: '+(Join-Path $output 'validation.json'))
