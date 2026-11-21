$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../../..").Path
$out = Join-Path $repo '.local\audio-switch'
[void][IO.Directory]::CreateDirectory($out)
$csc = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
$sdk = "$repo\.local\shvdne-reference\release\ScriptHookVDotNet3.dll"
if ((Get-FileHash $sdk).Hash -ne '1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48') { throw 'Enhanced SDK differs' }
$transport = Get-ChildItem "$repo\src\acoustics\host\Transport" -Filter '*.cs' -File | ForEach-Object FullName
$observations = @("$repo\src\acoustics\bridge\Integration\CameraListenerTracker.cs",
                  "$repo\src\acoustics\bridge\Integration\GameObservations.cs",
                  "$repo\src\acoustics\bridge\Shvdne\ShvdneGameSource.cs")
$switchSources = @('Switch.cs','AudioSwitch.cs','PowertrainHandoff.cs','PowertrainFrames.cs','PowertrainLink.cs') |
    ForEach-Object { "$PSScriptRoot\$_" }
& $csc /nologo /target:library /platform:x64 /unsafe+ /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll "/r:$sdk" "/out:$out\RichAudio.AudioSwitch.dll" @switchSources @transport @observations "$PSScriptRoot\..\native-suppression01\IdleDecoratorRegistration.cs"
if ($LASTEXITCODE) { throw 'SHVDNE build failed' }
& $csc /nologo /platform:x64 "/out:$out\TestSwitch.exe" "/r:$out\RichAudio.AudioSwitch.dll" "$PSScriptRoot\TestSwitch.cs"
if ($LASTEXITCODE) { throw 'Test build failed' }
& "$out\TestSwitch.exe"
if ($LASTEXITCODE) { throw 'Switch checks failed' }
Get-FileHash "$out\RichAudio.AudioSwitch.dll"
