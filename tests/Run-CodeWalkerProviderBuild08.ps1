# Fixed original-only Full Framework API probe; no archive or game-path input.
[CmdletBinding()]param([Parameter(Mandatory)][string]$CoreRoot)
$ErrorActionPreference='Stop';if($PSVersionTable.PSEdition-eq'Core'){throw 'Windows PowerShell5.1 required'}
$repo=Split-Path $PSScriptRoot -Parent;$root=[IO.Path]::GetFullPath($CoreRoot)
if(!$root.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Only explicit current-checkout original build accepted'}
for($at=$root;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked original probe input refused'}}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $root $name)))|Out-Null}
$references=@((Join-Path $root 'CodeWalker.Core.dll'),(Join-Path $root 'SharpDX.dll'),(Join-Path $root 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll')
Add-Type -Path (Join-Path $PSScriptRoot 'CodeWalkerProviderBuild08.cs') -ReferencedAssemblies $references
[RichAudio.Tests.CodeWalkerProviderBuild08]::Run()
