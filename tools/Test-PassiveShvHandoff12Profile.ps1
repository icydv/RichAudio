#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BuildReceipt,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){
 for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked validation paths are forbidden.'}
 }
}
function TwelvePath([string]$Path){
 $full=[IO.Path]::GetFullPath($Path)
 $root=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-12')).TrimEnd('\')+'\'
 if(!($full+'\').StartsWith($root,[StringComparison]::OrdinalIgnoreCase)-or$full.TrimEnd('\')-eq$root.TrimEnd('\')){throw 'Validation inputs/outputs must remain below .local/playable-12.'}
 Unlinked $full
 return $full
}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-12/profile-validation-'+[Guid]::NewGuid().ToString('N'))}
$output=TwelvePath $OutputRoot
if(Test-Path -LiteralPath $output){throw 'Validation output must be new; historical outputs are never overwritten.'}
$receiptPath=TwelvePath $BuildReceipt
if((Get-Item -LiteralPath $receiptPath).Length-gt262144){throw 'Build receipt size exceeds validation bound.'}
$receiptSha=Hash $receiptPath
$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($build.profile-cne'PLAYABLE-12'-or$build.runtimePolicy-cne'functional-compatibility'-or!$build.passiveOnly-or$build.audioPlaybackAllowed-ne$false-or$build.liveHandoffReady-ne$false-or$build.gameExecuted-ne$false-or$build.endpointOpened-ne$false){throw 'Expected unexecuted passive functional-policy build receipt.'}
$binary=TwelvePath $build.pluginPath
if((Hash $binary)-cne$build.pluginSha256-or(Get-Item -LiteralPath $binary).Length-ne$build.pluginBytes){throw 'Actual plugin differs from reviewed build receipt.'}
$sdk=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$reader=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll'
foreach($pin in @(@($sdk,'5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'),@($compiler,'46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'),@($reader,'0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'))){Unlinked $pin[0];if((Hash $pin[0])-cne$pin[1]){throw 'Existing authentic compiler/SDK/metadata-reader prerequisite differs.'}}
if($build.sdkSha256-cne(Hash $sdk)){throw 'Build SDK identity differs.'}
$sources=@(foreach($pin in $build.sources){
 $path=[IO.Path]::GetFullPath($pin.path);Unlinked $path
 if((Hash $path)-cne$pin.sha256){throw 'Compiled source differs from receipt.'}
 [ordered]@{path=$path;sha256=$pin.sha256}
})
if($sources.Count-lt15){throw 'Incomplete compiled source manifest.'}
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
 $forbidden='GameplayRuntime|GameplayPublisher|WindowsHost|AudioHost|Wasapi|WaveOut|XAudio|InGameMenu|InGameRecording|PassiveListener|PassiveSoundMap|RecordingSession|SynchronizedAudio|RphRuntimeProvenance|RphProvenance'
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
 return [ordered]@{exactPublicLifecyclePair=$true;pluginAttributeTargetsChecked=$true;mainCallsPassiveRun=$true;protectedNonInlinedLifecycleBoundary=$true;reachableMethods=$reached.Count;delegateTargetsAndTypeInitializersTraversed=$true;legacyRevolutionGetterReferences=0;reachableHostMenuRecordingActivation=0;reachableRphDistributionGates=0;retainedArtifactPins=5;nativeRoutes='Existing read-only camera/story RPH calls and owned loaded-producer ABI only';actualPluginExecuted=$false;analysisLimit='Static intra-module graph includes method references, delegate targets and reached-type initializers; arbitrary external SDK internals are not analyzed.'}
}
function ReadAssembly([string]$Path){[Mono.Cecil.AssemblyDefinition]::ReadAssembly($Path)}
function MethodMap($Assembly){
 $map=@{}
 foreach($type in @(Types $Assembly)){foreach($m in $type.Methods){
  $lines=[Collections.Generic.List[string]]::new();$lines.Add($m.Attributes.ToString())
  if($m.HasBody){
   $lines.Add('locals:'+(@($m.Body.Variables|ForEach-Object{$_.VariableType.FullName})-join','))
   foreach($i in $m.Body.Instructions){
    $v=$i.Operand;if($v-is[Array]){$v=@($v|ForEach-Object{$_.ToString()})-join','}
    $s=$i.OpCode.Name+':'+[string]$v
    if($i.Operand-is[Mono.Cecil.FieldReference]-and$i.Operand.DeclaringType.FullName-match'^<PrivateImplementationDetails>'){$s+='|initializer:'+([BitConverter]::ToString($i.Operand.Resolve().InitialValue))}
    $lines.Add(($s-replace'<PrivateImplementationDetails>\{[0-9A-Fa-f-]{36}\}','<PrivateImplementationDetails>'))
   }
   foreach($e in $m.Body.ExceptionHandlers){$lines.Add(([string]$e.HandlerType+':'+$e.TryStart+':'+$e.TryEnd+':'+$e.HandlerStart+':'+$e.HandlerEnd+':'+$e.CatchType))}
  }
  $map[($m.FullName-replace'<PrivateImplementationDetails>\{[0-9A-Fa-f-]{36}\}','<PrivateImplementationDetails>')]=$lines.ToArray()-join"`n"
 }}
 return $map
}
$actual=ReadAssembly $binary
$inspection=CheckProfile $actual
[IO.Directory]::CreateDirectory($output)|Out-Null
$cases=[Collections.Generic.List[string]]::new();$cases.Add('actual-authentic-sdk-passive-lifecycle-and-reachable-profile')
$defaultOutput=Join-Path $output 'default-product-regression'
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $sdk -Playable -Output $defaultOutput
if(!$?){throw 'Default product regression compilation failed.'}
$reference=Join-Path $repo '.local/playable-09/default-regression-current-01/RichAudio.Beacon.Rph.dll';Unlinked $reference
if((Hash $reference)-cne'28cfb8588ac546b90afca569cca62912816a513173a6a04d77d04d00fec14eaa'){throw 'Preserved default product reference differs.'}
$defaultBinary=Join-Path $defaultOutput 'RichAudio.Beacon.Rph.dll'
$left=MethodMap (ReadAssembly $reference);$right=MethodMap (ReadAssembly $defaultBinary)
$differences=@(foreach($key in @(@($left.Keys)+@($right.Keys)|Sort-Object -Unique)){if(!$left.ContainsKey($key)-or!$right.ContainsKey($key)-or$left[$key]-cne$right[$key]){$key}})
if($left.Count-ne655-or$right.Count-ne655-or$differences.Count){throw ('Default product method regression differs: '+($differences-join','))}
$cases.Add('default-product-655-method-bodies-and-metadata-unchanged')
foreach($pin in $sources){if((Hash $pin.path)-cne$pin.sha256){throw 'Compiled source changed during validation.'}}
if((Hash $binary)-cne$build.pluginSha256-or(Hash $receiptPath)-cne$receiptSha){throw 'Actual candidate/build receipt changed during validation.'}
$result=[ordered]@{schema=1;profile='PLAYABLE-12';kind='actual-passive-profile-static-callgraph-and-default-product-regression';runtimePolicy='functional-compatibility';passed=$true;cases=$cases.Count;casesPassed=$cases.ToArray();buildReceiptSha256=$receiptSha;pluginSha256=(Hash $binary);pluginBytes=(Get-Item -LiteralPath $binary).Length;staticInspection=$inspection;defaultProductReferenceSha256=(Hash $reference);defaultProductCurrentSha256=(Hash $defaultBinary);defaultProductMethodCount=$left.Count;defaultProductMethodDifferences=0;sources=$sources;runnerSha256=(Hash $PSCommandPath);compilerSha256=(Hash $compiler);sdkSha256=(Hash $sdk);metadataReaderSha256=(Hash $reader);liveHandoffReady=$false;actualPluginExecuted=$false;actualRphExecuted=$false;actualShvExecuted=$false;gameExecuted=$false;gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayback=$false;limits='Metadata inspection of authentic-SDK candidate and compilation/comparison of default product only. No installed framework or actual candidate executed. Compatibility and integration fixture execution is recorded separately; live compatibility remains unverified.'}
$resultPath=Join-Path $output 'validation.json';$result|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $resultPath -Encoding utf8
Write-Output ('PASS passive12 profile; '+$resultPath)
