# Explicit development dependency preparation: public pinned source and two
# hash-pinned public NuGet DLLs only. No installation discovery or GTA assets.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot,[string]$CompilerPath)
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent;$root=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))
if(!$root.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $root)){throw 'Fresh private world-03 public-dependency directory required'}
for($at=$root;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked dependency directory refused'}}
[IO.Directory]::CreateDirectory($root)|Out-Null;$source=Join-Path $root 'source';$dependencies=Join-Path $root 'dependencies';$profile=Join-Path $root 'profile'
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
git init $source *> (Join-Path $root 'source-fetch.log');if($LASTEXITCODE-ne0){throw 'Public source repository creation failed'}
git -C $source remote add origin https://github.com/dexyfex/CodeWalker.git;if($LASTEXITCODE-ne0){throw 'Public source remote setup failed'}
git -C $source fetch --depth=1 origin 485d56bec00262ed7fa472261cce7bbc6202b96e *>> (Join-Path $root 'source-fetch.log');if($LASTEXITCODE-ne0){throw 'Pinned public source fetch failed; no retry'}
git -C $source checkout --detach FETCH_HEAD *>> (Join-Path $root 'source-fetch.log');if($LASTEXITCODE-ne0){throw 'Pinned public source checkout failed'}
[IO.Directory]::CreateDirectory($dependencies)|Out-Null
$packages=@(@{id='sharpdx';file='SharpDX.dll';sha256='a0af255ea4b09a8cdb995b8c6fd1075e46f098e23c2351c974e6ded9b8b620cf'},@{id='sharpdx.mathematics';file='SharpDX.Mathematics.dll';sha256='4c9615496970ea84320e2a6e99f8fb828e3c7790384df5585d93fc368885d94e'})
$receipts=@(foreach($package in $packages){
 $url='https://api.nuget.org/v3-flatcontainer/'+$package.id+'/4.2.0/'+$package.id+'.4.2.0.nupkg';$archive=Join-Path $dependencies ($package.id+'.4.2.0.nupkg')
 Invoke-WebRequest -Uri $url -OutFile $archive
 $zip=[IO.Compression.ZipFile]::OpenRead($archive);try{$entry=$zip.GetEntry('lib/net45/'+$package.file);if(!$entry-or$entry.Length-gt1048576){throw 'Bounded exact NuGet library entry required'}
  $input=$entry.Open();$output=[IO.File]::Open((Join-Path $dependencies $package.file),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$input.CopyTo($output)}finally{$input.Dispose();$output.Dispose()}
 }finally{$zip.Dispose()}
 if((Hash (Join-Path $dependencies $package.file))-cne$package.sha256){throw 'Downloaded library digest differs; nothing executed'}
 @{package=$package.id;version='4.2.0';sourceUrl=$url;archiveSha256=Hash $archive;file=$package.file;sha256=$package.sha256}
})
& (Join-Path $repo 'tools/Build-CodeWalkerProfile03.ps1') -SourceRoot $source -SharpDxRoot $dependencies -OutputRoot $profile -CompilerPath $CompilerPath
if(!$?){throw 'Pinned public parser build failed'}
[ordered]@{schema=1;passed=$true;kind='public-CodeWalker-preparation03';sourceCommit='485d56bec00262ed7fa472261cce7bbc6202b96e';dependencies=$receipts;profileSha256=Hash (Join-Path $profile 'profile.json');parserSha256=Hash (Join-Path $profile 'CodeWalker.Core.dll');gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $root 'preparation.json') -Encoding utf8NoBOM
Write-Output ('PASS pinned public parser/dependencies prepared at '+$profile)
