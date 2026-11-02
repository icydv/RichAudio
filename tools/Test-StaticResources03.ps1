# Windows PowerShell5.1; one explicit private parser profile, original bytes only.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ProfileRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop';if($PSVersionTable.PSEdition-eq'Core'){throw 'Use Windows PowerShell5.1 for the explicit parser fixture process'}
$repo=Split-Path $PSScriptRoot -Parent;$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))
if(!$output.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private world-03 fixture output required'}
foreach($path in @($output,[IO.Path]::GetFullPath($ProfileRoot))){for($at=$path;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked profile/output refused'}}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$profilePath=Join-Path $ProfileRoot 'profile.json';$profileHash=Hash $profilePath;$profile=Get-Content -LiteralPath $profilePath -Raw|ConvertFrom-Json
if(!$profile.passed-or$profile.kind-cne'CodeWalker-public-source-private-profile03'-or$profile.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or(Hash (Join-Path $ProfileRoot 'CodeWalker.Core.dll'))-cne$profile.parserSha256){throw 'Exact separate pinned-source profile required'}
foreach($dependency in $profile.dependencies){if((Hash (Join-Path $ProfileRoot $dependency.file))-cne$dependency.sha256){throw 'Parser dependency drift'}}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $ProfileRoot $name)))|Out-Null}
$references=@((Join-Path $ProfileRoot 'CodeWalker.Core.dll'),(Join-Path $ProfileRoot 'SharpDX.dll'),(Join-Path $ProfileRoot 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll','System.IO.Compression.dll')
$sources=@('src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs')
$pins=@($sources|ForEach-Object{@{file=$_;sha256=Hash (Join-Path $repo $_)}})
Add-Type -Path @($sources|ForEach-Object{Join-Path $repo $_}) -ReferencedAssemblies $references
[IO.Directory]::CreateDirectory($output)|Out-Null
$result=[RichAudio.World.CodeWalkerResourceBoundary03]::OriginalBuildingResources($profile.parserSha256)|ConvertFrom-Json
foreach($group in $result.groups){$dir=Join-Path $output $group.profile;[IO.Directory]::CreateDirectory($dir)|Out-Null;foreach($item in $group.resources){$bytes=[Convert]::FromBase64String($item.base64);[IO.File]::WriteAllBytes((Join-Path $dir ('original.'+$item.kind)),$bytes);$item.PSObject.Properties.Remove('base64')}}
$receipt=[ordered]@{schema=1;passed=$true;result=$result;profileSha256=$profileHash;parserSha256=$profile.parserSha256;sources=$pins;gameFilesRead=$false;endpointOpened=$false;installedEnhancedVerified=$false}
$receipt|ConvertTo-Json -Depth 48|Set-Content -LiteralPath (Join-Path $output 'decoded-receipt.json') -Encoding utf8
$node=(Get-Command node).Source;$nodeHash=Hash $node
& $node (Join-Path $repo 'tests/Check-StaticResources03.mjs') (Join-Path $output 'decoded-receipt.json')
if($LASTEXITCODE-ne0){throw 'Independent actual-format scene/tile checks failed'}
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256){throw 'Adapter source drift'}}
if((Hash $profilePath)-cne$profileHash-or(Hash (Join-Path $ProfileRoot 'CodeWalker.Core.dll'))-cne$profile.parserSha256-or(Hash $node)-cne$nodeHash){throw 'Executed parser/profile/Node drift'}
$receipt.independentResultSha256=Hash (Join-Path $output 'independent-import-check.json');$receipt.nodeSha256=$nodeHash
$receipt|ConvertTo-Json -Depth 48|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('PASS bounded actual-format original building resources; '+(Join-Path $output 'validation.json'))
