# Read ECMA-335 metadata, not an assembly load or a game/native call.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SdkPath)
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
 $methods=@()
 foreach($handle in $metadata.TypeDefinitions){
  $type=$metadata.GetTypeDefinition($handle)
  if($metadata.GetString($type.Namespace)-ceq'Rage'-and$metadata.GetString($type.Name)-ceq'Vehicle'){
   foreach($methodHandle in $type.GetMethods()){
    $method=$metadata.GetMethodDefinition($methodHandle);$name=$metadata.GetString($method.Name)
    if($name-match'Audio|Sound|Siren|Silent|Horn|Engine'){
     $methods+=[ordered]@{name=$name;implementationRva=$method.RelativeVirtualAddress;declarationOnly=($method.RelativeVirtualAddress-eq0)}
    }
   }
  }
 }
 if(!$methods.Count){throw 'Expected Vehicle declarations not found.'}
 [ordered]@{schema=1;scope='read-only-sdk-metadata-not-runtime-validation';sdkSha256=$actual;
 sdkFileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($SdkPath).FileVersion;
 targetEnhanced='1.0.1158.16';targetRph='1.132.1428.17748';methods=$methods;
 nativeSuppressionVerified=$false;crashRecoveryVerified=$false;gameOrEndpointAccessed=$false} | ConvertTo-Json -Depth 5
} finally {if($reader){$reader.Dispose()};$stream.Dispose()}
