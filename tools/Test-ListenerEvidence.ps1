[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('build\listener-evidence')
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('AcousticSettings.cs','InGameSettingsBridge.cs','MenuDiagnostic.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\host\Windows\'+$_)}
$sources+=Join-Path $repo 'src\acoustics\bridge\Rph\ListenerEvidence.Rph.cs'
$sources+=Join-Path $repo 'tests\host\TestListenerEvidence.cs'
$test=Join-Path $output 'RichAudio.ListenerEvidence.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$test) @sources
if($LASTEXITCODE-ne0){throw 'Listener evidence compilation failed'}
& $test (Join-Path $repo ('.local\listener-evidence-'+[guid]::NewGuid().ToString('N')))
if($LASTEXITCODE-ne0){throw 'Listener evidence device-free tests failed'}
