# Offline only. No game launch, archive writes, tool installation or key export.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,[Parameter(Mandatory=$true)][string]$CodeWalkerRoot,[string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$privateRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local\audio-reconstruction'))
if(!$OutputDirectory){$OutputDirectory=Join-Path $privateRoot ('decoded-'+[guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputDirectory)
if(!$output.StartsWith($privateRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output must be below private .local/audio-reconstruction.'}
if(Test-Path -LiteralPath $output){throw 'Existing output rejected.'}
$build=Join-Path $repo 'build\audio'
[IO.Directory]::CreateDirectory($build)|Out-Null
$exe=Join-Path $build 'ExtractBati.exe'
& (Join-Path $PSScriptRoot 'Build-OfflineAudio.ps1')
& $exe ([IO.Path]::GetFullPath($GameRoot)) ([IO.Path]::GetFullPath($CodeWalkerRoot)) $output
if($LASTEXITCODE -ne 0){throw 'Extraction failed; inspect private journal.'}
& node (Join-Path $PSScriptRoot 'Prepare-BatiSources.mjs') $output
if($LASTEXITCODE -ne 0){throw 'Private waveform validation failed.'}
Write-Output ('Private manifest: '+(Join-Path $output 'source-manifest.json'))
