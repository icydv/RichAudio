#requires -Version 7.0
[CmdletBinding()]param([Parameter(Mandatory)][string]$ResearchCoreRoot,[Parameter(Mandatory)][string]$OutputRoot,[string]$CompilerPath)
$ErrorActionPreference='Stop';$repo10=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'CodeWalkerApiInputs10.ps1')
$inputs10=Get-CodeWalkerResearchInputs10 -ResearchCoreRoot $ResearchCoreRoot
$out10=[IO.Path]::GetFullPath($OutputRoot)
if(!$out10.StartsWith((Join-Path $repo10 '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out10)){throw 'Fresh current-checkout .local result directory required'}
for($at10=$out10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Test-Path -LiteralPath $at10)-and((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked result path refused'}}
if(!$CompilerPath){$vswhere10=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe';$CompilerPath=(& $vswhere10 -latest -products '*' -find 'MSBuild\**\Roslyn\csc.exe'|Select-Object -First 1)}
if(!$CompilerPath-or!(Test-Path -LiteralPath $CompilerPath)){throw 'Existing Roslyn compiler required; no tool is installed'}
[IO.Directory]::CreateDirectory($out10)|Out-Null
$adapter10=Join-Path $out10 'RichAudio.CodeWalkerApiAdapter10.dll'
$owned10=@('src/acoustics/world/CodeWalkerPublicApiAdapter10.cs','src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs')
$args10=@('/nologo','/target:library','/optimize+','/langversion:latest','/deterministic+','/debug-',('/out:"'+$adapter10+'"'),'/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.Runtime.Serialization.dll','/r:System.Xml.dll','/r:System.Drawing.dll')+@('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll'|ForEach-Object{'/r:"'+(Join-Path $inputs10.root $_)+'"'})+@($owned10|ForEach-Object{'"'+(Join-Path $repo10 $_)+'"'})
$rsp10=Join-Path $out10 'adapter-compile.rsp';[IO.File]::WriteAllLines($rsp10,$args10)
& $CompilerPath ('@'+$rsp10) *> (Join-Path $out10 'adapter-compile.log');if($LASTEXITCODE-ne0){throw 'Owned adapter compile failed; retained log'}
$legacy10=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
& $legacy10 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Audit-CodeWalkerApi10.ps1') -ResearchCoreRoot $ResearchCoreRoot -AdapterPath $adapter10 *> (Join-Path $out10 'metadata-audit.json')
if($LASTEXITCODE-ne0){throw 'Research metadata audit failed; retained output'}
& $legacy10 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo10 'tests/Run-CodeWalkerPublicApi10.ps1') -ResearchCoreRoot $ResearchCoreRoot -AdapterPath $adapter10 *> (Join-Path $out10 'controls.json')
if($LASTEXITCODE-ne0){throw 'Research public API controls failed; retained output'}
$audit10=Get-Content -LiteralPath (Join-Path $out10 'metadata-audit.json') -Raw|ConvertFrom-Json
$controls10=Get-Content -LiteralPath (Join-Path $out10 'controls.json') -Raw|ConvertFrom-Json
if(!$audit10.passed-or!$controls10.passed-or$controls10.checks-lt40){throw 'Complete API audit and original fixture controls required'}
$pins10=@($owned10|ForEach-Object{@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo10 $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
$null=Get-CodeWalkerResearchInputs10 -ResearchCoreRoot $ResearchCoreRoot
[ordered]@{schema=1;kind='RichAudioCodeWalkerPublicApi10Validation';passed=$true;controls=$controls10.checks;binaryRole='research-api-probe-only';researchCoreSHA256=$inputs10.build.coreSHA256;compilerSHA256=(Get-FileHash -LiteralPath $CompilerPath -Algorithm SHA256).Hash.ToLowerInvariant();adapter=@{file='RichAudio.CodeWalkerApiAdapter10.dll';sha256=(Get-FileHash -LiteralPath $adapter10 -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $adapter10).Length};ownedSourcePins=$pins10;coreBuilt=$false;officialBinaryAcquired=$false;standardBinaryQualified=$false;distributionQualified=$false;genuineEnhancedGeometryQualified=$false;gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out10 'result.json') -Encoding utf8NoBOM
Write-Output ('PASS '+$controls10.checks+' original public-API controls using retained research Core; standard DLL and distribution remain unqualified')
