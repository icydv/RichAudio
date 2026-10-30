# Candidate configuration only. Never installs/launches the plugin or changes game files.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
 [string]$PowerShellPath=(Get-Process -Id $PID).Path,
 [string]$OutputPath='',
 [string]$CacheRoot='',
 [ValidateRange(20,3600)][int]$MaximumSeconds=900,
 [ValidateRange(5,900)][int]$MaximumStageSeconds=300,
 [ValidateRange(256,4096)][int]$MaximumMemoryMiB=3072,
 [ValidateRange(1,128)][int]$MaximumGeometryResources=16,
 [bool]$Enabled=$true,
 [switch]$PlanOnly)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\')
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\');$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
if(!$OutputPath){$OutputPath=Join-Path $repo 'build\acoustics07\transport\RichAudio.WorldWarmup.json'}
if(!$CacheRoot){$CacheRoot=Join-Path $repo '.local\plugin-world-warmup'}
$output=[IO.Path]::GetFullPath($OutputPath);$cache=[IO.Path]::GetFullPath($CacheRoot)
if(!($output.StartsWith((Join-Path $repo '.local\'),[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith((Join-Path $repo 'build\'),[StringComparison]::OrdinalIgnoreCase))){throw 'Private workspace build/.local sidecar required'}
if(!$cache.StartsWith((Join-Path $repo '.local\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Private workspace .local cache required'}
foreach($target in @($output,$cache)){
 if($target -eq $game -or $target.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Game output forbidden'}
 for($part=$target;$part;$part=Split-Path $part -Parent){if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate path unsupported'}}
}
if(Test-Path -LiteralPath $output){throw 'Fresh candidate sidecar required; preserve earlier configuration'}
function Digest([string]$File){$stream=[IO.File]::OpenRead($File);$sha=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose();$stream.Dispose()}}
if([IO.Path]::GetFileName($PowerShellPath) -ne 'pwsh.exe'){throw 'Installed PowerShell7 host required'}
$sources=@('tools\Prepare-InstalledAudioWorld.ps1','tools\Build-InstalledAcousticCatalog.ps1','tools\Resolve-InstalledGameCache.ps1','tools\Export-InstalledCollision.ps1','tools\Prepare-InstalledCollisionWorld.ps1')|ForEach-Object{Join-Path $repo $_}
foreach($area in @('startup','world','integration')){$sources+=@(Get-ChildItem -LiteralPath (Join-Path $repo ('src\acoustics\'+$area)) -File -Recurse|ForEach-Object FullName)}
$bindings=@($sources|Sort-Object -Unique|ForEach-Object{[ordered]@{RelativePath=$_.Substring($repo.Length+1).Replace('\','/');SHA256=Digest $_}})
$config=[ordered]@{Schema=1;Enabled=$Enabled;WorkspaceRoot=$repo;GameRoot=$game;GameExecutableSHA256=Digest (Join-Path $game 'GTA5_Enhanced.exe');CodeWalkerRoot=$cw;CodeWalkerCoreSHA256=Digest (Join-Path $cw 'CodeWalker.Core.dll');PowerShellPath=[IO.Path]::GetFullPath($PowerShellPath);PowerShellSHA256=Digest $PowerShellPath;OutputRoot=$cache;Sources=$bindings;MaximumSeconds=$MaximumSeconds;MaximumStageSeconds=$MaximumStageSeconds;MaximumMemoryMiB=$MaximumMemoryMiB;MaximumGeometryResources=$MaximumGeometryResources;ImportQualifiedGeometry=(!$PlanOnly)}
$text=$config|ConvertTo-Json -Depth 8
if([Text.Encoding]::UTF8.GetByteCount($text) -gt 65536){throw 'Sidecar bound exceeded'}
[IO.Directory]::CreateDirectory((Split-Path $output -Parent))|Out-Null
[IO.File]::WriteAllText($output,$text,[Text.UTF8Encoding]::new($false))
[pscustomobject]@{Sidecar=$output;SHA256=Digest $output;Enabled=$Enabled;ImportQualifiedGeometry=(!$PlanOnly);SourceBindings=$bindings.Count;GameWrites=$false;RuntimeReplacementEnabled=$false;ReadyForGameLaunch=$false}
