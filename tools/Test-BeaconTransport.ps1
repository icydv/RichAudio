[CmdletBinding()]
param([switch]$BuildOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\acoustics07\transport'
[IO.Directory]::CreateDirectory($output) | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework compiler required.'}
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs' | ForEach-Object FullName)
$sources+=Join-Path $repo 'tests\host\TestListenerTransport.cs'
$executable=Join-Path $output 'RichAudio.Listener.Tests.exe'
& $compiler '/nologo' '/target:exe' '/platform:x64' '/langversion:5' '/warnaserror+' '/optimize+' '/r:System.Runtime.Serialization.dll' ('/out:'+$executable) @sources
if($LASTEXITCODE -ne 0){throw 'Listener transport test build failed.'}
if(!$BuildOnly){& $executable;if($LASTEXITCODE -ne 0){throw 'Listener transport tests failed.'}}
