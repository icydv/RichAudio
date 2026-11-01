#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[Parameter(Mandatory)][string[]]$ValidationReceipts,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Check([string]$Path,[string]$Sha,[long]$Bytes=-1){if((Hash $Path)-cne$Sha-or($Bytes-ge0-and(Get-Item -LiteralPath $Path).Length-ne$Bytes)){throw ('Exact input differs: '+[IO.Path]::GetFileName($Path))}}
function Local([string]$Path){$full=[IO.Path]::GetFullPath($Path);if(!$full.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Private validation paths required.'};for($at=$full;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked validation path refused.'}};return $full}
$receiptPath=Local $BuildReceipt;$receiptSha=Hash $receiptPath;$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($build.profile-cne'PLAYABLE-15'-or$build.gameFilesWritten-ne$false-or$build.gameLaunched-ne$false-or$build.endpointOpened-ne$false-or$build.hostRebuilt-ne$false-or$build.recorderRebuilt-ne$false){throw 'Offline15 build with preserved host/recorder required.'}
$reader=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll';Check $reader '0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772';Add-Type -Path $reader
function Types($Assembly){$queue=[Collections.Generic.Queue[object]]::new();foreach($type in $Assembly.MainModule.Types){$queue.Enqueue($type)};while($queue.Count){$type=$queue.Dequeue();$type;foreach($child in $type.NestedTypes){$queue.Enqueue($child)}}}
function Calls($Method){if($Method.HasBody){@($Method.Body.Instructions|Where-Object{$_.Operand-is[Mono.Cecil.MethodReference]})}}
$inspection=@{}
foreach($mode in @('passive','audible')){
 $artifact=$build.$mode;Check $artifact.pluginPath $artifact.pluginSha256 $artifact.pluginBytes;Check $artifact.sourceManifestPath $artifact.sourceManifestSha256
 foreach($pin in $artifact.sources){Check $pin.path $pin.sha256}
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($artifact.pluginPath)
 try{
  $types=@(Types $assembly);$methods=@($types|ForEach-Object{$_.Methods});$calls=@($methods|ForEach-Object{Calls $_})
  if(@($methods|Where-Object{$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'Main'}).Count-ne1-or@($methods|Where-Object{$_.IsPublic-and$_.IsStatic-and$_.Name-ceq'OnUnload'}).Count-ne1){throw 'One public product lifecycle required.'}
  if(@($calls|Where-Object{$_.Operand.Name-ceq'get_EngineRevolutionsRatio'}).Count-or@($types|Where-Object{$_.FullName-match'RphRuntimeProvenance|RphProvenance'}).Count){throw 'Legacy ratio/provenance route entered15 image.'}
  $entry=@($methods|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.ShvPassiveHandoffEntry'})
  $entryCalls=@($entry|ForEach-Object{Calls $_})
  foreach($name in @('AcquireFreshInitialBinding','ReadPrebindContext','RetainPrebind')){if(!@($entry|Where-Object Name -ceq $name).Count){throw ('Corrected fresh binding missing: '+$name)}}
  if(!@($entryCalls|Where-Object{$_.Operand.Name-ceq'AcquireFreshInitialBinding'}).Count){throw 'Fresh binding not integrated in entry.'}
  $listener=@($entry|Where-Object Name -ceq 'Listener');$listenerCalls=@(Calls $listener[0])
  if($listener.Count-ne1-or@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Rph.CameraListenerTracker').Count-ne1-or
   @($listenerCalls|Where-Object{$_.Operand.DeclaringType.FullName-ceq'RichAudio.Beacon.Rph.CameraListenerTracker'-and$_.Operand.Name-ceq'Observe'}).Count-ne1-or
   @($listenerCalls|Where-Object{$_.Operand.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.RphHandoffSampler'-and$_.Operand.Name-ceq'Capture'}).Count-ne2){throw 'Tested camera policy and two ownership brackets must be integrated.'}
  $journalCtor=@($methods|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvHandoffJournal'-and$_.IsConstructor-and!$_.IsStatic})
  $journalRoots=@($journalCtor[0].Body.Instructions|Where-Object{$_.OpCode.Name-ceq'ldstr'}|ForEach-Object{$_.Operand})
  if($journalCtor.Count-ne1-or'playable-15'-notin$journalRoots-or'playable-14'-in$journalRoots){throw 'Journal private root must match actual PLAYABLE-15 bootstrap.'}
  $journalRun=@($methods|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvHandoffJournal'-and$_.Name-ceq'Run'})
  if(!@($journalRun[0].Body.Instructions|Where-Object{$_.OpCode.Name-ceq'ldstr'-and$_.Operand-ceq'PLAYABLE-15'}).Count){throw 'Journal summary must retain PLAYABLE-15 profile.'}
  $bootstrap=@($methods|Where-Object{$_.DeclaringType.FullName-ceq'RichAudio.Beacon.Handoff.ShvHandoffBootstrap'-and$_.Name-ceq'TryLoad'})
  if(!@($bootstrap[0].Body.Instructions|Where-Object{$_.OpCode.Name-ceq'ldstr'-and$_.Operand-ceq'PLAYABLE-15'}).Count){throw 'Strict15 lease profile missing.'}
  $bati=@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Windows.BatiPlaybackSession')
  $batiCalls=@($entryCalls|Where-Object{$_.Operand.DeclaringType.FullName-ceq'RichAudio.Beacon.Windows.BatiPlaybackSession'})
  if($mode-ceq'passive'){
   if($bati.Count-or$batiCalls.Count){throw 'Passive image includes Bati playback.'}
  }else{
   if($bati.Count-ne1){throw 'Integrated Bati playback type missing.'}
   foreach($name in @('.ctor','Start','Enable','Disable','PublishAccepted','Retire','Stop','Join')){if(!@($batiCalls|Where-Object{$_.Operand.Name-ceq$name}).Count){throw ('Audible lifecycle integration missing: '+$name)}}
  }
  $inspection[$mode]=[ordered]@{oneProductLifecycle=$true;freshContextBindingIntegrated=$true;cameraTrackerIntegrated=$true;cameraOwnershipBracketCalls=2;journalPrivateRootAndSummaryProfile15=$true;strict15Lease=$true;legacyRatioReferences=0;legacyDistributionTypes=0;batiPlaybackTypeCount=$bati.Count;batiEntryCalls=$batiCalls.Count;actualPluginExecuted=$false}
 }finally{if($assembly-is[IDisposable]){$assembly.Dispose()}}
}
Check $build.host.path $build.host.sha256 $build.host.bytes;foreach($pin in $build.host.sources){Check $pin.path $pin.sha256}
Check $build.package.manifestPath $build.package.manifestSha256;$manifest=Get-Content -LiteralPath $build.package.manifestPath -Raw|ConvertFrom-Json
if($manifest.demoProfile-cne'PLAYABLE-13'-or$manifest.calibration.exhaustToEngine-ne10-or$manifest.calibration.commonSourceHeadroomTrim-ne0.25-or@($manifest.eligible).Count-ne1-or$manifest.eligible[0].model-ne4180675781){throw 'Preserved Bati host protocol/calibration required.'}
foreach($pin in $manifest.bindings){Check (Join-Path $build.package.root $pin.file) $pin.sha256};foreach($pin in $build.package.currentCode){Check $pin.path $pin.sha256}
$checks=@();foreach($path in $ValidationReceipts){$path=Local $path;$value=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;if($value.passed-ne$true){throw 'Passing component receipt required.'};$checks+=[ordered]@{path=$path;sha256=(Hash $path);kind=$value.kind;checks=$value.checks;cases=$value.cases;assertions=$value.assertions}}
Check $receiptPath $receiptSha
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/profile-'+[Guid]::NewGuid().ToString('N'))};$output=Local $OutputRoot
if(Test-Path -LiteralPath $output){throw 'New validation directory required.'};[IO.Directory]::CreateDirectory($output)|Out-Null
$result=[ordered]@{schema=1;profile='PLAYABLE-15';kind='exact-passive-audible-profile-integration-and-focused-component-evidence';passed=$true;buildReceiptSha256=$receiptSha;passivePluginSha256=$build.passive.pluginSha256;audiblePluginSha256=$build.audible.pluginSha256;hostSha256=$build.host.sha256;packageManifestSha256=$build.package.manifestSha256;staticInspection=$inspection;componentReceipts=$checks;runnerSha256=(Hash $PSCommandPath);metadataReaderSha256=(Hash $reader);gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;liveCorrectedListenerAccepted=$false;humanListeningApproved=$false;limits='Compiled image integration and separately pinned focused device-free component runs. Static method presence is not actual RPH execution. No GTA, endpoint, recording or perceptual proof.'}
$result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('PASS exact15 passive/audible integration; '+(Join-Path $output 'validation.json'))
