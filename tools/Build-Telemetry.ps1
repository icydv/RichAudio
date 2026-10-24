[CmdletBinding()]
param([string]$SdkPath='', [switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\telemetry'
[IO.Directory]::CreateDirectory($output) | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework x64 C# compiler not found.'}
if(!$SdkPath){$SdkPath=Join-Path $repo '.local\rph\sdk\RagePluginHookSDK.dll'}
$core=@(Get-ChildItem (Join-Path $repo 'src\telemetry\Core') -Filter '*.cs' | ForEach-Object FullName)
$base=@('/nologo','/optimize+','/warnaserror+','/platform:x64','/r:System.Runtime.Serialization.dll')
& $compiler @base '/target:library' ('/out:'+(Join-Path $output 'RichAudio.Telemetry.Core.dll')) @core
if($LASTEXITCODE -ne 0){throw 'Core build failed.'}
if(!$CoreOnly){
 if(!(Test-Path -LiteralPath $SdkPath)){throw 'Authentic RPH SDK required. See docs/RUNTIME_COMPATIBILITY.md; no stub build is substituted.'}
 $hash=(Get-FileHash -LiteralPath $SdkPath -Algorithm SHA256).Hash
 if($hash -ne '5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Unreviewed SDK fingerprint; verify provenance before updating the pin.'}
 $adapter=@(Get-ChildItem (Join-Path $repo 'src\telemetry\Rph') -Filter '*.cs' | ForEach-Object FullName)
 & $compiler @base '/r:System.Windows.Forms.dll' ('/r:'+$SdkPath) '/target:library' ('/out:'+(Join-Path $output 'RichAudio.Telemetry.Rph.dll')) @core @adapter
 if($LASTEXITCODE -ne 0){throw 'RPH adapter build failed.'}
}
$analysis=@(Get-ChildItem (Join-Path $repo 'src\telemetry\Analysis') -Filter '*.cs' | ForEach-Object FullName)
if($analysis.Count){& $compiler @base ('/r:'+(Join-Path $output 'RichAudio.Telemetry.Core.dll')) '/target:exe' ('/out:'+(Join-Path $output 'RichAudio.Telemetry.Analysis.exe')) @analysis;if($LASTEXITCODE -ne 0){throw 'Analysis build failed.'}}
Write-Output ('Built in '+$output+'; no game files installed.')
