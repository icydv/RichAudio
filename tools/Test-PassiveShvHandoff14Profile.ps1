#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked validation paths refused.'}}}
function FourteenPath([string]$Path){$full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-14')).TrimEnd('\')+'\';if(!$full.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'New14-only validation input/output required.'};Unlinked $full;return $full}
$receiptPath=FourteenPath $BuildReceipt;$receiptSha=Hash $receiptPath;$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($build.profile-cne'PLAYABLE-14'-or$build.mode-cne'passive'-or$build.passiveOnly-ne$true-or$build.audioPlaybackAllowed-ne$false-or$build.gameLaunched-ne$false-or$build.endpointOpened-ne$false-or$build.audibleRebuilt-ne$false-or$build.hostRebuilt-ne$false){throw 'Exact unexecuted passive14 build required.'}
$binary=FourteenPath $build.passive.pluginPath
if((Hash $binary)-cne$build.passive.pluginSha256-or(Get-Item -LiteralPath $binary).Length-ne$build.passive.pluginBytes){throw 'Actual passive14 image differs.'}
$sources=@($build.passive.sources);if($sources.Count-lt47){throw 'Incomplete actual compiled source manifest.'};foreach($pin in $sources){Unlinked $pin.path;if((Hash $pin.path)-cne$pin.sha256){throw 'Current compiled source changed.'}}
$reader=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll';Unlinked $reader
if((Hash $reader)-cne'0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Authentic retained metadata reader differs.'}
Add-Type -Path $reader
function Types($Assembly){
 $values=[Collections.Generic.List[object]]::new();$pending=[Collections.Generic.Stack[object]]::new()
 foreach($type in $Assembly.MainModule.Types){$pending.Push($type)}
 while($pending.Count){$type=$pending.Pop();$values.Add($type);foreach($nested in $type.NestedTypes){$pending.Push($nested)}}
 return $values.ToArray()
}
function Calls($Method){if($Method.HasBody){return @($Method.Body.Instructions|Where-Object{$_.Operand-is[Mono.Cecil.MethodReference]})}return @()}
function CheckProfile($Assembly){
 $types=@(Types $Assembly);$methods=@($types|ForEach-Object{$_.Methods})
 $entry=@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Rph.PlayableEntry')
 $main=@($methods|Where-Object{$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'Main'})
 $unload=@($methods|Where-Object{$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'OnUnload'})
 if($entry.Count-ne1-or$main.Count-ne1-or$unload.Count-ne1-or$main[0].DeclaringType-ne$entry[0]-or$unload[0].DeclaringType-ne$entry[0]){throw 'Expected one exact public product lifecycle pair.'}
 $attrs=@($Assembly.CustomAttributes|Where-Object{$_.AttributeType.FullName-ceq'Rage.Attributes.PluginAttribute'})
 if($attrs.Count-ne1){throw 'Expected one SDK plugin attribute.'}
 $targets=@{};foreach($v in @($attrs[0].Fields)+@($attrs[0].Properties)){$targets[$v.Name]=$v.Argument.Value}
 if($targets.EntryPoint-cne'RichAudio.Beacon.Rph.PlayableEntry.Main'-or$targets.ExitPoint-cne'RichAudio.Beacon.Rph.PlayableEntry.OnUnload'){throw 'Plugin entry/exit target differs.'}
 if($targets.PrefersSingleInstance-ne$true-or$targets.ShouldTickInPauseMenu-ne$true){throw 'Single-instance/cooperative pause-menu lifecycle attributes differ.'}
 if(@($methods|ForEach-Object{Calls $_}|Where-Object{$_.Operand.Name-ceq'get_EngineRevolutionsRatio'}).Count){throw 'Legacy RPH revolution getter is forbidden anywhere in the passive image.'}
 $wrapper=@($entry[0].Methods|Where-Object{$_.Name-ceq'RunPassive'-and$_.IsStatic-and!$_.IsPublic})
 if($wrapper.Count-ne1-or$wrapper[0].ImplAttributes.ToString()-notmatch'NoInlining'){throw 'Passive lifecycle requires one non-inlined invocation boundary.'}
 $mainCalls=@(Calls $main[0]);$wrapperCalls=@(Calls $wrapper[0])
 if(@($mainCalls|Where-Object{$_.Operand.FullName-ceq$wrapper[0].FullName}).Count-ne1-or@($wrapperCalls|Where-Object{$_.Operand.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry'-and$_.Operand.Name-ceq'Run'}).Count-ne1){throw 'Main must invoke the protected passive Run boundary exactly once.'}
 $catches=@($main[0].Body.ExceptionHandlers|Where-Object{$_.HandlerType-ceq'Catch'}|ForEach-Object{$_.CatchType.FullName})
 if('System.Threading.ThreadAbortException'-notin$catches-or'System.Exception'-notin$catches){throw 'Main must preserve the lifecycle/JIT exception boundary.'}
 $index=@{};foreach($m in $methods){$index[$m.FullName]=$m}
 $roots=@($main[0],$unload[0])+@($methods|Where-Object{$_.IsPublic-and$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry'})
 $pending=[Collections.Generic.Queue[object]]::new();foreach($m in $roots){$pending.Enqueue($m)}
 $reached=@{};$external=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
 $forbidden='BatiPlaybackSession|GameplayRecording|GameplayRuntime|GameplayPublisher|WindowsHost|AudioHost|Wasapi|WaveOut|XAudio|InGameMenu|InGameRecording|PassiveListener|PassiveSoundMap|RecordingSession|SynchronizedAudio|RphRuntimeProvenance|RphProvenance'
 while($pending.Count){
  $m=$pending.Dequeue();if($reached.ContainsKey($m.FullName)){continue};$reached[$m.FullName]=$m
  if($m.DeclaringType.FullName-match$forbidden){throw ('Forbidden reachable lifecycle/service type: '+$m.DeclaringType.FullName)}
  foreach($initializer in @($m.DeclaringType.Methods|Where-Object{$_.IsConstructor-and$_.IsStatic})){if(!$reached.ContainsKey($initializer.FullName)){$pending.Enqueue($initializer)}}
  if(!$m.HasBody){continue}
  foreach($i in $m.Body.Instructions){
   if($i.OpCode.Name-in@('ldfld','ldsfld')-and$i.Operand-is[Mono.Cecil.FieldReference]-and$i.Operand.Name-match'^(RphPath|RphSha256|RphVersion|LauncherSha256|ExpectedApiSha256|ReviewedEvidenceDigests)$'){throw 'Reachable legacy RPH distribution policy operand remains.'}
   if($i.OpCode.Name-ceq'ldstr'-and[string]$i.Operand-in@('actual-rph-runtime-bytes-or-version-unreviewed','api-runtime-policy-unreviewed','rphSha256','rphPath','rphVersion')){throw 'Reachable old RPH distribution gate/lease remains.'}
   if($i.Operand-isnot[Mono.Cecil.MethodReference]){continue}
   $call=$i.Operand;$type=$call.DeclaringType.GetElementType().FullName
   if($type-match$forbidden){throw ('Forbidden reachable service call: '+$call.FullName)}
   if(($type-ceq'System.Diagnostics.Process'-and$call.Name-in@('Start','Kill'))-or($type-ceq'System.Activator'-and$call.Name-ceq'CreateInstance')-or($type-ceq'System.Delegate'-and$call.Name-ceq'DynamicInvoke')-or($type-match'^System.Reflection.'-and$call.Name-match'^(Load|LoadFrom|LoadFile|LoadModule|Invoke|ReflectionOnlyLoad|ReflectionOnlyLoadFrom)$')-or$call.Name-match'^(LoadLibrary|LoadLibraryW|LoadLibraryA|NativeInit|NativePush|NativeCall)$'){throw ('Forbidden reachable activation/dynamic route: '+$call.FullName)}
   if($type-ceq'Rage.Native.NativeFunction'-and($call.Name-cne'CallByName'-or$m.DeclaringType.FullName-cne'RichAudio.Beacon.Rph.CameraSampler')){throw 'Unexpected direct RPH native route in passive lifecycle.'}
   $key=$call.GetElementMethod().FullName
   if($index.ContainsKey($key)){$pending.Enqueue($index[$key])}else{[void]$external.Add($call.FullName)}
  }
 }
 $nativeNames=@('NETWORK_IS_SESSION_STARTED','NETWORK_IS_GAME_IN_PROGRESS','PLAYER_ID','PLAYER_PED_ID','IS_PLAYER_PLAYING','DOES_ENTITY_EXIST','IS_PLAYER_SWITCH_IN_PROGRESS','GET_FINAL_RENDERED_CAM_COORD','GET_FINAL_RENDERED_CAM_ROT','GET_GAME_TIMER')
 $camera=@($reached.Values|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.CameraSampler'})
 foreach($m in $camera){foreach($i in $m.Body.Instructions){if($i.OpCode.Name-ceq'ldstr'-and[string]$i.Operand-notin$nativeNames){throw 'Unexpected native name in read-only camera/story sampler.'}}}
 $ctor=@($reached.Values|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvProducerModule'-and$_.IsConstructor-and!$_.IsStatic})
 if($ctor.Count-ne1){throw 'Actual loaded-producer admission is unreachable.'}
 $pinCalls=@(Calls $ctor[0]|Where-Object{$_.Operand.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvProducerModule'-and$_.Operand.Name-ceq'Pin'})
 if($pinCalls.Count-ne5){throw 'Expected five retained game/SHV/loader/producer/caller artifact pins.'}
 $required=@(@('GamePath','GameSha256'),@('ShvPath','ShvSha256'),@('LoaderPath','LoaderSha256'),@('ProducerPath','ProducerSha256'))
 for($n=0;$n-lt5;$n++){
  $at=$ctor[0].Body.Instructions.IndexOf($pinCalls[$n]);$before=@($ctor[0].Body.Instructions|Select-Object -Skip ([Math]::Max(0,$at-6)) -First 6)
  $fields=@($before|Where-Object{$_.Operand-is[Mono.Cecil.FieldReference]}|ForEach-Object{$_.Operand.Name})
  if($n-lt4){foreach($field in $required[$n]){if($field-notin$fields){throw 'Required qualified-stack/own artifact pin lost its operand.'}}}
  elseif('CallerAssemblySha256'-notin$fields-or!@($before|Where-Object{$_.Operand-is[Mono.Cecil.MethodReference]-and$_.Operand.Name-ceq'get_Location'}).Count){throw 'Actual caller artifact ownership pin is missing.'}
 }
 foreach($m in $reached.Values|Where-Object IsPInvokeImpl){
  $allowed=@('GetProcAddress','GetModuleHandleExW','GetProcessTimes')
  if($m.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvHandoffJournal'){$allowed=@('CreateDirectoryW','CreateFileW','GetFileInformationByHandle')}
  if($m.PInvokeInfo.Module.Name-notmatch'^kernel32(\.dll)?$'-or$m.PInvokeInfo.EntryPoint-notin$allowed){throw ('Unexpected unmanaged route in reachable passive lifecycle: '+$m.FullName)}
  if($m.PInvokeInfo.EntryPoint-ceq'GetProcAddress'-and$m.DeclaringType.FullName-cne'RichAudio.Beacon.Handoff.ShvProducerModule'){throw 'Dynamic export lookup is limited to the owned producer accessor.'}
 }
 $absent=@($types|Where-Object{$_.FullName-match'BatiPlaybackSession|RphRuntimeProvenance|RphProvenance'})
 if($absent.Count){throw 'Bati playback or distribution-provenance types must not exist in the passive14 image.'}
 $required=@(@('RichAudio.Beacon.Rph.ShvPassiveHandoffEntry','AcquireFreshInitialBinding'),@('RichAudio.Beacon.Rph.ShvPassiveHandoffEntry','ReadPrebindContext'),@('RichAudio.Beacon.Rph.ShvPassiveHandoffEntry','RetainPrebind'),@('RichAudio.Beacon.Handoff.TrustedShvComposition','InspectInitialBinding'),@('RichAudio.Beacon.Handoff.TrustedShvComposition','TryInitialBind'))
 foreach($pair in $required){if(!@($reached.Values|Where-Object{$_.DeclaringType.FullName-ceq$pair[0]-and$_.Name-ceq$pair[1]}).Count){throw ('New reachable14 gate missing: '+$pair[1])}}
 $reachableCalls=@($reached.Values|ForEach-Object{Calls $_})
 if(!@($reachableCalls|Where-Object{$_.Operand.DeclaringType.FullName-ceq'Rage.GameConsole'-and$_.Operand.Name-ceq'get_IsOpen'}).Count){throw 'Typed console-closed admission is absent from the actual image.'}
 $strings=@($reached.Values|Where-Object HasBody|ForEach-Object{$_.Body.Instructions}|Where-Object{$_.OpCode.Name-ceq'ldstr'}|ForEach-Object{[string]$_.Operand})
 foreach($reason in @('PLAYABLE-14','waiting-context-not-refreshing','prebind-diagnostic-write-failed','source-context-outside-map-window','clock-map-unavailable','clock-map-expired','source-context-stale-or-future','peer-observation-stale-or-future','binding-peer-skew-exceeded','source-context-not-bracketed','prebind-readiness')){if($reason-notin$strings){throw ('Reachable14 diagnostic/gate reason missing: '+$reason)}}
 $composition=@($types|Where-Object FullName -CEQ 'RichAudio.Beacon.Handoff.TrustedShvComposition')
 foreach($pair in @(@('PrebindMaximumWaitMilliseconds',10000),@('PrebindMaximumAttempts',200),@('PrebindPollMilliseconds',50),@('PrebindBracketWaitMilliseconds',40),@('PrebindMaximumBracketReads',8))){$field=@($composition[0].Fields|Where-Object Name -CEQ $pair[0]);if($field.Count-ne1-or!$field[0].HasConstant-or$field[0].Constant-ne$pair[1]){throw ('Exact bounded gate constant differs: '+$pair[0])}}
 $policy=@($types|Where-Object FullName -CEQ 'RichAudio.Beacon.Handoff.ShvOperatingStateHandoff')
 foreach($pair in @(@('MaximumAgeMs',250),@('MaximumBracketMs',250),@('MaximumPeerSkewMs',50),@('MaximumFutureMs',2),@('MaximumMapLifetimeMs',5000),@('MaximumDriftPpm',100))){$field=@($policy[0].Fields|Where-Object Name -CEQ $pair[0]);if($field.Count-ne1-or!$field[0].HasConstant-or$field[0].Constant-ne$pair[1]){throw ('Original freshness/map policy differs: '+$pair[0])}}
 return [ordered]@{exactPublicLifecyclePair=$true;pluginAttributeTargetsChecked=$true;mainCallsPassiveRun=$true;protectedNonInlinedLifecycleBoundary=$true;reachableMethods=$reached.Count;delegateTargetsAndTypeInitializersTraversed=$true;legacyRevolutionGetterReferences=0;reachableHostMenuRecordingActivation=0;reachableRphDistributionGates=0;retainedArtifactPins=5;nativeRoutes='Existing read-only camera/story RPH calls and owned loaded-producer ABI only';actualPluginExecuted=$false;analysisLimit='Static intra-module graph includes method references, delegate targets and reached-type initializers; arbitrary external SDK internals are not analyzed.'}
}

$assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($binary)
try{$inspection=CheckProfile $assembly
 $attributes=@($assembly.CustomAttributes|Where-Object{$_.AttributeType.FullName-ceq'Rage.Attributes.PluginAttribute'})
 $description=@((@($attributes[0].Fields)+@($attributes[0].Properties))|Where-Object Name -CEQ 'Description')
 if($description.Count-ne1-or[string]$description[0].Argument.Value-notlike'PLAYABLE-14 passive*'){throw 'Actual plugin description does not identify passive14.'}
}finally{if($assembly-is[IDisposable]){([IDisposable]$assembly).Dispose()}}
foreach($pin in $sources){if((Hash $pin.path)-cne$pin.sha256){throw 'Source drift during inspection.'}};if((Hash $receiptPath)-cne$receiptSha-or(Hash $binary)-cne$build.passive.pluginSha256){throw 'Artifact drift during metadata inspection.'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-14/profile-validation-'+[Guid]::NewGuid().ToString('N'))};$output=FourteenPath $OutputRoot
if(Test-Path -LiteralPath $output){throw 'Metadata inspection output must be new.'};[IO.Directory]::CreateDirectory($output)|Out-Null
$result=[ordered]@{schema=1;profile='PLAYABLE-14';kind='actual-passive-image-static-lifecycle-callgraph-and-new-prebinding-gate';runtimePolicy='functional-compatibility';passed=$true;buildReceiptSha256=$receiptSha;passivePluginSha256=(Hash $binary);pluginBytes=(Get-Item -LiteralPath $binary).Length;staticInspection=$inspection;newGateAndConsoleReferencesReachable=$true;exactPrebindingWaitMilliseconds=10000;exactMaximumPrebindingAttempts=200;originalFreshnessMs=250;originalPeerSkewMs=50;originalMapLifetimeMs=5000;absentBatiPlaybackTypes=$true;absentProvenanceTypes=$true;sources=$sources;runnerSha256=(Hash $PSCommandPath);metadataReaderSha256=(Hash $reader);defaultProductRebuilt=$false;audibleRebuilt=$false;actualCandidateExecuted=$false;actualRphExecuted=$false;actualShvExecuted=$false;gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayed=$false;limits='Only Cecil metadata of the exact authentic-SDK passive14 image. Static intra-module lifecycle references are traced; external SDK internals, live compatibility, game behaviour, actual device output and human listening remain unverified.'}
$path=Join-Path $output 'validation.json';[IO.File]::WriteAllText($path,($result|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
Write-Output ('PASS exact passive14 compiled profile only; no candidate execution: '+$path)
