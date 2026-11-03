# Original authored PE bytes only. No supplied tool/game file is inspected.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
function Check([bool]$ok,[string]$why){if(!$ok){throw $why}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Put16([byte[]]$b,[int]$at,[uint16]$n){[BitConverter]::GetBytes($n).CopyTo($b,$at)}
function Put32([byte[]]$b,[int]$at,[uint32]$n){[BitConverter]::GetBytes($n).CopyTo($b,$at)}
function Node([string]$key,[byte[]]$value,[uint16]$type,[byte[][]]$children){
 $keyBytes=[Text.Encoding]::Unicode.GetBytes($key+[char]0)
 $vAt=(6+$keyBytes.Length+3)-band(-bnot3)
 $length=$vAt+$value.Length
 foreach($child in $children){$length=($length+3)-band(-bnot3);$length+=$child.Length}
 $b=New-Object byte[] $length;Put16 $b 0 $length;Put16 $b 2 $(if($type-eq1){$value.Length/2}else{$value.Length});Put16 $b 4 $type
 $keyBytes.CopyTo($b,6);$value.CopyTo($b,$vAt);$at=$vAt+$value.Length
 foreach($child in $children){$at=($at+3)-band(-bnot3);$child.CopyTo($b,$at);$at+=$child.Length}
 return ,$b
}
function OriginalPe([string]$productName='Original PE test fixture') {
 $strings=Node 'ProductName' ([Text.Encoding]::Unicode.GetBytes($productName+[char]0)) 1 @()
 $versionString=Node 'FileVersion' ([Text.Encoding]::Unicode.GetBytes('3.4.5.6'+[char]0)) 1 @()
 $table=Node '040904B0' @() 1 @($strings,$versionString)
 $info=Node 'StringFileInfo' @() 1 (,$table)
 $fixed=New-Object byte[] 52;Put32 $fixed 0 4277077181;Put32 $fixed 4 65536;Put32 $fixed 8 196612;Put32 $fixed 12 327686;Put32 $fixed 16 458760;Put32 $fixed 20 589834
 $version=Node 'VS_VERSION_INFO' $fixed 0 (,$info)
 $b=New-Object byte[] 8192;Put16 $b 0 23117;Put32 $b 60 128;Put32 $b 128 17744;Put16 $b 132 34404;Put16 $b 134 1;Put16 $b 148 240
 $opt=152;Put16 $b $opt 523;Put32 $b ($opt+60) 512;Put32 $b ($opt+108) 16;Put32 $b ($opt+128) 4096;Put32 $b ($opt+132) 4096
 $section=$opt+240;[Text.Encoding]::ASCII.GetBytes('.rsrc').CopyTo($b,$section);Put32 $b ($section+8) 4096;Put32 $b ($section+12) 4096;Put32 $b ($section+16) 4096;Put32 $b ($section+20) 512
 # Root has an unrelated opaque original resource entry. Its payload at2560
 # must never be followed or included in any recorded read range.
 $r=512;Put16 $b ($r+14) 2;Put32 $b ($r+16) 10;Put32 $b ($r+20) 96;Put32 $b ($r+24) 16;Put32 $b ($r+28) 2147483680
 Put16 $b ($r+32+14) 1;Put32 $b ($r+48) 1;Put32 $b ($r+52) 2147483704
 Put16 $b ($r+56+14) 1;Put32 $b ($r+72) 1033;Put32 $b ($r+76) 80
 Put32 $b ($r+80) 4224;Put32 $b ($r+84) $version.Length
 Put32 $b ($r+96) 6144;Put32 $b ($r+100) 64
 $version.CopyTo($b,$r+128);[Text.Encoding]::ASCII.GetBytes('ORIGINAL-OPAQUE-RESOURCE-MUST-NOT-BE-READ').CopyTo($b,2560)
 return ,$b
}
$pattern='^(COR_|CORECLR_|COMPLUS_|DOTNET_)|^(APPDOMAIN_MANAGER_ASM|APPDOMAIN_MANAGER_TYPE|DEVPATH)$'
$inherited=@(Get-ChildItem Env:|Where-Object Name -Match $pattern|ForEach-Object {@{name=$_.Name;value=$_.Value}})
try{
 foreach($v in $inherited){Remove-Item -LiteralPath ('Env:\'+$v.name)}
 $root=[IO.Path]::GetFullPath($OutputRoot);$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
 Check ($root.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)-and!(Test-Path -LiteralPath $root)) 'Fresh private synthetic output required'
 [IO.Directory]::CreateDirectory($root)|Out-Null;$results=@()
 $literalOnly=Join-Path $root 'unopened-original.exe';$lexicalDir=Join-Path $root 'lexical-prepare-only'
 & (Join-Path $repo 'tools/world05-prepare-tool-metadata.ps1') -OutputRoot $lexicalDir -ToolPath $literalOnly
 $lexical=Get-Content -LiteralPath (Join-Path $lexicalDir 'preparation.json') -Raw|ConvertFrom-Json
 Check (!$lexical.sourceOpened-and!$lexical.sourceStatted-and!(Test-Path -LiteralPath $literalOnly)-and!(Test-Path -LiteralPath (Join-Path $lexicalDir 'consumed'))) 'Literal-only preparation inspected or created original source'
 $results+=@{case='lexical-prepare-only';passed=$true;sourceOnlyOriginalFixture=$true;gameFilesRead=$false;audioEndpointOpened=$false}
 $guardDir=Join-Path $root 'prepare-clr-environment';$guardRejected=$false;$env:DOTNET_STARTUP_HOOKS='original-preparation-negative'
 try{try{& (Join-Path $repo 'tools/world05-prepare-tool-metadata.ps1') -OutputRoot $guardDir -Synthetic}catch{$guardRejected=$_.Exception.Message.Contains('before compiler/helper launch')}}finally{Remove-Item Env:\DOTNET_STARTUP_HOOKS}
 Check ($guardRejected-and!(Test-Path -LiteralPath $guardDir)) 'Inherited CLR override was not refused before compiler/helper launch'
 $results+=@{case='prepare-clr-environment';passed=$true;sourceOnlyOriginalFixture=$true;gameFilesRead=$false;audioEndpointOpened=$false}
 foreach($case in @('success','pe32','unicode-version','pipe-boundary','missing','bad-mz','pe-outside-header','missing-version','bad-resource-rva','oversized-version','version-signature','overlap-sections','timeout','bad-manifest-digest','oversized-manifest','clr-environment','junction','hardlink','oversized-source','write-sharing')){
  $dir=Join-Path $root $case
  & (Join-Path $repo 'tools/world05-prepare-tool-metadata.ps1') -OutputRoot $dir -Synthetic
  $manifestPath=Join-Path $dir 'manifest.json';$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json;$pins=Get-Content -LiteralPath (Join-Path $dir 'preparation.json') -Raw|ConvertFrom-Json
  $productName=if($case-eq'unicode-version'){'Original café Ω fixture'}else{'Original PE test fixture'}
  $b=OriginalPe $productName
  switch($case){
   'pe32' {Put16 $b 132 332;Put16 $b 148 224;Put16 $b 152 267;Put32 $b (152+92) 16;Put32 $b (152+112) 4096;Put32 $b (152+116) 4096;[Array]::Copy($b,392,$b,376,40)}
   'bad-mz' {Put16 $b 0 0}
   'pe-outside-header' {Put32 $b 60 5000}
   'missing-version' {Put32 $b (512+24) 17}
   'bad-resource-rva' {Put32 $b (152+128) 2147483647}
   'oversized-version' {Put32 $b (512+84) 16385}
   'version-signature' {Put32 $b (512+128+40) 0}
   'overlap-sections' {Put16 $b 134 2;[Array]::Copy($b,392,$b,432,40)}
   'timeout' {$manifest|Add-Member syntheticDelayMs 6000}
   'pipe-boundary' {$manifest|Add-Member syntheticPipeBoundaryProbe $true}
   'oversized-manifest' {$manifest|Add-Member padding ('x'*32769)}
  }
  if($case-ne'missing'){[IO.File]::WriteAllBytes($manifest.sourceFile,$b)}
  if($case-eq'hardlink'){New-Item -ItemType HardLink -Path (Join-Path $dir 'original-alias.exe') -Target $manifest.sourceFile|Out-Null}
  if($case-eq'oversized-source'){$large=[IO.File]::Open($manifest.sourceFile,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$large.SetLength(33554433)}finally{$large.Dispose()}}
  if($case-eq'junction'){$real=Join-Path $dir 'real';[IO.Directory]::CreateDirectory($real)|Out-Null;[IO.File]::WriteAllBytes((Join-Path $real 'original-tool.exe'),$b);$link=Join-Path $dir 'linked';New-Item -ItemType Junction -Path $link -Target $real|Out-Null;$manifest.sourceFile=Join-Path $link 'original-tool.exe'}
  $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM;$digest=Hash $manifestPath;if($case-eq'bad-manifest-digest'){$digest='0'*64}
  $lock=$null;if($case-eq'write-sharing'){$lock=[IO.File]::Open($manifest.sourceFile,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::ReadWrite)}
  if($case-eq'clr-environment'){$env:DOTNET_STARTUP_HOOKS='original-negative-fixture'}
  try{& $pins.command[0] --supervise $manifestPath $digest *> (Join-Path $dir 'invocation.log');$code=$LASTEXITCODE}finally{if($lock){$lock.Dispose()};if($case-eq'clr-environment'){Remove-Item Env:\DOTNET_STARTUP_HOOKS}}
  if($case-in@('success','pe32','unicode-version')){
   Check ($code-eq0) 'Original PE metadata capture failed'
   $metadata=Get-Content -LiteralPath (Join-Path $dir 'result/metadata.json') -Raw|ConvertFrom-Json;$supervision=Get-Content -LiteralPath (Join-Path $dir 'result/supervision.json') -Raw|ConvertFrom-Json
   Check ($metadata.sourceReadCalls-eq11-and$metadata.totalSourceBytesRead-le65536-and$supervision.joined-and$supervision.readersJoined-and!$metadata.wholeBinaryAuthenticated-and$null-eq$metadata.wholeBinarySHA256) 'PE fixed-scope read/identity/authority mismatch'
   Check (($metadata.fileVersion-join'.')-ceq'3.4.5.6'-and$metadata.versionStrings.ProductName-ceq$productName) 'Original authored version metadata changed'
   foreach($range in $metadata.ranges){Check (!(($range.offset-lt2624)-and($range.offset+$range.bytes-gt2560))) 'Unrelated opaque resource payload read';Check (!(($range.offset-lt128)-and($range.offset+$range.bytes-gt64))) 'DOS stub/code bytes read'}
   & $pins.command[0] --supervise $manifestPath $digest *> (Join-Path $dir 'rejected-reuse.log');Check ($LASTEXITCODE-ne0) 'Consumed original preparation reused'
  }elseif($case-in@('bad-manifest-digest','oversized-manifest','clr-environment')){Check ($code-ne0-and!(Test-Path -LiteralPath (Join-Path $dir 'consumed'))) 'Expected preflight rejection without source read'}else{
   Check ($code-ne0) ('Expected PE rejection: '+$case)
   $failure=Get-Content -LiteralPath (Join-Path $dir 'result/failure-supervision.json') -Raw|ConvertFrom-Json
   Check ($failure.joined-and$failure.readersJoined-and$failure.consumed-and$failure.childCreated-and!(Test-Path -LiteralPath (Join-Path $dir 'result/metadata.json'))) 'Failure missing joined/consumed evidence or published metadata'
   if($case-eq'pipe-boundary'){Check ((Get-Content -LiteralPath (Join-Path $dir 'invocation.log') -Raw).Contains('metadata receipt bounds')) '4096-byte original JSON plus newline did not drain before schema rejection'}
  }
  $results+=@{case=$case;passed=$true;exitCode=$code;sourceOnlyOriginalFixture=$true;gameFilesRead=$false;audioEndpointOpened=$false}
 }
 $results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $root 'result.json') -Encoding utf8NoBOM
 Write-Output ('PASS '+$results.Count+' original PE metadata controls; no supplied tool or installed source read')
}finally{
 Get-ChildItem Env:|Where-Object Name -Match $pattern|ForEach-Object {Remove-Item -LiteralPath ('Env:\'+$_.Name)}
 foreach($v in $inherited){Set-Item -LiteralPath ('Env:\'+$v.name) -Value $v.value}
}
