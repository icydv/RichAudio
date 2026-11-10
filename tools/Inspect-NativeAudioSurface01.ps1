# Read ECMA-335 metadata, not an assembly load or a game/native call.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SdkPath,[switch]$IncludeRecoverySurface)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major-lt7){throw 'PowerShell 7 is required for the metadata reader.'}
$expected='5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
$actual=(Get-FileHash -LiteralPath $SdkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual-cne$expected){throw 'Unreviewed SDK fingerprint; no metadata inspected.'}
$stream=[IO.File]::OpenRead((Get-Item -LiteralPath $SdkPath).FullName)
$reader=$null
try {
 $reader=[System.Reflection.PortableExecutable.PEReader]::new($stream)
 $metadata=[System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($reader)
 $methods=@();$recovery=@()
 foreach($handle in $metadata.TypeDefinitions){
  $type=$metadata.GetTypeDefinition($handle)
  if($metadata.GetString($type.Namespace)-cne'Rage'){continue}
  $typeName=$metadata.GetString($type.Name)
  if($typeName-ceq'Vehicle'){
   foreach($methodHandle in $type.GetMethods()){
    $method=$metadata.GetMethodDefinition($methodHandle);$name=$metadata.GetString($method.Name)
    if($name-match'Audio|Sound|Siren|Silent|Horn|Engine'){
     $methods+=[ordered]@{name=$name;implementationRva=$method.RelativeVirtualAddress;declarationOnly=($method.RelativeVirtualAddress-eq0)}
    }
   }
  }
  if($IncludeRecoverySurface-and$typeName-in @('AppDomainPool','GameFiber','Game')){
   foreach($methodHandle in $type.GetMethods()){
    $method=$metadata.GetMethodDefinition($methodHandle);$name=$metadata.GetString($method.Name)
    if($typeName-ceq'AppDomainPool'-or
       ($typeName-ceq'GameFiber'-and$name-in @('Start','StartNew','Abort'))-or
       ($typeName-ceq'Game'-and$name-ceq'UnloadActivePlugin')){
     $recovery+=[ordered]@{type=$typeName;name=$name;
      visibility=[string]($type.Attributes-band[Reflection.TypeAttributes]::VisibilityMask);
      access=[string]($method.Attributes-band[Reflection.MethodAttributes]::MemberAccessMask);
      static=$method.Attributes.HasFlag([Reflection.MethodAttributes]::Static);
      implementationRva=$method.RelativeVirtualAddress}
    }
   }
  }
 }
 if(!$methods.Count){throw 'Expected Vehicle declarations not found.'}
 $result=[ordered]@{schema=1;scope='read-only-sdk-metadata-not-runtime-validation';sdkSha256=$actual;
 sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;
 targetEnhanced='1.0.1158.16';targetRph='1.132.1428.17748';methods=$methods;
 nativeSuppressionVerified=$false;crashRecoveryVerified=$false;gameOrEndpointAccessed=$false}
 if($IncludeRecoverySurface){$result.recoveryDeclarations=$recovery}
 $result | ConvertTo-Json -Depth 5
} finally {if($reader){$reader.Dispose()};$stream.Dispose()}
