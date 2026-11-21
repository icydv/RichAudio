#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedProducerSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedApiSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedSdkHeaderSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedNativeIdsSha256,
 [string]$GameRoot='D:\Games\steamapps\common\Grand Theft Auto V Enhanced',
 [string]$BuildToolsRoot='C:\VSBuildTools', [string]$OutputRoot='', [string]$PublicEvidencePath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Inspect-ShvHandoff.ps1')
if(!$OutputRoot){$OutputRoot=Join-Path $repo 'build/playable-09-shv-handoff'}
$output=Assert-ShvHandoffOutputPath $OutputRoot $repo $GameRoot
if(Test-Path -LiteralPath $output){throw 'Build output must be new; no existing artifact or receipt is overwritten.'}
if(!$PublicEvidencePath){$PublicEvidencePath=Join-Path $repo 'evidence/playable-09-handoff-build.json'}
$publicTarget=[IO.Path]::GetFullPath($PublicEvidencePath)
if(![IO.Path]::GetDirectoryName($publicTarget).Equals((Join-Path $repo 'evidence'),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($publicTarget) -notmatch '^playable-09-handoff-build(?:[-.][A-Za-z0-9_-]+)?\.json$'){throw 'New public evidence must use a09 handoff-build filename directly under evidence.'}
if(Test-Path -LiteralPath $publicTarget){throw 'Public evidence must be new.'}
for($cursor=$publicTarget;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse output is forbidden.'}}
function File-Record([string]$Path){$item=Get-Item -LiteralPath $Path;[ordered]@{Name=$item.Name;Bytes=$item.Length;Sha256=(Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant();FileVersion=$item.VersionInfo.FileVersion}}
function Checked-Record([string]$Path,[string]$Name,[string]$Sha256,[long]$Bytes=-1){
 $r=File-Record $Path
 if($r.Sha256 -ne $Sha256 -or ($Bytes -ge 0 -and $r.Bytes -ne $Bytes)){throw ('Preservation or source pin differs: '+$Name)}
 [ordered]@{Name=$Name;Path=[IO.Path]::GetFullPath($Path);Bytes=$r.Bytes;Sha256=$r.Sha256}
}
function Tool-Record([string]$Path){
 $r=File-Record $Path;$signature=Get-AuthenticodeSignature -LiteralPath $Path
 if($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'Build tools require valid Microsoft signatures.'}
 $r.AuthenticodeStatus=$signature.Status.ToString();$r.Signer=$signature.SignerCertificate.Subject;$r
}
function Invoke-BuildTool([string]$Executable,[string[]]$Arguments,[string]$Log){
 $lines=@(& $Executable @Arguments 2>&1|ForEach-Object {$_.ToString()});$code=$LASTEXITCODE
 $lines|Set-Content -LiteralPath $Log -Encoding utf8
 if($code -ne 0){throw ('Offline build failed: '+($lines|Select-Object -Last 18|Out-String))}
 [ordered]@{ExitCode=$code;Log=$Log}
}
$baselinePath=Join-Path $repo '.local/playable-09/baseline.json'
$baselinePin=Checked-Record $baselinePath '.local/playable-09/baseline.json' '024d16b24305df1b7e52975f41989e78e5d9b284b0ee8580a515fe8763d72074'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.result -ne 'PASS' -or @($baseline.historicalPins).Count -ne 140 -or @($baseline.foundationPins).Count -ne 24 -or @($baseline.protectedFiles).Count -ne 11 -or @($baseline.shortcutsAndSettings).Count -ne 4){throw 'Initial09 preservation baseline is incomplete.'}
$preserved=[Collections.Generic.List[object]]::new();$preserved.Add($baselinePin)
if($output.Equals((Join-Path $repo 'build/playable-09-shv-handoff-final'),[StringComparison]::OrdinalIgnoreCase)){
 foreach($pin in @(
  @{Name='build/playable-09-shv-handoff/RichAudio.OperatingState.ShvHandoff.asi';Bytes=129024;Sha256='3a6a5e8b94241fb344942e35cce3b800555ae2e6d16cf3486d0322603f074d72'},
  @{Name='build/playable-09-shv-handoff/build-receipt.json';Bytes=-1;Sha256='cab2a86aca3411da2a01e8daca25cbb8725451510847f40cf181895e3df6cc55'},
  @{Name='evidence/playable-09-handoff-build-initial.json';Bytes=-1;Sha256='fdc34a42fa6c4e1761e6ef007d3a9616b80110286fc5a68bfe3e9fad8ef04dc7'}
 )){$preserved.Add((Checked-Record (Join-Path $repo $pin.Name) $pin.Name $pin.Sha256 $pin.Bytes))}
}
foreach($pin in @($baseline.historicalPins)+@($baseline.foundationPins)+@($baseline.diagnosticSources)+@($baseline.acceptedDiagnosticArtifacts)+@($baseline.primaryAnalyzer)+@($baseline.restrictedAcceptanceAndEvidence)){
 $name=$pin.name -creplace '^repo/',''
 if($name -match '(^|[/\\])\.\.([/\\]|$)' -or [IO.Path]::IsPathFullyQualified($name)){throw 'Invalid repository preservation path.'}
 $preserved.Add((Checked-Record (Join-Path $repo $name) $name $pin.sha256 $pin.bytes))
}
$snapshotRoot=Join-Path $repo '.local/playable-09/preserved-playable-08-handoff'
$snapshotPath=Join-Path $snapshotRoot 'snapshot.json';$snapshot=Get-Content -LiteralPath $snapshotPath -Raw|ConvertFrom-Json
if(@($snapshot.sourcePins).Count -ne 4){throw 'Historical08 handoff source snapshot is incomplete.'}
foreach($pin in $snapshot.sourcePins){
 $accepted=@($baseline.offlineHandoffPreparation|Where-Object {$_.name -ceq $pin.source})
 if($accepted.Count -ne 1 -or $accepted[0].sha256 -ne $pin.sha256 -or $accepted[0].bytes -ne $pin.bytes -or [IO.Path]::GetFileName($pin.name) -cne $pin.name){throw 'Historical08 source snapshot differs from the initial09 baseline.'}
 $preserved.Add((Checked-Record (Join-Path $snapshotRoot $pin.name) ('.local/playable-09/preserved-playable-08-handoff/'+$pin.name) $pin.sha256 $pin.bytes))
}
foreach($directory in @('.local/playable-08/live-01','.local/playable-08/live-02-guided','.local/playable-08/candidate','.local/playable-08/candidate-guided','.local/playable-08/hud-coach/original')){
 $files=@(Get-ChildItem -LiteralPath (Join-Path $repo $directory) -Recurse -Force)
 if($files.Count -gt 512 -or @($files|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Prior evidence snapshot is oversized or contains reparse points.'}
 foreach($file in $files|Where-Object {!$_.PSIsContainer}){$r=File-Record $file.FullName;$preserved.Add((Checked-Record $file.FullName ([IO.Path]::GetRelativePath($repo,$file.FullName).Replace('\','/')) $r.Sha256 $r.Bytes))}
}
foreach($file in @(Get-ChildItem -LiteralPath (Join-Path $repo 'evidence') -Filter 'playable-08-*.json' -File)+@(Get-Item -LiteralPath $snapshotPath)){
 $r=File-Record $file.FullName;$preserved.Add((Checked-Record $file.FullName ([IO.Path]::GetRelativePath($repo,$file.FullName).Replace('\','/')) $r.Sha256 $r.Bytes))
}
foreach($attempt in @('live-01','live-02-guided')){
 $capture=Get-Content -LiteralPath (Join-Path $repo ('.local/playable-08/'+$attempt+'/capture-preservation.json')) -Raw|ConvertFrom-Json
 foreach($pin in $capture.files){
  $accepted=@($baseline.preservedOriginalAndCopied08Captures|Where-Object {$_.attempt -ceq $attempt -and $_.name -ceq $pin.name})
  if($accepted.Count -ne 1 -or $accepted[0].sha256 -ne $pin.sha256){throw 'Capture preservation lineage differs.'}
  $preserved.Add((Checked-Record (Join-Path $capture.sourceCapturePath $pin.name) ('private-capture/'+$attempt+'/'+$pin.name) $pin.sha256 $pin.bytes))
 }
}
$manifest=Get-Content -LiteralPath (Join-Path $repo '.local/playable-08/candidate-guided/installation-manifest.json') -Raw|ConvertFrom-Json
$integrity=@(foreach($pin in $baseline.protectedFiles){Checked-Record (Join-Path $GameRoot $pin.name) $pin.name $pin.sha256 $pin.bytes})
if(@($manifest.reviewedShortcutBaselines).Count -ne 4){throw 'Saved-settings mapping is incomplete.'}
for($index=0;$index -lt 4;$index++){$pin=$baseline.shortcutsAndSettings[$index];$mapping=$manifest.reviewedShortcutBaselines[$index];if($mapping.sha256 -ne $pin.sha256){throw 'Saved-settings mapping differs.'};$integrity+=Checked-Record $mapping.path $pin.name $pin.sha256 $pin.bytes}
if((Get-Content -LiteralPath $manifest.reviewedShortcutBaselines[3].path -Raw|ConvertFrom-Json).integrationMode -ne 'stock-fallback'){throw 'Saved acoustic settings must select stock fallback.'}
$decisionPath=Join-Path $repo '.local/playable-09/identity-scope-decision.json';$decision=Get-Content -LiteralPath $decisionPath -Raw|ConvertFrom-Json
if($decision.identityMode -ne 'read-only-sdk-ordinary-reuse' -or !$decision.unobservedFullCounterWrapAndAddressAbaExcluded -or $decision.entityMetadataWritesAllowed -or $decision.deploymentAuthorised){throw 'Expected the bounded read-only identity design decision without live authorisation.'}
$decisionRecord=File-Record $decisionPath;$preserved.Add((Checked-Record $decisionPath '.local/playable-09/identity-scope-decision.json' $decisionRecord.Sha256 $decisionRecord.Bytes))
$vcVersion=([IO.File]::ReadAllText((Join-Path $BuildToolsRoot 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt'))).Trim()
if($vcVersion -notmatch '^14\.\d+\.\d+$'){throw 'Unexpected Microsoft toolset version.'}
$vcRoot=Join-Path $BuildToolsRoot ('VC/Tools/MSVC/'+$vcVersion)
$compiler=Join-Path $vcRoot 'bin/Hostx64/x64/cl.exe';$linker=Join-Path $vcRoot 'bin/Hostx64/x64/link.exe';$librarian=Join-Path $vcRoot 'bin/Hostx64/x64/lib.exe'
$sdkRoot='C:\Program Files (x86)\Windows Kits\10';$sdkVersion='10.0.26100.0'
$includeDirs=@((Join-Path $vcRoot 'include'),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/ucrt')),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/shared')),(Join-Path $sdkRoot ('Include/'+$sdkVersion+'/um')))
$libraryDirs=@((Join-Path $vcRoot 'lib/x64'),(Join-Path $sdkRoot ('Lib/'+$sdkVersion+'/ucrt/x64')),(Join-Path $sdkRoot ('Lib/'+$sdkVersion+'/um/x64')))
foreach($directory in @($includeDirs)+@($libraryDirs)){if(!(Test-Path -LiteralPath $directory -PathType Container)){throw 'Existing authorised Microsoft C++/Windows SDK prerequisites are missing; no installer is invoked.'}}
$tools=[ordered]@{Compiler=(Tool-Record $compiler);Linker=(Tool-Record $linker);Librarian=(Tool-Record $librarian)}
function Portable-InputName([string]$Path){
 $full=[IO.Path]::GetFullPath($Path)
 foreach($root in @(@{Path=$vcRoot;Prefix=('msvc/'+$vcVersion)},@{Path=$sdkRoot;Prefix='windows-sdk'},@{Path=$repo;Prefix='repo'})){$prefix=[IO.Path]::GetFullPath($root.Path).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar;if($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){return $root.Prefix+'/'+$full.Substring($prefix.Length).Replace('\','/')}}
 throw 'A compiler/link input is outside the reviewed project/MSVC/SDK roots.'
}
$sourceRoot=Join-Path $repo 'src/telemetry/ShvHandoff'
$freeze=[ordered]@{'Producer.cpp'=$ExpectedProducerSha256;'ProducerApi.h'=$ExpectedApiSha256;'ScriptHookVApi.h'=$ExpectedSdkHeaderSha256;'NativeIds.h'=$ExpectedNativeIdsSha256}
$projectInputs=@(foreach($name in $freeze.Keys){$r=Checked-Record (Join-Path $sourceRoot $name) ('repo/src/telemetry/ShvHandoff/'+$name) $freeze[$name];[ordered]@{Name=$r.Name;Bytes=$r.Bytes;Sha256=$r.Sha256}})
$contractPath=Join-Path $repo 'evidence/playable-06-native-contracts.json';$contractSha=(Get-FileHash -LiteralPath $contractPath).Hash.ToLowerInvariant()
if($contractSha -ne '5eaefdcb1e7969c71587b1adc0d0e71e0582a27c3186736917b812abe2b88639'){throw 'Historical native contract allowlist differs.'}
$contract=Get-Content -LiteralPath $contractPath -Raw|ConvertFrom-Json
$nativeText=Get-Content -LiteralPath (Join-Path $sourceRoot 'NativeIds.h') -Raw
$definitions=@([regex]::Matches($nativeText,'(?m)^\s*inline constexpr std::uint64_t ([A-Za-z_]\w*) = (0x[0-9A-Fa-f]{16})ULL;\s*(?://[^\r\n]*)?$'))
$declared=@(foreach($match in $definitions){[ordered]@{Alias=$match.Groups[1].Value;Hash=$match.Groups[2].Value.ToUpperInvariant()}})
$expected=@($contract.checkedDefinitions|Select-Object -First 18|ForEach-Object {$_.alias+':'+$_.hash.ToUpperInvariant()}|Sort-Object)
$actual=@($declared|ForEach-Object {$_.Alias+':'+$_.Hash}|Sort-Object)
if($actual.Count -ne 18 -or @([regex]::Matches($nativeText,'inline\s+constexpr\s+std::uint64_t\s+')).Count -ne 18 -or @(Compare-Object $expected $actual -CaseSensitive).Count -or $nativeText -notmatch 'inline constexpr std::uint32_t BatiModel = 0xF9300CC5U;'){throw 'Handoff NativeIds must be the exact first18 previously reviewed non-HUD definitions and Bati model.'}
$framework=Get-ShvPeImage (Join-Path $GameRoot 'ScriptHookV.dll')
if($framework.Sha256 -ne '126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f' -or $framework.Machine -ne 'Amd64' -or $framework.PeKind -ne 'PE32Plus' -or !$framework.IsDll){throw 'Installed SHV fingerprint or image kind differs.'}
$imports=@(Get-ShvHandoffImports)
foreach($name in $imports){$m=@($framework.Exports|Where-Object {$_.Name -ceq $name});if($m.Count -ne 1 -or $m[0].Forwarded -or !$m[0].HasFunction){throw 'An exact public SDK export is absent or forwarded.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$definition=Join-Path $output 'ScriptHookV.def';$importLibrary=Join-Path $output 'ScriptHookV.lib';$object=Join-Path $output 'Producer.obj';$binary=Join-Path $output 'RichAudio.OperatingState.ShvHandoff.asi';$dependencies=Join-Path $output 'source-dependencies.json'
(@('LIBRARY ScriptHookV.dll','EXPORTS')+@($imports|ForEach-Object {'  '+$_}))|Set-Content -LiteralPath $definition -Encoding ascii
$compilerArguments=@('/nologo','/c','/std:c++17','/W4','/WX','/O2','/MT','/EHsc','/guard:cf','/Brepro','/utf-8',('/Fo'+$object),('/Fd'+(Join-Path $output 'Producer.compiler.pdb')),'/sourceDependencies',$dependencies)+@($includeDirs|ForEach-Object {'/I'+$_})+(Join-Path $sourceRoot 'Producer.cpp')
$linkArguments=@('/NOLOGO','/DLL','/MACHINE:X64','/INCREMENTAL:NO','/OPT:REF','/OPT:ICF','/GUARD:CF','/DYNAMICBASE','/NXCOMPAT','/HIGHENTROPYVA','/Brepro','/VERBOSE:LIB',('/OUT:'+$binary),$object,$importLibrary,'kernel32.lib','user32.lib')+@($libraryDirs|ForEach-Object {'/LIBPATH:'+$_})
$oldTemp=$env:TEMP;$oldTmp=$env:TMP;$oldLanguage=$env:VSLANG;$temp=Join-Path $output 'tmp';[IO.Directory]::CreateDirectory($temp)|Out-Null
try{$env:TEMP=$temp;$env:TMP=$temp;$env:VSLANG='1033';Push-Location $output;try{
 $libraryStep=Invoke-BuildTool $librarian @('/NOLOGO','/MACHINE:X64',('/DEF:'+$definition),('/OUT:'+$importLibrary)) (Join-Path $output 'import-library.log')
 $compileStep=Invoke-BuildTool $compiler $compilerArguments (Join-Path $output 'compile.log')
 $linkStep=Invoke-BuildTool $linker $linkArguments (Join-Path $output 'link.log')
}finally{Pop-Location}}finally{$env:TEMP=$oldTemp;$env:TMP=$oldTmp;$env:VSLANG=$oldLanguage}
$image=Get-ShvPeImage $binary;$null=Assert-ShvHandoffImage $image
Write-ShvHandoffJsonNew (Join-Path $output 'pe-inspection.json') $image
$symbolLog=Join-Path $output 'owned-object-symbols.log'
$objectInspectionStep=Invoke-BuildTool $linker @('/dump','/symbols',$object) $symbolLog
$directImports=@(@(foreach($line in Get-Content -LiteralPath $symbolLog){if($line -match '\bUNDEF\b.*\bExternal\s+\|\s+__imp_(\S+)'){$Matches[1]}})|Sort-Object -Unique)
$expectedDirect=@($imports)+@('QueryPerformanceCounter','QueryPerformanceFrequency','GetProcessTimes','GetCurrentProcess','GetCurrentProcessId','GetModuleHandleExW','GetForegroundWindow','GetWindowThreadProcessId')
if($directImports.Count -ne 15 -or @(Compare-Object ($expectedDirect|Sort-Object) $directImports -CaseSensitive).Count){throw 'Owned COFF object must directly import precisely seven SHV APIs and eight OS QPC/process/foreground/module-pin readers.'}
$dependencyData=Get-Content -LiteralPath $dependencies -Raw|ConvertFrom-Json
$includedHeaders=@(foreach($path in @($dependencyData.Data.Includes)|Sort-Object -Unique){[ordered]@{Name=(Portable-InputName $path);Sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}})
if(@($includedHeaders|Where-Object {$_.Name -match '/um/Windows\.h$'}).Count -ne 1){throw 'Actual Windows SDK header is absent from compiler dependency evidence.'}
$includedManifest=Join-Path $output 'included-headers.portable.json';Write-ShvHandoffJsonNew $includedManifest $includedHeaders
$libraryPaths=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$null=$libraryPaths.Add($importLibrary)
foreach($line in Get-Content -LiteralPath (Join-Path $output 'link.log')){if($line -match '^\s*Searching\s+(.+\.lib):\s*$'){$path=$Matches[1].Trim();if([IO.Path]::IsPathFullyQualified($path) -and (Test-Path -LiteralPath $path -PathType Leaf)){$null=$libraryPaths.Add($path)}}}
$linkedLibraries=@(foreach($path in @($libraryPaths)|Sort-Object){[ordered]@{Name=(Portable-InputName $path);Bytes=(Get-Item -LiteralPath $path).Length;Sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}})
foreach($name in @('kernel32','user32')){if(@($linkedLibraries|Where-Object {$_.Name -match ('/'+$name+'\.lib$')}).Count -ne 1){throw 'Actual consumed Windows import library is absent from linker trace.'}}
foreach($pin in $preserved.ToArray()+@($integrity)){$null=Checked-Record $pin.Path $pin.Name $pin.Sha256 $pin.Bytes}
foreach($pin in $projectInputs){$null=Checked-Record (Join-Path $repo $pin.Name.Substring(5)) $pin.Name $pin.Sha256 $pin.Bytes}
$portablePreserved=@($preserved.ToArray()|Sort-Object { $_.Name } -Unique|ForEach-Object {[ordered]@{Name=$_.Name;Bytes=$_.Bytes;Sha256=$_.Sha256}})
$portableIntegrity=@($integrity|ForEach-Object {[ordered]@{Name=$_.Name;Bytes=$_.Bytes;Sha256=$_.Sha256}})
$toolchain=[ordered]@{Compiler=$compiler;Linker=$linker;Librarian=$librarian;SdkRoot=$sdkRoot;SdkVersion=$sdkVersion;VcRoot=$vcRoot;VcVersion=$vcVersion;IncludeDirs=$includeDirs;LibraryDirs=$libraryDirs}
$identityLimit='Read-only SDK opaque-address correspondence and retained RPH wrapper/local pool counter bound ordinary observed reuse. Full unobserved 8-bit counter wrap plus address ABA is excluded; no cross-framework numeric-handle equality, entity writes or memory dereference is authorised.'
$private=[ordered]@{Schema=1;Profile='playable-09';Purpose='passive-shv-rph-owned-host-handoff';BuiltUtc=[DateTime]::UtcNow.ToString('o');Candidate=[ordered]@{Path=$binary;Sha256=$image.Sha256;Bytes=$image.Bytes};Toolchain=$toolchain;CompilerArguments=$compilerArguments;LinkerArguments=$linkArguments;Steps=@($libraryStep,$compileStep,$linkStep,$objectInspectionStep);PeInspection=$image;OwnedObjectDirectImports=$directImports;OwnedObjectSha256=(Get-FileHash -LiteralPath $object).Hash.ToLowerInvariant();SourceInputs=$projectInputs;IncludedHeaders=$includedHeaders;LinkedLibraries=$linkedLibraries;DeclaredNativeIds=$declared;NativeAllowlistSha256=$contractSha;PreservedPriorFiles=$portablePreserved;ProtectedFilesAndSettings=$portableIntegrity;EarlierArtifactsAndReceiptsUnchanged=$true;ProtectedFilesAndSettingsUnchanged=$true;IdentityLimit=$identityLimit;RequiresFreshLiveApproval=$true;LiveHandoffReady=$false;GameFilesWritten=$false;GameOrProducerExecuted=$false;DeviceFreeFixturesExecutedByBuilder=$false}
$receiptPath=Join-Path $output 'build-receipt.json';Write-ShvHandoffJsonNew $receiptPath $private
$public=[ordered]@{schema=1;profile='playable-09';builtUtc=$private.BuiltUtc;scope='Offline genuine Microsoft x64 C++ compilation, public SDK import-library generation and static PE inspection of a new passive producer only';candidate=[ordered]@{name=$image.Name;bytes=$image.Bytes;sha256=$image.Sha256;pathHint=(Portable-InputName $binary).Substring(5)};privateBuildReceiptSha256=(Get-FileHash -LiteralPath $receiptPath).Hash.ToLowerInvariant();sourceInputs=$projectInputs;toolchain=[ordered]@{msvcVersion=$vcVersion;windowsSdkVersion=$sdkVersion;tools=$tools;compilerFlags=@('/std:c++17','/W4','/WX','/O2','/MT','/EHsc','/guard:cf','/Brepro','/utf-8')};includedHeaderCount=$includedHeaders.Count;includedHeaderManifestSha256=(Get-FileHash -LiteralPath $includedManifest).Hash.ToLowerInvariant();linkedLibraries=$linkedLibraries;generatedImportLibrary=[ordered]@{method='Local MSVC librarian from seven statically verified public decorated exports; no proprietary import-library binary copied';definitionSha256=(Get-FileHash -LiteralPath $definition).Hash.ToLowerInvariant();librarySha256=(Get-FileHash -LiteralPath $importLibrary).Hash.ToLowerInvariant();exactImportedNames=$imports};ownedExports=@(Get-ShvHandoffExports);wireAbi=[ordered]@{platform='Windows x64';callingConvention='Cdecl';pack=8;contextBytes=80;recordBytes=256;readReplyBytes=288;qualification='Header static assertions compile. PE names alone do not prove function signatures or consumer marshalling; independent device-free ABI fixtures are required.'};declaredNativeIds=$declared;nativeAllowlistSha256=$contractSha;preservedPriorFileCount=$portablePreserved.Count;preservedPriorFiles=$portablePreserved;foundationPinCount=24;historicalPinCount=140;protectedFilesAndSettings=$portableIntegrity;protectedFileCount=11;shortcutAndSettingsCount=4;earlierArtifactsAndReceiptsUnchanged=$true;pe=$image;identityMode='read-only-sdk-ordinary-reuse';identityLimit=$identityLimit;liveHandoffReady=$false;newProducerRuntimeQualified=$false;priorDiagnosticQualificationInherited=$false;requiresFreshLiveApproval=$true;deployed=$false;gameFilesWritten=$false;gameOrProducerExecuted=$false;endpointOpened=$false;deviceFreeFixturesExecutedByBuilder=$false;newSystemSoftwareInstalled=$false;privacy='Absolute paths, process IDs and compiler/linker logs remain ignored/private. SDK/runtime/game binaries and captures are not published.'}
$public.ownedObjectDirectImports=$directImports
$public.ownedObjectSha256=$private.OwnedObjectSha256
$public.wholeImageCrtImportsQualification='The /MT linked image includes normal static CRT file, console and loader helpers. The authored Producer.obj directly imports only the listed seven SHV symbols and eight OS QPC/process/foreground/module-pin readers. Source review separately covers CRT function use and dispatch semantics.'
Write-ShvHandoffJsonNew $publicTarget $public
Write-Output ('PASS offline native handoff build/static inspection. '+$binary)
Write-Output ('SHA256 '+$image.Sha256+'; '+$image.Bytes+' bytes; no deployment, load, game execution or live qualification.')
