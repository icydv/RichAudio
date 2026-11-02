[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SdkPath,
 [Parameter(Mandatory=$true)][string]$CecilPath,
 [string]$ComparisonSdkPath='',
 [string]$ProbePath='',
 [string]$Output=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$Output){$Output=Join-Path $repo 'evidence/playable-03-native-invocation.json'}
function Get-FileEvidence([string]$Path){
 $item=Get-Item -LiteralPath $Path
 [ordered]@{bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant();fileVersion=$item.VersionInfo.FileVersion}
}
$readerEvidence=Get-FileEvidence $CecilPath
if($readerEvidence.sha256 -ne '0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Expected the authentic bundled Mono.Cecil 0.9.6 metadata reader.'}
Add-Type -Path ([IO.Path]::GetFullPath($CecilPath))
function Get-AllTypes($Types){foreach($type in $Types){$type;Get-AllTypes $type.NestedTypes}}
function Get-MethodEvidence($Method){
 [ordered]@{
  signature=$Method.FullName;attributes=$Method.Attributes.ToString();implementationAttributes=$Method.ImplAttributes.ToString()
  genericParameters=@($Method.GenericParameters | ForEach-Object {[ordered]@{name=$_.Name;attributes=$_.Attributes.ToString();constraints=@($_.Constraints | ForEach-Object {$_.ToString()})}})
  parameters=@($Method.Parameters | ForEach-Object {[ordered]@{name=$_.Name;type=$_.ParameterType.FullName;attributes=$_.Attributes.ToString();isParamArray=@($_.CustomAttributes | Where-Object {$_.AttributeType.FullName -eq 'System.ParamArrayAttribute'}).Count -eq 1;hasMarshalInfo=$_.HasMarshalInfo}})
  customAttributes=@($Method.CustomAttributes | ForEach-Object {$_.AttributeType.FullName})
  implementationPresent=($Method.RVA -ne 0)
 }
}
function Read-Sdk([string]$Path,[string]$ExpectedHash){
 $file=Get-FileEvidence $Path
 if($file.sha256 -ne $ExpectedHash){throw 'SDK hash differs from the explicitly reviewed artifact.'}
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly([IO.Path]::GetFullPath($Path))
 $types=@(Get-AllTypes $assembly.MainModule.Types)
 $native=@($types | Where-Object {$_.FullName -in @('Rage.Native.NativeFunction','Rage.Native.NativeArgument','Rage.Native.DynamicNativeFunction')})
 if($native.Count -ne 3){throw 'Expected public native invocation types are missing or ambiguous.'}
 [ordered]@{
  file=$file;assemblyIdentity=$assembly.FullName
  nativeTypeNames=@($types | Where-Object Namespace -eq 'Rage.Native' | ForEach-Object FullName)
  nativeCallOrFlagTypeNames=@($types | Where-Object {$_.Name -match 'NativeCall|CallFlag'} | ForEach-Object FullName)
  types=@($native | ForEach-Object {
   $type=$_
   [ordered]@{type=$type.FullName;attributes=$type.Attributes.ToString();baseType=$type.BaseType.FullName
    publicMethods=@($type.Methods | Where-Object IsPublic | ForEach-Object {Get-MethodEvidence $_})
    publicProperties=@($type.Properties | Where-Object {$_.GetMethod -and $_.GetMethod.IsPublic} | ForEach-Object {[ordered]@{signature=$_.FullName;customAttributes=@($_.CustomAttributes | ForEach-Object {$_.AttributeType.FullName})}})
   }
  })
 }
}
function Contract-Keys($Sdk){
 @(foreach($type in $Sdk.types){
  $type.type+'|'+$type.attributes+'|'+$type.baseType
  foreach($method in $type.publicMethods){$method | ConvertTo-Json -Depth 8 -Compress}
  foreach($property in $type.publicProperties){$property | ConvertTo-Json -Depth 5 -Compress}
 }) | Sort-Object
}
$pinned=Read-Sdk $SdkPath '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
$comparison=$null;$comparisonDocs=$null;$contractDifferences=@();$sameContract=$null
if($ComparisonSdkPath){
 $comparison=Read-Sdk $ComparisonSdkPath '1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45'
 $contractDifferences=@(Compare-Object (Contract-Keys $pinned) (Contract-Keys $comparison) | ForEach-Object {[ordered]@{contract=$_.InputObject;side=$_.SideIndicator}})
 $sameContract=$contractDifferences.Count -eq 0
 $xmlPath=[IO.Path]::ChangeExtension([IO.Path]::GetFullPath($ComparisonSdkPath),'.xml')
 if(Test-Path -LiteralPath $xmlPath){
  $documentationFile=Get-FileEvidence $xmlPath
  if($documentationFile.sha256 -ne 'adcb826402c3f871a7d6f4ffcf320a446b798ac1890f16ad2f4c77e076aabf27'){throw 'Comparison SDK XML differs from the official reviewed package.'}
  $settings=New-Object System.Xml.XmlReaderSettings;$settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null
  $reader=[System.Xml.XmlReader]::Create($xmlPath,$settings)
  try{$document=New-Object System.Xml.XmlDocument;$document.XmlResolver=$null;$document.Load($reader)}finally{$reader.Dispose()}
  $dynamic=$document.SelectSingleNode('//member[@name="T:Rage.Native.DynamicNativeFunction"]')
  $hash=$document.SelectSingleNode('//member[@name="M:Rage.Native.NativeFunction.CallByHash``1(System.UInt64,Rage.Native.NativeArgument[])"]')
  $ratio=$document.SelectSingleNode('//member[@name="P:Rage.Vehicle.EngineRevolutionsRatio"]')
  if(!$dynamic -or !$hash -or !$ratio){throw 'Expected SDK documentation members are missing.'}
  $comparisonDocs=[ordered]@{
   file=$documentationFile;publisherPost='https://www.lcpdfr.com/forums/topic/156960-lspdfr-api-documentation-and-rph-sdk/'
   dynamicMemberId=$dynamic.GetAttribute('name');genericHashMemberId=$hash.GetAttribute('name')
   documentsOriginal64BitHash=($dynamic.InnerText.Contains('original 64-bit value'))
   documentsXPrefix=($dynamic.InnerText.Contains('begin the method name with x followed by the 64-bit value'))
   documentsHandleableConversion=($dynamic.InnerText.Contains('will be converted to their handle'))
   documentsCompileSuccessDoesNotEstablishMethodExistence=($dynamic.InnerText.Contains('calling any non-existing method on this object will work at compile time'))
   directHashDiscouraged=($hash.InnerText.Contains('This method should not be called directly.'))
   directHashRecommendationReferencesNatives=@($hash.GetElementsByTagName('see') | Where-Object {$_.GetAttribute('cref').Contains('Natives')}).Count -gt 0
   currentRatioContractStillZeroToOne=($ratio.InnerText.Contains('0.0F and 1.0F'))
   interpretation='The shipped 1.131 XML recommends dynamic Natives, documents original 64-bit x-prefixed identifiers and handle conversion, and still documents a 0..1 RPH ratio. It does not promise a different hash resolver, exact-build support for the candidate hash or a direct-call workaround.'
  }
 }
}
$probe=$null
if(!$ProbePath){$candidate=Join-Path $repo 'build/operating-state-probe/RichAudio.OperatingStateProbe.Rph.dll';if(Test-Path -LiteralPath $candidate){$ProbePath=$candidate}}
if($ProbePath){
 $file=Get-FileEvidence $ProbePath
 if($file.sha256 -ne 'a34bdc8b05d870eef3f2a3f214a5a7b2774dd45346859bbfa8b5d67bc8c57f3e'){throw 'Probe differs from the reviewed PLAYABLE-02 diagnostic artifact; do not confuse artifacts.'}
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly([IO.Path]::GetFullPath($ProbePath))
 $calls=@(foreach($type in (Get-AllTypes $assembly.MainModule.Types)){foreach($method in $type.Methods){
  if(!$method.HasBody){continue};$instructions=$method.Body.Instructions
  for($i=0;$i -lt $instructions.Count;$i++){
   $instruction=$instructions[$i];$operand=$instruction.Operand
   if($operand -isnot [Mono.Cecil.GenericInstanceMethod] -or $operand.DeclaringType.FullName -ne 'Rage.Native.NativeFunction' -or $operand.Name -ne 'CallByHash'){continue}
   $start=[Math]::Max(0,$i-14);$window=@($instructions[$start..$i]);$constants=@($window | Where-Object {$_.OpCode.Name -eq 'ldc.i8'})
   if($constants.Count -ne 1){throw 'Cannot unambiguously identify the prior probe native hash literal.'}
   $bits=[BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$constants[0].Operand),0)
   [ordered]@{caller=$method.FullName;publishedHashBits='0x'+$bits.ToString('X16');genericReturnType=$operand.GenericArguments[0].FullName;callSignature=$operand.FullName;usesHandleableNativeArgumentConversion=@($window | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq 'Rage.Native.NativeArgument Rage.Native.NativeArgument::op_Implicit(Rage.IHandleable)'}).Count -eq 1;nativeArgumentArrayLengthOne=@($window | Where-Object {$_.OpCode.Name -eq 'ldc.i4.1'}).Count -eq 1}
  }
 }})
 if($calls.Count -ne 3){throw 'Expected exactly three compiled candidate hash call sites.'}
 $probe=[ordered]@{file=$file;metadataOnly=$true;callSites=$calls;interpretation='The prior diagnostic artifact preserves the published 64-bit literals, expected float/int return types and one IHandleable-derived argument. This excludes source-level integer truncation or an omitted vehicle argument in this artifact; it does not validate runtime marshalling or the native handlers.'}
}
$contractRoot=Join-Path $repo 'build/playable-03-native-contract'
[IO.Directory]::CreateDirectory($contractRoot)|Out-Null
$contractSource=Join-Path $contractRoot 'RphNativeInvocationContract.cs'
@'
using Rage;
using Rage.Native;
// Compile-only contract fixture. No plugin attribute, Main, startup or execution.
public static class RphNativeInvocationContract
{
 public static float ReadRphGetter(Vehicle vehicle) { return vehicle.EngineRevolutionsRatio; }
 public static float DirectCallByHash(Vehicle vehicle)
 { return NativeFunction.CallByHash<float>(0xF9DDA40BC293A61EUL,vehicle); }
 public static float DocumentedDynamic(Vehicle vehicle)
 { return NativeFunction.Natives.xF9DDA40BC293A61E<float>(vehicle); }
}
'@ | Set-Content -LiteralPath $contractSource -Encoding utf8
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Authentic .NET Framework x64 compiler is required for the compile-only contract fixture.'}
$contractBuilds=@(foreach($inputSdk in @([ordered]@{label='pinned-sdk';path=$SdkPath},[ordered]@{label='comparison-sdk';path=$ComparisonSdkPath})){
 if(!$inputSdk.path){continue}
 $binary=Join-Path $contractRoot ($inputSdk.label+'.NativeInvocationContract.dll')
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /r:System.Core.dll /r:Microsoft.CSharp.dll ('/r:'+([IO.Path]::GetFullPath($inputSdk.path))) ('/out:'+$binary) $contractSource
 if($LASTEXITCODE -ne 0){throw ('Compile-only contract fixture failed against '+$inputSdk.label)}
 $assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($binary);$all=@(Get-AllTypes $assembly.MainModule.Types)
 $lifecycle=@($all | ForEach-Object {$_.Methods | Where-Object {$_.IsPublic -and $_.IsStatic -and $_.Name -in @('Main','OnUnload')}})
 $pluginAttributes=@($assembly.CustomAttributes | Where-Object {$_.AttributeType.FullName -eq 'Rage.Attributes.PluginAttribute'})
 if($lifecycle.Count -ne 0 -or $pluginAttributes.Count -ne 0 -or $assembly.EntryPoint){throw 'Compile-only library unexpectedly contains a plugin or process entry point.'}
 $type=@($all | Where-Object FullName -eq 'RphNativeInvocationContract')
 if($type.Count -ne 1){throw 'Contract fixture type is missing or ambiguous.'}
 $methods=@($type[0].Methods | Where-Object IsPublic)
 if($methods.Count -ne 3 -or @($methods | Where-Object {$_.ReturnType.FullName -ne 'System.Single' -or $_.Parameters.Count -ne 1 -or $_.Parameters[0].ParameterType.FullName -ne 'Rage.Vehicle'}).Count){throw 'Contract fixture method types differ from the requested float(Vehicle) signatures.'}
 $direct=@($methods | Where-Object Name -eq 'DirectCallByHash')[0]
 $generic=@($direct.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.GenericInstanceMethod] -and $_.Operand.Name -eq 'CallByHash'})
 $literal=@($direct.Body.Instructions | Where-Object {$_.OpCode.Name -eq 'ldc.i8'})
 if($generic.Count -ne 1 -or $generic[0].Operand.GenericArguments[0].FullName -ne 'System.Single' -or $literal.Count -ne 1){throw 'Direct contract hash call or return type differs.'}
 $directBits=[BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$literal[0].Operand),0)
 $literalHash='0x'+$directBits.ToString('X16')
 if($literalHash -ne '0xF9DDA40BC293A61E'){throw 'Direct contract native hash was altered or truncated.'}
 $dynamic=@($methods | Where-Object Name -eq 'DocumentedDynamic')[0]
 $identifier=@($dynamic.Body.Instructions | Where-Object {$_.OpCode.Name -eq 'ldstr' -and $_.Operand -eq 'xF9DDA40BC293A61E'})
 $binder=@($dynamic.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.DeclaringType.FullName -eq 'Microsoft.CSharp.RuntimeBinder.Binder' -and $_.Operand.Name -eq 'InvokeMember'})
 $floatTokens=@($dynamic.Body.Instructions | Where-Object {$_.OpCode.Name -eq 'ldtoken' -and $_.Operand.FullName -eq 'System.Single'})
 if($identifier.Count -ne 1 -or $binder.Count -ne 1 -or $floatTokens.Count -lt 1){throw 'Documented dynamic contract did not compile to the expected identifier, invocation binder and float type token.'}
 [ordered]@{sdk=$inputSdk.label;file=(Get-FileEvidence $binary);methodSignatures=@($methods | ForEach-Object FullName);directNativeHashBits=$literalHash;directGenericReturnType=$generic[0].Operand.GenericArguments[0].FullName;dynamicIdentifier='xF9DDA40BC293A61E';dynamicInvokeMemberBinderPresent=$true;dynamicFloatTypeTokenPresent=$true;pluginAttributeCount=$pluginAttributes.Count;lifecycleMethodCount=$lifecycle.Count;executed=$false}
})
$result=[ordered]@{
 schema=1;inspectedUtc=[DateTime]::UtcNow.ToString('o');scope='Offline metadata and authentic SDK XML contract comparison only; no runtime body analysis or native invocation'
 metadataReader=$readerEvidence;pinnedSdk=$pinned;comparisonSdk=$comparison;publicInvocationContractIdentical=$sameContract;contractDifferences=$contractDifferences;comparisonDocumentation=$comparisonDocs;priorDiagnosticProbe=$probe
 compileOnlyContract=[ordered]@{sourceSha256=(Get-FileHash -LiteralPath $contractSource).Hash.ToLowerInvariant();builds=$contractBuilds;fixtureStoredOnlyInIgnoredBuildDirectory=$true;interpretation='Both source spellings and the existing getter type-check against each inspected authentic SDK. The libraries contain no plugin or lifecycle entry point and were never executed. Compilation does not establish dispatch equivalence, successful resolution, a corrected provider or live safety.'}
 conclusion=[ordered]@{
  nativeCallFlagsAvailableInReviewedSdks=$false
  documentedDynamicHashEntry='NativeFunction.Natives.x<original-64-bit-hash><ReturnType>(vehicle)'
  dynamicVersusDirectHashDomainDifferenceEstablished=$false;dynamicResolverFixEstablished=$false
  noHashFoundEstablishes='The installed RPH invocation path reported that the supplied 64-bit identifier could not be found. No candidate return value was obtained.'
  noHashFoundDoesNotEstablish=@('Native absent from the game','Which internal table, mapping or resolver stage missed','Incorrect vehicle argument or float return type','A NativeDB error','A missing optional NativeCallFlags argument','An SDK upgrade or dynamic syntax would fix the miss','Cause of the independent RPH ratio value of 50')
  knownHistoricalDefect=[ordered]@{version='RPH 0.50.1044.10171';affectedLegacyBuild='944';publishedSummary='A legacy EngineRevolutionsRatio invalid-value defect was fixed.';source='https://docs.ragepluginhook.net/html/567cc57d-324e-4309-8869-ba0751ce4356.htm';access='Official indexed documentation was available; direct fetch returned 404';applicability='Historical precedent only; does not identify the current Enhanced defect or justify a workaround.'}
  exactCurrentIssueMaintainerAcknowledgementFound=$false
  newMaintainerCompatibilityStatement=[ordered]@{source='https://www.lcpdfr.com/forums/topic/157697-request-for-enhanced-rph-sdk-compatibility-gta-v-10115816/?comment=834046&do=findComment';finding='The maintainer states that no Enhanced-specific SDK is needed because RPH provides cross-compatibility.';access='Primary forum page and search index reviewed during PLAYABLE-03; this inspection tool does not fetch the forum';limitation='General compatibility statement, not per-native or engine-ratio correctness assurance.'}
  providerReady=$false;productChangeJustified=$false;anotherLiveAttemptJustifiedBySyntaxAlone=$false
 }
 sdkOrProbeCodeExecuted=$false;installedRuntimeInspected=$false;gameStarted=$false;gameFilesWritten=$false;sdkRepinned=$false
 privacy='Only signatures, hashes, bounded public contract interpretations and prior public outcome are recorded; no absolute paths, raw capture stacks, source assets, runtime dumps or signed download URLs.'
}
$directory=Split-Path -Parent ([IO.Path]::GetFullPath($Output));[IO.Directory]::CreateDirectory($directory)|Out-Null
$result | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $Output -Encoding utf8
Write-Output ('PASS offline native API inspection. Comparison identical='+$sameContract+'; no invocation or deployment. Evidence: '+[IO.Path]::GetFullPath($Output))
