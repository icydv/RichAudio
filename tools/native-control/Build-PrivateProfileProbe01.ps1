# Standalone probe only. The normal plugin build never includes this source.
#requires -Version 7.0
param([Parameter(Mandatory)][string]$SdkPath,[Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$root=Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) '.local'
$out=[IO.Path]::GetFullPath($Output)
if(!$out.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Use a fresh private repository output directory'}
for($part=[IO.DirectoryInfo]::new($out);$null-ne$part;$part=$part.Parent){if($part.Exists-and($part.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
$sdk=(Resolve-Path -LiteralPath $SdkPath).Path
if((Get-FileHash -LiteralPath $sdk).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Exact private RPH SDK required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /warnaserror+ /r:Microsoft.CSharp.dll ('/r:'+$sdk) ('/out:'+(Join-Path $out 'RichAudio.ProfileProbe.dll')) (Join-Path $PSScriptRoot 'ProfileProbe.Rph.cs')
if($LASTEXITCODE){throw 'Profile probe compile failed'}
