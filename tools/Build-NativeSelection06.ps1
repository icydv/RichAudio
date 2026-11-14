#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$DlcPath,
 [string]$OutputDirectory='',
 [switch]$AllowDirtyForOfflineBuild
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local/native-suppression-01'))+[IO.Path]::DirectorySeparatorChar
if(!$OutputDirectory){$OutputDirectory=Join-Path $private ('probe-'+[Guid]::NewGuid().ToString('N'))}
$out=[IO.Path]::GetFullPath($OutputDirectory)
$dlc=[IO.Path]::GetFullPath($DlcPath)
foreach($path in @($out,$dlc)){
 if(!$path.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Only task-private inputs and fresh outputs permitted'}
 for($at=$path;$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build path refused'}
 }
}
if((Test-Path -LiteralPath $out)-or!(Test-Path -LiteralPath $dlc -PathType Leaf)){throw 'Fresh output and existing private DLC required'}
$dirty=@(& git -C $repo status --porcelain)
if($LASTEXITCODE){throw 'Git status failed'}
if($dirty.Count-and!$AllowDirtyForOfflineBuild){throw 'Commit verified source before finalizing candidate; dirty build is offline-only'}
$head=(& git -C $repo rev-parse HEAD).Trim()
if($LASTEXITCODE-or$head-notmatch'\A[0-9a-f]{40}\z'){throw 'Commit identity unavailable'}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
$core=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet.asi'
$game='D:\Games\steamapps\common\Grand Theft Auto V Enhanced\GTA5_Enhanced.exe'
function Pin([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
$apiPin='1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'
$gamePin='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'
$corePin='c702e54a7e806acb8bb21de807ff3747e6c24269ce71797aa81e21580d14a08e'
if((Pin $api)-cne$apiPin-or(Pin $core)-cne$corePin-or(Pin $game)-cne$gamePin-or(Get-Item -LiteralPath $game).VersionInfo.FileVersion-cne'1.0.1158.16'){throw 'Reviewed exact game/API/core identity differs'}
$dlcPin=Pin $dlc
[IO.Directory]::CreateDirectory($out)|Out-Null
$binding=Join-Path $out 'Candidate.cs'
$code=@"
namespace RichAudio.NativeSuppression01 {
 internal static class Candidate {
  internal const string SourceCommit = "$head";
  internal const string GamePath = @"$game";
  internal const string GameSha256 = "$gamePin";
  internal const string ApiSha256 = "$apiPin";
  internal const string DlcSha256 = "$dlcPin";
 }
}
"@
[IO.File]::WriteAllText($binding,$code,[Text.UTF8Encoding]::new($false))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('IdleExperiment.cs','IdleNativeApi.cs','IdleProbe.Shvdne.cs')|ForEach-Object{Join-Path $repo ('tools/native-control/native-suppression06/'+$_)}
$sources+=@(Join-Path $repo 'tools/native-control/native-suppression01/IdleDecoratorRegistration.cs')
$binary=Join-Path $out 'RichAudio.NativeSuppression06.dll'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /optimize+ /unsafe+ /warnaserror+ /r:System.Core.dll /r:System.Windows.Forms.dll ('/r:'+$api) ('/out:'+$binary) @sources $binding
if($LASTEXITCODE){throw 'Idle experiment compilation failed'}
[IO.File]::WriteAllText((Join-Path $out 'RichAudio.NativeSuppression06.ini'),"Enabled=false`r`n",[Text.UTF8Encoding]::new($false))
$receipt=[ordered]@{
 schema='RichAudioNativeSelectionBuild06';sourceCommit=$head;sourceClean=(!$dirty.Count);finalCandidate=(!$dirty.Count-and!$AllowDirtyForOfflineBuild)
 game=[ordered]@{path=$game;sha256=$gamePin;version='1.0.1158.16'};api=[ordered]@{path=$api;sha256=$apiPin;version='1.1.0.6'}
 core=[ordered]@{path=$core;sha256=$corePin;assemblyFullName='ScriptHookVDotNet, Version=3.9.0.6, Culture=neutral, PublicKeyToken=8564999cffc18483'}
 dlc=[ordered]@{path=$dlc;sha256=$dlcPin};compiler=[ordered]@{path=$compiler;sha256=(Pin $compiler)}
 binary=[ordered]@{path=$binary;sha256=(Pin $binary);bytes=(Get-Item -LiteralPath $binary).Length}
 sources=@(@($sources)+@($PSCommandPath)|ForEach-Object{[ordered]@{path=[IO.Path]::GetRelativePath($repo,$_).Replace('\','/');sha256=(Pin $_)}})
 defaultEnabled=$false;installed=$false;gameLaunched=$false;inGameSuppressionObserved=$false;recoveryQualified=$false
}
$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $out 'build.json') -Encoding utf8
Write-Output $out
