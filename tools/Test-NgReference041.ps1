[CmdletBinding()]param([Parameter(Mandatory)][string]$ProfileRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$out=[IO.Path]::GetFullPath($OutputRoot)
if(!$out.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private NG reference fixture directory required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$profile=[IO.Path]::GetFullPath($ProfileRoot)
$parser=Join-Path $profile 'CodeWalker.Core.dll'
$receipt=Get-Content -LiteralPath (Join-Path $profile 'profile.json') -Raw|ConvertFrom-Json
if($receipt.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or(Get-FileHash -LiteralPath $parser -Algorithm SHA256).Hash.ToLowerInvariant()-cne$receipt.parserSha256){throw 'Pinned public source profile required'}
& node (Join-Path $repo 'tests/Check-NgReference041.mjs') prepare $out
if($LASTEXITCODE-ne0){throw 'Synthetic NG reference generation failed'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $out 'NgReference041.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /r:System.Web.Extensions.dll ('/r:'+$parser) ('/out:'+$exe) (Join-Path $repo 'tests/NgReference041.cs') *> (Join-Path $out 'compile.log')
if($LASTEXITCODE-ne0){throw 'NG reference fixture compilation failed'}
foreach($name in @('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll')){Copy-Item -LiteralPath (Join-Path $profile $name) -Destination (Join-Path $out $name)}
& $exe (Join-Path $out 'input.json') > (Join-Path $out 'actual.json')
if($LASTEXITCODE-ne0){throw 'Pinned synthetic NG reference invocation failed'}
& node (Join-Path $repo 'tests/Check-NgReference041.mjs') check $out
if($LASTEXITCODE-ne0){throw 'Independent NG reference comparison failed'}
