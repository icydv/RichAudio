#requires -Version 7.0
param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant()-ne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Authentic pinned SHVDNE API3 required'}
$out=[IO.Path]::GetFullPath($Output)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local/gate-a-shvdne-private-01')).TrimEnd('\')+'\'
if(!$out.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private Gate A output required'}
foreach($path in @($out,$api)){for($at=[IO.Path]::GetFullPath($path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path refused'}}}
[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('PrivateAssignmentController.cs','PrivateProfile.Shvdne.cs','PrivateResourceAdmission.cs','PrivateCandidateBinding.cs','SupervisorProtocol.cs')|ForEach-Object{Join-Path $repo ('tools/native-control/private-profile/'+$_)}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary=Join-Path $out 'RichAudio.GateAPrivate01.Shvdne.dll'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:library /r:System.Core.dll /r:System.Windows.Forms.dll ('/r:'+$api) ('/out:'+$binary) @sources
if($LASTEXITCODE){throw 'Private probe build failed'}
@'
; Experimental candidate is also compile-time blocked pending qualified registration.
Enabled=false
SupervisorSession=
'@|Set-Content -LiteralPath (Join-Path $out 'RichAudio.GateAPrivate01.Shvdne.ini') -Encoding ascii
$receipt=[ordered]@{schema=1;kind='GATE-A-SHVDNE-PRIVATE-01-offline-probe-build';branch=(& git -C $repo branch --show-current);base=(& git -C $repo rev-parse HEAD);profile='ra_gapriv01_bati';profileHash='dd89929d';framework='.NET Framework 4.8';platform='x64';apiAssemblyVersion=([Reflection.AssemblyName]::GetAssemblyName($api)).Version.ToString();apiSha256=(Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant();compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();offlineRegistrationAdmitted=$false;compileTimeActivationBlocked=$true;blocker='qualified Enhanced mods-loader identity and cache/registration contract';installed=$false;gameLaunched=$false;nativeAssignmentsExecuted=$false;runtimeProfileResolution='UNQUALIFIED';observationPerformance='FAIL';productionHostIncluded=$false;sources=@(($sources+@($PSCommandPath))|ForEach-Object{[ordered]@{path=[IO.Path]::GetRelativePath($repo,$_).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});outputs=@(Get-ChildItem -LiteralPath $out -File|ForEach-Object{[ordered]@{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant();bytes=$_.Length}})}
$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $out 'build-receipt.json') -Encoding utf8
Write-Output ($binary+' '+(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant())
