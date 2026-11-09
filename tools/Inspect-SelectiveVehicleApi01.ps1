# On-disk public declarations/exports only. Never load an inspected module.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SdkPath,
 [Parameter(Mandatory=$true)][string]$RuntimePath,
 [Parameter(Mandatory=$true)][string]$OpenRpfPath,
 [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major-lt7){throw 'PowerShell 7 metadata reader required'}
function Read-PublicSurface01([string]$Path,[string]$Role){
 $file=Get-Item -LiteralPath $Path
 if($file.Length-le0-or$file.Length-gt32MB){throw 'Named software file exceeds the 32MiB metadata audit bound'}
 $stream=[IO.File]::OpenRead($file.FullName);$pe=$null
 try{
  $pe=[Reflection.PortableExecutable.PEReader]::new($stream)
  $members=@();$metadataError=$null;$typeCount=$null;$identity=$null
  if($pe.HasMetadata){try{
   $md=[Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe);$assembly=$md.GetAssemblyDefinition()
   $identity=$md.GetString($assembly.Name)+', Version='+$assembly.Version;$typeCount=$md.TypeDefinitions.Count
   foreach($handle in $md.TypeDefinitions){
    $type=$md.GetTypeDefinition($handle);$fullName=$md.GetString($type.Namespace)+'.'+$md.GetString($type.Name)
    if($fullName-notin@('Rage.Vehicle','Rage.Native.NativeFunction','Rage.Native.DynamicNativeFunction')){continue}
    foreach($methodHandle in $type.GetMethods()){
     $method=$md.GetMethodDefinition($methodHandle);$name=$md.GetString($method.Name)
     if(($method.Attributes-band[Reflection.MethodAttributes]::MemberAccessMask)-ne[Reflection.MethodAttributes]::Public){continue}
     if($fullName-eq'Rage.Vehicle'-and$name-notmatch'Audio|Sound|Engine|Siren|Silent|Horn'){continue}
     $members+=[ordered]@{type=$fullName;name=$name;genericArity=$method.GetGenericParameters().Count;parameterMetadataCount=$method.GetParameters().Count;declarationOnly=($method.RelativeVirtualAddress-eq0)}
    }
   }
  }catch{$metadataError=$_.Exception.GetType().FullName}}
  $exports=@();$directory=$pe.PEHeaders.PEHeader.ExportTableDirectory
  if($directory.RelativeVirtualAddress-ne0){
   $table=[byte[]]$pe.GetSectionData($directory.RelativeVirtualAddress).GetContent(0,40)
   $count=[BitConverter]::ToUInt32($table,24);$namesRva=[BitConverter]::ToUInt32($table,32)
   if($count-gt4096){throw 'Export-name table exceeds audit bound'}
   if($count-gt0){
    $names=[byte[]]$pe.GetSectionData([int]$namesRva).GetContent(0,[int]($count*4))
    for($i=0;$i-lt$count;$i++){
     $rva=[BitConverter]::ToUInt32($names,$i*4);$block=$pe.GetSectionData([int]$rva)
     $raw=[byte[]]$block.GetContent(0,[Math]::Min(512,$block.Length));$end=[Array]::IndexOf($raw,[byte]0)
     if($end-lt0){throw 'Export name exceeds 512-byte bound'}
     $exports+=[Text.Encoding]::ASCII.GetString($raw,0,$end)
    }
   }
  }
  [ordered]@{role=$Role;fileName=$file.Name;bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();fileVersion=$file.VersionInfo.FileVersion;productVersion=$file.VersionInfo.ProductVersion;hasClrMetadata=$pe.HasMetadata;assemblyIdentity=$identity;readableTypeCount=$typeCount;metadataError=$metadataError;publicSelectedDeclarations=$members;namedExports=$exports;exportInspectionComplete=$true}
 }finally{if($pe){$pe.Dispose()};$stream.Dispose()}
}
$report=[ordered]@{schema=1;kind='RichAudioSelectiveVehicleOnDiskCapabilityAudit01';inspectedUtc=[DateTime]::UtcNow.ToString('o');files=@(
 (Read-PublicSurface01 $SdkPath 'supplied-compile-reference'),(Read-PublicSurface01 $RuntimePath 'installed-RPH-container'),(Read-PublicSurface01 $OpenRpfPath 'supplied-archive-loader'));
 scope='Bounded public ECMA-335 declarations and PE named export tables only; no IL/body reverse engineering, module initialization or native invocation';
 inspectedModulesLoaded=$false;gameAccessed=$false;nativeCalled=$false;profileRegistered=$false;takeoverEnabled=$false;
 limits='No named export does not exclude a private internal mechanism. Unreadable runtime metadata does not establish absence of an API. Declarations do not establish exact-runtime behavior or independent recovery.'}
[IO.Directory]::CreateDirectory((Split-Path -Parent ([IO.Path]::GetFullPath($Output))))|Out-Null
$report|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $Output -Encoding utf8
Write-Output ('PASS bounded on-disk capability audit: '+[IO.Path]::GetFullPath($Output))
