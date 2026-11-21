#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.local\menu03-preparation-01\diagnostic-checks-01'}
if(![IO.Path]::IsPathFullyQualified($OutputRoot)){$OutputRoot=Join-Path $repo $OutputRoot}
$out=[IO.Path]::GetFullPath($OutputRoot)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$out.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Fresh private repository fixture output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){
 $item=$null
 try{$item=Get-Item -LiteralPath $at -Force -ErrorAction Stop}catch{if($_.CategoryInfo.Category-ne[Management.Automation.ErrorCategory]::ObjectNotFound){throw}}
 if($null-ne$item-and($item.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked test path refused'}
}
if(Test-Path -LiteralPath $out){throw 'Existing fixture output; do not overwrite earlier evidence'}
[IO.Directory]::CreateDirectory($out)|Out-Null
function Hash($Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function NewJson($Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 10));$s=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$adapter=Join-Path $repo 'src\acoustics\bridge\Rph\InGameMenu.Rph.cs'
$formatterTest=Join-Path $repo 'tests\menu\TestMenuFailureDiagnostics.cs'
$adapterTest=Join-Path $repo 'tests\menu\TestMenuFailureAdapter.cs'
$doubles=Join-Path $repo 'tests\menu\MenuFailureFakeRph.cs'
$core=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\settings\InGame') -Filter '*.cs'|Sort-Object Name|ForEach-Object FullName)
$settings=Join-Path $repo 'src\acoustics\host\Windows\AcousticSettings.cs'
$diagnostic=Join-Path $repo 'src\acoustics\host\Windows\MenuDiagnostic.cs'
$sources=@($adapter,$formatterTest,$adapterTest,$doubles,$settings,$diagnostic)+$core
$inputs=@($sources|Select-Object -Unique|ForEach-Object{[ordered]@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Hash $_)}})
NewJson (Join-Path $out 'started.json') ([ordered]@{kind='MenuFailureFocusedDiagnosticFixtures';startedUtc=[DateTime]::UtcNow.ToString('o');sourceInputs=$inputs;compilerSha256=(Hash $compiler);powershell=$PSVersionTable.PSVersion.ToString();singleUseOutput=$true;retainedCandidateOpenedOrWritten=$false})
$commands=[Collections.Generic.List[object]]::new()
function Run([string]$Label,[string]$Exe,[string[]]$Arguments){
 $log=Join-Path $out ($Label+'.log')
 & $Exe @Arguments *> $log
 $exit=$LASTEXITCODE
 $commands.Add([ordered]@{label=$Label;exitCode=$exit;log=[IO.Path]::GetFileName($log);sha256=(Hash $log)})
 Get-Content -LiteralPath $log
 if($exit-ne0){throw ($Label+' failed; original log retained')}
}
$success=$false
try{
 $common=@('/nologo','/warnaserror+','/langversion:5','/platform:x64','/debug:full','/optimize-','/r:System.Web.Extensions.dll')
 $pure=Join-Path $out 'MenuFailure.Formatter.Tests.exe'
 Run 'formatter-compile' $compiler ($common+@('/define:MENU_DIAGNOSTICS_ONLY','/main:TestMenuFailureDiagnostics',('/out:'+$pure),$adapter,$formatterTest))
 Run 'formatter-tests' $pure @($out)
 $combined=Join-Path $out 'MenuFailure.AdapterStub.Tests.exe'
 Run 'adapter-compile' $compiler ($common+@('/define:PLAYABLE_PRODUCT','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:Microsoft.CSharp.dll','/main:TestMenuFailureAdapter',('/out:'+$combined),$adapter,$adapterTest,$doubles,$settings,$diagnostic)+$core)
 Run 'adapter-tests' $combined @($out)
 foreach($pin in $inputs){if((Hash $pin.path)-cne$pin.sha256){throw 'Source changed during diagnostic fixtures'}}
 $success=$true
}finally{
 NewJson (Join-Path $out 'result.json') ([ordered]@{kind='MenuFailureFocusedDiagnosticFixtureReceipt';schema=1;completedUtc=[DateTime]::UtcNow.ToString('o');passed=$success;commands=@($commands.ToArray());sourceInputs=$inputs;separatePopulations=@('Actual formatter helper','Actual adapter against authored API/worker doubles');privateSdkRead=$false;retainedCandidateReadOrWritten=$false;installedFilesReadOrWritten=$false;gameRphOrEndpointUsed=$false;recordingStarted=$false;actualRuntimeCauseProven=$false})
}
if(!$success){exit 1}
