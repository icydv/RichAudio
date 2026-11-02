# Read only ECMA-335 metadata from the exact retained reference SDK.
# No Assembly.Load, constructor, native invocation, game process or endpoint.
#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SdkPath)
$ErrorActionPreference='Stop'
$expected='5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
$actual=(Get-FileHash -LiteralPath $SdkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual-cne$expected){throw 'Unreviewed SDK fingerprint; no metadata inspected.'}
if((Get-Item -LiteralPath $SdkPath).Length-gt16MB){throw 'Unexpected SDK metadata size.'}
$stream=[IO.File]::OpenRead((Get-Item -LiteralPath $SdkPath).FullName)
$reader=$null
try {
 $reader=[System.Reflection.PortableExecutable.PEReader]::new($stream)
 $metadata=[System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($reader)
 $methods=@();$events=@();$payloadProperties=@();$types=0
 foreach($handle in $metadata.TypeDefinitions){
  $type=$metadata.GetTypeDefinition($handle)
  $namespace=$metadata.GetString($type.Namespace);$typeName=$metadata.GetString($type.Name)
  if($namespace-cne'Rage'-and!$namespace.StartsWith('Rage.',[StringComparison]::Ordinal)){continue}
  $types++
  foreach($eventHandle in $type.GetEvents()){
   $event=$metadata.GetEventDefinition($eventHandle)
   $events+=[ordered]@{type=$namespace+'.'+$typeName;name=$metadata.GetString($event.Name)}
  }
  if($typeName-match'EventArgs$'){
   foreach($propertyHandle in $type.GetProperties()){
    $property=$metadata.GetPropertyDefinition($propertyHandle)
    $payloadProperties+=[ordered]@{type=$namespace+'.'+$typeName;name=$metadata.GetString($property.Name);
     signatureBlob=[Convert]::ToHexString($metadata.GetBlobBytes($property.Signature)).ToLowerInvariant()}
   }
  }
  if($typeName-notin@('Ped','Entity','World','Game','GameEvents')-and$typeName-notmatch'Event'){continue}
  foreach($methodHandle in $type.GetMethods()){
   $method=$metadata.GetMethodDefinition($methodHandle);$name=$metadata.GetString($method.Name)
   if($typeName-match'EventArgs$'-or$name-match'Shoot|Shot|Impact|Explos|Damage|Weapon|Projectile|Event'){
    $methods+=[ordered]@{type=$namespace+'.'+$typeName;name=$name;
     implementationRva=$method.RelativeVirtualAddress;declarationOnly=($method.RelativeVirtualAddress-eq0);
     signatureBlob=[Convert]::ToHexString($metadata.GetBlobBytes($method.Signature)).ToLowerInvariant()}
   }
  }
 }
 if(!$types-or!$methods.Count){throw 'Expected SDK declaration surface not found.'}
 [ordered]@{schema=1;scope='read-only-reference-sdk-metadata-not-runtime-event-support';
 sdkSha256=$actual;sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;
 targetEnhanced='1.0.1158.16';targetRph='1.132.1428.17748';rageTypesInspected=$types;
 matchingMethods=$methods;declaredManagedEvents=$events;eventPayloadProperties=$payloadProperties;
 authoritativeShotEventsVerified=$false;sampleAccurateSourceTimestampVerified=$false;
 nativeSuppressionVerified=$false;gameOrEndpointAccessed=$false;
 limits='Declaration names/signature blobs and absent RVA do not establish implementation, event semantics, payload clock, exact Enhanced support or native audio ownership.'}|ConvertTo-Json -Depth 6
} finally {if($reader){$reader.Dispose()};$stream.Dispose()}
