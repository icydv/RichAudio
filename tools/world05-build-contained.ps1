# Compile the xml-only native supervisor. No installed/game/key input.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private xml build directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build directory refused'}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$source=Join-Path $PSScriptRoot 'world05-contained-process.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sourceHash=Hash $source
$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'world05-contained.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Xml contained supervisor compile failed; retained without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Xml build source/compiler drift'}
[ordered]@{kind='World05XmlContainedSupervisorBuild';sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);bufferOnly=$true;installedReaderImplemented=$false;realKeyProviderImplemented=$false;installedArchiveRead=$false;realKeysRead=$false;audioEndpointOpened=$false;runtimeAndParserQualification='separate validation and independent review required'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'build.json') -Encoding utf8NoBOM
Write-Output ('PASS compiled xml contained supervisor SHA-256 '+(Hash $exe))
