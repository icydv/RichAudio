param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputDirectory){$OutputDirectory=Join-Path $repo ('.local/native-suppression-01/controller-tests-'+[Guid]::NewGuid().ToString('N'))}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $OutputDirectory){throw 'Use a new test output directory'}
[IO.Directory]::CreateDirectory($OutputDirectory)|Out-Null
$compiler='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@('tools/native-control/native-suppression01/IdleExperiment.cs','tools/native-control/native-suppression01/IdleNativeApi.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestNativeIdle01.cs')|ForEach-Object {Join-Path $repo $_}
$binary=Join-Path $OutputDirectory 'TestNativeIdle01.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /langversion:5 /platform:x64 /target:exe ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Idle controller/adapter fixture compilation failed'}
$result=& $binary
$testExit=$LASTEXITCODE
$result|ForEach-Object {Write-Output $_}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'result.txt'),($result -join "`n"),[Text.UTF8Encoding]::new($false))
$pins=@($sources)+@($compiler,$binary,$PSCommandPath)|ForEach-Object {@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'result.json'),(@{passed=($testExit-eq0);exitCode=$testExit;kind='authored-offline-controller-and-native-dispatch-fixtures';gameLaunched=$false;liveQualified=$false;artifacts=$pins}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output ('Evidence: '+$OutputDirectory)
if($testExit-ne0){throw 'Idle controller/adapter fixtures failed'}
