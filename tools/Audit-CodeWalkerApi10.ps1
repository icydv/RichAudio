# Names and CLR metadata only; ReflectionOnly cannot run a vendor initializer.
# No manifest-resource contents, private fields or upstream method bodies are read.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ResearchCoreRoot,[string]$AdapterPath)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition-eq'Core'){throw 'Use a fresh Windows PowerShell 5.1 process for metadata-only ReflectionOnly loading'}
. (Join-Path $PSScriptRoot 'CodeWalkerApiInputs10.ps1')
$input10=Get-CodeWalkerResearchInputs10 -ResearchCoreRoot $ResearchCoreRoot
$resolve10=[ResolveEventHandler]{param($sender10,$event10)
 $name10=[Reflection.AssemblyName]::new($event10.Name).Name
 if($name10-in@('CodeWalker.Core','SharpDX','SharpDX.Mathematics')){return [Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $input10.root ($name10+'.dll')))}
 if($name10-in@('mscorlib','System','System.Core','System.Drawing','System.Xml','System.Xml.Linq','System.Runtime.Serialization','System.IO.Compression','System.Runtime','netstandard')){return [Reflection.Assembly]::ReflectionOnlyLoad($event10.Name)}
 throw 'Undeclared metadata dependency refused'
}
[AppDomain]::CurrentDomain.add_ReflectionOnlyAssemblyResolve($resolve10)
try {
 $assemblies10=@(foreach($name10 in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $input10.root $name10))})
 $core10=$assemblies10[2]
 if($AdapterPath){
  $adapter10=[IO.Path]::GetFullPath($AdapterPath);$repo10=Split-Path $PSScriptRoot -Parent
  if(!$adapter10.StartsWith((Join-Path $repo10 '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($adapter10)-cne'RichAudio.CodeWalkerApiAdapter10.dll'){throw 'Only current-checkout owned adapter metadata admitted'}
  for($at10=$adapter10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked adapter metadata path refused'}}
  $assemblies10+=@([Reflection.Assembly]::ReflectionOnlyLoadFrom($adapter10))
 }
 $records10=@(foreach($a10 in $assemblies10){
  $file10=$a10.GetName().Name+'.dll';$path10=if($file10-ceq'RichAudio.CodeWalkerApiAdapter10.dll'){$adapter10}else{Join-Path $input10.root $file10}
  $framework10=$null
  foreach($attribute10 in [Reflection.CustomAttributeData]::GetCustomAttributes($a10)){
   if($attribute10.AttributeType.FullName-ceq'System.Runtime.Versioning.TargetFrameworkAttribute'){$framework10=[string]$attribute10.ConstructorArguments[0].Value}
  }
  [ordered]@{file=$file10;bytes=(Get-Item -LiteralPath $path10).Length;sha256=(Get-FileHash -LiteralPath $path10 -Algorithm SHA256).Hash.ToLowerInvariant();name=$a10.GetName().Name;version=$a10.GetName().Version.ToString();mvid=$a10.ManifestModule.ModuleVersionId.ToString();targetFramework=$framework10;imageRuntimeVersion=$a10.ImageRuntimeVersion;manifestResources=@($a10.GetManifestResourceNames());references=@($a10.GetReferencedAssemblies()|Sort-Object Name|ForEach-Object{[ordered]@{name=$_.Name;version=$_.Version.ToString();publicKeyToken=([BitConverter]::ToString($_.GetPublicKeyToken()).Replace('-','').ToLowerInvariant())}})}
 })
 function Has-BytesLoad10([string]$type10){$found10=@($core10.GetType($type10,$true).GetMethods([Reflection.BindingFlags]'Public,Instance')|Where-Object{$_.Name-ceq'Load'-and$_.GetParameters().Length-eq1-and$_.GetParameters()[0].ParameterType.FullName-ceq'System.Byte[]'});return $found10.Count-eq1}
 $rpf10=$core10.GetType('CodeWalker.GameFiles.RpfFile',$true)
 $keys10=$core10.GetType('CodeWalker.GameFiles.GTA5Keys',$true)
 $public10=[Reflection.BindingFlags]'Public,Instance,Static'
 $selector10=$core10.GetType('CodeWalker.GameFiles.RpfManager',$true).GetProperty('IsGen9',$public10)
 $markers10=@(foreach($pair10 in @(@($rpf10,'ReadHeaderForRichAudio08'),@($keys10,'InitializeFromRichAudio09'))){if($pair10[0].GetMethod($pair10[1],$public10)){$pair10[1]}})
 $features10=[ordered]@{publicYmapLoadBytes=(Has-BytesLoad10 'CodeWalker.GameFiles.YmapFile');publicYtypLoadBytes=(Has-BytesLoad10 'CodeWalker.GameFiles.YtypFile');publicYbnLoadBytes=(Has-BytesLoad10 'CodeWalker.GameFiles.YbnFile');publicGen9Selector=($null-ne$selector10-and$selector10.CanRead-and$selector10.CanWrite);researchAugmentationMarkers=$markers10;publicBoundedArchiveHeaderInUnmodifiedPinnedSource=$false;publicExplicitBootstrapInUnmodifiedPinnedSource=$false}
 # A second identity check prevents changed files from receiving a stable report.
 $null=Get-CodeWalkerResearchInputs10 -ResearchCoreRoot $ResearchCoreRoot
 [ordered]@{schema=1;kind='RichAudioCodeWalkerApiAudit10';passed=$true;binaryRole='research-api-probe-only';mode='reflection-only-metadata-no-resource-values-or-code-execution';files=$records10;features=$features10;standardBinaryQualified=$false;distributionQualified=$false;proprietaryPayloadAbsenceQualified=$false;gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json -Depth 10
} finally {[AppDomain]::CurrentDomain.remove_ReflectionOnlyAssemblyResolve($resolve10)}
