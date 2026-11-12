[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$output=& (Join-Path $PSScriptRoot 'SupervisorBuild.ps1')
$output=[string]@($output)[-1]
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('SupervisorProtocol.cs','SupervisorPolicy.cs','SupervisorMonitor.cs','SupervisorTests.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
$fixture=Join-Path $output 'RichAudio.Private01.DisposableFixture.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /define:SUPERVISION_FIXTURES /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /main:SupervisorTests ('/out:'+$fixture) @sources
if($LASTEXITCODE-ne0){throw 'Supervision fixture compilation failed'}
& $fixture $output (Join-Path $output 'RichAudio.Private01.Supervisor.exe') | Tee-Object -FilePath (Join-Path $output 'fixture.log')
if($LASTEXITCODE-ne0){throw ('Supervision fixtures failed; evidence retained: '+$output)}
Write-Output ('Supervision fixture evidence: '+$output)
