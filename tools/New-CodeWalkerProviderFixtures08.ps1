#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$build=if([IO.Path]::IsPathRooted($BuildRoot)){[IO.Path]::GetFullPath($BuildRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $BuildRoot))};$out=if([IO.Path]::IsPathRooted($OutputRoot)){[IO.Path]::GetFullPath($OutputRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))}
foreach($p in @($build,$out)){if(!$p.StartsWith((Join-Path $repo '.local')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Only fresh current-checkout .local original fixture/build roots are supported'};for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture/build root refused'}}}
if(Test-Path -LiteralPath $out){throw 'Fresh fixture output required'}
$core=Join-Path $build 'core';$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $core ('original-fixtures08-'+[guid]::NewGuid().ToString('N')+'.exe')
$sources=@('tests/CodeWalkerProviderFixtures08.cs','tools/New-CodeWalkerProviderFixtures08.ps1','tools/Extend-OriginalProviderFixtures08.mjs','tests/fixtures/ProviderWorld08.mjs','tests/fixtures/NgMetadata041.mjs');$sourcePins=@{};foreach($p in $sources){$sourcePins[$p]=(Get-FileHash -LiteralPath (Join-Path $repo $p) -Algorithm SHA256).Hash}
$refs=@('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll','provider-worker08.exe')|ForEach-Object{'/r:'+(Join-Path $core $_)}
& $compiler /nologo /target:exe /platform:x64 /r:System.Web.Extensions.dll @refs ('/out:'+$exe) (Join-Path $repo 'tests/CodeWalkerProviderFixtures08.cs')
if($LASTEXITCODE-ne0){throw 'Original fixture compilation failed'}
$parser=(Get-FileHash -LiteralPath (Join-Path $core 'CodeWalker.Core.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
& $exe $out $parser
if($LASTEXITCODE-ne0){throw 'Original fixture generation failed; evidence retained'}
& node (Join-Path $repo 'tools/Extend-OriginalProviderFixtures08.mjs') --original-root $out
if($LASTEXITCODE-ne0){throw 'Original encrypted fixture generation failed; evidence retained'}
foreach($p in $sources){if((Get-FileHash -LiteralPath (Join-Path $repo $p) -Algorithm SHA256).Hash-cne$sourcePins[$p]){throw 'Original fixture factory source changed during generation'}}
