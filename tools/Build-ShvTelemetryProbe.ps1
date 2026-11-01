#requires -Version 7.0
[CmdletBinding()]
param(
 [string]$GameRoot='D:\Games\steamapps\common\Grand Theft Auto V Enhanced',
 [string]$BuildToolsRoot='',
 [string]$OutputRoot='',
 [string]$PublicEvidencePath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Inspect-ShvProbe.ps1')
if(!$OutputRoot){$OutputRoot=Join-Path $repo 'build/playable-07-shv-probe'}
$output=Assert-ShvBuildOutputPath $OutputRoot $repo $GameRoot
$probeProfile='playable-07'
foreach($name in @('build/playable-04-shv-probe','build/playable-06-shv-probe','.local/playable-04','.local/playable-05','.local/playable-06')){
 $preservedRoot=[IO.Path]::GetFullPath((Join-Path $repo $name)).TrimEnd('\','/')
 if($output.Equals($preservedRoot,[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($preservedRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'PLAYABLE-04/06 build artifacts and receipts are preserved; choose the PLAYABLE-07 output directory.'}
}
if(!$PublicEvidencePath){$PublicEvidencePath=Join-Path $repo 'evidence/playable-07-build.json'}
$publicTarget=[IO.Path]::GetFullPath($PublicEvidencePath);$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo 'evidence'))
if(![IO.Path]::GetDirectoryName($publicTarget).Equals($evidenceRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($publicTarget) -notmatch '^playable-07-build(?:[-.][A-Za-z0-9_-]+)?\.json$'){throw 'Public build evidence must be a new playable-07-build JSON directly under this repository evidence directory.'}
for($cursor=$publicTarget;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Public evidence output through a reparse point is not permitted.'}}
$sourceRoot=Join-Path $repo 'src/telemetry/ShvProbe'
$sources=@('Probe.cpp','ScriptHookVApi.h','NativeIds.h')
foreach($name in $sources){if(!(Test-Path -LiteralPath (Join-Path $sourceRoot $name))){throw ('Probe source is not ready: '+$name)}}
if(!$BuildToolsRoot){
 $candidates=@('C:\VSBuildTools','C:\Program Files (x86)\Microsoft Visual Studio\2022\RichAudioBuildTools','C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools','C:\Program Files\Microsoft Visual Studio\2022\BuildTools')
 $BuildToolsRoot=@($candidates | Where-Object {Test-Path -LiteralPath (Join-Path $_ 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt')} | Select-Object -First 1)[0]
}
if(!$BuildToolsRoot){throw 'The authorised Microsoft x64 C++ Build Tools installation is not ready; this tool does not install software.'}
$versionFile=Join-Path $BuildToolsRoot 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt'
$vcVersion=([IO.File]::ReadAllText($versionFile)).Trim()
if($vcVersion -notmatch '^14\.\d+\.\d+$'){throw 'Unexpected MSVC toolset version.'}
$vcRoot=Join-Path $BuildToolsRoot ('VC/Tools/MSVC/'+$vcVersion)
$compiler=Join-Path $vcRoot 'bin/Hostx64/x64/cl.exe';$linker=Join-Path $vcRoot 'bin/Hostx64/x64/link.exe';$librarian=Join-Path $vcRoot 'bin/Hostx64/x64/lib.exe'
$sdkRoot='C:\Program Files (x86)\Windows Kits\10'
foreach($key in @('HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots')){
 if(Test-Path -LiteralPath $key){$root=(Get-ItemProperty -LiteralPath $key -Name KitsRoot10 -ErrorAction SilentlyContinue).KitsRoot10;if($root){$sdkRoot=$root;break}}
}
$sdkVersion=@(Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory | Where-Object {$_.Name -match '^10\.0\.26100\.\d+$'} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1 -ExpandProperty Name)[0]
if(!$sdkVersion){throw 'The authorised Windows 11 SDK 26100 headers are not ready.'}
$includeDirs=@((Join-Path $vcRoot 'include'),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/ucrt')),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/shared')),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/um')))
$libraryDirs=@((Join-Path $vcRoot 'lib/x64'),(Join-Path $sdkRoot ('Lib/'+$sdkVersion+'/ucrt/x64')),(Join-Path $sdkRoot ('Lib/'+$sdkVersion+'/um/x64')))
foreach($directory in @($includeDirs)+@($libraryDirs)){if(!(Test-Path -LiteralPath $directory -PathType Container)){throw 'Microsoft compiler/SDK include or library directory is missing.'}}
foreach($path in @($compiler,$linker,$librarian,(Join-Path $includeDirs[3] 'Windows.h'),(Join-Path $libraryDirs[2] 'kernel32.lib'),(Join-Path $libraryDirs[2] 'user32.lib'))){if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Required Microsoft compiler, SDK header or import library is missing.'}}

function File-Record([string]$Path){$item=Get-Item -LiteralPath $Path;[ordered]@{Name=$item.Name;Bytes=$item.Length;Sha256=(Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant();FileVersion=$item.VersionInfo.FileVersion}}
function Tool-Record([string]$Path){
 $record=File-Record $Path;$signature=Get-AuthenticodeSignature -LiteralPath $Path
 if($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'Compiler/linker/librarian must have a valid Microsoft Authenticode signature.'}
 $record.AuthenticodeStatus=$signature.Status.ToString();$record.Signer=$signature.SignerCertificate.Subject;return $record
}
function Portable-InputName([string]$Path){
 $full=[IO.Path]::GetFullPath($Path)
 foreach($root in @([ordered]@{Path=$vcRoot;Prefix='msvc/'+$vcVersion},[ordered]@{Path=$sdkRoot;Prefix='windows-sdk'},[ordered]@{Path=$repo;Prefix='repo'})){
  $prefix=[IO.Path]::GetFullPath($root.Path).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
  if($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){return $root.Prefix+'/'+$full.Substring($prefix.Length).Replace('\','/')}
 }
 throw 'Compiler included or linked an input outside reviewed project/MSVC/SDK roots.'
}
function Invoke-BuildTool([string]$Executable,[string[]]$Arguments,[string]$Log){
 $lines=@(& $Executable @Arguments 2>&1 | ForEach-Object {$_.ToString()});$code=$LASTEXITCODE
 $lines | Set-Content -LiteralPath $Log -Encoding utf8
 if($code -ne 0){throw ('Native build step failed with exit '+$code+': '+($lines | Select-Object -Last 18 | Out-String))}
 return [ordered]@{ExitCode=$code;Log=$Log}
}
$tools=[ordered]@{Compiler=(Tool-Record $compiler);Linker=(Tool-Record $linker);Librarian=(Tool-Record $librarian)}
$preservedNames=@('build/playable-04-shv-probe/RichAudio.OperatingState.Shv.asi','build/playable-04-shv-probe/build-receipt.json','build/playable-04-shv-probe/pe-inspection.json','evidence/playable-04-build.json','evidence/playable-04-fixtures.json','evidence/playable-05-rollback.json','build/playable-06-shv-probe/RichAudio.OperatingState.Shv.asi','build/playable-06-shv-probe/build-receipt.json','build/playable-06-shv-probe/pe-inspection.json')
$preservedNames+=@(Get-ChildItem -LiteralPath (Join-Path $repo 'evidence') -Filter 'playable-06-*.json' -File | ForEach-Object {'evidence/'+$_.Name})
$liveRoot=Join-Path $repo '.local/playable-06/live-01'
$liveFiles=@(Get-ChildItem -LiteralPath $liveRoot -Recurse -Force)
if($liveFiles.Count -gt 128 -or @($liveFiles|Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count){throw 'Prior live evidence directory exceeds the preservation bound or contains a reparse point.'}
$preservedNames+=@($liveFiles|Where-Object {!$_.PSIsContainer}|ForEach-Object {[IO.Path]::GetRelativePath($repo,$_.FullName).Replace('\','/')})
$preserved=@(foreach($name in $preservedNames|Sort-Object -Unique){
 $path=Join-Path $repo $name;$record=File-Record $path;[ordered]@{Name=$name;Bytes=$record.Bytes;Sha256=$record.Sha256}
})
foreach($pin in @(@{Name='build/playable-04-shv-probe/RichAudio.OperatingState.Shv.asi';Sha256='8f516dc5bdfd62f125c8f9624d3396c9c3f9debceb618c39f76784323fd7a083';Bytes=288256},@{Name='build/playable-06-shv-probe/RichAudio.OperatingState.Shv.asi';Sha256='af860dc42540a94c2176ee0dce09c77d9c16c9eeea46a1572d5011aaa8863be4';Bytes=323584})){
 $record=@($preserved|Where-Object {$_.Name -ceq $pin.Name})
 if($record.Count -ne 1 -or $record[0].Sha256 -ne $pin.Sha256 -or $record[0].Bytes -ne $pin.Bytes){throw 'Preserved PLAYABLE-04/06 candidate no longer matches its approved fingerprint.'}
}
$contractsFile=Join-Path $repo 'evidence/playable-06-native-contracts.json'
$contractsSha256=(Get-FileHash -LiteralPath $contractsFile).Hash.ToLowerInvariant()
if($contractsSha256 -ne '5eaefdcb1e7969c71587b1adc0d0e71e0582a27c3186736917b812abe2b88639'){throw 'The frozen PLAYABLE-06 native-contract allowlist differs.'}
$contracts=Get-Content -LiteralPath $contractsFile -Raw|ConvertFrom-Json
$nativeText=Get-Content -LiteralPath (Join-Path $sourceRoot 'NativeIds.h') -Raw
$definitions=@([regex]::Matches($nativeText,'(?m)^\s*inline constexpr std::uint64_t ([A-Za-z_]\w*) = (0x[0-9A-Fa-f]{16})ULL;\s*(?://[^\r\n]*)?$'))
$declaredNativeIds=@($definitions|ForEach-Object {[ordered]@{Alias=$_.Groups[1].Value;Hash=$_.Groups[2].Value.ToUpperInvariant()}})
$actualIds=@($declaredNativeIds|ForEach-Object {$_.Alias+':'+$_.Hash}|Sort-Object)
$expectedIds=@($contracts.checkedDefinitions|ForEach-Object {$_.alias+':'+$_.hash.ToUpperInvariant()}|Sort-Object)
if($actualIds.Count -ne 25 -or $expectedIds.Count -ne 25 -or @($actualIds|Select-Object -Unique).Count -ne 25 -or @(Compare-Object $expectedIds $actualIds -CaseSensitive).Count -ne 0 -or [regex]::Matches($nativeText,'inline\s+constexpr\s+std::uint64_t\s+').Count -ne 25 -or $nativeText -notmatch 'inline constexpr std::uint32_t BatiModel = 0xF9300CC5U;'){throw 'Declared NativeIds must exactly preserve the 25 approved PLAYABLE-06 names/hashes and Bati model.'}
$rollbackFile=Join-Path $repo 'evidence/playable-06-rollback.json'
if((Get-FileHash -LiteralPath $rollbackFile).Hash.ToLowerInvariant() -ne 'bb33402d7321a174605a07ed97e0a657aa24be495a3f58cb8413b1da565640b7'){throw 'The frozen PLAYABLE-06 rollback baseline differs.'}
$rollback=Get-Content -LiteralPath $rollbackFile -Raw|ConvertFrom-Json
$manifestFile=Join-Path $repo '.local/playable-06/candidate/installation-manifest.json'
if((Get-FileHash -LiteralPath $manifestFile).Hash.ToLowerInvariant() -ne $rollback.preparedManifestSha256){throw 'The historical protected-file/settings manifest differs from its independent rollback receipt.'}
$historicalManifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
$integrityInputs=@(foreach($record in $rollback.protectedFiles){[ordered]@{Name=$record.name;Path=(Join-Path $GameRoot $record.name);Sha256=$record.sha256}})
if($integrityInputs.Count -ne 11 -or @($historicalManifest.reviewedShortcutBaselines).Count -ne 4){throw 'Expected eleven protected files and four shortcut/settings baselines.'}
for($index=0;$index -lt 4;$index++){
 $record=$historicalManifest.reviewedShortcutBaselines[$index];$portable=$rollback.reviewedShortcutsAndSettings[$index]
 if($record.sha256 -ne $portable.sha256){throw 'Historical shortcut/settings pins disagree with rollback evidence.'}
 $integrityInputs+=[ordered]@{Name=$portable.name;Path=$record.path;Sha256=$record.sha256}
}
function Get-CheckedIntegrity {
 @($integrityInputs|ForEach-Object {
  $item=Get-Item -LiteralPath $_.Path
  if((Get-FileHash -LiteralPath $item.FullName).Hash.ToLowerInvariant() -ne $_.Sha256){throw ('Protected file or saved settings fingerprint differs: '+$_.Name)}
  [ordered]@{Name=$_.Name;Bytes=$item.Length;Sha256=$_.Sha256}
 })
}
$integrityBefore=@(Get-CheckedIntegrity)
$pins=[ordered]@{'ScriptHookV.dll'='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f';'dinput8.dll'='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d';'GTA5_Enhanced.exe'='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'}
$baseline=@(foreach($name in $pins.Keys){$record=File-Record (Join-Path $GameRoot $name);if($record.Sha256 -ne $pins[$name]){throw ('Installed baseline fingerprint differs: '+$name)};$record})
$framework=Get-ShvPeImage -Path (Join-Path $GameRoot 'ScriptHookV.dll')
if($framework.Machine -ne 'Amd64' -or $framework.PeKind -ne 'PE32Plus' -or !$framework.IsDll){throw 'Installed ScriptHookV baseline is not the verified x64 native DLL.'}
$exports=@(Get-ShvExpectedExports -Profile $probeProfile)
foreach($name in $exports){$match=@($framework.Exports | Where-Object {$_.Name -ceq $name});if($match.Count -ne 1 -or $match[0].Forwarded -or !$match[0].HasFunction){throw 'Required exact public ScriptHookV export is missing, ambiguous or forwarded.'}}
$provenanceFile=Join-Path $repo 'evidence/playable-07-header-provenance.json';$provenance=Get-Content -LiteralPath $provenanceFile -Raw|ConvertFrom-Json
if($provenance.installedShv.expectedSha256 -ne $pins['ScriptHookV.dll'] -or @(Compare-Object ($exports|Sort-Object) (@($provenance.abi.PSObject.Properties.Value)|Sort-Object) -CaseSensitive).Count){throw 'Project header provenance and verified import boundary disagree.'}
$projectInputs=@(foreach($name in $sources){$path=Join-Path $sourceRoot $name;[ordered]@{Name=(Portable-InputName $path);Bytes=(Get-Item -LiteralPath $path).Length;Sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}})
[IO.Directory]::CreateDirectory($output)|Out-Null
$definition=Join-Path $output 'ScriptHookV.def';$importLibrary=Join-Path $output 'ScriptHookV.lib';$object=Join-Path $output 'Probe.obj';$binary=Join-Path $output 'RichAudio.OperatingState.Shv.asi';$dependencies=Join-Path $output 'source-dependencies.json'
(@('LIBRARY ScriptHookV.dll','EXPORTS')+@($exports|ForEach-Object {'  '+$_})) | Set-Content -LiteralPath $definition -Encoding ascii
$compilerArguments=@('/nologo','/c','/std:c++17','/W4','/WX','/O2','/MT','/EHsc','/guard:cf','/Brepro','/utf-8',('/Fo'+$object),('/Fd'+(Join-Path $output 'Probe.compiler.pdb')),'/sourceDependencies',$dependencies)
$compilerArguments+=@($includeDirs|ForEach-Object {'/I'+$_});$compilerArguments+=(Join-Path $sourceRoot 'Probe.cpp')
$linkArguments=@('/NOLOGO','/DLL','/MACHINE:X64','/INCREMENTAL:NO','/OPT:REF','/OPT:ICF','/GUARD:CF','/DYNAMICBASE','/NXCOMPAT','/HIGHENTROPYVA','/Brepro','/VERBOSE:LIB',('/OUT:'+$binary),$object,$importLibrary,'kernel32.lib','user32.lib')+@($libraryDirs|ForEach-Object {'/LIBPATH:'+$_})
$oldTemp=$env:TEMP;$oldTmp=$env:TMP;$oldLanguage=$env:VSLANG
$temp=Join-Path $output 'tmp';[IO.Directory]::CreateDirectory($temp)|Out-Null
try{
 $env:TEMP=$temp;$env:TMP=$temp;$env:VSLANG='1033';Push-Location $output
 try{
  $libraryStep=Invoke-BuildTool $librarian @('/NOLOGO','/MACHINE:X64',('/DEF:'+$definition),('/OUT:'+$importLibrary)) (Join-Path $output 'import-library.log')
  $compileStep=Invoke-BuildTool $compiler $compilerArguments (Join-Path $output 'compile.log')
  $linkStep=Invoke-BuildTool $linker $linkArguments (Join-Path $output 'link.log')
 }finally{Pop-Location}
}finally{$env:TEMP=$oldTemp;$env:TMP=$oldTmp;$env:VSLANG=$oldLanguage}
$image=Get-ShvPeImage -Path $binary;$null=Assert-ShvProductImage -Image $image -Profile $probeProfile
$image|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $output 'pe-inspection.json') -Encoding utf8
$dependencyData=Get-Content -LiteralPath $dependencies -Raw|ConvertFrom-Json
$includedHeaders=@(foreach($path in @($dependencyData.Data.Includes)|Sort-Object -Unique){[ordered]@{Name=(Portable-InputName $path);Sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}})
if($includedHeaders.Count -eq 0 -or @($includedHeaders|Where-Object {$_.Name -match '/um/Windows\.h$'}).Count -ne 1){throw 'Compiler source-dependency manifest did not record the actual Windows SDK header.'}
$includedManifest=Join-Path $output 'included-headers.portable.json';$includedHeaders|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $includedManifest -Encoding utf8
$libraryPaths=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$null=$libraryPaths.Add($importLibrary)
foreach($line in Get-Content -LiteralPath (Join-Path $output 'link.log')){if($line -match '^\s*Searching\s+(.+\.lib):\s*$'){$path=$Matches[1].Trim();if([IO.Path]::IsPathFullyQualified($path) -and (Test-Path -LiteralPath $path -PathType Leaf)){$null=$libraryPaths.Add($path)}}}
$linkedLibraries=@(foreach($path in @($libraryPaths)|Sort-Object){[ordered]@{Name=(Portable-InputName $path);Bytes=(Get-Item -LiteralPath $path).Length;Sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}})
if(@($linkedLibraries|Where-Object {$_.Name -match '/kernel32\.lib$'}).Count -ne 1){throw 'Linker trace did not identify the consumed Windows kernel import library.'}
foreach($name in $pins.Keys){if((Get-FileHash -LiteralPath (Join-Path $GameRoot $name)).Hash.ToLowerInvariant() -ne $pins[$name]){throw 'A pinned game baseline changed during offline build; no success receipt is published.'}}
$integrityAfter=@(Get-CheckedIntegrity)
foreach($sourceInput in $projectInputs){$path=Join-Path $repo $sourceInput.Name.Substring(5);if((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $sourceInput.Sha256){throw 'Probe source changed while compiling; rebuild the settled source.'}}
foreach($record in $preserved){$path=Join-Path $repo $record.Name;if((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $record.Sha256 -or (Get-Item -LiteralPath $path).Length -ne $record.Bytes){throw 'A preserved prior artifact, receipt or live evidence file changed during compilation; no success receipt is published.'}}
$toolchain=[ordered]@{Compiler=$compiler;Linker=$linker;Librarian=$librarian;SdkRoot=$sdkRoot;SdkVersion=$sdkVersion;VcRoot=$vcRoot;VcVersion=$vcVersion;IncludeDirs=$includeDirs;LibraryDirs=$libraryDirs}
$private=[ordered]@{Schema=1;Profile=$probeProfile;BuiltUtc=[DateTime]::UtcNow.ToString('o');Candidate=[ordered]@{Path=$binary;Sha256=$image.Sha256;Bytes=$image.Bytes};Toolchain=$toolchain;CompilerArguments=$compilerArguments;LinkerArguments=$linkArguments;Steps=@($libraryStep,$compileStep,$linkStep);PeInspection=$image;SourceInputs=$projectInputs;IncludedHeaders=$includedHeaders;LinkedLibraries=$linkedLibraries;DeclaredNativeIds=$declaredNativeIds;NativeAllowlistSha256=$contractsSha256;PreservedPriorFiles=$preserved;EarlierArtifactAndReceiptsUnchanged=$true;ProtectedFilesAndSettings=$integrityAfter;ProtectedFilesAndSettingsUnchanged=$true;GameFilesWritten=$false;GameOrProbeExecuted=$false;DeviceFreeFixturesExecutedByBuilder=$false}
$private|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $output 'build-receipt.json') -Encoding utf8
$public=[ordered]@{
 schema=1;profile=$probeProfile;builtUtc=$private.BuiltUtc;scope='Offline Microsoft x64 C++ compilation of the bounded operator-armed multi-state diagnostic, exact public import-boundary linking and static PE inspection only'
 candidate=[ordered]@{name=$image.Name;bytes=$image.Bytes;sha256=$image.Sha256;pathHint=(Portable-InputName $binary).Substring(5);installablePlayableUpdate=$false}
 toolchain=[ordered]@{msvcVersion=$vcVersion;windowsSdkVersion=$sdkVersion;compiler=$tools.Compiler;linker=$tools.Linker;librarian=$tools.Librarian;compilerFlags=@('/std:c++17','/W4','/WX','/O2','/MT','/EHsc','/guard:cf','/Brepro','/utf-8');linkerFlags=@('/DLL','/MACHINE:X64','/INCREMENTAL:NO','/OPT:REF','/OPT:ICF','/GUARD:CF','/DYNAMICBASE','/NXCOMPAT','/HIGHENTROPYVA','/Brepro')}
 sourceInputs=$projectInputs;headerProvenanceSha256=(Get-FileHash -LiteralPath $provenanceFile).Hash.ToLowerInvariant();includedHeaderCount=$includedHeaders.Count;includedHeaderManifestSha256=(Get-FileHash -LiteralPath $includedManifest).Hash.ToLowerInvariant();linkedLibraries=$linkedLibraries
 generatedImportLibrary=[ordered]@{method='Local MSVC librarian generated a COFF import library from eight statically verified decorated exports, including documented keyboard callbacks; no proprietary import-library binary was copied';definitionSha256=(Get-FileHash -LiteralPath $definition).Hash.ToLowerInvariant();librarySha256=(Get-FileHash -LiteralPath $importLibrary).Hash.ToLowerInvariant();frameworkDll='ScriptHookV.dll';exactImportedNames=@($exports|Sort-Object)}
 declaredNativeSetMatchesFrozen06=$true;declaredNativeIds=$declaredNativeIds;nativeAllowlistSha256=$contractsSha256;nativeAllowlistQualification='Declaration names and values are checked; source review separately verifies dispatch and measurement behaviour.'
 preservedPriorFiles=$preserved;earlierArtifactAndReceiptsUnchanged=$true;priorLiveSnapshotAndReceiptsUnchanged=$true
 protectedFilesAndSettings=$integrityAfter;protectedFileCount=11;shortcutAndSettingsCount=4;protectedFilesAndSettingsUnchanged=$true
 pinnedInstalledBaselines=$baseline;baselineHashesStillMatchAfterBuild=$true;pe=$image
 runtimeSupportEstablished=$false;nativeResolutionEstablished=$false;operatingStateContractValidated=$false;sourceOrRenderedAudioEstablished=$false;gameFilesWritten=$false;deployed=$false;gameOrProbeExecuted=$false;deviceFreeFixturesExecutedByBuilder=$false;newSystemSoftwareInstalledByBuilder=$false
 qualification='A compiled isolated operator-armed multi-state diagnostic candidate only. Static imports/entry point do not prove correct operator gating, capture bounds, successful ASI loading, native availability, valid engine telemetry or audible vehicle sound. Device-free fixtures are reported separately. Gear, actual throttle and control-axis values remain unavailable; keyboard intent is not a measured throttle signal.'
 privacy='Absolute project/toolchain/game paths, raw build logs, compiler dependency paths and private captures remain in ignored build storage. No source audio, SDK/runtime binaries or game assets are published.'
}
$public|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $publicTarget -Encoding utf8
Write-Output ('PASS native x64 read-only SHV probe compiled and PE/import boundary verified. '+$binary)
Write-Output ('SHA256 '+$image.Sha256+'; not deployed, loaded or executed by this builder.')
