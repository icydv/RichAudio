#requires -Version 7.0
param([Parameter(Mandatory)][string]$CodeWalkerCore,[Parameter(Mandatory)][string]$ResourceDirectory,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh project-private fixture output required'}
for($dir=$out;$dir;$dir=[IO.Path]::GetDirectoryName($dir)){if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
[void][IO.Directory]::CreateDirectory($out)
$validate=Join-Path $repo 'tools/native-control/private-profile/ResourceValidate.ps1'
$pin=(Get-FileHash -LiteralPath (Join-Path $ResourceDirectory 'resource-manifest.json')).Hash.ToLowerInvariant()
$cases=[Collections.Generic.List[object]]::new()
$result=& $validate -CodeWalkerCore $CodeWalkerCore -ResourceDirectory $ResourceDirectory -ExpectedManifestSha256 $pin | ConvertFrom-Json
if(!$result.passed){throw 'Positive resource validation failed'}
$cases.Add(@{name='real-four-record-closure-and-original-wave-roundtrip';passed=$true})
function Reject([string]$name,[scriptblock]$mutate,[bool]$reseal=$false){
 $dir=Join-Path $out $name
 Copy-Item -LiteralPath $ResourceDirectory -Destination $dir -Recurse
 & $mutate $dir
 $expected=if($reseal){(Get-FileHash -LiteralPath (Join-Path $dir 'resource-manifest.json')).Hash.ToLowerInvariant()}else{$pin}
 $caught=$null
 try { & $validate -CodeWalkerCore $CodeWalkerCore -ResourceDirectory $dir -ExpectedManifestSha256 $expected | Out-Null }catch{$caught=$_.Exception.Message}
 if(!$caught){throw "Unexpected resource acceptance: $name"}
 $cases.Add(@{name=$name;passed=$true;rejection=$caught})
}
Reject 'tampered-awc' {param($d) $p=Join-Path $d 'ra_private01_marker.awc';$b=[IO.File]::ReadAllBytes($p);$b[$b.Length-1]=$b[$b.Length-1] -bxor 1;[IO.File]::WriteAllBytes($p,$b)}
Reject 'missing-dat54' {param($d) Remove-Item -LiteralPath (Join-Path $d 'ra_private01_sounds.dat54.rel')}
Reject 'changed-manifest' {param($d) Add-Content -LiteralPath (Join-Path $d 'resource-manifest.json') -Value ' '}
Reject 'wrong-fixed-profile-even-resealed' {param($d) $p=Join-Path $d 'resource-manifest.json';$m=Get-Content -LiteralPath $p -Raw|ConvertFrom-Json;$m.profileName='adder';[IO.File]::WriteAllText($p,($m|ConvertTo-Json -Depth 30))} $true
Reject 'changed-audit' {param($d) Add-Content -LiteralPath (Join-Path $d 'namespace-audit.json') -Value ' '}
Reject 'wrong-role-even-resealed' {param($d) $p=Join-Path $d 'resource-manifest.json';$m=Get-Content -LiteralPath $p -Raw|ConvertFrom-Json;$m.files[0].role='AUDIO_SOUNDDATA';[IO.File]::WriteAllText($p,($m|ConvertTo-Json -Depth 30))} $true
Reject 'path-escape-even-resealed' {param($d) $p=Join-Path $d 'resource-manifest.json';$m=Get-Content -LiteralPath $p -Raw|ConvertFrom-Json;$m.markerManifest.path='../resource-manifest.json';[IO.File]::WriteAllText($p,($m|ConvertTo-Json -Depth 30))} $true
$receipt=@{schema='RichAudioPrivateResourceFixtures01';passed=$cases.Count;cases=$cases;resourceManifestSha256=$pin;validatorSha256=(Get-FileHash -LiteralPath $validate).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $out 'result.json'),($receipt|ConvertTo-Json -Depth 8))
$receipt|ConvertTo-Json -Depth 8
