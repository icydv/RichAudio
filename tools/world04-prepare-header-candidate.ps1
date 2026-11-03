# Preparation only. No installation path is opened, statted or enumerated here.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot,[string]$GameRoot,[switch]$Synthetic)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private candidate directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'No-follow preparation path required'}}
if(!$Synthetic-and[string]::IsNullOrWhiteSpace($GameRoot)){throw 'Explicit proposed game root required; preparation will not access it'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$source=Join-Path $PSScriptRoot 'world04-header-candidate.cs'
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$sourceHash=Hash $source
$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'world04-header.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Header-only candidate compile failed; retain directory without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Source/compiler drift'}
$runtimeJson=& $exe --runtime-pins
if($LASTEXITCODE-ne0){throw 'Runtime closure discovery failed; no installed files read'}
$runtimePins=$runtimeJson|ConvertFrom-Json
$mode='installed-header-proposed'
$sourceFile=Join-Path ([IO.Path]::GetFullPath($GameRoot)) 'update/update.rpf'
if($Synthetic){
 $mode='synthetic-offline-test';$sourceFile=Join-Path $output 'synthetic-header.bin'
 $bytes=New-Object byte[] 16
 [BitConverter]::GetBytes([uint32]0x52504637).CopyTo($bytes,0)
 [BitConverter]::GetBytes([uint32]1).CopyTo($bytes,4)
 [BitConverter]::GetBytes([uint32]1).CopyTo($bytes,8)
 [BitConverter]::GetBytes([uint32]0x0FFFFFF9).CopyTo($bytes,12)
 [IO.File]::WriteAllBytes($sourceFile,$bytes)
 $GameRoot=$output
}
$manifest=[ordered]@{kind='world04-one-shot-header-candidate-v1';attemptId=[guid]::NewGuid().ToString('N');mode=$mode;gameRoot=[IO.Path]::GetFullPath($GameRoot);sourceFile=[IO.Path]::GetFullPath($sourceFile);outputDirectory=(Join-Path $output 'result');exeSHA256=(Hash $exe);runtimePins=@($runtimePins);approvalRequired=(!$Synthetic);maximumReadBytes=16;archiveAllowlist=@('update/update.rpf');memberAllowlist=@();tableReadsAllowed=$false;retryAllowed=$false}
$manifestPath=Join-Path $output 'manifest.json'
$manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$manifestHash=Hash $manifestPath
$pins=[ordered]@{kind='world04-header-preparation';sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);manifestSHA256=$manifestHash;gameFilesRead=$false;endpointOpened=$false;installedExecutorRun=$false;headerOnly=$true;externalResourceParserExecuted=$false;runtimePinCount=@($runtimePins).Count;runtimeClosureQualification='actual loaded modules and managed files plus machine.config pinned; trusted Windows platform';command=@($exe,'--supervise',$manifestPath,$manifestHash)}
$pins|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'preparation.json') -Encoding utf8NoBOM
Write-Output ('Prepared fresh '+$mode+' candidate; manifest SHA-256 '+$manifestHash)
