param([string]$Output=(Join-Path $PSScriptRoot '../../.local/operator/OwnedTree.exe'))
$ErrorActionPreference='Stop'
$Output=[IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory((Split-Path $Output))|Out-Null
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:$Output (Join-Path $PSScriptRoot 'OwnedTree.cs')
if($LASTEXITCODE-ne0){throw 'Containment broker compilation failed'}
