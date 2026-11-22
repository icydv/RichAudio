# Automatic package build of the derived existing AppContainer/Job supervisor.
# No installed archives, external tools, private keys, game or audio operation.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot,[string]$CompilerPath)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private provider supervisor build directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build directory refused'}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$source=Join-Path $PSScriptRoot 'world08-contained-process.cs'
if(!$CompilerPath){$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe';if(!(Test-Path -LiteralPath $vswhere)){throw 'Existing Roslyn compiler required; this build installs no tools'};$CompilerPath=(& $vswhere -latest -products '*' -find 'MSBuild\**\Roslyn\csc.exe'|Select-Object -First 1)}
if(!$CompilerPath-or!(Test-Path -LiteralPath $CompilerPath)){throw 'Existing Roslyn compiler unavailable'}
$compiler=[IO.Path]::GetFullPath($CompilerPath)
$sourceHash=Hash $source
$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'provider-supervisor08.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /deterministic+ /debug- ('/pathmap:'+$repo+'=RichAudio') /r:System.Web.Extensions.dll ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Provider supervisor compile failed; retained without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Provider supervisor source/compiler drift'}
[ordered]@{schema=1;kind='RichAudioProviderSupervisorBuild08';passed=$true;sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);deterministicCompileRequested=$true;profile='appcontainer-zero-capabilities-core-readonly08';derivedFrom='world05-contained-process.cs';fixedWorker='provider-worker08.exe';fixedArguments=@('--request-stdin');installedArchivesRead=$false;keyMaterialRead=$false;audioEndpointOpened=$false;gameLaunched=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $output 'supervisor-build08.json') -Encoding utf8NoBOM
Write-Output ('PASS built provider supervisor SHA-256 '+(Hash $exe))
