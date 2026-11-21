$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../../..").Path
$out = Join-Path $repo '.local\audio-switch'
[void][IO.Directory]::CreateDirectory($out)
$csc = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
$sdk = "$repo\.local\shvdne-reference\release\ScriptHookVDotNet3.dll"
if ((Get-FileHash $sdk).Hash -ne '1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48') { throw 'Enhanced SDK differs' }
& $csc /nologo /target:library /platform:x64 /unsafe+ /r:System.Web.Extensions.dll "/r:$sdk" "/out:$out\RichAudio.AudioSwitch.dll" "$PSScriptRoot\Switch.cs" "$PSScriptRoot\AudioSwitch.cs" "$PSScriptRoot\..\native-suppression01\IdleDecoratorRegistration.cs"
if ($LASTEXITCODE) { throw 'SHVDNE build failed' }
& $csc /nologo /platform:x64 "/out:$out\TestSwitch.exe" "/r:$out\RichAudio.AudioSwitch.dll" "$PSScriptRoot\TestSwitch.cs"
if ($LASTEXITCODE) { throw 'Test build failed' }
& "$out\TestSwitch.exe"
if ($LASTEXITCODE) { throw 'Switch checks failed' }
Get-FileHash "$out\RichAudio.AudioSwitch.dll"
