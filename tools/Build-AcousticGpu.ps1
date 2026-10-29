[CmdletBinding()]
param([switch]$Probe,[switch]$RequireHardware,[switch]$Tests)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\acoustic-gpu'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Installed Framework x64 compiler required; no dependency is installed.'}
$source=Join-Path $repo 'src\acoustics\gpu\AcousticGpu.cs'
$shader=Join-Path $repo 'src\acoustics\gpu\FiniteCull.hlsl'
$exe=Join-Path $out 'RichAudio.AcousticGpu.exe'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /langversion:5 /r:System.Web.Extensions.dll ('/resource:'+$shader+',RichAudio.FiniteCull') ('/out:'+$exe) $source
if($LASTEXITCODE-ne0){throw 'Acoustic GPU helper compilation failed'}
if($Tests){
    $testSource=Join-Path $repo 'tests\gpu\TestAdapterClassification.cs'
    $testExe=Join-Path $out 'RichAudio.AcousticGpu.Classifier.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /langversion:5 /r:System.Web.Extensions.dll /main:RichAudio.AcousticGpu.TestAdapterClassification ('/out:'+$testExe) $source $testSource
    if($LASTEXITCODE-ne0){throw 'Actual GPU adapter classifier fixture compilation failed'}
    & $testExe
    if($LASTEXITCODE-ne0){throw 'Actual GPU adapter classifier regressions failed'}
}
if($Probe-or$RequireHardware){
    # Raw helper capability is private local IPC and includes adapter identity.
    # Public build/probe output has an explicit allowlist, never adapter LUID.
    $raw=& $exe --probe
    $probeCode=$LASTEXITCODE
    $capability=$raw|ConvertFrom-Json
    $public=[ordered]@{}
    foreach($name in @('schemaVersion','supported','hardware','api','device','vendorId','usesHardwareRayTracing','rayTracingCapability','rayTracingBackend',
        'maximumSegments','maximumSurfaces','marginMetres','completionWait','dedicatedVideoBytes','ownedBufferBytes','processVideoMemoryBytes',
        'processWorkingSetBytes','initializationMs','helperCumulativeCpuMs','reason')){
        if($null-ne$capability.PSObject.Properties[$name]){$public[$name]=$capability.$name}
    }
    $public['helperCpuAccountingNote']='Windows cumulative process CPU; development-host quantum observed at 15.625 ms; use aggregate deltas'
    $public|ConvertTo-Json -Compress -Depth 4|Write-Output
    if($RequireHardware-and$probeCode-ne0){throw 'Real hardware DirectCompute capability unavailable'}
}
Write-Output 'Built owned compute helper only. No game, deployment or audio endpoint.'
