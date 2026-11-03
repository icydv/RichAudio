# Fresh-process original fixture runner. No installation discovery or Core build.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ResearchCoreRoot,[Parameter(Mandatory)][string]$AdapterPath)
$ErrorActionPreference='Stop';if($PSVersionTable.PSEdition-eq'Core'){throw 'Windows PowerShell5.1 required'}
$repo10=Split-Path $PSScriptRoot -Parent
. (Join-Path $repo10 'tools/CodeWalkerApiInputs10.ps1')
$inputs10=Get-CodeWalkerResearchInputs10 -ResearchCoreRoot $ResearchCoreRoot
$adapter10=[IO.Path]::GetFullPath($AdapterPath)
if(!$adapter10.StartsWith((Join-Path $repo10 '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($adapter10)-cne'RichAudio.CodeWalkerApiAdapter10.dll'){throw 'Only current-checkout owned API adapter accepted'}
for($at10=$adapter10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked adapter path refused'}}
foreach($name10 in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $inputs10.root $name10)))|Out-Null}
[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($adapter10))|Out-Null
$references10=@((Join-Path $inputs10.root 'CodeWalker.Core.dll'),(Join-Path $inputs10.root 'SharpDX.dll'),(Join-Path $inputs10.root 'SharpDX.Mathematics.dll'),$adapter10,'System.Web.Extensions.dll')
Add-Type -Path (Join-Path $PSScriptRoot 'CodeWalkerPublicApi10.cs') -ReferencedAssemblies $references10
$fixtures10=Join-Path $inputs10.root 'fixtures'
$expected10=@('3cd7d694d6b6025b8175f29e61431037404cb743e68d42f65f5ff9ead0613424','268f1fa88d6153ab43a9059035c1f43431dd10136b2f51c96f2c2bd70c7037c8','04eff9010c4026b6bf795134e4bccfde6712919b2c2c52158ba6ca3e3216d0c2')
$data10=[Collections.Generic.List[byte[]]]::new();$k10=0
foreach($name10 in @('original.ymap','original.ytyp','original.ybn')){
 $path10=Join-Path $fixtures10 $name10
 for($at10=$path10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked original fixture path refused'}}
 if((Get-Item -LiteralPath $path10).Length-gt1048576-or(Get-FileHash -LiteralPath $path10 -Algorithm SHA256).Hash.ToLowerInvariant()-cne$expected10[$k10++]){throw 'Exact authored research fixture required'}
 $data10.Add([IO.File]::ReadAllBytes($path10))
}
[RichAudio.Tests.CodeWalkerPublicApi10]::Run($data10.ToArray(),$inputs10.build.coreSHA256)
