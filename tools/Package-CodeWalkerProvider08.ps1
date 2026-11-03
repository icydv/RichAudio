#requires -Version 7.0
# Automatic companion package. Writes only fresh checkout build/.local output;
# no deployment, GUI startup, installed-resource discovery or key acquisition.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputRoot,[string]$BuildRoot,[string]$PublicPreparationRoot,[string]$SupervisorBuildRoot,[string]$CompilerPath,[string]$NodePath,[switch]$UseExistingRichAudioNode,[string]$ControlEntry='tools/Prepare-CodeWalkerWorld08.mjs')
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Checked([string]$p,[bool]$fresh=$false){$p=[IO.Path]::GetFullPath($p);$ok=@('.local','build')|Where-Object{$p.StartsWith([IO.Path]::GetFullPath((Join-Path $repo $_))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)};if(!$ok){throw 'Only checkout-local build/package paths are accepted'};for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked package/input refused'}};if($fresh-and(Test-Path -LiteralPath $p)){throw 'Fresh package destination required'};$p}
function WriteNew([string]$p,[string]$text){$s=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=[Text.UTF8Encoding]::new($false).GetBytes($text);$s.Write($b,0,$b.Length)}finally{$s.Dispose()}}
$output=Checked $OutputRoot $true
if(!$BuildRoot){$BuildRoot=Join-Path $repo ('.local/world08-provider-build-'+[guid]::NewGuid().ToString('N'));& (Join-Path $PSScriptRoot 'Build-CodeWalkerProvider08.ps1') -OutputRoot $BuildRoot -PublicPreparationRoot $PublicPreparationRoot -CompilerPath $CompilerPath;if(!$?){throw 'Provider build failed'}}
$build=Checked $BuildRoot;$binding=Get-Content -LiteralPath (Join-Path $build 'provider-build08.json') -Raw|ConvertFrom-Json
if(!$binding.passed-or$binding.kind-cne'RichAudioCodeWalkerProviderBuild08'-or$binding.coreOnly-or$binding.protectedBootstrapAvailable-or$binding.proprietaryPayloadIncluded-or$binding.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'){throw 'Complete source-qualified no-proprietary-data provider build required'}
foreach($s in $binding.workerSources){if((Hash (Join-Path $repo $s.file))-cne$s.sha256){throw 'Worker source differs from built package'}}
if(!$SupervisorBuildRoot){$SupervisorBuildRoot=Join-Path $repo ('.local/world08-supervisor-build-'+[guid]::NewGuid().ToString('N'));& (Join-Path $PSScriptRoot 'Build-ProviderSupervisor08.ps1') -OutputRoot $SupervisorBuildRoot -CompilerPath $CompilerPath;if(!$?){throw 'Supervisor build failed'}}
$supervisor=Checked $SupervisorBuildRoot;$supervision=Get-Content -LiteralPath (Join-Path $supervisor 'supervisor-build08.json') -Raw|ConvertFrom-Json
if($supervision.kind-cne'RichAudioProviderSupervisorBuild08'-or(Hash (Join-Path $supervisor 'provider-supervisor08.exe'))-cne$supervision.exeSHA256-or(Hash (Join-Path $PSScriptRoot 'world08-contained-process.cs'))-cne$supervision.sourceSHA256){throw 'Supervisor source/executable binding required'}
[IO.Directory]::CreateDirectory($output)|Out-Null;$package=Join-Path $output 'WorldProvider08';[IO.Directory]::CreateDirectory($package)|Out-Null
$entries=@()
function Include([string]$src,[string]$relative,[string]$role,[string]$expected=''){
 $src=[IO.Path]::GetFullPath($src);for($at=$src;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked package source refused'}}
 if($relative-match'(^/|\\|:|(^|/)\.\.(/|$))'){throw 'Unsafe package name'}
 $before=Hash $src;if($expected-and$before-cne$expected){throw 'Package source digest differs'}
 $dest=Join-Path $package $relative;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
 $input=[IO.File]::Open($src,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$out=[IO.File]::Open($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$input.CopyTo($out)}finally{$input.Dispose();$out.Dispose()}
 if((Hash $dest)-cne$before-or(Hash $src)-cne$before){throw 'Package source changed during copy'}
 $script:entries+=@{path=$relative;sha256=$before;bytes=(Get-Item -LiteralPath $dest).Length;role=$role}
}
function Generated([string]$relative,[string]$text,[string]$role){$dest=Join-Path $package $relative;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;WriteNew $dest $text;$script:entries+=@{path=$relative;sha256=Hash $dest;bytes=(Get-Item -LiteralPath $dest).Length;role=$role}}
Include (Join-Path $build 'core/provider-worker08.exe') 'provider-worker08.exe' 'worker' $binding.workerExeSHA256
Include (Join-Path $build 'core/CodeWalker.Core.dll') 'CodeWalker.Core.dll' 'core' $binding.coreSHA256
foreach($d in $binding.dependencies){Include (Join-Path $build ('core/'+$d.file)) $d.file 'dependency' $d.sha256}
Include (Join-Path $supervisor 'provider-supervisor08.exe') 'provider-supervisor08.exe' 'supervisor' $supervision.exeSHA256
Include (Join-Path $build 'provider-build08.json') 'provider-build08.json' 'receipt'
Include (Join-Path $supervisor 'supervisor-build08.json') 'supervisor-build08.json' 'receipt'
foreach($name in @('CodeWalker.Notice.txt','CodeWalker.Readme_Src.txt')){Include (Join-Path $build ('notices/'+$name)) ('notices/'+$name) 'notice'}
foreach($name in @('README.md','SharpDX.LICENSE','FbxWriter.GPL.LICENSE','FbxWriter.LGPL.LICENSE')){Include (Join-Path $repo ('third_party/codewalker08/'+$name)) ('notices/'+$name) 'notice'}
Include (Join-Path $repo 'config/world08/codewalker-dependency08.json') 'codewalker-dependency08.json' 'notice'
foreach($s in $binding.sourcePins){Include (Join-Path $build ('adapted-source/'+$s.file)) ('source/'+$s.file) 'source' $s.compiledSHA256}
foreach($s in $binding.workerSources){Include (Join-Path $repo $s.file) ('source/RichAudio/'+$s.file) 'source' $s.sha256}
foreach($p in @('tools/Build-CodeWalkerProvider08.ps1','tools/Package-CodeWalkerProvider08.ps1','tools/Prepare-CodeWalkerPublicProfile03.ps1','tools/Build-CodeWalkerProfile03.ps1','tools/Build-ProviderSupervisor08.ps1','tools/world08-contained-process.cs','config/world08/codewalker-dependency08.json')){Include (Join-Path $repo $p) ('source/RichAudio/'+$p) 'source'}
foreach($name in @('README.md','SharpDX.LICENSE','FbxWriter.GPL.LICENSE','FbxWriter.LGPL.LICENSE')){Include (Join-Path $repo ('third_party/codewalker08/'+$name)) ('source/RichAudio/third_party/codewalker08/'+$name) 'source'}
# Keep the repository-relative control/module layout: its existing imports and
# runtime source-binding checks then work after extraction, without checkout IO.
foreach($f in @(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.mjs'|Sort-Object FullName)){$p=[IO.Path]::GetRelativePath($repo,$f.FullName).Replace('\','/');Include $f.FullName $p 'control-module'}
foreach($f in @(Get-ChildItem -LiteralPath (Join-Path $repo 'tools/soundmap') -Recurse -File|Where-Object{$_.Extension-in@('.mjs','.js','.html','.css','.svg','.png')}|Sort-Object FullName)){$p=[IO.Path]::GetRelativePath($repo,$f.FullName).Replace('\','/');Include $f.FullName $p 'control-ui'}
foreach($s in $binding.workerSources){Include (Join-Path $repo $s.file) $s.file 'runtime-source-binding' $s.sha256}
Include (Join-Path $PSScriptRoot 'world08-contained-process.cs') 'tools/world08-contained-process.cs' 'runtime-source-binding' $supervision.sourceSHA256
Include (Join-Path $PSScriptRoot 'prelaunch08.mjs') 'tools/prelaunch08.mjs' 'control-ui'
if($ControlEntry){if($ControlEntry-match'(^/|\\|:|(^|/)\.\.(/|$))'-or!$ControlEntry.StartsWith('tools/')-or!$ControlEntry.EndsWith('08.mjs')){throw 'Literal tools/*08.mjs control entry required'};Include (Join-Path $repo $ControlEntry) $ControlEntry 'prelaunch-entry'}
$node=[ordered]@{mode='existing-packaged-RichAudio-Node-required';bundled=$false;relativePath=$null;version=$null;sha256=$null;officialChecksumsUrl=$null;officialChecksumMatched=$false}
if(!$UseExistingRichAudioNode){
 if(!$NodePath){$NodePath=Get-Command node -CommandType Application|Select-Object -First 1 -ExpandProperty Source}
 $nodeSource=[IO.Path]::GetFullPath($NodePath)
 # Lexical refusal happens before opening the selected runtime. No installation
 # search or reading of GTA executables is part of packaging.
 if([IO.Path]::GetFileName($nodeSource)-cne'node.exe'-or$nodeSource-match'(?i)(Grand Theft Auto|[\\/]GTA5(?:_|[\\/.])|[\\/]steamapps[\\/]common[\\/])'){throw 'Node runtime must be an explicit existing node.exe outside game directories'}
 for($at=$nodeSource;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked Node runtime refused'}}
 if((Get-Item -LiteralPath $nodeSource).Length-gt134217728){throw 'Bounded Node runtime required'}
 $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($nodeSource).ProductVersion.TrimStart('v')
 if($version-cnotmatch'^[0-9]{1,2}\.[0-9]{1,3}\.[0-9]{1,3}$'){throw 'Exact release Node version metadata required'}
 $version='v'+$version;$checksumsUrl='https://nodejs.org/dist/'+$version+'/SHASUMS256.txt'
 $response=Invoke-WebRequest -Uri $checksumsUrl;$checksums=if($response.Content-is[byte[]]){[Text.Encoding]::UTF8.GetString($response.Content)}else{[string]$response.Content}
 if([Text.Encoding]::UTF8.GetByteCount($checksums)-gt65536){throw 'Bounded official Node checksum file required'}
 $match=@([regex]::Matches($checksums,'(?m)^([a-f0-9]{64})\s+win-x64/node.exe\r?$'))
 if($match.Count-ne1-or(Hash $nodeSource)-cne$match[0].Groups[1].Value){throw 'Node executable differs from exact official release checksum'}
 $licenseUrl='https://raw.githubusercontent.com/nodejs/node/'+$version+'/LICENSE';$response=Invoke-WebRequest -Uri $licenseUrl;$license=if($response.Content-is[byte[]]){[Text.Encoding]::UTF8.GetString($response.Content)}else{[string]$response.Content}
 if([Text.Encoding]::UTF8.GetByteCount($license)-gt262144-or!$license.Contains('Node.js')){throw 'Bounded original Node licence required'}
 Include $nodeSource 'runtime/node.exe' 'node-runtime' $match[0].Groups[1].Value
 Generated ('notices/Node-'+$version+'.LICENSE') $license 'notice'
 Generated ('notices/Node-'+$version+'.SHASUMS256.txt') $checksums 'notice'
 $node=[ordered]@{mode='bundled-current-official-Node-win-x64';bundled=$true;relativePath='runtime/node.exe';version=$version;sha256=$match[0].Groups[1].Value;officialChecksumsUrl=$checksumsUrl;officialChecksumMatched=$true;licenseUrl=$licenseUrl}
}
if($ControlEntry-and$node.bundled){Generated 'Start-Preparation08.cmd' ('@echo off'+"`r`n"+'"%~dp0runtime\node.exe" "%~dp0'+$ControlEntry.Replace('/','\')+'" %*'+"`r`n") 'prelaunch-launcher'}
if($entries.Count-gt1024){throw 'Bounded complete companion package file closure'}
$manifest=[ordered]@{schema=1;kind='RichAudioCodeWalkerProviderPackage08';passed=$true;parserSHA256=$binding.coreSHA256;workerExeSHA256=$binding.workerExeSHA256;buildSHA256=Hash (Join-Path $build 'provider-build08.json');supervisorBuildSHA256=Hash (Join-Path $supervisor 'supervisor-build08.json');protectedBootstrapAvailable=$false;proprietaryPayloadIncluded=$false;sourceCommit=$binding.sourceCommit;nodeRuntime=$node;controlEntry=$ControlEntry;files=$entries;installationRelativeDestination='Plugins/RichAudio/WorldProvider08';deploymentPerformed=$false;gameLaunched=$false;endpointOpened=$false;installedEnhancedCompatibilityVerified=$false}
WriteNew (Join-Path $package 'provider-package08.json') (($manifest|ConvertTo-Json -Depth 12)+"`n")
$zipPath=Join-Path $output 'WorldProvider08.zip';$stream=[IO.File]::Open($zipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try{foreach($p in @($entries.path)+@('provider-package08.json')|Sort-Object){$entry=$zip.CreateEntry('WorldProvider08/'+$p,[IO.Compression.CompressionLevel]::Optimal);$entry.LastWriteTime=[DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero);$input=[IO.File]::OpenRead((Join-Path $package $p));$out=$entry.Open();try{$input.CopyTo($out)}finally{$input.Dispose();$out.Dispose()}}}finally{$zip.Dispose();$stream.Dispose()}
WriteNew (Join-Path $output 'package-result08.json') (([ordered]@{schema=1;kind='RichAudioCodeWalkerProviderPackageResult08';passed=$true;manifestSHA256=Hash (Join-Path $package 'provider-package08.json');zipSHA256=Hash $zipPath;zipBytes=(Get-Item -LiteralPath $zipPath).Length;files=$entries.Count;workerRuntimeFiles=4;correspondingSourceIncluded=$true;protectedBootstrapAvailable=$false;deploymentPerformed=$false;installedResourcesRead=$false}|ConvertTo-Json -Depth 5)+"`n")
Write-Output ('PASS integrated headless Core package08; files '+$entries.Count+'; bootstrap unavailable; ZIP SHA256 '+(Hash $zipPath))
