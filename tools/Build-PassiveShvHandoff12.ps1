#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){
 for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build/input paths are forbidden.'}
 }
}
function CheckPins($Pins){foreach($pin in $Pins){Unlinked $pin.path;if((Hash $pin.path)-ne$pin.sha256-or(Get-Item -LiteralPath $pin.path).Length-ne$pin.bytes){throw ('Preserved input differs: '+$pin.name)}}}
$baselinePath=Join-Path $repo '.local/playable-12/baseline.json'
if((Hash $baselinePath)-cne'15ad58db0e0c811498ea436a49874a14f93980bbe7712d8fbc831d2984df3b79'){throw 'PLAYABLE-12 preservation baseline differs.'}
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-12'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Incomplete PLAYABLE-12 baseline.'}
$immutableTracked=@($baseline.tracked|Where-Object {$_.name-match'^(docs/|evidence/|config/)'})
$preserved=@($baseline.private)+@($baseline.local11)+@($immutableTracked)
$protected=@($baseline.protected)+@($baseline.settings)
CheckPins (@($preserved)+@($protected))
$gamePin=@($baseline.protected|Where-Object name -ceq 'GTA5_Enhanced.exe')
if($gamePin.Count-ne1){throw 'Missing game baseline.'}
$gameRoot=Split-Path -Parent $gamePin[0].path
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-12/passive-bridge-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-12')).TrimEnd('\')+'\'
if(!($output+'\').StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or$output.TrimEnd('\')-eq$allowed.TrimEnd('\')){throw 'Build output must be a new subdirectory of .local/playable-12.'}
Unlinked $output
if(Test-Path -LiteralPath $output){throw 'Build output must be new; no receipt or historical build is overwritten.'}
$producerBuildPath=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json'
if((Hash $producerBuildPath)-cne'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'){throw 'Frozen producer receipt differs.'}
$producerBuild=Get-Content -LiteralPath $producerBuildPath -Raw|ConvertFrom-Json
$producerSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
Unlinked $producerBuild.Candidate.Path
if($producerBuild.Candidate.Sha256-cne$producerSha-or(Hash $producerBuild.Candidate.Path)-cne$producerSha-or(Get-Item -LiteralPath $producerBuild.Candidate.Path).Length-ne129024){throw 'Frozen producer artifact differs.'}
foreach($pin in $producerBuild.SourceInputs){$path=Join-Path $repo ($pin.Name-creplace'^repo/','');Unlinked $path;if((Hash $path)-cne$pin.Sha256){throw 'Frozen native source differs.'}}
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'}
Unlinked $SdkPath
if((Hash $SdkPath)-cne'5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'){throw 'Authentic pinned compilation SDK required; no substitution or download.'}
$pins=[ordered]@{
 WorkspaceRoot=$repo;GamePath=(Join-Path $gameRoot 'GTA5_Enhanced.exe');GameVersion='1.0.1158.16';GameSha256='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'
 ShvPath=(Join-Path $gameRoot 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f'
 LoaderPath=(Join-Path $gameRoot 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d'
 ProducerPath=(Join-Path $gameRoot 'RichAudio.OperatingState.ShvHandoff.asi');ProducerSha256=$producerSha
 LeasePath=(Join-Path $gameRoot 'Plugins/RichAudio.ShvHandoff.json')
}
[IO.Directory]::CreateDirectory($output)|Out-Null
$policyPath=Join-Path $output 'ShvHandoffBuildPolicy.generated.cs'
$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {')
foreach($name in $pins.Keys){$lines+='internal const string '+$name+' = @"'+$pins[$name].Replace('"','""')+'";'}
$lines+='} }';$lines|Set-Content -LiteralPath $policyPath -Encoding utf8
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $SdkPath -Playable -ShvHandoff -ShvHandoffPolicySource $policyPath -Output $output
if($LASTEXITCODE-ne0){throw 'Managed passive build failed.'}
$binary=Join-Path $output 'RichAudio.Beacon.Rph.dll'
if(!(Test-Path -LiteralPath $binary -PathType Leaf)){throw 'Managed passive image is missing.'}
$reader=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll'
if((Hash $reader)-cne'0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Static reader pin differs.'}
Add-Type -Path $reader
$stream=[IO.File]::OpenRead($binary)
try{
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($stream)
 $types=[Collections.Generic.List[object]]::new();$pending=[Collections.Generic.Stack[object]]::new();foreach($type in $assembly.MainModule.Types){$pending.Push($type)}
 while($pending.Count){$type=$pending.Pop();$types.Add($type);foreach($nested in $type.NestedTypes){$pending.Push($nested)}}
 $entry=@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Rph.PlayableEntry')[0]
 $mains=@($types|ForEach-Object {$_.Methods}|Where-Object {$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'Main'})
 $unloads=@($types|ForEach-Object {$_.Methods}|Where-Object {$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'OnUnload'})
 if($mains.Count-ne1-or$unloads.Count-ne1-or$mains[0].DeclaringType-ne$entry-or$unloads[0].DeclaringType-ne$entry){throw 'Expected one public Main/OnUnload pair.'}
 $attributes=@($assembly.CustomAttributes|Where-Object {$_.AttributeType.FullName-ceq'Rage.Attributes.PluginAttribute'})
 if($attributes.Count-ne1){throw 'Expected one genuine RPH Plugin attribute.'}
 $targets=@{};foreach($field in @($attributes[0].Fields)+@($attributes[0].Properties)){$targets[$field.Name]=$field.Argument.Value}
 if($targets.EntryPoint-cne'RichAudio.Beacon.Rph.PlayableEntry.Main'-or$targets.ExitPoint-cne'RichAudio.Beacon.Rph.PlayableEntry.OnUnload'){throw 'Plugin entry/exit targets differ.'}
 $calls=@($types|ForEach-Object {$_.Methods}|Where-Object HasBody|ForEach-Object {$_.Body.Instructions}|Where-Object {$_.Operand-is[Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($calls|Where-Object {$_.Name-ceq'get_EngineRevolutionsRatio'}).Count){throw 'Broken revolution getter is forbidden.'}
 $mainCalls=@($mains[0].Body.Instructions|Where-Object {$_.Operand-is[Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 $wrapper=@($entry.Methods|Where-Object Name -ceq 'RunPassive')
 if($wrapper.Count-ne1-or($wrapper[0].ImplAttributes-band[Mono.Cecil.MethodImplAttributes]::NoInlining)-eq0-or@($mainCalls|Where-Object {$_.DeclaringType.FullName-ceq$entry.FullName-and$_.Name-ceq'RunPassive'}).Count-ne1){throw 'Main must call the unique NoInlining passive wrapper once.'}
 $wrapperCalls=@($wrapper[0].Body.Instructions|Where-Object {$_.Operand-is[Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($wrapperCalls|Where-Object {$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry'-and$_.Name-ceq'Run'}).Count-ne1){throw 'Wrapper must call passive Run exactly once.'}
 $passiveCalls=@($types|Where-Object {$_.FullName-ceq'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry'-or$_.FullName.StartsWith('RichAudio.Beacon.Rph.ShvPassiveHandoffEntry/')}|ForEach-Object {$_.Methods}|Where-Object HasBody|ForEach-Object {$_.Body.Instructions}|Where-Object {$_.Operand-is[Mono.Cecil.MethodReference]}|ForEach-Object {$_.Operand})
 if(@($passiveCalls|Where-Object {$_.DeclaringType.FullName-match'GameplayRuntime|GameplayPublisher|WindowsHost|Process|InGameMenu'-and$_.Name-match'^Start$|^\.ctor$|Configure|Publish'}).Count){throw 'Passive entry must not activate gameplay/audio/menu services.'}
 $inspection=[ordered]@{exactPublicEntryPair=$true;pluginAttributeTargetsChecked=$true;mainCallsNoInliningWrapper=$true;wrapperCallsPassiveRun=$true;legacyEngineGetterReferences=0;passiveEntryHostActivationCalls=0;passiveEntryProductMenuStarts=0;codeExecuted=$false}
}finally{$stream.Dispose()}
CheckPins (@($preserved)+@($protected))
$binarySha=Hash $binary
$template=[ordered]@{schema=1;profile='PLAYABLE-12';runtimePolicy='functional-compatibility';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';gamePath=$pins.GamePath;gameSha256=$pins.GameSha256;gameVersion=$pins.GameVersion;shvPath=$pins.ShvPath;shvSha256=$pins.ShvSha256;loaderPath=$pins.LoaderPath;loaderSha256=$pins.LoaderSha256;producerPath=$pins.ProducerPath;producerSha256=$pins.ProducerSha256;callerAssemblySha256=$binarySha;passiveOnly=$true;audioPlaybackAllowed=$false;fixtureOnly=$false;identityMode='read-only-sdk-ordinary-reuse';counterWrapAddressAbaExcluded=$true}
if($template.Count-ne21){throw 'Expected exact21-field functional lease.'}
$template|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $output 'session-lease-template.json') -Encoding utf8
$sourceManifestPath=Join-Path $output 'passive-build-source-manifest.json'
$sourceManifest=Get-Content -LiteralPath $sourceManifestPath -Raw|ConvertFrom-Json
if($sourceManifest.profile-cne'PLAYABLE-12'){throw 'Wrong compiled source profile.'}
foreach($pin in $sourceManifest.sources){Unlinked $pin.path;if((Hash $pin.path)-cne$pin.sha256){throw 'Compiled source pin differs.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-12';runtimePolicy='functional-compatibility';builtUtc=[DateTime]::UtcNow.ToString('o');pluginPath=$binary;pluginSha256=$binarySha;pluginBytes=(Get-Item -LiteralPath $binary).Length;producerSha256=$producerSha;producerBuildReceiptSha256=(Hash $producerBuildPath);sdkSha256=(Hash $SdkPath);policySourceSha256=(Hash $policyPath);sourceManifestSha256=(Hash $sourceManifestPath);sources=$sourceManifest.sources;staticInspection=$inspection;baselineSha256=(Hash $baselinePath);preservedPrivateAnd11PinCount=$preserved.Count;protectedFileCount=11;shortcutAndSettingsCount=4;preservedAndProtectedInputsUnchanged=$true;passiveOnly=$true;audioPlaybackAllowed=$false;liveHandoffReady=$false;runtimeCompatibilityEstablished=$false;runtimeDistributionAuthenticated=$false;launcherAndApiEqualityRequired=$false;apiHashWhitelistUsed=$false;sessionTemplateRequiresFreshActualProcessIdentity=$true;leaseFieldCount=21;identityLimit='Read-only bounded SDK ordinary-reuse checks; full unobserved8-bit counter-wrap plus address ABA excluded.';gameFilesWritten=$false;deployed=$false;gameExecuted=$false;endpointOpened=$false;newSystemSoftwareInstalled=$false;builderSha256=(Hash $PSCommandPath);bridgeBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1'))}
$receipt.runtimePolicyLimit='Functional compatibility is a scoped passive-test policy, not distribution authenticity or protection against equivalent-privilege in-process code. Launcher baseline hashes support reproducibility/restoration only.'
$receipt.preservedImmutableTrackedPinCount=$immutableTracked.Count
$receiptPath=Join-Path $output 'passive-handoff-build-receipt.json'
$receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output ('PASS passive functional-policy bridge compiled/static-inspected only; '+$receiptPath)
