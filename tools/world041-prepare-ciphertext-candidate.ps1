# Preparation only. Source installation path and ancestors are never inspected.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot,[string]$GameRoot,[string]$HeaderEvidencePath,[string]$HeaderEvidenceSHA256,[switch]$Synthetic)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$privatePrefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($privatePrefix,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private candidate directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'No-follow preparation path required'}}
if(!$Synthetic-and[string]::IsNullOrWhiteSpace($GameRoot)){throw 'Explicit proposed root required; preparation does not access it'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$expectedSize=$null;$expectedHeader=$null;$entries=$null;$names=$null;$retainedEvidence=$null
if(!$Synthetic){
 if([string]::IsNullOrWhiteSpace($HeaderEvidencePath)-or$HeaderEvidenceSHA256-notmatch'^[a-f0-9]{64}$'){throw 'Exact retained private header evidence and digest required'}
 $retainedEvidence=[IO.Path]::GetFullPath($HeaderEvidencePath)
 $literalGame=[IO.Path]::GetFullPath($GameRoot).TrimEnd([char]'\',[char]'/')+[IO.Path]::DirectorySeparatorChar
 if($retainedEvidence.StartsWith($literalGame,[StringComparison]::OrdinalIgnoreCase)-or$retainedEvidence.IndexOf(([IO.Path]::DirectorySeparatorChar+'.local'+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)-lt0){throw 'Retained header evidence must be a private local receipt, never an installed source'}
}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$source=Join-Path $PSScriptRoot 'world041-ciphertext-candidate.cs'
$sourceHash=Hash $source
$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'world041-ciphertext.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Ciphertext-only candidate compile failed; retain without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Source/compiler drift'}
$runtimeJson=& $exe --runtime-pins
if($LASTEXITCODE-ne0){throw 'Runtime closure discovery failed; no installed files read'}
$runtimePins=$runtimeJson|ConvertFrom-Json
if(!$Synthetic){
 # The new compiled helper reads only the exact already retained private JSON
 # receipt, with pinned no-follow parents, single-link handle and bounded4KiB.
 # No PowerShell File.Open can follow a swapped evidence alias here.
 $evidenceJson=& $exe --retained-header-evidence $retainedEvidence $HeaderEvidenceSHA256
 if($LASTEXITCODE-ne0){throw 'Retained header evidence qualification failed; no installed files read'}
 $evidence=$evidenceJson|ConvertFrom-Json
 $expectedSize=[long]$evidence.archiveBytes;$expectedHeader=[string]$evidence.headerSHA256;$entries=[int]$evidence.declaredEntryCount;$names=[int]$evidence.declaredNamesBytes
 if($evidence.gameFilesRead-or$evidence.retainedEvidenceSHA256-cne$HeaderEvidenceSHA256-or$expectedHeader-notmatch'^[a-f0-9]{64}$'-or$entries-le0-or$names-le0-or$entries*16+$names-ne46128-or$expectedSize-lt46144){throw 'Retained identity exceeds exact proposed ciphertext cap'}
}
$mode='installed-ciphertext-proposed'
$sourceFile=Join-Path ([IO.Path]::GetFullPath($GameRoot)) 'update/update.rpf'
if($Synthetic){
 $mode='synthetic-offline-test';$sourceFile=Join-Path $output 'synthetic-archive.bin';$GameRoot=$output;$expectedSize=8192;$entries=2;$names=32
 $data=New-Object byte[] $expectedSize
 [BitConverter]::GetBytes([uint32]0x52504637).CopyTo($data,0)
 [BitConverter]::GetBytes([uint32]$entries).CopyTo($data,4)
 [BitConverter]::GetBytes([uint32]$names).CopyTo($data,8)
 [BitConverter]::GetBytes([uint32]0x0FEFFFFF).CopyTo($data,12)
 for($i=16;$i-lt16+$entries*16+$names;$i++){$data[$i]=[byte](($i*37+19)-band255)}
 $handle=[IO.File]::Open($sourceFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$handle.Write($data,0,$data.Length);$handle.Flush($true)}finally{$handle.Dispose()}
 $header=New-Object byte[] 16
 [Array]::Copy($data,$header,16)
 $expectedHeader=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($header)).ToLowerInvariant()
}
$metadata=$entries*16+$names
$manifest=[ordered]@{kind='world041-one-shot-ciphertext-candidate-v1';attemptId=[guid]::NewGuid().ToString('N');mode=$mode;gameRoot=[IO.Path]::GetFullPath($GameRoot);sourceFile=[IO.Path]::GetFullPath($sourceFile);outputDirectory=(Join-Path $output 'result');exeSHA256=(Hash $exe);runtimePins=@($runtimePins);expectedArchiveBytes=$expectedSize;expectedHeaderSHA256=$expectedHeader;expectedEntryCount=$entries;expectedNamesBytes=$names;ciphertextOffset=16;ciphertextBytes=$metadata;retainedHeaderEvidencePath=$retainedEvidence;retainedHeaderEvidenceSHA256=$(if($Synthetic){$null}else{$HeaderEvidenceSHA256});approvalRequired=(!$Synthetic);maximumInstalledReadBytes=16+$metadata;archiveAllowlist=@('update/update.rpf');memberAllowlist=@();tableParsingAllowed=$false;decryptionAllowed=$false;keyProviderAllowed=$false;retryAllowed=$false}
$manifestPath=Join-Path $output 'manifest.json'
$manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$manifestHash=Hash $manifestPath
$pins=[ordered]@{kind='world041-ciphertext-preparation';sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);manifestSHA256=$manifestHash;gameFilesRead=$false;endpointOpened=$false;installedExecutorRun=$false;ciphertextAcquisitionOnly=$true;tableParsed=$false;decryptionAttempted=$false;keysAcquired=0;runtimePinCount=@($runtimePins).Count;runtimeClosureQualification='actual loaded modules and managed files plus machine.config pinned; trusted Windows platform';command=@($exe,'--supervise',$manifestPath,$manifestHash)}
$pins|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'preparation.json') -Encoding utf8NoBOM
Write-Output ('Prepared fresh '+$mode+' candidate; manifest SHA-256 '+$manifestHash)
