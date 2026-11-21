[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SdkPath,
 [Parameter(Mandatory=$true)][string]$RphRuntime,
 [string]$PluginPath='',
 [string]$Output=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$Output){$Output=Join-Path $repo 'evidence/playable-02-provider-assembly.json'}
$sdkFile=(Get-Item -LiteralPath $SdkPath).FullName
$runtimeFile=(Get-Item -LiteralPath (Join-Path $RphRuntime 'RAGEPluginHook.exe')).FullName
$cecilFile=(Get-Item -LiteralPath (Join-Path $RphRuntime 'Mono.Cecil.dll')).FullName
function Get-BinaryEvidence([string]$File,[string]$Role){
 $item=Get-Item -LiteralPath $File
 [ordered]@{role=$Role;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant();fileVersion=$item.VersionInfo.FileVersion;productVersion=$item.VersionInfo.ProductVersion}
}
$sdkEvidence=Get-BinaryEvidence $sdkFile 'authentic-pinned-compile-time-sdk'
$runtimeEvidence=Get-BinaryEvidence $runtimeFile 'installed-rph-runtime'
$cecilEvidence=Get-BinaryEvidence $cecilFile 'installed-metadata-reader'
if($sdkEvidence.sha256 -ne '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'){throw 'SDK fingerprint differs from the authentic pinned SDK. Review provenance before inspecting a replacement.'}
if($runtimeEvidence.sha256 -ne '73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac'){throw 'Runtime fingerprint differs from the installed 1.132.1428.17748 baseline. Review provenance before inspecting a replacement.'}
if($cecilEvidence.sha256 -ne '0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Mono.Cecil fingerprint differs from the bundled 0.9.6 metadata reader.'}
# Only the metadata reader executes. Neither the SDK, runtime nor plugin is loaded
# as executable code; Cecil parses their on-disk metadata.
Add-Type -Path $cecilFile
$sdk=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($sdkFile)
$vehicle=@($sdk.MainModule.Types | Where-Object FullName -eq 'Rage.Vehicle')
if($vehicle.Count -ne 1){throw 'Authentic SDK does not contain exactly one Rage.Vehicle definition.'}
$members=@(foreach($name in @('EngineRevolutionsRatio','IsEngineOn','IsEngineStarting','CurrentGear','NumberOfGears','AccelerationScale','EngineHealth')){
 $property=@($vehicle[0].Properties | Where-Object Name -eq $name)
 if($property.Count -ne 1 -or !$property[0].GetMethod){throw ('Expected SDK getter missing or ambiguous: '+$name)}
 $method=$property[0].GetMethod
 [ordered]@{property=$property[0].FullName;getter=$method.FullName;returnType=$method.ReturnType.FullName;visibility='public';rva=$method.RVA;codeSize=$method.Body.CodeSize;instructionCount=$method.Body.Instructions.Count;implementationAvailable=($method.RVA -ne 0 -and $method.Body.Instructions.Count -gt 0)}
})
$ratio=@($members | Where-Object {$_.getter -eq 'System.Single Rage.Vehicle::get_EngineRevolutionsRatio()'})
if($ratio.Count -ne 1 -or $ratio[0].rva -ne 0 -or $ratio[0].instructionCount -ne 0){throw 'Pinned SDK ratio getter no longer has the expected reference-only declaration.'}
$reflectionResult=[ordered]@{status='not-inspected';error=$null}
try{
 $identity=[Reflection.AssemblyName]::GetAssemblyName($runtimeFile)
 $reflectionResult=[ordered]@{status='metadata-identity-read';identity=$identity.FullName;implementationAvailable=$false}
}catch{
 $failure=$_.Exception
 while($failure.InnerException){$failure=$failure.InnerException}
 $reflectionResult=[ordered]@{status='unsupported-runtime-metadata';exceptionType=$failure.GetType().FullName;error=$failure.Message;implementationAvailable=$false}
}
$cecilResult=[ordered]@{status='not-inspected';implementationAvailable=$false}
try{
 $runtime=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($runtimeFile)
 $count=$runtime.MainModule.Types.Count
 # This bundled reader accepts the container but produces zero definitions.
 # That is a failed inspection, never evidence that the runtime has no getter.
 $cecilResult=[ordered]@{status=if($count -eq 0){'unusable-zero-type-result'}else{'metadata-types-read-not-implementation-validated'};reportedTypeCount=$count;implementationAvailable=$false}
}catch{
 $failure=$_.Exception
 while($failure.InnerException){$failure=$failure.InnerException}
 $cecilResult=[ordered]@{status='unsupported-runtime-metadata';exceptionType=$failure.GetType().FullName;error=$failure.Message;implementationAvailable=$false}
}
$pluginEvidence=$null
if($PluginPath){
 $pluginFile=(Get-Item -LiteralPath $PluginPath).FullName
 $pluginEvidence=Get-BinaryEvidence $pluginFile 'inspected-existing-plugin-not-deployed-by-this-tool'
 $plugin=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($pluginFile)
 $calls=@(foreach($type in $plugin.MainModule.Types){foreach($method in $type.Methods){if(!$method.HasBody){continue};$instructions=$method.Body.Instructions
  for($i=0;$i -lt $instructions.Count;$i++){
   $instruction=$instructions[$i]
   if($instruction.Operand -is [Mono.Cecil.MethodReference] -and $instruction.Operand.FullName -eq 'System.Single Rage.Vehicle::get_EngineRevolutionsRatio()'){
    [ordered]@{caller=$method.FullName;instruction=$instruction.ToString();nextInstruction=if($i+1 -lt $instructions.Count){$instructions[$i+1].ToString()}else{$null}}
   }
  }
 }})
 $pluginEvidence.identity=$plugin.FullName
 $pluginEvidence.referencesRph=@($plugin.MainModule.AssemblyReferences | Where-Object Name -eq 'RagePluginHook' | ForEach-Object FullName)
 $pluginEvidence.ratioGetterCalls=$calls
}
$result=[ordered]@{
 schema=1;inspectedUtc=[DateTime]::UtcNow.ToString('o');purpose='Read-only on-disk API and implementation-availability inspection; no live telemetry measurement'
 sdk=$sdkEvidence;sdkAssemblyIdentity=$sdk.FullName;sdkVehicleMembers=$members
 sdkConclusion='The pinned SDK declares the getter but has no getter IL (RVA zero). It cannot establish the runtime implementation, return units on Enhanced, memory layout or cause of a value of 50.'
 runtime=$runtimeEvidence;metadataReader=$cecilEvidence;runtimeReflection=$reflectionResult;runtimeCecil=$cecilResult;plugin=$pluginEvidence
 actualGetterImplementationEstablished=$false;causeOf50='Unestablished';outdatedOffsetProven=$false;reliableAlternativeEstablished=$false
 measurementFeasibility=[ordered]@{existingRphGetterCanBeCompiled=$true;proposedMeasure='Raw EngineRevolutionsRatio accompanied by IsEngineOn, CurrentGear, identity and monotonic timing; none of the additional getters is treated as independently reliable RPM';purpose='Characterise existing supported public getter across labelled real engine states; does not manufacture a replacement provider';requiresSeparateLiveAuthorisation=$true;noMemoryAccessOrGuessedNativeHashes=$true}
 sdkOrRuntimeCodeExecuted=$false;gameStarted=$false;gameFilesWritten=$false
 privacy='No absolute paths, raw RPH logs, game coordinates, process identifiers, runtime implementation dumps or source audio included'
}
$directory=Split-Path -Parent ([IO.Path]::GetFullPath($Output))
[IO.Directory]::CreateDirectory($directory) | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Output -Encoding utf8
Write-Output ('PASS pinned SDK signature and empty IL confirmed; runtime implementation inspection remains unsupported. Portable evidence: '+[IO.Path]::GetFullPath($Output))
