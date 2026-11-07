# Metadata-only API audit for the supplied vendor software. ReflectionOnly never
# invokes GTA5Keys, a resource loader, a vendor constructor or static initializer.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CoreRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -eq 'Core'){throw 'Use a fresh Windows PowerShell 5.1 process for ReflectionOnly metadata'}
$apiRoot=[IO.Path]::GetFullPath($CoreRoot)
$apiNames=@('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')
function Api-Hash([string]$File){$apiStream=[IO.File]::OpenRead($File);$apiSha=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($apiSha.ComputeHash($apiStream))).Replace('-','').ToLowerInvariant()}finally{$apiStream.Dispose();$apiSha.Dispose()}}
function Api-Bindings {
 @($apiNames|ForEach-Object{
  $apiPath=Join-Path $apiRoot $_
  for($apiAt=$apiPath;$apiAt;$apiAt=[IO.Path]::GetDirectoryName($apiAt)){if((Get-Item -LiteralPath $apiAt -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked software audit input refused'}}
  $apiInfo=Get-Item -LiteralPath $apiPath -Force
  if($apiInfo.PSIsContainer -or $apiInfo.Length -le 0 -or $apiInfo.Length -gt 32MB){throw 'Bounded software audit input required'}
  [ordered]@{File=$apiInfo.Name;Bytes=$apiInfo.Length;SHA256=Api-Hash $apiPath}
 })
}
$apiBefore=Api-Bindings
$apiResolver=[ResolveEventHandler]{param($apiSender,$apiEvent)
 $apiName=[Reflection.AssemblyName]::new($apiEvent.Name).Name
 if($apiName -in @('CodeWalker.Core','SharpDX','SharpDX.Mathematics')){return [Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $apiRoot ($apiName+'.dll')))}
 if($apiName -in @('mscorlib','System','System.Core','System.Drawing','System.Xml','System.Xml.Linq','System.Runtime.Serialization','System.IO.Compression','System.Runtime','netstandard')){return [Reflection.Assembly]::ReflectionOnlyLoad($apiEvent.Name)}
 throw 'Undeclared metadata dependency refused'
}
[AppDomain]::CurrentDomain.add_ReflectionOnlyAssemblyResolve($apiResolver)
try {
 $apiAssemblies=@($apiNames|ForEach-Object{[Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $apiRoot $_))})
 $apiCore=$apiAssemblies[2];$apiPublic=[Reflection.BindingFlags]'Public,Instance,Static'
 function Api-Signature($Member){[ordered]@{Name=$Member.Name;Static=if($Member -is [Reflection.MethodInfo]){$Member.IsStatic}else{$false};Parameters=@($Member.GetParameters()|ForEach-Object{[ordered]@{Name=$_.Name;Type=$_.ParameterType.FullName;Optional=$_.IsOptional}});ReturnType=if($Member -is [Reflection.MethodInfo]){$Member.ReturnType.FullName}else{$null}}}
 $apiTypes=@(foreach($apiTypeName in @('GTA5Keys','GameFileCache','RpfManager','RpfFile','YmapFile','YtypFile','YbnFile','AwcFile')){
  $apiType=$apiCore.GetType(('CodeWalker.GameFiles.'+$apiTypeName),$true)
  [ordered]@{Name=$apiTypeName;Constructors=@($apiType.GetConstructors()|ForEach-Object{Api-Signature $_});Methods=@($apiType.GetMethods($apiPublic)|Where-Object{($_.DeclaringType -eq $apiType -and $apiTypeName -eq 'GTA5Keys') -or $_.Name -in @('LoadFromPath','Init','SetDlcLevel','ScanStructure','ExtractFile','Load','GetYmap','GetYtyp','GetYbn','GetAwc','ReadHeaderForRichAudio08','InitializeFromRichAudio09')}|ForEach-Object{Api-Signature $_});Properties=@($apiType.GetProperties($apiPublic)|Where-Object{$_.Name -in @('IsGen9','IsInited','LoadPeds','LoadVehicles','LoadAudio','LoadArchetypes','AllRpfs','DlcNameList','SelectedDlc','EnableDlc','AllYbns','AllYmaps','AllYtyps')}|ForEach-Object{[ordered]@{Name=$_.Name;Type=$_.PropertyType.FullName;Read=$_.CanRead;Write=$_.CanWrite}})}
 })
 $apiAfter=Api-Bindings
 if(($apiBefore|ConvertTo-Json -Depth 5 -Compress) -cne ($apiAfter|ConvertTo-Json -Depth 5 -Compress)){throw 'Software changed during API audit'}
 [ordered]@{Schema=1;Kind='RichAudioSuppliedCodeWalkerApiAudit01';Mode='reflection-only-metadata';Files=$apiBefore;AssemblyReferences=@($apiCore.GetReferencedAssemblies()|ForEach-Object{[ordered]@{Name=$_.Name;Version=$_.Version.ToString()}});Types=$apiTypes;SoftwareIdentityStable=$true;VendorAuthenticityIndependentlyVerified=$false;DistributionQualified=$false;GameFilesRead=$false;InitializerExecuted=$false;ManifestResourceValuesRead=$false;EndpointOpened=$false}|ConvertTo-Json -Depth 12
} finally {[AppDomain]::CurrentDomain.remove_ReflectionOnlyAssemblyResolve($apiResolver)}
