# Offline refusal and artifact-integrity checks. Disposable copies only; no game writes.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GameRoot,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$task=[IO.Path]::GetFullPath((Join-Path $repo '.local\gate-a-shvdne-private-01')).TrimEnd('\')+'\'
$out=[IO.Path]::GetFullPath($Output)
if(!$out.StartsWith(($task+'registration\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh task registration test output required'}
for($p=$out;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked test output refused'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
$resource=Join-Path $task 'resource';$shadow=Join-Path $task 'registration\shadow-01\shadow-receipt.json';$dlc=Join-Path $task 'registration\dlc-01\dlc-receipt.json'
$manifest=Join-Path $resource 'resource-manifest.json'
$verify=Join-Path $PSScriptRoot 'RegistrationVerify.ps1';$build=Join-Path $PSScriptRoot 'RegistrationDlc.ps1'
$tests=New-Object 'System.Collections.Generic.List[object]'
function Rejected([string]$name,[scriptblock]$action,[string]$expected){
 $message=$null
 try{&$action|Out-Null}catch{$message=$_.Exception.Message}
 if(!$message-or$message-notlike('*'+$expected+'*')){throw ('Expected refusal '+$name+'; actual '+$message)}
 $tests.Add([pscustomobject]@{name=$name;passed=$true;observed=$message})
}
&$verify -GameRoot $GameRoot -ShadowReceipt $shadow -DlcReceipt $dlc -ResourceManifest $manifest -Output (Join-Path $out 'valid-bindings.json')|Out-Null
$valid=Get-Content -LiteralPath (Join-Path $out 'valid-bindings.json') -Raw|ConvertFrom-Json
if(!$valid.completeShadowOfflineVerified-or!$valid.dlcLayoutOfflineVerified-or$valid.offlineRegistrationAdmitted-or$valid.runtimeMounted){throw 'Offline-valid package must remain unadmitted'}
$tests.Add([pscustomobject]@{name='valid-artifacts-remain-unadmitted';passed=$true;observed='Full bound artifacts pass; runtime and registration admission remain false'})
Rejected 'out-of-scope-output' {&$build -ResourceRoot $resource -Output (Join-Path $repo 'registration-test-outside-private-scope')} 'Only private task-local'
$missing=Join-Path $out 'missing-input';[IO.Directory]::CreateDirectory($missing)|Out-Null
Rejected 'missing-resource' {&$build -ResourceRoot $missing -Output (Join-Path $out 'missing-output')} 'Missing resource'
$tampered=Join-Path $out 'tampered-input';[IO.Directory]::CreateDirectory($tampered)|Out-Null
foreach($name in @('resource-manifest.json','ra_private01_game.dat151.rel','ra_private01_sounds.dat54.rel','ra_private01_marker.awc')){[IO.File]::Copy((Join-Path $resource $name),(Join-Path $tampered $name),$false)}
$awc=Join-Path $tampered 'ra_private01_marker.awc';$bytes=[IO.File]::ReadAllBytes($awc);$bytes[0]=$bytes[0]-bxor1;[IO.File]::WriteAllBytes($awc,$bytes)
Rejected 'modified-source-resource' {&$build -ResourceRoot $tampered -Output (Join-Path $out 'tampered-output')} 'Resource manifest integrity differs'
$claims=Get-Content -LiteralPath $dlc -Raw|ConvertFrom-Json;$claims.offlineRegistrationAdmitted=$true
$claimPath=Join-Path $out 'false-admission.json';$claims|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $claimPath -Encoding UTF8
Rejected 'receipt-cannot-grant-admission' {&$verify -GameRoot $GameRoot -ShadowReceipt $shadow -DlcReceipt $claimPath -ResourceManifest $manifest -Output (Join-Path $out 'false-admission-output.json')} 'Offline-only evidence state required'
$corrupt=Get-Content -LiteralPath $dlc -Raw|ConvertFrom-Json
$archive=Join-Path $out 'corrupt-dlc.rpf';$bytes=[IO.File]::ReadAllBytes($corrupt.archive);$bytes[-1]=$bytes[-1]-bxor1;[IO.File]::WriteAllBytes($archive,$bytes)
$corrupt.archive=$archive;$corruptPath=Join-Path $out 'corrupt-archive-receipt.json';$corrupt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $corruptPath -Encoding UTF8
Rejected 'modified-packed-archive' {&$verify -GameRoot $GameRoot -ShadowReceipt $shadow -DlcReceipt $corruptPath -ResourceManifest $manifest -Output (Join-Path $out 'corrupt-archive-output.json')} 'Bound file integrity mismatch'
$receipt=[ordered]@{schema=1;state='passed';tests=$tests.ToArray();count=$tests.Count;gameFilesWritten=$false;gameLaunched=$false;runtimeMounted=$false;offlineRegistrationAdmitted=$false}
$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'test-results.json') -Encoding UTF8
Write-Output ('PASS '+$tests.Count+' registration checks: '+$out)
