# Fresh original synthetic files only. No installation path is opened or statted.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Check([bool]$ok,[string]$why){if(!$ok){throw $why}}
$overridePattern='^(COR_|CORECLR_|COMPLUS_|DOTNET_)|^(APPDOMAIN_MANAGER_ASM|APPDOMAIN_MANAGER_TYPE|DEVPATH)$'
$inherited=@(Get-ChildItem Env:|Where-Object Name -Match $overridePattern|ForEach-Object{@{name=$_.Name;value=$_.Value}})
try{
foreach($entry in $inherited){Remove-Item -LiteralPath ('Env:\'+$entry.name)}
$root=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $root){throw 'Fresh synthetic acquisition output required'}
[IO.Directory]::CreateDirectory($root)|Out-Null
$results=@()
$cases=@('success-small','success-maximum','wrong-header','header-count','wrong-tag','growth','shrink','missing','timeout','bad-digest','reparse','write-sharing','output-precreated','oversized-manifest','clr-environment','oversized-range')
foreach($case in $cases){
 $directory=Join-Path $root $case
 & (Join-Path $repo 'tools/world041-prepare-ciphertext-candidate.ps1') -OutputRoot $directory -GameRoot C:\unused -Synthetic
 $manifestPath=Join-Path $directory 'manifest.json'
 $pins=Get-Content -LiteralPath (Join-Path $directory 'preparation.json') -Raw|ConvertFrom-Json
 $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
 if($case-eq'success-maximum'){
  $data=New-Object byte[] 65536
  [BitConverter]::GetBytes([uint32]0x52504637).CopyTo($data,0)
  [BitConverter]::GetBytes([uint32]3).CopyTo($data,4)
  [BitConverter]::GetBytes([uint32]46080).CopyTo($data,8)
  [BitConverter]::GetBytes([uint32]0x0FEFFFFF).CopyTo($data,12)
  for($i=16;$i-lt46144;$i++){$data[$i]=[byte](($i*53+7)-band255)}
  [IO.File]::WriteAllBytes($manifest.sourceFile,$data)
  $header=New-Object byte[] 16
  [Array]::Copy($data,$header,16)
  $manifest.expectedArchiveBytes=65536;$manifest.expectedEntryCount=3;$manifest.expectedNamesBytes=46080;$manifest.ciphertextBytes=46128;$manifest.maximumInstalledReadBytes=46144
  $manifest.expectedHeaderSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($header)).ToLowerInvariant()
 }
 if($case-in@('wrong-header','wrong-tag')){
  $data=[IO.File]::ReadAllBytes($manifest.sourceFile)
  if($case-eq'wrong-header'){$data[0]=0}else{[BitConverter]::GetBytes([uint32]0x12345678).CopyTo($data,12)}
  [IO.File]::WriteAllBytes($manifest.sourceFile,$data)
 }
 if($case-eq'header-count'){$manifest.expectedEntryCount=3;$manifest.ciphertextBytes=80;$manifest.maximumInstalledReadBytes=96}
 if($case-eq'growth'){$handle=[IO.File]::Open($manifest.sourceFile,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$handle.WriteByte(1)}finally{$handle.Dispose()}}
 if($case-eq'shrink'){$handle=[IO.File]::Open($manifest.sourceFile,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$handle.SetLength(32)}finally{$handle.Dispose()}}
 if($case-eq'missing'){$manifest.sourceFile=Join-Path $directory 'absent.bin'}
 if($case-eq'timeout'){$manifest|Add-Member syntheticDelayMs 6000}
 if($case-eq'output-precreated'){$manifest|Add-Member syntheticPrecreateCiphertext $true}
 if($case-eq'oversized-manifest'){$manifest|Add-Member padding ('x'*20000)}
 if($case-eq'oversized-range'){$manifest.ciphertextBytes=46144}
 if($case-eq'reparse'){
  $target=Join-Path $directory 'original-source';[IO.Directory]::CreateDirectory($target)|Out-Null
  [IO.File]::WriteAllBytes((Join-Path $target 'synthetic.bin'),[IO.File]::ReadAllBytes($manifest.sourceFile))
  $link=Join-Path $directory 'source-link';New-Item -ItemType Junction -Path $link -Target $target|Out-Null
  $manifest.sourceFile=Join-Path $link 'synthetic.bin'
 }
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
 $sha=Hash $manifestPath
 if($case-eq'bad-digest'){$sha='0'*64}
 $writer=$null
 if($case-eq'write-sharing'){$writer=[IO.File]::Open($manifest.sourceFile,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::ReadWrite)}
 if($case-eq'clr-environment'){$env:DOTNET_STARTUP_HOOKS='original-synthetic-rejection-control'}
 try{& $pins.command[0] --supervise $manifestPath $sha *> (Join-Path $directory 'invocation.log');$code=$LASTEXITCODE}
 finally{if($writer){$writer.Dispose()};if($case-eq'clr-environment'){Remove-Item Env:\DOTNET_STARTUP_HOOKS}}
 if($case-like'success-*'){
  Check ($code-eq0) 'synthetic opaque ciphertext capture failed'
  $acquired=Get-Content -LiteralPath (Join-Path $directory 'result/acquisition.json') -Raw|ConvertFrom-Json
  $supervision=Get-Content -LiteralPath (Join-Path $directory 'result/supervision.json') -Raw|ConvertFrom-Json
  $ciphertext=[IO.File]::ReadAllBytes((Join-Path $directory 'result/ciphertext.bin'))
  $source=[IO.File]::ReadAllBytes($manifest.sourceFile)
  $expected=New-Object byte[] ([int]$manifest.ciphertextBytes)
  [Array]::Copy($source,16,$expected,0,$expected.Length)
  Check ([Convert]::ToBase64String($ciphertext)-ceq[Convert]::ToBase64String($expected)) 'capture differs from exact original synthetic ciphertext range'
  Check ((Hash (Join-Path $directory 'result/ciphertext.bin'))-ceq$acquired.ciphertextSHA256) 'opaque output digest'
  Check ($acquired.archiveFileName-ceq[IO.Path]::GetFileName($manifest.sourceFile)-and$acquired.resolvedSourcePath-ieq$manifest.sourceFile) 'private resolved source path/case not retained'
  Check ($acquired.headerBytesRead-eq16-and$acquired.ciphertextBytesRead-eq$expected.Length-and$acquired.totalSourceBytesRead-eq16+$expected.Length-and$acquired.sourceReadCalls-eq2-and!$acquired.tableParsed-and!$acquired.decryptionAttempted-and$acquired.keysRead-eq0-and$acquired.memberPayloadsRead-eq0-and$supervision.joined-and!$supervision.gameFilesRead) 'scope, two-read, join or no-parser evidence'
  Check ((Get-Item -LiteralPath (Join-Path $directory 'invocation.log')).Length-lt4096) 'ciphertext entered stdout pipe'
  & $pins.command[0] --supervise $manifestPath $sha *> (Join-Path $directory 'rejected-reuse.log')
  Check ($LASTEXITCODE-ne0) 'consumed synthetic attempt reused'
 }elseif($case-in@('bad-digest','oversized-manifest','clr-environment','oversized-range')){
  Check ($code-ne0-and!(Test-Path -LiteralPath (Join-Path $directory 'consumed'))-and!(Test-Path -LiteralPath (Join-Path $directory 'result'))) 'preflight rejection consumed or created result'
 }else{
  Check ($code-ne0) 'negative opaque acquisition unexpectedly succeeded'
  $failure=Get-Content -LiteralPath (Join-Path $directory 'result/failure-supervision.json') -Raw|ConvertFrom-Json
  Check ($failure.joined-and$failure.consumed-and$failure.childCreated-and$failure.assigned-and!$failure.tableParsed-and!$failure.decryptionAttempted-and$failure.keysRead-eq0) 'failed helper did not exit/join with consumed no-parser evidence'
  Check (!(Test-Path -LiteralPath (Join-Path $directory 'result/acquisition.json'))) 'failed helper published success receipt'
  if($case-eq'output-precreated'){Check ((Get-Content -LiteralPath (Join-Path $directory 'result/ciphertext.bin') -Raw)-ceq'original synthetic create-new rejection control') 'precreated private output changed'}else{Check (!(Test-Path -LiteralPath (Join-Path $directory 'result/ciphertext.bin'))) 'failed helper published ciphertext'}
 }
 $results+=@{case=$case;passed=$true;exitCode=$code;gameFilesRead=$false;endpointOpened=$false;tableParsed=$false;decryptionAttempted=$false}
}
# Preparation's retained-evidence reader uses the same pinned no-follow path
# primitives, not a check-then-open PowerShell stream. These are original JSON
# receipts generated from the synthetic source, never prior installed inputs.
$sample=Get-Content -LiteralPath (Join-Path $root 'success-small/preparation.json') -Raw|ConvertFrom-Json
$sampleManifest=Get-Content -LiteralPath (Join-Path $root 'success-small/manifest.json') -Raw|ConvertFrom-Json
$sampleSource=[IO.File]::ReadAllBytes($sampleManifest.sourceFile)
$sampleHeader=New-Object byte[] 16
[Array]::Copy($sampleSource,$sampleHeader,16)
$evidenceDirectory=Join-Path $root 'evidence-original';[IO.Directory]::CreateDirectory($evidenceDirectory)|Out-Null
$evidencePath=Join-Path $evidenceDirectory 'evidence.json'
$evidence=[ordered]@{kind='world04-exact-header-result';bytesRead=16;headerHex=[Convert]::ToHexString($sampleHeader).ToLowerInvariant();headerSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sampleHeader)).ToLowerInvariant();archiveBytes=$sampleManifest.expectedArchiveBytes;declaredEntryCount=$sampleManifest.expectedEntryCount;declaredNamesBytes=$sampleManifest.expectedNamesBytes;encryptionTag=[uint32]0x0FEFFFFF;tableBytesRead=0;memberPayloadsRead=0;keysRead=0}
$evidence|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $evidencePath -Encoding utf8NoBOM
$evidenceHash=Hash $evidencePath
& $sample.command[0] --retained-header-evidence $evidencePath $evidenceHash *> (Join-Path $root 'evidence-success.log')
Check ($LASTEXITCODE-eq0) 'bounded retained evidence qualification failed'
$qualified=Get-Content -LiteralPath (Join-Path $root 'evidence-success.log') -Raw|ConvertFrom-Json
Check (!$qualified.gameFilesRead-and$qualified.retainedEvidenceSHA256-ceq$evidenceHash-and$qualified.headerSHA256-ceq$evidence.headerSHA256) 'retained evidence digest/scope mismatch'
$results+=@{case='retained-evidence-success';passed=$true;exitCode=0;gameFilesRead=$false}
& $sample.command[0] --retained-header-evidence $evidencePath ('0'*64) *> (Join-Path $root 'evidence-digest-rejected.log')
Check ($LASTEXITCODE-ne0) 'wrong retained evidence digest accepted'
$results+=@{case='retained-evidence-wrong-digest';passed=$true;exitCode=$LASTEXITCODE;gameFilesRead=$false}
$evidenceLink=Join-Path $root 'evidence-linked';New-Item -ItemType Junction -Path $evidenceLink -Target $evidenceDirectory|Out-Null
& $sample.command[0] --retained-header-evidence (Join-Path $evidenceLink 'evidence.json') $evidenceHash *> (Join-Path $root 'evidence-junction-rejected.log')
Check ($LASTEXITCODE-ne0) 'retained evidence junction accepted'
$results+=@{case='retained-evidence-junction';passed=$true;exitCode=$LASTEXITCODE;gameFilesRead=$false}
$evidenceHardlink=Join-Path $root 'evidence-hardlink.json';New-Item -ItemType HardLink -Path $evidenceHardlink -Target $evidencePath|Out-Null
& $sample.command[0] --retained-header-evidence $evidenceHardlink $evidenceHash *> (Join-Path $root 'evidence-hardlink-rejected.log')
Check ($LASTEXITCODE-ne0) 'retained evidence hardlink accepted'
$results+=@{case='retained-evidence-hardlink';passed=$true;exitCode=$LASTEXITCODE;gameFilesRead=$false}
$results|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'result.json') -Encoding utf8NoBOM
Write-Output 'PASS 20 synthetic opaque acquisition/evidence controls, max46128-byte private capture, one-shot reuse rejection'
}finally{
 Get-ChildItem Env:|Where-Object Name -Match $overridePattern|ForEach-Object{Remove-Item -LiteralPath ('Env:\'+$_.Name)}
 foreach($entry in $inherited){Set-Item -LiteralPath ('Env:\'+$entry.name) -Value $entry.value}
}
