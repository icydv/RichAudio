# Fresh synthetic files only. No game root is accessed by this test.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Check([bool]$ok,[string]$why){if(!$ok){throw $why}}
# GitHub's CLI first-run preference is unrelated to the Framework header
# fixture. Isolate that one known benign inherited flag in this synthetic
# harness only; the sealed reader keeps its strict environment rejection.
$ciFirstRunFlagName='DOTNET_SKIP_FIRST_TIME_EXPERIENCE'
$ciFirstRunFlagExisted=Test-Path ('Env:\'+$ciFirstRunFlagName)
$ciFirstRunFlagValue=[Environment]::GetEnvironmentVariable($ciFirstRunFlagName,'Process')
try{
Remove-Item ('Env:\'+$ciFirstRunFlagName) -ErrorAction SilentlyContinue
$root=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $root){throw 'Fresh synthetic header test output required'}
[IO.Directory]::CreateDirectory($root)|Out-Null
$results=@()
foreach($case in @('success','missing','timeout','bad-digest','reparse','clr-environment','output-precreated','oversized-manifest')){
 $directory=Join-Path $root $case
 & (Join-Path $repo 'tools/world04-prepare-header-candidate.ps1') -OutputRoot $directory -GameRoot C:\unused -Synthetic
 $manifestPath=Join-Path $directory 'manifest.json';$pins=Get-Content (Join-Path $directory 'preparation.json') -Raw|ConvertFrom-Json
 $manifest=Get-Content $manifestPath -Raw|ConvertFrom-Json
 if($case-eq'missing'){$manifest.sourceFile=Join-Path $directory 'absent.bin'}
 if($case-eq'timeout'){$manifest|Add-Member syntheticDelayMs 6000}
 if($case-eq'output-precreated'){$manifest|Add-Member syntheticPrecreateHeader $true}
 if($case-eq'oversized-manifest'){$manifest|Add-Member padding ('x'*20000)}
 if($case-eq'reparse'){
  $target=Join-Path $directory 'real';[IO.Directory]::CreateDirectory($target)|Out-Null
  [IO.File]::WriteAllBytes((Join-Path $target 'header.bin'),[IO.File]::ReadAllBytes($manifest.sourceFile))
  $linked=Join-Path $directory 'linked';New-Item -ItemType Junction -Path $linked -Target $target|Out-Null
  $manifest.sourceFile=Join-Path $linked 'header.bin'
 }
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
 $sha=Hash $manifestPath
 if($case-eq'bad-digest'){$sha='0'*64}
 if($case-eq'clr-environment'){$env:DOTNET_STARTUP_HOOKS='injected-test'}
 try{& $pins.command[0] --supervise $manifestPath $sha *> (Join-Path $directory 'invocation.log');$code=$LASTEXITCODE}finally{if($case-eq'clr-environment'){Remove-Item Env:\DOTNET_STARTUP_HOOKS}}
 if($case-eq'success'){
  Check ($code-eq0) 'synthetic fixed header did not succeed'
  $header=Get-Content (Join-Path $directory 'result/header.json') -Raw|ConvertFrom-Json
  $supervision=Get-Content (Join-Path $directory 'result/supervision.json') -Raw|ConvertFrom-Json
  Check ($header.bytesRead-eq16-and$header.tableBytesRead-eq0-and$header.memberPayloadsRead-eq0-and$supervision.joined-and!$supervision.gameFilesRead) 'fixed read/join/evidence identity'
  & $pins.command[0] --supervise $manifestPath $sha *> (Join-Path $directory 'rejected-reuse.log')
  Check ($LASTEXITCODE-ne0) 'consumed attempt reused'
 }elseif($case-in@('missing','timeout','reparse','output-precreated')){
  Check ($code-ne0) 'expected helper failure'
  $failure=Get-Content (Join-Path $directory 'result/failure-supervision.json') -Raw|ConvertFrom-Json
  Check ($failure.joined-and$failure.consumed-and$failure.childCreated) 'failed helper did not exit/join with consumed evidence'
  if($case-eq'output-precreated'){Check ((Get-Content (Join-Path $directory 'result/header.json') -Raw)-ceq'synthetic create-new rejection control') 'preexisting receipt was changed'}else{Check (!(Test-Path -LiteralPath (Join-Path $directory 'result/header.json'))) 'failed helper published header'}
 }else{Check ($code-ne0-and!(Test-Path -LiteralPath (Join-Path $directory 'consumed'))) 'preflight rejection consumed or opened input'}
 $results+=@{case=$case;passed=$true;exitCode=$code;gameFilesRead=$false;endpointOpened=$false}
}
$results|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'result.json') -Encoding utf8NoBOM
Write-Output 'PASS 8 synthetic header controls, one-shot reuse rejection, no installed reads'
}finally{
 if($ciFirstRunFlagExisted){Set-Item ('Env:\'+$ciFirstRunFlagName) -Value $ciFirstRunFlagValue}else{Remove-Item ('Env:\'+$ciFirstRunFlagName) -ErrorAction SilentlyContinue}
}
