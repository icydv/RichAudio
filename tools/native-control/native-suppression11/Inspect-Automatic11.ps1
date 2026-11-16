param([Parameter(Mandatory)][string]$BuildReceipt,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private inspection output required'}
New-Item -ItemType Directory -Path $out|Out-Null;$exe=Join-Path $out 'InspectAutomatic11.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:exe /langversion:5 /optimize+ /warnaserror+ /r:System.Core.dll /r:System.Web.Extensions.dll ('/out:'+$exe) (Join-Path $PSScriptRoot 'InspectAutomatic11.cs')
if($LASTEXITCODE){throw 'Inspector compile failed'}
& $exe $repo ([IO.Path]::GetFullPath($BuildReceipt)) (Join-Path $out 'result.json');if($LASTEXITCODE){throw 'Compiled candidate inspection failed'}
