#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BuildReceipt,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$path){
 for($at=[IO.Path]::GetFullPath($path);$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked validation input/output is forbidden.'}
 }
}
function TenPath([string]$path){
 $full=[IO.Path]::GetFullPath($path)
 $roots=@('.local/playable-10','build/playable-10-runtime-provenance')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
 if(!@($roots|Where-Object{($full+'\').StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Profile validation uses new10-only storage.'}
 Unlinked $full
 return $full
}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-10/profile-validation-'+[Guid]::NewGuid().ToString('N'))}
$output=TenPath $OutputRoot
if(Test-Path -LiteralPath $output){throw 'Validation output must be new; prior receipts are never overwritten.'}
$receiptPath=TenPath $BuildReceipt
if((Get-Item -LiteralPath $receiptPath).Length -gt 131072){throw 'Build receipt exceeds bounded input size.'}
$receiptInitialSha=Hash $receiptPath
$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($build.profile -cne 'PLAYABLE-10' -or !$build.diagnosticOnly){throw 'Only an explicitly diagnostic PLAYABLE-10 build is accepted.'}
if($build.sourceAttachmentAllowed -ne $false -or $build.handoffAllowed -ne $false -or $build.audioPlaybackAllowed -ne $false -or $build.asiDeploymentAllowed -ne $false -or $build.fixturePolicy -ne $false -or $build.expectedRuntimeState -cne 'UNREVIEWED'){throw 'Production diagnostic build must deny all activation and retain unreviewed runtime policy.'}
$binary=[IO.Path]::GetFullPath($build.pluginPath);Unlinked $binary
if((Hash $binary) -cne $build.pluginSha256 -or (Get-Item -LiteralPath $binary).Length -ne $build.pluginBytes){throw 'Actual compiled artifact differs from build receipt.'}
$sdk=$build.sdkPath
if(!$sdk){$baseline=Get-Content -LiteralPath (Join-Path $repo '.local/playable-09/baseline.json') -Raw|ConvertFrom-Json;$sdk=@($baseline.existingCompilerAndAuthenticSdkInventory|Where-Object sha256 -eq '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'|Select-Object -First 1 -ExpandProperty path)[0]}
Unlinked $sdk
if((Hash $sdk) -cne '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0' -or $build.sdkSha256 -cne (Hash $sdk)){throw 'Authentic pinned SDK is required; no fixture SDK compilation.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Hash $compiler) -cne '46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Existing compiler fingerprint differs.'}
$cecil=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/runtime-9695-1158.16/Mono.Cecil.dll'
if((Hash $cecil) -cne '0f6465ce57a0cbabc37013c8e3c9f110672de1c127b6192177d59eb1c7809772'){throw 'Static metadata reader fingerprint differs.'}
Add-Type -Path $cecil
$pins=@(foreach($pin in $build.sources){
 $name=if($pin.path){[string]$pin.path}else{[string]$pin.name};$path=if([IO.Path]::IsPathRooted($name)){$name}else{Join-Path $repo $name}
 Unlinked $path
 if((Hash $path) -cne $pin.sha256){throw 'Actual production source differs from receipt.'}
 [ordered]@{path=[IO.Path]::GetFullPath($path);sha256=$pin.sha256}
})
if($pins.Count -lt 3 -or $pins.Count -gt 6 -or @($pins|Where-Object{[IO.Path]::GetFileName($_.path) -notmatch 'Provenance.*\.cs$'}).Count){throw 'Diagnostic source manifest must be small and contain provenance-only sources.'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$cases=[Collections.Generic.List[string]]::new()
function Types($assembly){
 $list=[Collections.Generic.List[object]]::new();$stack=[Collections.Generic.Stack[object]]::new()
 foreach($type in $assembly.MainModule.Types){$stack.Push($type)}
 while($stack.Count){$type=$stack.Pop();$list.Add($type);foreach($nested in $type.NestedTypes){$stack.Push($nested)}}
 return $list.ToArray()
}
function Check-Profile($assembly){
 $types=@(Types $assembly);$methods=@($types|ForEach-Object{$_.Methods})
 $forbidden='ShvProducer|ShvHandoff|ShvOperatingState|TrustedShv|Gameplay|WindowsHost|Wasapi|Recording|InGameMenu|SoundMap|ListenerProtocol|StatePipe|AudioHost|NativeFunction|NativeArgument'
 $allTypes=@($types)+@($assembly.MainModule.GetTypeReferences())
 if(@($allTypes|Where-Object{$_.FullName -match $forbidden}).Count){throw 'Source, gameplay, audio or game-native types must be physically absent.'}
 $rphTypes=@($allTypes|Where-Object{$_.Namespace -eq 'Rage' -or $_.Namespace.StartsWith('Rage.')})
 if(@($rphTypes|Where-Object{$_.FullName -notin @('Rage.Game','Rage.GameFiber','Rage.Attributes.PluginAttribute')}).Count){throw 'Diagnostic profile must not reference game/world APIs.'}
 $entry=@($types|Where-Object FullName -ceq 'RichAudio.Beacon.Rph.RphProvenanceEntry')
 $mains=@($methods|Where-Object{$_.IsPublic -and $_.IsStatic -and $_.Name -ceq 'Main'})
 $unloads=@($methods|Where-Object{$_.IsPublic -and $_.IsStatic -and $_.Name -ceq 'OnUnload'})
 if($entry.Count -ne 1 -or $mains.Count -ne 1 -or $unloads.Count -ne 1 -or $mains[0].DeclaringType -ne $entry[0] -or $unloads[0].DeclaringType -ne $entry[0]){throw 'Diagnostic DLL needs one exact public lifecycle pair.'}
 $attrs=@($assembly.CustomAttributes|Where-Object{$_.AttributeType.FullName -ceq 'Rage.Attributes.PluginAttribute'})
 if($attrs.Count -ne 1){throw 'Diagnostic DLL needs one genuine SDK plugin attribute.'}
 $targets=@{};foreach($field in @($attrs[0].Fields)+@($attrs[0].Properties)){$targets[$field.Name]=$field.Argument.Value}
 if($targets.EntryPoint -cne 'RichAudio.Beacon.Rph.RphProvenanceEntry.Main' -or $targets.ExitPoint -cne 'RichAudio.Beacon.Rph.RphProvenanceEntry.OnUnload'){throw 'Plugin entry/exit targets differ.'}
 $allowedAssemblies=@('mscorlib','System','System.Core','System.Xml','System.Web.Extensions','System.Runtime.Serialization',$script:sdkName)
 if(@($assembly.MainModule.AssemblyReferences|Where-Object{$_.Name -notin $allowedAssemblies}).Count){throw 'Diagnostic profile has an unexpected dependency.'}
 $calls=@($methods|Where-Object HasBody|ForEach-Object{$_.Body.Instructions}|Where-Object{$_.Operand -is [Mono.Cecil.MethodReference]}|ForEach-Object{$_.Operand})
 if(@($calls|Where-Object{$_.DeclaringType.GetElementType().FullName -match $forbidden -or ($_.DeclaringType.FullName -eq 'System.Diagnostics.Process' -and $_.Name -eq 'Start') -or ($_.DeclaringType.Namespace -eq 'System.Reflection' -and $_.Name -match '^Load|^ReflectionOnlyLoad|^Invoke$' -and !($_.DeclaringType.FullName -eq 'System.Reflection.Assembly' -and $_.Name -eq 'ReflectionOnlyLoadFrom')) -or $_.Name -match 'GetProcAddress|LoadLibrary|GetScriptHandle|NativeInit|NativeCall|NativePush'}).Count){throw 'Diagnostic profile has a forbidden activation/dynamic/native route.'}
 $gameCalls=@($calls|Where-Object{$_.DeclaringType.Namespace -eq 'Rage' -or $_.DeclaringType.Namespace.StartsWith('Rage.')})
 if(@($gameCalls|Where-Object{!(($_.DeclaringType.FullName -eq 'Rage.Game' -and $_.Name -eq 'LogTrivial') -or ($_.DeclaringType.FullName -eq 'Rage.GameFiber' -and $_.Name -eq 'Sleep'))}).Count){throw 'Only bounded logging and cooperative lease waiting may call RPH.'}
 $pinvoke=@($methods|Where-Object IsPInvokeImpl)
 $allowedImports=@('GetProcessTimes','GetFileInformationByHandle','GetFinalPathNameByHandleW','GetFileInformationByHandleEx','CreateFileW','CloseHandle')
 if(@($pinvoke|Where-Object{$_.PInvokeInfo.Module.Name -notmatch '^kernel32(\.dll)?$' -or $_.PInvokeInfo.EntryPoint -notin $allowedImports}).Count){throw 'Unexpected unmanaged import in diagnostic profile.'}
 if($assembly.MainModule.Resources.Count){throw 'Diagnostic profile must not embed executables/resources.'}
 return [ordered]@{typeCount=$types.Count;methodCount=$methods.Count;rphMethodCalls=@($gameCalls|ForEach-Object FullName|Sort-Object -Unique);unmanagedImports=@($pinvoke|ForEach-Object{$_.PInvokeInfo.EntryPoint}|Sort-Object -Unique);exactPublicEntryPair=$true;pluginAttributeTargetsChecked=$true;sourceTypes=0;gameplayTypes=0;audioTypes=0;gameNativeTypes=0;activationOrDynamicRoutes=0;allMethodBodiesInspected=$true}
}
function Read-Assembly([string]$path){[Mono.Cecil.AssemblyDefinition]::ReadAssembly($path)}
$sdkAssembly=Read-Assembly $sdk;$script:sdkName=$sdkAssembly.Name.Name
$actual=Read-Assembly $binary;$inspection=Check-Profile $actual;$cases.Add('actual-authentic-SDK-diagnostic-profile-isolated')
$rebuildDir=Join-Path $output 'independent-authentic-sdk-rebuild';[IO.Directory]::CreateDirectory($rebuildDir)|Out-Null
$rebuild=Join-Path $rebuildDir ([IO.Path]::GetFileName($binary))
$compilerArgs=@('/nologo','/target:library','/platform:x64','/langversion:5','/optimize+','/warnaserror+','/define:SHV_PROVENANCE_10','/r:System.Web.Extensions.dll','/r:System.Runtime.Serialization.dll','/r:System.Xml.dll',('/r:'+$sdk),('/out:'+$rebuild))
& $compiler @compilerArgs @($pins|ForEach-Object path)
if($LASTEXITCODE -ne 0){throw 'Independent authentic-SDK profile compilation failed.'}
$rebuilt=Read-Assembly $rebuild;$null=Check-Profile $rebuilt
function Method-Map($assembly){
 $map=@{}
 foreach($type in @(Types $assembly)){foreach($method in $type.Methods){
  $lines=[Collections.Generic.List[string]]::new();$lines.Add($method.Attributes.ToString())
  if($method.HasBody){
   $lines.Add('locals:'+(@($method.Body.Variables|ForEach-Object{$_.VariableType.FullName}) -join ','))
   foreach($i in $method.Body.Instructions){
    $operand=$i.Operand;if($operand -is [Array]){$operand=(@($operand|ForEach-Object{$_.ToString()}) -join ',')}
    $text=$i.OpCode.Name+':'+[string]$operand
    if($i.Operand -is [Mono.Cecil.FieldReference] -and $i.Operand.DeclaringType.FullName -match '^<PrivateImplementationDetails>'){$text+='|initializer:'+([BitConverter]::ToString($i.Operand.Resolve().InitialValue))}
    $lines.Add(($text -replace '<PrivateImplementationDetails>\{[0-9A-Fa-f-]{36}\}','<PrivateImplementationDetails>'))
   }
   foreach($e in $method.Body.ExceptionHandlers){$lines.Add(([string]$e.HandlerType+':'+$e.TryStart+':'+$e.TryEnd+':'+$e.HandlerStart+':'+$e.HandlerEnd+':'+$e.CatchType))}
  }
  $map[($method.FullName -replace '<PrivateImplementationDetails>\{[0-9A-Fa-f-]{36}\}','<PrivateImplementationDetails>')]=$lines.ToArray() -join "`n"
 }}
 return $map
}
function Equal-Methods($left,$right){
 $a=Method-Map $left;$b=Method-Map $right
 $diff=@(foreach($name in @(@($a.Keys)+@($b.Keys)|Sort-Object -Unique)){if(!$a.ContainsKey($name) -or !$b.ContainsKey($name) -or $a[$name] -cne $b[$name]){$name}})
 if($diff.Count){throw ('Compiled method mismatch: '+($diff -join ','))}
 return $a.Count
}
$rebuiltMethods=Equal-Methods $actual $rebuilt;$cases.Add('independent-rebuild-all-method-bodies-equal')
function Reject-Mutation([string]$name,[scriptblock]$mutate){
 $copy=Read-Assembly $binary;& $mutate $copy
 $path=Join-Path $output ('rejected-'+$name+'.dll');$copy.Write($path)
 $rejected=$false;try{$null=Check-Profile (Read-Assembly $path)}catch{$rejected=$true}
 if(!$rejected){throw ('Isolation checker accepted mutation: '+$name)}
 $cases.Add($name)
}
Reject-Mutation 'source-type-injection' {param($a)$a.MainModule.Types.Add([Mono.Cecil.TypeDefinition]::new('RichAudio.Beacon.Handoff','ShvProducerModule',[Mono.Cecil.TypeAttributes]::Public,$a.MainModule.TypeSystem.Object))}
Reject-Mutation 'gameplay-field-reference' {param($a)$ref=[Mono.Cecil.TypeReference]::new('RichAudio.Beacon.Transport','GameplayFrame',$a.MainModule,$a.MainModule);$a.MainModule.Types[1].Fields.Add([Mono.Cecil.FieldDefinition]::new('forbidden',[Mono.Cecil.FieldAttributes]::Private,$ref))}
Reject-Mutation 'extra-lifecycle-entry' {param($a)$m=[Mono.Cecil.MethodDefinition]::new('Main',([Mono.Cecil.MethodAttributes]::Public -bor [Mono.Cecil.MethodAttributes]::Static),$a.MainModule.TypeSystem.Void);$m.Body.Instructions.Add([Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ret));$a.MainModule.Types[1].Methods.Add($m)}
Reject-Mutation 'unexpected-audio-dependency' {param($a)$a.MainModule.AssemblyReferences.Add([Mono.Cecil.AssemblyNameReference]::new('NAudio',[Version]::new(1,0,0,0)))}
Reject-Mutation 'forbidden-native-import' {param($a)$module=[Mono.Cecil.ModuleReference]::new('kernel32.dll');$a.MainModule.ModuleReferences.Add($module);$m=[Mono.Cecil.MethodDefinition]::new('ForbiddenNative',([Mono.Cecil.MethodAttributes]::Private -bor [Mono.Cecil.MethodAttributes]::Static -bor [Mono.Cecil.MethodAttributes]::PInvokeImpl),$a.MainModule.TypeSystem.IntPtr);$m.PInvokeInfo=[Mono.Cecil.PInvokeInfo]::new([Mono.Cecil.PInvokeAttributes]::CallConvWinapi,'GetProcAddress',$module);$a.MainModule.Types[1].Methods.Add($m)}
Reject-Mutation 'plugin-entry-target-mutation' {param($a)$attr=@($a.CustomAttributes|Where-Object{$_.AttributeType.FullName -eq 'Rage.Attributes.PluginAttribute'})[0];$changed=$false;for($i=0;$i -lt $attr.Fields.Count;$i++){if($attr.Fields[$i].Name -eq 'EntryPoint'){$attr.Fields[$i]=[Mono.Cecil.CustomAttributeNamedArgument]::new('EntryPoint',[Mono.Cecil.CustomAttributeArgument]::new($a.MainModule.TypeSystem.String,'wrong.Main'));$changed=$true}};if(!$changed){for($i=0;$i -lt $attr.Properties.Count;$i++){if($attr.Properties[$i].Name -eq 'EntryPoint'){$attr.Properties[$i]=[Mono.Cecil.CustomAttributeNamedArgument]::new('EntryPoint',[Mono.Cecil.CustomAttributeArgument]::new($a.MainModule.TypeSystem.String,'wrong.Main'));$changed=$true}}};if(!$changed){throw 'No plugin entry target to mutate.'}}
$fixtureInputs=@('tests/rph-provenance/FakeRph.cs','tests/rph-provenance/EntryFixture.cs')
$fixturePins=@($fixtureInputs|ForEach-Object{[ordered]@{name=$_;sha256=(Hash (Join-Path $repo $_))}})
$helpers=Join-Path $output 'entry-fixture-helpers';[IO.Directory]::CreateDirectory($helpers)|Out-Null
$facade=Join-Path $helpers 'RagePluginHook.dll';$hostImage=Join-Path $helpers 'FixtureHost.exe'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /optimize+ /warnaserror+ ('/out:'+$facade) (Join-Path $repo $fixtureInputs[0])
if($LASTEXITCODE -ne 0){throw 'Test-only runtime facade compilation failed.'}
& $compiler /nologo /target:exe /platform:x64 /langversion:5 /optimize+ /warnaserror+ /r:System.Web.Extensions.dll /main:EntryFixture ('/out:'+$hostImage) (Join-Path $repo $fixtureInputs[1])
if($LASTEXITCODE -ne 0){throw 'Diagnostic entry fixture host compilation failed.'}
$launcherSource=Join-Path $helpers 'FixtureLauncher.cs';$launcherImage=Join-Path $helpers 'FixtureLauncher.dll'
'using System.Reflection; [assembly:AssemblyFileVersion("2.0.0.0")] internal sealed class ExplicitHarmlessLauncherFixture {}'|Set-Content -LiteralPath $launcherSource -Encoding utf8
& $compiler /nologo /target:library /platform:x64 /langversion:5 /optimize+ /warnaserror+ ('/out:'+$launcherImage) $launcherSource
if($LASTEXITCODE -ne 0){throw 'Harmless distinct launcher fixture compilation failed.'}
$entryResults=[Collections.Generic.List[object]]::new()
$entryCases=@('valid-unreviewed','wrong-process','wrong-creation','wrong-caller','wrong-session','wrong-profile','source-opt-in','audio-opt-in','asi-opt-in','runtime-self-review','unknown-lease-field','duplicate-lease-field','changed-installed-scope','changed-launcher','occupied-report-output','unload-before-entry')
$productionSources=@($pins|Where-Object{[IO.Path]::GetFileName($_.path) -notmatch 'BuildPolicy'})
if($productionSources.Count -ne 3){throw 'Entry fixtures require exactly reporter, bootstrap and entry production sources.'}
foreach($caseName in $entryCases){
 $caseRoot=Join-Path $output ('entry-'+$caseName);[IO.Directory]::CreateDirectory($caseRoot)|Out-Null
 $caseHost=Join-Path $caseRoot 'FixtureHost.exe';$caseFacade=Join-Path $caseRoot 'RagePluginHook.dll';$caseLauncher=Join-Path $caseRoot 'FixtureLauncher.dll'
 [IO.File]::Copy($hostImage,$caseHost,$false);[IO.File]::Copy($facade,$caseFacade,$false);[IO.File]::Copy($launcherImage,$caseLauncher,$false)
 $workspace=Join-Path $caseRoot 'workspace';[IO.Directory]::CreateDirectory($workspace)|Out-Null
 $shvFixture=Join-Path $caseRoot 'never-loaded-shv.fixture';$loaderFixture=Join-Path $caseRoot 'never-loaded-loader.fixture'
 'Explicit inert fixture bytes; no SDK exports or executable code.'|Set-Content -LiteralPath $shvFixture -Encoding utf8
 'Explicit inert fixture loader bytes; never loaded.'|Set-Content -LiteralPath $loaderFixture -Encoding utf8
 $values=[ordered]@{WorkspaceRoot=$workspace;GamePath=$caseHost;GameSha256=(Hash $caseHost);GameVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($caseHost).FileVersion;LauncherPath=$caseLauncher;LauncherSha256=(Hash $caseLauncher);LauncherVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($caseLauncher).FileVersion;ShvPath=$shvFixture;ShvSha256=(Hash $shvFixture);LoaderPath=$loaderFixture;LoaderSha256=(Hash $loaderFixture);PreservedProducerSha256='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40';LeasePath=(Join-Path $caseRoot 'diagnostic-lease.json')}
 $policyLines=@('namespace RichAudio.Beacon.Provenance { internal static class RphProvenanceBuildPolicy {')
 foreach($key in $values.Keys){$policyLines+='internal const string '+$key+' = @"'+$values[$key].Replace('"','""')+'";'}
 $policyLines+='internal const long GameBytes = '+(Get-Item -LiteralPath $caseHost).Length+'L;'
 $policyLines+='internal const long LauncherBytes = '+(Get-Item -LiteralPath $caseLauncher).Length+'L;'
 $policyLines+='internal const bool FixturePolicy = true; } }'
 $fixturePolicy=Join-Path $caseRoot 'RphProvenanceBuildPolicy.fixture.cs';$policyLines|Set-Content -LiteralPath $fixturePolicy -Encoding utf8
 $fixturePlugin=Join-Path $caseRoot ([IO.Path]::GetFileName($binary))
 & $compiler @($compilerArgs|Where-Object{$_ -notlike '/out:*'}) ('/out:'+$fixturePlugin) @($productionSources|ForEach-Object path) $fixturePolicy
 if($LASTEXITCODE -ne 0){throw ('Authentic-SDK source-identical fixture-policy compilation failed: '+$caseName)}
 $null=Check-Profile (Read-Assembly $fixturePlugin)
 $start=[Diagnostics.ProcessStartInfo]::new($caseHost);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.Arguments='"'+$fixturePlugin+'" '+$caseName
 $process=[Diagnostics.Process]::Start($start)
 try{
  if(!$process.WaitForExit(10000)){$process.Kill();throw ('Owned entry fixture exceeded10s: '+$caseName)}
  $stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd()
  [IO.File]::WriteAllText((Join-Path $caseRoot 'stdout.json'),$stdout);[IO.File]::WriteAllText((Join-Path $caseRoot 'stderr.txt'),$stderr)
  if($process.ExitCode -ne 0 -or $stdout.Length -gt 65536){throw ('Entry fixture failed: '+$caseName+' '+$stderr)}
  $entryResult=$stdout|ConvertFrom-Json
  if(!$entryResult.passed -or !$entryResult.fixturePolicyOnly -or $entryResult.actualRphExecuted -or $entryResult.actualShvExecuted -or $entryResult.sourceOpened -or $entryResult.sourceBegin -or $entryResult.audioPlayback){throw 'Entry fixture boundary mismatch.'}
  $entryResults.Add([ordered]@{name=$caseName;assertions=$entryResult.assertions;terminalReason=$entryResult.terminalReason;reportWritten=$entryResult.reportWritten;fixturePluginSha256=(Hash $fixturePlugin);fixturePolicySha256=(Hash $fixturePolicy);resultSha256=(Hash (Join-Path $caseRoot 'stdout.json'))})
  $cases.Add('source-identical-fixture-policy-entry-'+$caseName)
 }finally{$process.Dispose()}
}
$defaultOutput=Join-Path $output 'default-product-regression'
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $sdk -Playable -Output $defaultOutput
if(!$?){throw 'Default product regression build failed.'}
$reference=Join-Path $repo '.local/playable-09/default-regression-current-01/RichAudio.Beacon.Rph.dll'
if((Hash $reference) -cne '28cfb8588ac546b90afca569cca62912816a513173a6a04d77d04d00fec14eaa'){throw 'Preserved default product reference differs.'}
$defaultBinary=Join-Path $defaultOutput 'RichAudio.Beacon.Rph.dll'
$defaultMethods=Equal-Methods (Read-Assembly $reference) (Read-Assembly $defaultBinary);$cases.Add('default-product-methods-unchanged')
foreach($pin in $pins){if((Hash $pin.path) -cne $pin.sha256){throw 'Production source changed during validation.'}}
foreach($pin in $fixturePins){if((Hash (Join-Path $repo $pin.name)) -cne $pin.sha256){throw 'Entry fixture source changed during validation.'}}
if((Hash $binary) -cne $build.pluginSha256 -or (Hash $receiptPath) -cne $receiptInitialSha){throw 'Production artifact changed during validation.'}
$entryAssertionCount=0;foreach($result in $entryResults){$entryAssertionCount+=[int]$result['assertions']}
$validation=[ordered]@{schema=1;profile='PLAYABLE-10';kind='authentic-sdk-compiled-diagnostic-isolation-entry-fixtures-and-default-product-regression';passed=$true;cases=$cases.Count;casesPassed=$cases.ToArray();buildReceiptSha256=(Hash $receiptPath);pluginSha256=(Hash $binary);independentRebuildSha256=(Hash $rebuild);independentRebuildMethodCount=$rebuiltMethods;staticInspection=$inspection;defaultProductReferenceSha256=(Hash $reference);defaultProductCurrentSha256=(Hash $defaultBinary);defaultProductMethodCount=$defaultMethods;defaultProductMethodDifferences=0;entryFixtures=$entryResults.ToArray();entryFixtureAssertions=$entryAssertionCount;fixtureSources=$fixturePins;fixtureFacadeSha256=(Hash $facade);fixtureHostSha256=(Hash $hostImage);fixtureLauncherSha256=(Hash $launcherImage);fixtureFacadeUsedForCompilation=$false;sourceIdenticalFixturePolicyPluginExecuted=$true;productionDiagnosticPluginExecuted=$false;sources=$pins;runnerSha256=(Hash $PSCommandPath);compilerSha256=(Hash $compiler);sdkSha256=(Hash $sdk);metadataReaderSha256=(Hash $cecil);actualRphExecuted=$false;actualShvExecuted=$false;gameExecuted=$false;gameFilesWritten=$false;sourceAttached=$false;sourceOpened=$false;sourceBegin=$false;gameplayFramesPublished=0;endpointOpened=$false;audioPlayback=$false;interpretation='Exact production DLL inspected and independently rebuilt with authentic SDK; six serialized mutant DLLs rejected. Entry execution used identical3 production sources and explicit fixture-generated policy, authentic compilation SDK and test-only CLR runtime facade. Production bytes were not executed. Default product methods equal preserved09 reference. No installed RPH/SHV/GTA or endpoint was executed.'}
$path=Join-Path $output 'validation.json';$validation|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$cases.Count+' profile controls; '+$path)
