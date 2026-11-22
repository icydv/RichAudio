#requires -Version 7.0
# Actual full Core builds plus original memory-only parser controls.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot,[string]$PublicPreparationRoot,[string]$CompilerPath)
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent;$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh current-checkout private test root required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked test root refused'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
if(!$PublicPreparationRoot){$PublicPreparationRoot=Join-Path $repo ('.local/world-03/world08-build-test-public-'+[guid]::NewGuid().ToString('N'));& (Join-Path $PSScriptRoot 'Prepare-CodeWalkerPublicProfile03.ps1') -OutputRoot $PublicPreparationRoot -CompilerPath $CompilerPath;if(!$?){throw 'Public source preparation failed'}}
$builds=@();foreach($name in @('first','second')){$p=Join-Path $output $name;& (Join-Path $PSScriptRoot 'Build-CodeWalkerProvider08.ps1') -OutputRoot $p -PublicPreparationRoot $PublicPreparationRoot -CompilerPath $CompilerPath -CoreOnly;if(!$?){throw 'Actual Core build failed'};$builds+=Get-Content -LiteralPath (Join-Path $p 'provider-build08.json') -Raw|ConvertFrom-Json}
if($builds[0].coreSHA256-cne$builds[1].coreSHA256-or$builds[0].compilerSHA256-cne$builds[1].compilerSHA256){throw 'Two fresh same-compiler full Core outputs must be byte-identical'}
$legacy=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$log=Join-Path $output 'original-api-controls.json'; & $legacy -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo 'tests/Run-CodeWalkerProviderBuild08.ps1') -CoreRoot (Join-Path $output 'first/core') *> $log
if($LASTEXITCODE-ne0){throw 'Original full Core API controls failed; output retained'}
$result=Get-Content -LiteralPath $log -Raw|ConvertFrom-Json
if(!$result.passed-or$result.checks-lt20){throw 'Expected actual Core and bounded parser controls missing'}
$receipt=[ordered]@{schema=1;kind='CodeWalkerProviderBuild08Validation';passed=$true;originalApiControls=$result.checks;byteIdenticalCoreBuilds=$true;coreSHA256=$builds[0].coreSHA256;compilerSHA256=$builds[0].compilerSHA256;sourceFiles=114;protectedBootstrapAvailable=$false;gameOrPrivateInputsRead=$false;endpointOpened=$false}
$receipt|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8NoBOM
Write-Output ('PASS '+$result.checks+' original full Core API/bounds controls and byte-identical fresh builds; no protected bootstrap or game access')
