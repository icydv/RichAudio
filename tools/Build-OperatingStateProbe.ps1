[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SdkPath,
 [Parameter(Mandatory=$true)][string]$RphRuntime
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build/operating-state-probe'
$source=Join-Path $repo 'src/telemetry/Probe/OperatingStateProbe.Rph.cs'
$sdk=(Get-Item -LiteralPath $SdkPath).FullName
$cecil=(Get-Item -LiteralPath (Join-Path $RphRuntime 'Mono.Cecil.dll')).FullName
if((Get-FileHash -LiteralPath $sdk).Hash -ne '5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Authentic pinned RPH SDK required; replacement fingerprint is not approved.'}
if((Get-FileHash -LiteralPath $cecil).Hash -ne '0F6465CE57A0CBABC37013C8E3C9F110672DE1C127B6192177D59EB1C7809772'){throw 'Expected bundled read-only Mono.Cecil metadata reader.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework x64 C# compiler not found.'}
[IO.Directory]::CreateDirectory($output) | Out-Null
$binary=Join-Path $output 'RichAudio.OperatingStateProbe.Rph.dll'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library ('/r:'+$sdk) ('/out:'+$binary) $source
if($LASTEXITCODE -ne 0){throw 'Read-only measurement probe compilation failed.'}
# Inspect compiled metadata; do not execute the probe, SDK or RPH.
Add-Type -Path $cecil
$assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($binary)
$entries=@($assembly.MainModule.Types | ForEach-Object {$_.Methods | Where-Object {$_.IsPublic -and $_.IsStatic -and $_.Name -in @('Main','OnUnload')}})
if($entries.Count -ne 2 -or @($entries | Where-Object {$_.DeclaringType.FullName -ne 'RichAudio.Telemetry.Probe.OperatingStateProbe'}).Count -ne 0){throw 'Probe lifecycle methods are missing or ambiguous.'}
$attributes=@($assembly.CustomAttributes | Where-Object {$_.AttributeType.FullName -eq 'Rage.Attributes.PluginAttribute'})
if($attributes.Count -ne 1){throw 'Probe must declare exactly one plugin identity.'}
$entryProperty=@($attributes[0].Properties | Where-Object Name -eq 'EntryPoint')
$exitProperty=@($attributes[0].Properties | Where-Object Name -eq 'ExitPoint')
if($entryProperty.Count -ne 1 -or $entryProperty[0].Argument.Value -ne 'RichAudio.Telemetry.Probe.OperatingStateProbe.Main' -or $exitProperty.Count -ne 1 -or $exitProperty[0].Argument.Value -ne 'RichAudio.Telemetry.Probe.OperatingStateProbe.OnUnload'){throw 'Probe plugin attribute points to an unexpected lifecycle method.'}
$plan=[ordered]@{
 schema=1;candidate='PLAYABLE-02 read-only operating-state measurement probe';builtUtc=[DateTime]::UtcNow.ToString('o')
 binary=[IO.Path]::GetFileName($binary);binaryBytes=(Get-Item -LiteralPath $binary).Length;binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();sourceSha256=(Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant();sdkSha256=(Get-FileHash -LiteralPath $sdk).Hash.ToLowerInvariant()
 compiledAgainstAuthenticSdk=$true;singleMainAndOnUnload=$true;pluginExecuted=$false;includedInPlayableProduct=$false;deploymentPerformed=$false;deploymentAuthorised=$false;gameLaunchPerformed=$false;gameLaunchAuthorised=$false
 proposedDestination='Plugins/RichAudio.OperatingStateProbe.Rph.dll (separate temporary measurement plugin; not installed)'
 privateOutput='%LOCALAPPDATA%/RichAudio/telemetry-probe/<session-guid>/summary.json and observations.jsonl'
 preconditions=@('Fresh separate authorisation for temporary deployment and game launch','Offline Story Mode, current player is the driver of an existing real Bati 0xf9300cc5','Existing supported RPH launch route; no autoload/startup changes')
 limits=[ordered]@{captureSeconds=120;totalWatchdogSeconds=150;writerBudgetSeconds=10;samplingHz=20;maximumRecords=2400;maximumBatchBudgetMs=10;batchBudgetIsMeasuredNotPreemptive=$true;stalledNativeOrFilesystemCannotBePreempted=$true}
 phases=@('0-20s requested engine off','20-40s requested stationary idle','40-60s requested stationary throttle where supported','60-80s requested acceleration','80-100s requested gear changes','100-120s requested deceleration')
 phaseLabelsAreAchievedStateEvidence=$false
 observations=@('RPH EngineRevolutionsRatio (raw; classify range violations, never rescale)','RPH IsEngineOn and IsEngineStarting','RPH CurrentGear and Speed (raw; never converted to RPM)','NativeDB _GET_VEHICLE_CURRENT_REV_RATIO float(Vehicle) 0xF9DDA40BC293A61E','NativeDB _GET_VEHICLE_THROTTLE float(Vehicle) 0x92D96892FC06AF22','NativeDB _GET_VEHICLE_CURRENT_DRIVE_GEAR int(Vehicle) 0x56185A25D45A0DCD','Per-batch monotonic before/after/midpoint ticks, paused flag, stable pool-handle identity and fixed generation')
 nativeProvenance='https://raw.githubusercontent.com/alloc8or/gta5-nativedb-data/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json'
 nativeLegacyProvenance='https://raw.githubusercontent.com/alloc8or/gta5-nativedb-data/424fb51b089049a9fbcebcc641500b1d44d255b4/natives.json'
 nativeContract='The Enhanced corpus lists the same three identifiers/signatures with build 811 and empty comments; the Legacy corpus uses build 3095. These are introduction metadata, not exact 1158.16 availability, range or failure contracts.'
 dispatchQualification='Historical direct CallByHash probe; lookup failed on installed RPH in PLAYABLE-02. Current SDK XML recommends dynamic Natives, but no resolver fix or provider has been established. Updating provenance does not change the probe dispatch.'
 providerReady=$false
 privateFailureDiagnostics=[ordered]@{fullExceptionTypeMaximumCharacters=256;messageMaximumCharacters=512;stackTraceMaximumCharacters=1024;maximumExceptionObjectsInChain=3;hresultRetained=$true;threadAbortRethrown=$true;rawDetailsMustRemainLocal=$true;automaticRetry=$false}
 stopConditions=@('120-second fixed capture window; no more than 2400 sample slots','150-second independent watchdog (dedicated thread with no filesystem or RPH calls)','First candidate native invocation exception: preserve its failure sample, skip remaining candidate natives and stop without retry','Plugin unload','Offline/Story/loading/player-switch check fails or throws','Player ceases to be driver of the same living Bati pool handle/model','Unhandled capture or writer exception')
 safety=[ordered]@{nativeSetters=$false;memoryAddressesOrDereferences=$false;spawnOrVehicleControl=$false;inputInterception=$false;menuChanges=$false;audioOrHost=$false;sourceAssets=$false;gameFiberFileWrites=$false;stockAudioSuppression=$false;dataCollectionRunsAutomaticallyAfterExplicitProbeLoad=$true}
 acceptance='Measurement only. No trustworthy provider, recognisable sound, audible contribution or PLAYABLE-02 success is established by compilation or plausible raw values.'
}
$plan | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $output 'proposed-measurement-plan.json') -Encoding utf8
Write-Output ('PASS separate read-only probe compiled; one Main/OnUnload verified. Candidate: '+$output)
Write-Output ('SHA256 '+$plan.binarySha256+'; not deployed, loaded, launched or included in playable plugin.')
