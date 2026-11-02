#requires -Version 7.0
[CmdletBinding()]param([Parameter(Mandatory)][string]$SdkPath)
$ErrorActionPreference='Stop'
$expected='5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
$actual=(Get-FileHash -LiteralPath $SdkPath).Hash.ToLowerInvariant()
if($actual-cne$expected){throw 'Unreviewed reference SDK; no metadata inspected.'}
if((Get-Item -LiteralPath $SdkPath).Length-gt16MB){throw 'Unexpected reference metadata size.'}
$stream=[IO.File]::OpenRead((Get-Item -LiteralPath $SdkPath).FullName);$reader=$null
try {
 $reader=[Reflection.PortableExecutable.PEReader]::new($stream)
 $metadata=[Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($reader)
 $types=@();$methods=@();$events=@();$payloadProperties=@()
 foreach($handle in $metadata.TypeDefinitions){
  $type=$metadata.GetTypeDefinition($handle);$namespace=$metadata.GetString($type.Namespace);$name=$metadata.GetString($type.Name)
  if($namespace-cne'Rage'-or$name-notmatch'Vehicle|Wheel|Entity|Bone|World|Door|PedRunOverEventArgs|SpatialEventArgs'){continue}
  $types+=$namespace+'.'+$name
  foreach($eventHandle in $type.GetEvents()){$event=$metadata.GetEventDefinition($eventHandle);$events+=[ordered]@{type=$namespace+'.'+$name;name=$metadata.GetString($event.Name)}}
  if($name-match'EventArgs$'){foreach($propertyHandle in $type.GetProperties()){$property=$metadata.GetPropertyDefinition($propertyHandle);$payloadProperties+=[ordered]@{type=$namespace+'.'+$name;name=$metadata.GetString($property.Name);signatureBlob=[Convert]::ToHexString($metadata.GetBlobBytes($property.Signature)).ToLowerInvariant()}}}
  foreach($methodHandle in $type.GetMethods()){
   $method=$metadata.GetMethodDefinition($methodHandle);$methodName=$metadata.GetString($method.Name)
   if($name-cne'VehicleWheel'-and$methodName-notmatch'Engin|Horn|Siren|Wheel|Tyre|Tire|Door|Window|Roof|Turbo|Clutch|Gear|Rpm|Brake|Collid|Collision|Velocity|Speed|Bone|Model|Surface|Material|Suspens|Damage|Deform|Alarm|Touch|Contact|Impact|Boost|Throttl'){continue}
   $parameters=@($method.GetParameters()|ForEach-Object{$parameter=$metadata.GetParameter($_);[ordered]@{name=$metadata.GetString($parameter.Name);sequence=$parameter.SequenceNumber;attributes=$parameter.Attributes.ToString()}})
   $methods+=[ordered]@{type=$namespace+'.'+$name;method=$methodName;parameters=$parameters;rva=$method.RelativeVirtualAddress;declarationOnly=($method.RelativeVirtualAddress-eq0);
    signatureBlob=[Convert]::ToHexString($metadata.GetBlobBytes($method.Signature)).ToLowerInvariant()}
  }
 }
 [ordered]@{schema=1;kind='vehicle-component-read-only-reference-declarations';sdkSha256=$actual;
  sdkVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;types=$types;methods=$methods;events=$events;payloadProperties=$payloadProperties;
  target='Enhanced1.0.1158.16-RPH1.132.1428.17748';exactRuntimeGetterSemanticsVerified=$false;
  reliableComponentEventOccurrenceVerified=$false;perComponentSuppressionVerified=$false;independentRestorationVerified=$false;
  assemblyLoaded=$false;gameAccessed=$false;endpointOpened=$false;installationScanned=$false;
  limits='PE metadata only. No Assembly.Load/native invocation. Reference declarations neither prove exact-runtime implementation nor source timestamps, source mounts, physical intensity, selective suppression or crash-safe restoration.'}|ConvertTo-Json -Depth 6
} finally {if($reader){$reader.Dispose()};$stream.Dispose()}
