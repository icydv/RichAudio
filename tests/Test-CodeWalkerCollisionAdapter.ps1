[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CodeWalkerRoot,[string]$OutputRoot='',[string]$TestScriptPath='')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -eq 'Core'){throw 'Use Windows PowerShell 5.1 for the existing CodeWalker DLL.'}
$scriptFile=if($TestScriptPath){[IO.Path]::GetFullPath($TestScriptPath)}else{$PSCommandPath}
if(!$scriptFile){throw 'Supply TestScriptPath when loading this test as a ScriptBlock.'}
$testRoot=Split-Path $scriptFile -Parent
$repo=[IO.Path]::GetFullPath((Join-Path $testRoot '..')).TrimEnd('\')
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.local\collision-authored-oracles'}
$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith((Join-Path $repo '.local\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Use private checkout .local output.'}
for($part=New-Object IO.DirectoryInfo($output);$null -ne $part;$part=$part.Parent){if($part.Exists -and ($part.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output ancestors are unsupported.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $CodeWalkerRoot $name)))|Out-Null}
$runtime=[Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory();$netstandard=Join-Path $runtime 'netstandard.dll';if(!(Test-Path -LiteralPath $netstandard)){$netstandard=Join-Path $runtime 'Facades\netstandard.dll'}
Add-Type -Path (Join-Path $repo 'src\acoustics\world\CodeWalkerCollisionAdapter.cs') -ReferencedAssemblies @((Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll'),(Join-Path $CodeWalkerRoot 'SharpDX.dll'),(Join-Path $CodeWalkerRoot 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll',$netstandard)
$path=Join-Path $output 'authored-oracle-fixtures.json'
[IO.File]::WriteAllText($path,[RichAudio.World.CodeWalkerCollisionAdapter]::AuthoredOracleFixtures(),(New-Object Text.UTF8Encoding($false)))
& node (Join-Path $testRoot 'Check-CodeWalkerCollisionFixtures.mjs') $path
if($LASTEXITCODE -ne 0){throw 'Native API authored fixtures failed.'}
