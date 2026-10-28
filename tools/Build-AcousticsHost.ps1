[CmdletBinding()]
param([switch]$Tests)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\acoustics-host'
[IO.Directory]::CreateDirectory($out) | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Installed .NET Framework x64 C# compiler required.'}
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Windows') -Filter '*.cs' | ForEach-Object FullName)
$options=@('/nologo','/optimize+','/warnaserror+','/unsafe+','/platform:x64','/target:exe','/r:System.Web.Extensions.dll','/r:System.Runtime.Serialization.dll')
$transport=Join-Path $repo 'src\acoustics\host\Transport'
if(Test-Path -LiteralPath $transport){$sources+=@(Get-ChildItem $transport -Filter '*.cs' | ForEach-Object FullName);$options+='/define:STATE_TRANSPORT'}
& $compiler @options '/main:RichAudio.Beacon.Windows.HostProgram' ('/out:'+(Join-Path $out 'RichAudio.Acoustics.Host.exe')) @sources
if($LASTEXITCODE-ne0){throw 'Windows audio host compilation failed.'}
if($Tests){
  & $compiler @options '/main:RichAudio.Beacon.Tests.TestAudioHost' ('/out:'+(Join-Path $out 'RichAudio.Acoustics.Host.Tests.exe')) @sources (Join-Path $repo 'tests\host\TestAudioHost.cs')
  if($LASTEXITCODE-ne0){throw 'Host test compilation failed.'}
  & (Join-Path $out 'RichAudio.Acoustics.Host.Tests.exe')
  if($LASTEXITCODE-ne0){throw 'Host offline tests failed.'}
}
Write-Output 'Built original Windows host. No device was opened by the build; no game files were accessed.'
