#requires -Version 7.0
param(
 [Parameter(Mandatory)][string]$ResourceDirectory,
 [Parameter(Mandatory)][string]$RetainedRelDirectory,
 [Parameter(Mandatory)][string]$DecodedBatiAwc,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent;$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh private fixtures required'}
for($p=$out;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
[void][IO.Directory]::CreateDirectory($out)
$validate=Join-Path $repo 'tools/native-control/native-suppression01/Test-IdleResources.ps1'
$pack=Join-Path $repo 'tools/native-control/native-suppression01/Build-IdleDlc.ps1'
$parameters=@{RetainedRelDirectory=$RetainedRelDirectory;DecodedBatiAwc=$DecodedBatiAwc;CodeWalkerCore=$CodeWalkerCore}
$positive=& $validate -ResourceDirectory $ResourceDirectory @parameters|ConvertFrom-Json
if(!$positive.passed -or $positive.checks -ne 71){throw 'Real resource verification failed'}
$cases=@(@{name='real-binary-readback';passed=$true;checks=$positive.checks})
function Reject([string]$name,[scriptblock]$mutate,[string]$expected,[bool]$packOnly=$false){
 $dir=Join-Path $out $name;Copy-Item -LiteralPath $ResourceDirectory -Destination $dir -Recurse
 & $mutate $dir
 $failure=$null
 try {if($packOnly){& $pack -ResourceRoot $dir -Output (Join-Path $out ($name+'-dlc')) -CodeWalkerCore $CodeWalkerCore|Out-Null}else{& $validate -ResourceDirectory $dir @parameters|Out-Null}}catch{$failure=$_.Exception.Message}
 if(!$failure -or $failure -notlike ('*'+$expected+'*')){throw "Wrong rejection for ${name}: $failure"}
 $script:cases+=@{name=$name;passed=$true;reason=$failure}
}
function MutateAwc([string]$dir,[string]$variant,[scriptblock]$change){
 $p=Join-Path $dir ('ra_ns01_idle_'+$variant+'.awc');$e=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$e.Name=[IO.Path]::GetFileName($p);$a=[CodeWalker.GameFiles.AwcFile]::new();$a.Load([IO.File]::ReadAllBytes($p),$e);& $change $a;[IO.File]::WriteAllBytes($p,$a.Save())
}
Reject 'silent-wave-nonzero' {param($d) MutateAwc $d 'c' {param($a) $a.Streams[0].DataChunk.Data[200]=1}} 'C PCM and derived peaks exactly zero'
Reject 'changed-grain-trailer' {param($d) MutateAwc $d 'b' {param($a) $a.Streams[0].GranularGrainsChunk.UnkFloat1=0.5}} 'Every grain byte and trailer preserved'
Reject 'changed-headroom' {param($d) MutateAwc $d 'b' {param($a) $a.Streams[0].FormatChunk.Headroom=0}} 'Nonpeak format bytes preserved'
Reject 'changed-untargeted-channel' {param($d)
 $p=Join-Path $d 'ra_ns01_sounds.dat54.rel';$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load([IO.File]::ReadAllBytes($p),$null)
 $r.RelDatas[0].Channel0.ContainerName=[CodeWalker.GameFiles.MetaHash]::new([uint32]1)
 [IO.File]::WriteAllBytes($p,$r.Save())
} 'Untargeted channel retains stock bank'
Reject 'dlc-refuses-tampered-resource' {param($d) $p=Join-Path $d 'ra_ns01_idle_c.awc';$b=[IO.File]::ReadAllBytes($p);$b[-1]=1;[IO.File]::WriteAllBytes($p,$b)} 'Resource manifest integrity differs' $true
$result=@{passed=$true;cases=$cases;binaryChecks=$positive.checks;metrics=$positive.metrics;runtimeVerified=$false}
[IO.File]::WriteAllText((Join-Path $out 'result.json'),($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
$result|ConvertTo-Json -Depth 7
