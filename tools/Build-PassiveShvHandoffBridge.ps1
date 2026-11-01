#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-09/passive-bridge-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=@('build/playable-09-passive-bridge','.local/playable-09')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
if(!@($allowed|Where-Object{($output+'\').StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Passive bridge output must remain in new09-only storage.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output is forbidden.'}}
if(Test-Path -LiteralPath $output){throw 'Passive bridge output must be a new directory.'}
$baselinePath=Join-Path $repo '.local/playable-09/baseline.json'
if((Get-FileHash -LiteralPath $baselinePath).Hash.ToLowerInvariant() -ne '024d16b24305df1b7e52975f41989e78e5d9b284b0ee8580a515fe8763d72074'){throw 'Initial09 baseline changed.'}
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
$historicalManifest=Get-Content -LiteralPath (Join-Path $repo '.local/playable-08/candidate-guided/installation-manifest.json') -Raw|ConvertFrom-Json
$gameRoot=Split-Path -Parent $historicalManifest.payload[0].destination
$producerBuildPath=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json'
if((Get-FileHash -LiteralPath $producerBuildPath).Hash.ToLowerInvariant() -ne 'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'){throw 'Final producer build receipt differs.'}
$producerBuild=Get-Content -LiteralPath $producerBuildPath -Raw|ConvertFrom-Json
$producerSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
if($producerBuild.Candidate.Sha256 -ne $producerSha -or (Get-FileHash -LiteralPath $producerBuild.Candidate.Path).Hash.ToLowerInvariant() -ne $producerSha){throw 'Final producer artifact differs.'}
$preserved=@(foreach($pin in @($baseline.historicalPins)+@($baseline.foundationPins)+@($baseline.diagnosticSources)+@($baseline.acceptedDiagnosticArtifacts)+@($baseline.primaryAnalyzer)){
 $name=$pin.name -creplace '^repo/','';$path=Join-Path $repo $name
 if($name -ceq 'tools/Build-BeaconBridge.ps1'){$path=Join-Path $repo '.local/playable-09/preserved-build-beacon/Build-BeaconBridge.ps1';$name='.local/playable-09/preserved-build-beacon/Build-BeaconBridge.ps1'}
 if((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $pin.sha256 -or (Get-Item -LiteralPath $path).Length -ne $pin.bytes){throw ('Prior pin differs: '+$name)}
 [ordered]@{name=$name;path=$path;bytes=$pin.bytes;sha256=$pin.sha256}
})
$protected=@(foreach($pin in $baseline.protectedFiles){$path=Join-Path $gameRoot $pin.name;if((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Protected installation pin differs.'};[ordered]@{name=$pin.name;path=$path;sha256=$pin.sha256}})
for($i=0;$i -lt 4;$i++){$pin=$baseline.shortcutsAndSettings[$i];$path=$historicalManifest.reviewedShortcutBaselines[$i].path;if((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Saved settings pin differs.'};$protected+=[ordered]@{name=$pin.name;path=$path;sha256=$pin.sha256}}
if(!$SdkPath){$SdkPath=@($baseline.existingCompilerAndAuthenticSdkInventory|Where-Object {$_.sha256 -eq '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'}|Select-Object -First 1 -ExpandProperty path)[0]}
if(!$SdkPath -or (Get-FileHash -LiteralPath $SdkPath).Hash.ToLowerInvariant() -ne '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'){throw 'Authentic pinned old SDK is required; no download/substitution.'}
$pins=[ordered]@{
 WorkspaceRoot=$repo;GamePath=(Join-Path $gameRoot 'GTA5_Enhanced.exe');GameVersion='1.0.1158.16';GameSha256='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'
 ShvPath=(Join-Path $gameRoot 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f'
 LoaderPath=(Join-Path $gameRoot 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d'
 RphPath=(Join-Path $gameRoot 'RAGEPluginHook.exe');RphVersion='1.132.1428.17748';RphSha256='73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac'
 ProducerPath=(Join-Path $gameRoot 'RichAudio.OperatingState.ShvHandoff.asi');ProducerSha256=$producerSha
 LeasePath=(Join-Path $gameRoot 'Plugins/RichAudio.ShvHandoff.json')
}
[IO.Directory]::CreateDirectory($output)|Out-Null
$policyPath=Join-Path $output 'ShvHandoffBuildPolicy.generated.cs'
$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {')
foreach($name in $pins.Keys){$lines+='internal const string '+$name+' = @"'+$pins[$name].Replace('"','""')+'";'}
$lines+='} }';$lines|Set-Content -LiteralPath $policyPath -Encoding utf8
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $SdkPath -Playable -ShvHandoff -ShvHandoffPolicySource $policyPath -Output $output
$binary=Join-Path $output 'RichAudio.Beacon.Rph.dll';if(!(Test-Path -LiteralPath $binary)){throw 'Passive bridge build did not produce an image.'}
$reader=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll'
if((Get-FileHash -LiteralPath $reader).Hash.ToLowerInvariant() -ne '0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Static reader pin differs.'}
Add-Type -Path $reader
$stream=[IO.File]::OpenRead($binary)
try{
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($stream)
 $types=[Collections.Generic.List[object]]::new();$pending=[Collections.Generic.Stack[object]]::new();foreach($type in $assembly.MainModule.Types){$pending.Push($type)}
 while($pending.Count){$type=$pending.Pop();$types.Add($type);foreach($nested in $type.NestedTypes){$pending.Push($nested)}}
 $entry=@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Rph.PlayableEntry')[0]
 $mains=@($types|ForEach-Object {$_.Methods}|Where-Object {$_.IsPublic -and $_.IsStatic -and $_.Name -ceq 'Main'})
 $unloads=@($types|ForEach-Object {$_.Methods}|Where-Object {$_.IsPublic -and $_.IsStatic -and $_.Name -ceq 'OnUnload'})
 if($mains.Count -ne 1 -or $unloads.Count -ne 1 -or $mains[0].DeclaringType -ne $entry -or $unloads[0].DeclaringType -ne $entry){throw 'Passive plugin must have one public Main/OnUnload pair.'}
 $attributes=@($assembly.CustomAttributes|Where-Object {$_.AttributeType.FullName -ceq 'Rage.Attributes.PluginAttribute'})
 if($attributes.Count -ne 1){throw 'Passive plugin must have exactly one genuine Plugin attribute.'}
 $targets=@{};foreach($field in @($attributes[0].Fields)+@($attributes[0].Properties)){$targets[$field.Name]=$field.Argument.Value}
 if($targets.EntryPoint -cne 'RichAudio.Beacon.Rph.PlayableEntry.Main' -or $targets.ExitPoint -cne 'RichAudio.Beacon.Rph.PlayableEntry.OnUnload'){throw 'Plugin attribute entry/exit targets differ.'}
 $allCalls=@($types|ForEach-Object {$_.Methods}|Where-Object HasBody|ForEach-Object {$_.Body.Instructions}|Where-Object {$_.Operand -is [Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($allCalls|Where-Object {$_.Name -ceq 'get_EngineRevolutionsRatio'}).Count){throw 'Legacy engine getter must be absent from the passive binary.'}
 $mainCalls=@($mains[0].Body.Instructions|Where-Object {$_.Operand -is [Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($mainCalls|Where-Object {$_.DeclaringType.FullName -ceq 'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry' -and $_.Name -ceq 'Run'}).Count -ne 1){throw 'Main must call the passive entry exactly once.'}
 $passive=@($types|Where-Object {$_.FullName -ceq 'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry' -or $_.FullName.StartsWith('RichAudio.Beacon.Rph.ShvPassiveHandoffEntry/')}|ForEach-Object {$_.Methods}|Where-Object HasBody|ForEach-Object {$_.Body.Instructions}|Where-Object {$_.Operand -is [Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($passive|Where-Object {$_.DeclaringType.FullName -match 'GameplayRuntime|GameplayPublisher|WindowsHost|Process|InGameMenu' -and $_.Name -match '^Start$|^\.ctor$|Configure|Publish'}).Count){throw 'Passive entry must not activate a gameplay/audio host, publisher or product menu service.'}
 $inspection=[ordered]@{exactPublicEntryPair=$true;pluginAttributeTargetsChecked=$true;mainCallsPassiveRun=$true;legacyEngineGetterReferences=0;passiveEntryHostActivationCalls=0;passiveEntryProductMenuStarts=0;codeExecuted=$false}
}finally{$stream.Dispose()}
foreach($pin in @($preserved)+@($protected)){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Prior/protected input changed during compilation.'}}
$binarySha=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant()
$template=[ordered]@{schema=1;profile='PLAYABLE-09';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';gamePath=$pins.GamePath;gameSha256=$pins.GameSha256;gameVersion=$pins.GameVersion;shvPath=$pins.ShvPath;shvSha256=$pins.ShvSha256;loaderPath=$pins.LoaderPath;loaderSha256=$pins.LoaderSha256;rphPath=$pins.RphPath;rphSha256=$pins.RphSha256;rphVersion=$pins.RphVersion;producerPath=$pins.ProducerPath;producerSha256=$pins.ProducerSha256;callerAssemblySha256=$binarySha;passiveOnly=$true;audioPlaybackAllowed=$false;fixtureOnly=$false;identityMode='read-only-sdk-ordinary-reuse';counterWrapAddressAbaExcluded=$true}
$template|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $output 'session-lease-template.json') -Encoding utf8
$sourceManifestPath=Join-Path $output 'passive-build-source-manifest.json';$sourceManifest=Get-Content -LiteralPath $sourceManifestPath -Raw|ConvertFrom-Json
$receipt=[ordered]@{schema=1;profile='PLAYABLE-09';builtUtc=[DateTime]::UtcNow.ToString('o');pluginPath=$binary;pluginSha256=$binarySha;pluginBytes=(Get-Item -LiteralPath $binary).Length;producerSha256=$producerSha;producerBuildReceiptSha256=(Get-FileHash -LiteralPath $producerBuildPath).Hash.ToLowerInvariant();sdkSha256=(Get-FileHash -LiteralPath $SdkPath).Hash.ToLowerInvariant();policySourceSha256=(Get-FileHash -LiteralPath $policyPath).Hash.ToLowerInvariant();sourceManifestSha256=(Get-FileHash -LiteralPath $sourceManifestPath).Hash.ToLowerInvariant();sources=$sourceManifest.sources;staticInspection=$inspection;preservedPriorPinCount=$preserved.Count;protectedFileCount=11;shortcutAndSettingsCount=4;preservedAndProtectedInputsUnchanged=$true;passiveOnly=$true;audioPlaybackAllowed=$false;liveHandoffReady=$false;runtimeCompatibilityEstablished=$false;sessionTemplateRequiresFreshActualProcessIdentity=$true;identityLimit='Read-only bounded SDK ordinary-reuse checks; full unobserved8-bit counter-wrap plus address ABA excluded.';gameFilesWritten=$false;deployed=$false;gameExecuted=$false;endpointOpened=$false;newSystemSoftwareInstalled=$false}
$receipt.builderSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
$receipt.bridgeBuilderSha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1')).Hash.ToLowerInvariant()
$receipt.authorisedToolingChange=[ordered]@{name='tools/Build-BeaconBridge.ps1';acceptedOriginalSha256='f8a2a1dce3072d91346357db99a90b7110bdb7ded420304a5e114f8b1f42a94a';acceptedOriginalPreservedPath=(Join-Path $repo '.local/playable-09/preserved-build-beacon/Build-BeaconBridge.ps1');currentSha256=$receipt.bridgeBuilderSha256;currentFoundationFilesStillByteIdentical=23;originalFoundationFilesPreserved=24}
$receiptPath=Join-Path $output 'passive-handoff-build-receipt.json';$receipt|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output ('PASS passive SDK bridge compiled/static-inspected only; '+$receiptPath)
