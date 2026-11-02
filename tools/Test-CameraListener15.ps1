#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant()}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/listener-fixture-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$parent=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-15'))
if([IO.Path]::GetDirectoryName($output)-cne$parent-or[IO.Path]::GetFileName($output)-notmatch'^listener-fixture-[a-f0-9]{32}$'-or(Test-Path -LiteralPath $output)){throw 'New private15 listener-fixture-GUID required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Hash $compiler)-cne'46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Expected reviewed x64 Framework compiler.'}
$commit='25fdfadd77784f2d600508c9c650ccc1f33fe0af'
$frozen=@(& git -C $repo show ($commit+':src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs'));if($LASTEXITCODE-ne0){throw 'Frozen actual Listener source unavailable.'}
$frozenText=$frozen-join[Environment]::NewLine
$start=$frozenText.IndexOf('        static ListenerState Listener(string session)');$end=$frozenText.IndexOf('        internal static void Stop()', $start)
if($start-lt0-or$end-le$start){throw 'Frozen actual Listener method boundaries differ.'}
$method=$frozenText.Substring($start,$end-$start)
$legacy=Join-Path $output 'LegacyCameraListener.generated.cs'
$text=@'
using System;
using System.Diagnostics;
using System.IO;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Rph {
internal static class LegacyCameraListener {
static CameraObservation previous;
static long listenerSequence,listenerGeneration=1;
internal static void Reset(CameraObservation value){previous=value;listenerSequence=0;listenerGeneration=1;}
internal static ListenerState Call(string session){return Listener(session);}
'@+[Environment]::NewLine+$method+[Environment]::NewLine+'} }'
[IO.File]::WriteAllText($legacy,$text,[Text.UTF8Encoding]::new($false))
$entryText=[IO.File]::ReadAllText((Join-Path $repo 'src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs'))
$hookStart=$entryText.IndexOf('        static object Number(double? value)');$hookEnd=$entryText.IndexOf('#else', $hookStart)
if($hookStart-lt0-or$hookEnd-le$hookStart){throw 'Actual15 diagnostic method boundaries differ.'}
$diagnosticHook=$entryText.Substring($hookStart,$hookEnd-$hookStart)
$hook=Join-Path $output 'CameraListenerHook.generated.cs'
$hookText=@'
using System;
using System.IO;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;
namespace RichAudio.Beacon.Rph {
internal static class CameraListenerHook {
static CameraListenerTracker listenerTracker=new CameraListenerTracker();
static void Need(bool value,string why){if(!value)throw new InvalidDataException(why??"passive-gate-rejected");}
internal static void Reset(string session,CameraObservation baseline){listenerTracker=new CameraListenerTracker();listenerTracker.Observe(session,baseline);}
internal static ListenerState Call(string session,RphHandoffSampler sampler,H.Candidate source,HandoffPeerObservation peer,ShvHandoffJournal journal,out bool publish){return Listener(session,sampler,source,peer,journal,out publish);}
'@+[Environment]::NewLine+$diagnosticHook+[Environment]::NewLine+'} }'
[IO.File]::WriteAllText($hook,$hookText,[Text.UTF8Encoding]::new($false))
$relative=@('src/acoustics/bridge/Rph/CameraSampler.Rph.cs','src/acoustics/bridge/Rph/ShvHandoffSampler.Rph.cs',
 'src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs',
 'src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs',
 'src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs',
 'src/acoustics/host/Transport/CameraBasis.cs','tests/host/TestCameraListener15.cs')
$pins=@($relative|ForEach-Object{[ordered]@{name=$_;sha256=(Hash (Join-Path $repo $_))}})
$entryPin=[ordered]@{name='src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs';sha256=(Hash (Join-Path $repo 'src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs'))}
$pins+=@($entryPin)
$binary=Join-Path $output 'RichAudio.CameraListener15.Tests.exe'
$log=@(& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /define:SHV_HANDOFF_09 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:TestCameraListener15 ('/out:'+$binary) @($relative|ForEach-Object{Join-Path $repo $_}) $legacy $hook 2>&1)
$log|Set-Content -LiteralPath (Join-Path $output 'build.log') -Encoding utf8
if($LASTEXITCODE-ne0){throw ('Focused actual listener fixture compilation failed: '+($log-join[Environment]::NewLine))}
$raw=@(& $binary);if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw 'Focused listener fixture failed.'};$result=$raw[0]|ConvertFrom-Json
if(!$result.passed-or$result.gameLaunched-or$result.endpointOpened){throw 'Unexpected fixture boundary.'}
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.name))-cne$pin.sha256){throw 'Compiled source changed during fixture.'}}
$report=[ordered]@{schema=1;profile='PLAYABLE-15';kind='actual-camera-listener-and-retained-driver-device-free';passed=$true;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins;binary=[ordered]@{path=$binary;sha256=(Hash $binary)};frozenListenerCommit=$commit;frozenListenerMethod=$method;frozenListenerCompiledSourceSha256=(Hash $legacy);actual15ListenerDiagnosticHookCompiledSourceSha256=(Hash $hook);actual15ListenerDiagnosticMethods=$diagnosticHook;compilerSha256=(Hash $compiler);runnerSha256=(Hash $PSCommandPath);actualCameraSamplerCompiled=$true;actualRetainedRphSamplerCompiled=$true;fakeSdkAndNativeResponses=$true;gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayed=$false;limits='Controlled authored camera/native/SDK values with actual compiled CameraSampler, CameraListenerTracker, RphHandoffSampler, verbatim current15 diagnostic methods and frozen prechange Listener method. Fake bounded-journal admission permits diagnostic failure injection; real journal tested separately. Reproduces policy failure offline, not the missing rejected operands from live attempt5 or actual GTA camera causality.'}
$path=Join-Path $output 'validation.json';$report|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$result.cases+' listener cases / '+$result.assertions+' assertions; '+$path)
