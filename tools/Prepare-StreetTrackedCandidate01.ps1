# Preparation is private-source-only. Deployment functions require a separate
# exact approval and verified process closure; this file never launches GTA.
#requires -Version 7.0
[CmdletBinding()]
param([switch]$FunctionsOnly,[string]$BuildReceipt,[string]$ReviewedBuildReceiptSha256,
 [string]$HistoricalBaseline,[string]$ReviewedBaselineSha256,[string]$AsiInventory,[string]$ReviewedAsiInventorySha256,[string]$OutputRoot)
$ErrorActionPreference='Stop'
$script:StreetTrackedRepo01=Split-Path -Parent $PSScriptRoot
$script:StreetTrackedTargets01=@('RichAudio.StreetTracked01.asi','Plugins/RichAudio.StreetTrackedDiagnostic01.Rph.dll','Plugins/RichAudio.StreetTrackedDiagnostic01.json','startup.rphs')
function Get-StreetTrackedHash01([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Get-StreetTrackedBoundedAsi01([string]$Path,[long]$ExpectedBytes,[long]$MaximumBytes,$ExpectedIdentity=$null){
 Assert-Menu02UnlinkedPath $Path
 if($ExpectedBytes-lt0-or$ExpectedBytes-gt$MaximumBytes-or$MaximumBytes-lt1){throw 'ASI length exceeds approved per-file allowance'}
 if(!('RichAudio.StreetTracked.BoundedHash01'-as[type])){
 Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace RichAudio.StreetTracked {
 public sealed class AsiHash01 { public string sha256,canonicalPath,volumeSerial,fileId; public long bytes,bytesRead; public bool complete; }
 public static class BoundedHash01 {
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attr,CL,CH,AL,AH,WL,WH,Volume,SizeH,SizeL,Links,IndexH,IndexL; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle h,StringBuilder s,uint n,uint f);
  static Info Inspect(SafeFileHandle h) { Info i;if(!GetFileInformationByHandle(h,out i))throw new Win32Exception();if((i.Attr & (0x400|0x10))!=0||i.Links!=1)throw new IOException("Linked or non-regular ASI refused");return i; }
  static long Length(Info i){return checked((long)(((ulong)i.SizeH<<32)|i.SizeL));}
  static string Id(Info i){return (((ulong)i.IndexH<<32)|i.IndexL).ToString("x16");}
  static string Canonical(SafeFileHandle h){var s=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(h,s,32768,0);if(n==0||n>=32768)throw new Win32Exception();string p=s.ToString();return p.StartsWith(@"\\?\")?p.Substring(4):p;}
  public static AsiHash01 Read(string path,long expected,long maximum){
   if(expected<0||expected>maximum)throw new IOException("ASI expected length exceeds allowance");
   using(var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read,65536,FileOptions.SequentialScan)){
    var before=Inspect(stream.SafeFileHandle);string canonical=Canonical(stream.SafeFileHandle);
    if(!String.Equals(canonical,Path.GetFullPath(path),StringComparison.OrdinalIgnoreCase)||Length(before)!=expected||stream.Length!=expected)throw new IOException("ASI exact path/length differs before hashing");
    long read=0;byte[] buffer=new byte[65536];string digest;
    using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256)){
     while(read<expected){int n=stream.Read(buffer,0,(int)Math.Min(buffer.Length,expected-read));if(n==0)throw new IOException("Incomplete ASI hash; early EOF");read+=n;if(read>maximum)throw new IOException("ASI byte allowance exceeded");hash.AppendData(buffer,0,n);}
     if(stream.Position!=expected||stream.Length!=expected)throw new IOException("ASI grew or is incomplete; partial digest refused");
     digest=BitConverter.ToString(hash.GetHashAndReset()).Replace("-","").ToLowerInvariant();
    }
    var after=Inspect(stream.SafeFileHandle);
    if(before.Volume!=after.Volume||Id(before)!=Id(after)||before.CL!=after.CL||before.CH!=after.CH||before.WL!=after.WL||before.WH!=after.WH||Length(after)!=expected||stream.Length!=expected||read!=expected)throw new IOException("ASI identity or length changed while hashing");
    using(var current=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){
     var now=Inspect(current.SafeFileHandle);if(now.Volume!=before.Volume||Id(now)!=Id(before)||!String.Equals(Canonical(current.SafeFileHandle),canonical,StringComparison.OrdinalIgnoreCase))throw new IOException("ASI path replaced while hashing");
    }
    return new AsiHash01{sha256=digest,bytes=expected,bytesRead=read,complete=true,canonicalPath=canonical,volumeSerial=before.Volume.ToString("x8"),fileId=Id(before)};
   }
  }
 }
}
'@
 }
 $result=[RichAudio.StreetTracked.BoundedHash01]::Read($Path,$ExpectedBytes,$MaximumBytes)
 Assert-Menu02UnlinkedPath $Path
 if($ExpectedIdentity-and($result.volumeSerial-cne$ExpectedIdentity.VolumeSerial-or$result.fileId-cne$ExpectedIdentity.FileId-or![string]::Equals($result.canonicalPath,$ExpectedIdentity.CanonicalPath,[StringComparison]::OrdinalIgnoreCase))){throw 'ASI expected stable identity differs'}
 return $result
}
function Assert-StreetTrackedLocal01([string]$Path){
 $p=[IO.Path]::GetFullPath($Path);$local=[IO.Path]::GetFullPath((Join-Path $script:StreetTrackedRepo01 '.local'))+'\'
 if(!$p.StartsWith($local,[StringComparison]::OrdinalIgnoreCase)){throw 'Private repository .local path required'}
 for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked private input refused'}};return $p
}
function Read-StreetTrackedPinned01([string]$Path,[string]$Expected){
 $p=Assert-StreetTrackedLocal01 $Path;if($Expected-notmatch'^[a-f0-9]{64}$'-or(Get-StreetTrackedHash01 $p)-cne$Expected){throw 'Pinned private input differs'}
 if((Get-Item -LiteralPath $p).Length-gt1048576){throw 'Bounded private receipt required'};return Get-Content -LiteralPath $p -Raw|ConvertFrom-Json
}
function Write-StreetTrackedNew01([string]$Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 30));$f=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$f.Write($bytes,0,$bytes.Length);$f.Flush($true)}finally{$f.Dispose()}}
function Copy-StreetTrackedNew01([string]$From,[string]$To,[string]$Sha,[long]$Bytes){
 $inputFile=[IO.File]::Open($From,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{if($inputFile.Length-ne$Bytes){throw 'Pinned source length differs'};$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($inputFile)).ToLowerInvariant();if($hash-cne$Sha){throw 'Pinned source digest differs'};$inputFile.Position=0
  $out=[IO.File]::Open($To,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($out);$out.Flush($true)}finally{$out.Dispose()}
 }finally{$inputFile.Dispose()}
}
function Assert-StreetTrackedPlan01($Plan){
 if($Plan.schema-ne1-or$Plan.kind-cne'RichAudioStreetTrackedCandidate01'-or$Plan.approvalGranted-ne$false-or$Plan.maximumLaunches-ne1-or$Plan.automaticRetry-ne$false-or$Plan.audioAllowed-ne$false-or$Plan.nativeMutationAllowed-ne$false-or$Plan.mappingAllowed-ne$false-or$Plan.recordingAllowed-ne$false-or$Plan.hotUnloadAllowed-ne$false){throw 'Exact passive candidate scope required'}
 $rows=@($Plan.payload);if($rows.Count-ne4-or@($rows.relative|Sort-Object -Unique).Count-ne4-or@($rows|Where-Object{$_.relative-notin$script:StreetTrackedTargets01}).Count){throw 'Unexpected deployment target scope'}
 foreach($r in $rows){if($r.sha256-notmatch'^[a-f0-9]{64}$'-or$r.bytes-lt0-or$r.expectedOriginalExists-isnot[bool]){throw 'Payload identity required'};if($r.relative-ceq'startup.rphs'){if(!$r.expectedOriginalExists-or$r.expectedOriginalSha256-notmatch'^[a-f0-9]{64}$'-or$r.bytes-ne0){throw 'Exact temporary startup suppression required'}}elseif($r.expectedOriginalExists){throw 'Diagnostic additions must be create-only'}}
 if($Plan.sidecar.passiveOnly-ne$true-or$Plan.sidecar.audioAllowed-ne$false-or$Plan.sidecar.nativeMutationAllowed-ne$false-or$Plan.sidecar.maximumRecords-ne2400-or$Plan.sidecar.maximumSeconds-ne120-or$Plan.sidecar.rphSHA256-cne$Plan.baseline.observedApi.sha256-or$Plan.sidecar.gameSHA256-cne$Plan.baseline.gameExecutable.sha256){throw 'Diagnostic sidecar binding or bounds differ'}
 if($Plan.launch.method-cne'Windows-shell-open-existing-cmd-once'-or$Plan.launch.useShellExecute-ne$true-or$Plan.launch.verb-cne'open'-or$Plan.launch.arguments-cne''-or$Plan.launch.alternateLaunchOrRetry-ne$false){throw 'Reviewed single existing CMD route required'}
 if([IO.Path]::GetFileName($Plan.launch.fileName)-cne'Launch RAGE Plugin Hook.cmd'-or![string]::Equals($Plan.launch.workingDirectory,$Plan.gameRoot,[StringComparison]::OrdinalIgnoreCase)-or![string]::Equals([IO.Path]::GetDirectoryName($Plan.launch.fileName),$Plan.gameRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Exact reviewed game working directory/CMD required'}
 if($Plan.rootAsiReadPolicy){
  $policy=@($Plan.rootAsiReadPolicy)
  if($policy.Count-ne4-or($policy.name|Sort-Object -Unique)-join'|' -cne 'DirectStorageFix.asi|OpenRPF.asi|StraightToStoryMode.asi|TrainerV.asi'){throw 'Exact four ASI inspection policies required'}
  foreach($p in $policy){$limit=if($p.name-ceq'TrainerV.asi'){27073536}else{8388608};if($p.maximumBytes-ne$limit-or$p.expectedBytes-lt0-or$p.expectedBytes-gt$limit-or($p.name-ceq'TrainerV.asi'-and$p.expectedBytes-ne27073536)){throw 'Only exact TrainerV inspection allowance may increase'}}
 }
}
function New-StreetTrackedCandidate01 {
 [CmdletBinding()]param([Parameter(Mandatory)][string]$BuildReceipt,[Parameter(Mandatory)][string]$ReviewedBuildReceiptSha256,[Parameter(Mandatory)][string]$HistoricalBaseline,[Parameter(Mandatory)][string]$ReviewedBaselineSha256,[string]$AsiInventory,[string]$ReviewedAsiInventorySha256,[Parameter(Mandatory)][string]$OutputRoot)
 $build=Read-StreetTrackedPinned01 $BuildReceipt $ReviewedBuildReceiptSha256;$baseline=Read-StreetTrackedPinned01 $HistoricalBaseline $ReviewedBaselineSha256
 if($build.kind-cne'RichAudioActualTrackedDiagnosticBoundaryFixture01'-or$build.passed-ne$true-or$build.gameAccessed-ne$false-or$build.endpointOpened-ne$false-or$build.normalTelemetryQualified-ne$false-or!$build.buildArtifacts){throw 'Passing exact diagnostic artifact receipt required'}
 if($baseline.schema-ne1-or$baseline.kind-cne'StreetTrackedHistoricalBaseline01'-or$baseline.currentInstallationVerified-ne$false-or$baseline.approvalGranted-ne$false-or$baseline.originalPathsFollowed-ne$false){throw 'Retained-only baseline required'}
 if($AsiInventory){$inventory=Read-StreetTrackedPinned01 $AsiInventory $ReviewedAsiInventorySha256;if($inventory.schema-ne1-or$inventory.kind-cne'StreetTrackedRetainedAsiInventory01'-or$inventory.gameRoot-cne$baseline.gameRoot-or$inventory.originalFilesRead-ne$false-or$inventory.currentInstallationVerified-ne$false-or@($inventory.inventory).Count-ne4){throw 'Exact retained ASI namespace addendum required'};$rows=@($inventory.inventory|ForEach-Object{@{name=$_.name;sha256=$_.sha256;bytes=$_.bytes;hashStatus=$(if($_.hashPreviouslyRetained){'retained-hash'}else{'not-retained-preflight-observation-required'})}});$baseline|Add-Member -NotePropertyName rootAsiInventory -NotePropertyValue $rows}
 if(!$build.fixtureOnly-and!$baseline.rootAsiInventory){throw 'Production candidate requires the retained complete ASI namespace'}
 if(!$build.fixtureOnly-and($build.authenticRphSdkCompiledOnly-ne$true-or$build.productionNativeCompiledLinkedNeverLoaded-ne$true-or@($build.sourcePins).Count-lt8)){throw 'Disabled native and authentic-SDK managed build required'}
 if(!$build.fixtureOnly){$a=$build.buildArtifacts;if($a.abiVersion-ne2-or$a.recordBytes-ne200-or$a.normalEntryExcluded-ne$true-or$a.manualLoadRequired-ne$true-or$a.noAudioHost-ne$true-or$a.noMapGeneration-ne$true-or$a.noRecording-ne$true-or$a.noEndpoint-ne$true-or$a.deployed-ne$false-or$a.loaded-ne$false){throw 'Reviewed passive ABI2/manual-only binary scope required'}}
 if($baseline.startupPolicy.normalMainModMustRemainUnloaded-ne$true-or$baseline.startupPolicy.noRphIniChangeProposed-ne$true-or$baseline.quarantine.originalAbsent-ne$true-or$baseline.quarantine.modificationAllowed-ne$false-or$baseline.observedApi.sha256-notmatch'^[a-f0-9]{64}$'-or$baseline.observedApi.sha256-ceq$baseline.rph.sha256){throw 'Startup/quarantine/independent API baseline required'}
 foreach($pin in $build.sourcePins){$source=[IO.Path]::GetFullPath((Join-Path $script:StreetTrackedRepo01 $pin.path));if(!$source.StartsWith($script:StreetTrackedRepo01+'\',[StringComparison]::OrdinalIgnoreCase)-or(Get-StreetTrackedHash01 $source)-cne$pin.sha256){throw 'Compiled diagnostic source changed'}}
 foreach($snapshot in @($baseline.startupSnapshot,$baseline.rphIniSnapshot,$baseline.launcherSnapshot)){[void](Assert-StreetTrackedLocal01 $snapshot.path);if((Get-StreetTrackedHash01 $snapshot.path)-cne$snapshot.sha256-or(Get-Item -LiteralPath $snapshot.path).Length-ne$snapshot.bytes){throw 'Retained startup/launcher snapshot differs'}}
 $startup=[IO.File]::ReadAllBytes($baseline.startupSnapshot.path);$text=[Text.UTF8Encoding]::new($false,$true).GetString($startup);if($text-cne"LoadPlugin `"RichAudio.dll`"`r`n"){throw 'Unreviewed startup entries; exact retained command required'}
 $ini=[IO.File]::ReadAllText($baseline.rphIniSnapshot.path);if($ini-match'(?im)^\s*(?:Plugins|LoadPlugins|LoadAllPluginsOnStartup)\s*='){throw 'Unreviewed automatic plugin configuration'}
 $out=Assert-StreetTrackedLocal01 $OutputRoot;if(Test-Path -LiteralPath $out){throw 'Fresh candidate output required'};[IO.Directory]::CreateDirectory($out)|Out-Null
 $payload=@();foreach($pair in @(@('native',$script:StreetTrackedTargets01[0]),@('managed',$script:StreetTrackedTargets01[1]))){$a=$build.buildArtifacts.($pair[0]);$source=Assert-StreetTrackedLocal01 $a.path;if($a.sha256-notmatch'^[a-f0-9]{64}$'-or$a.bytes-le0){throw 'Exact artifact pin required'};$staged=Join-Path $out ([IO.Path]::GetFileName($pair[1]));Copy-StreetTrackedNew01 $source $staged $a.sha256 $a.bytes;$payload+= [ordered]@{relative=$pair[1];source=$staged;sha256=$a.sha256;bytes=$a.bytes;expectedOriginalExists=$false}}
 if($build.buildArtifacts.disabledSidecar){$d=$build.buildArtifacts.disabledSidecar;[void](Assert-StreetTrackedLocal01 $d.path);Copy-StreetTrackedNew01 $d.path (Join-Path $out 'RichAudio.StreetTrackedDiagnostic01.disabled.json') $d.sha256 $d.bytes;$disabled=Get-Content -LiteralPath $d.path -Raw|ConvertFrom-Json;if($disabled.enabled-ne$false-or$disabled.audioAllowed-ne$false-or$disabled.nativeMutationAllowed-ne$false){throw 'Disabled template scope differs'}}
 $session=[Guid]::NewGuid().ToString('N');$sidecar=[ordered]@{enabled=$true;passiveOnly=$true;audioAllowed=$false;nativeMutationAllowed=$false;session=$session;modulePath=(Join-Path $baseline.gameRoot $script:StreetTrackedTargets01[0]);moduleSHA256=$payload[0].sha256;gameSHA256=$baseline.gameExecutable.sha256;rphSHA256=$baseline.observedApi.sha256;outputDirectory=(Join-Path $out 'telemetry');maximumRecords=2400;maximumSeconds=120}
 $sidecarPath=Join-Path $out 'RichAudio.StreetTrackedDiagnostic01.json';Write-StreetTrackedNew01 $sidecarPath $sidecar;$payload+=[ordered]@{relative=$script:StreetTrackedTargets01[2];source=$sidecarPath;sha256=(Get-StreetTrackedHash01 $sidecarPath);bytes=(Get-Item -LiteralPath $sidecarPath).Length;expectedOriginalExists=$false}
 $empty=Join-Path $out 'startup.rphs';[IO.File]::WriteAllBytes($empty,[byte[]]@());$payload+=[ordered]@{relative='startup.rphs';source=$empty;sha256=(Get-StreetTrackedHash01 $empty);bytes=0;expectedOriginalExists=$true;expectedOriginalSha256=$baseline.startupSnapshot.sha256;expectedOriginalBytes=$baseline.startupSnapshot.bytes}
 $watch=Join-Path $script:StreetTrackedRepo01 'tools/Watch-StreetTrackedSession01.ps1'
 $plan=[ordered]@{schema=1;kind='RichAudioStreetTrackedCandidate01';fixtureOnly=[bool]$build.fixtureOnly;gameRoot=$baseline.gameRoot;session=$session;buildReceiptSha256=$ReviewedBuildReceiptSha256;baselineSha256=$ReviewedBaselineSha256;asiInventorySha256=$ReviewedAsiInventorySha256;baseline=$baseline;payload=$payload;sidecar=$sidecar;launch=$baseline.launch;maximumLaunches=1;automaticRetry=$false;approvalGranted=$false;currentActivation=$false;proposedSessionSidecarEnabled=$true;audioAllowed=$false;nativeMutationAllowed=$false;mappingAllowed=$false;recordingAllowed=$false;hotUnloadAllowed=$false;normalMainModMustRemainUnloaded=$true;manualLoadRequired=$true;manualCommand='LoadPlugin "RichAudio.StreetTrackedDiagnostic01.Rph.dll"';runtimeOriginAuthenticated=$false;currentInstallationVerified=$false;freshInventoryRequired=$true;processExitBeforeRestorationRequired=$true;supervisorSha256=(Get-StreetTrackedHash01 $watch);supervision='tools/Watch-StreetTrackedSession01.ps1:600+10+120+3+180=913s; no retry; original lifetime closure before removal';installationMachinery='tools/playable/Setup.ps1 Invoke-InstallTransaction';restorationMachinery='tools/menu02-recovery/Restoration.ps1 Invoke-Menu02Restoration';sourcePins=@(@('tools/Prepare-StreetTrackedCandidate01.ps1','tools/Watch-StreetTrackedSession01.ps1','tools/playable/Setup.ps1','tools/menu02-recovery/Restoration.ps1','tools/menu02-recovery/Supervision.ps1','tools/menu02-recovery/Launch.ps1')|ForEach-Object{[ordered]@{path=$_;sha256=(Get-StreetTrackedHash01 (Join-Path $script:StreetTrackedRepo01 $_))}})}
 if(!$build.fixtureOnly){$plan.rootAsiReadPolicy=@(@{name='DirectStorageFix.asi';expectedBytes=592384;maximumBytes=8388608},@{name='OpenRPF.asi';expectedBytes=1173504;maximumBytes=8388608},@{name='StraightToStoryMode.asi';expectedBytes=42496;maximumBytes=8388608},@{name='TrainerV.asi';expectedBytes=27073536;maximumBytes=27073536})}
 Assert-StreetTrackedPlan01 $plan;$manifest=Join-Path $out 'candidate.json';Write-StreetTrackedNew01 $manifest $plan;Write-StreetTrackedNew01 (Join-Path $out 'preflight.json') ([ordered]@{schema=1;kind='RichAudioStreetTrackedPreparedOnly01';candidateSha256=(Get-StreetTrackedHash01 $manifest);prepared=$true;currentInstalledPreflightPerformed=$false;approvalGranted=$false;gameFilesRead=$false;gameFilesWritten=$false;launched=$false;endpointOpened=$false;fixtureOnly=[bool]$build.fixtureOnly});return $manifest
}
function Assert-StreetTrackedApproval01($Plan,[string]$CandidateSha256,$Approval){
 if(!$Approval-or$Approval.approved-isnot[bool]-or!$Approval.approved-or$Approval.kind-cne'RichAudioStreetTrackedSessionApproval01'-or$Approval.candidateSha256-cne$CandidateSha256-or$Approval.maximumLaunches-ne1-or$Approval.noRetry-ne$true-or$Approval.processLifetimePinAcknowledged-ne$true-or$Approval.processExitBeforeRestoration-ne$true-or$Approval.supervisorSha256-cne$Plan.supervisorSha256-or$Plan.supervisorSha256-cne(Get-StreetTrackedHash01 (Join-Path $script:StreetTrackedRepo01 'tools/Watch-StreetTrackedSession01.ps1'))){throw 'Separate exact single-session approval required before installation access'}
 Assert-StreetTrackedPlan01 $Plan
}
function Import-StreetTrackedTransaction01 {
 # Load reviewed definitions in a private function scope. Setup's own local
 # variables must never overwrite this adapter's Candidate/transaction paths.
 . (Join-Path $script:StreetTrackedRepo01 'tools/playable/Setup.ps1') -FunctionsOnly
 . (Join-Path $script:StreetTrackedRepo01 'tools/menu02-recovery/Restoration.ps1')
 . (Join-Path $script:StreetTrackedRepo01 'tools/menu02-recovery/Launch.ps1') -FunctionsOnly
 $names=@('Invoke-InstallTransaction','Safe-Path','Write-Json','Digest')+@(Get-ChildItem Function:|Where-Object{$_.Name-like'*Menu02*'}|ForEach-Object Name)
 foreach($name in $names){$definition=(Get-Item -LiteralPath ('Function:'+ $name)).ScriptBlock;Set-Item -LiteralPath ('Function:script:'+ $name) -Value $definition}
}
function Assert-StreetTrackedFixture01($Plan){$fixture=Assert-StreetTrackedLocal01 $Plan.gameRoot;$parent=Split-Path $fixture -Parent;if([IO.Path]::GetFileName($parent)-notmatch'^street01-passive-fixtures-[a-f0-9]{32}$'){throw 'Explicit authored fixture root required'};$marker=Get-Content -LiteralPath (Join-Path $parent 'fixture-only.json') -Raw|ConvertFrom-Json;if($marker.kind-cne'OriginalStreetTrackedTransactionFixture01'-or$marker.installedAccessAllowed-ne$false){throw 'Authored fixture marker required'}}
function Get-StreetTrackedActiveProcesses01($Plan){
 $nodes=@();foreach($p in @($Plan.baseline.settings)){if([IO.Path]::GetFileName([string]$p.path)-ceq'acoustic-settings.json'){$package=Split-Path (Split-Path $p.path -Parent) -Parent;$nodes+=[IO.Path]::GetFullPath((Join-Path $package 'runtime/node.exe'))}}
 $filter="Name LIKE 'RichAudio%' OR Name='GTA5_Enhanced.exe' OR Name='GTA5.exe' OR Name='RAGEPluginHook.exe' OR Name='PlayGTAV.exe' OR Name='node.exe' OR Name='pwsh.exe' OR Name='powershell.exe'"
 $rows=@();foreach($p in @(Get-CimInstance -ClassName Win32_Process -Filter $filter -ErrorAction Stop)){
  $name=[IO.Path]::GetFileNameWithoutExtension([string]$p.Name);$command=[string]$p.CommandLine;$relevant=$name-match'^(?:GTA5_Enhanced|GTA5|RAGEPluginHook|PlayGTAV|RichAudio.*)$';$reason='named-game-or-RichAudio-process'
  if($name-ieq'node'){$known=$nodes|Where-Object{[string]::Equals($_,[string]$p.ExecutablePath,[StringComparison]::OrdinalIgnoreCase)};if($known-or$command-match'(?i)(?:Run-Gameplay\.mjs|[\\/]tools[\\/]soundmap[\\/]|installed-scene-worker01\.mjs)'){$relevant=$true;$reason='known-RichAudio-node-package-or-service'}}
  if($name-imatch'^(?:pwsh|powershell)$'){if($command-match'(?i)-EncodedCommand\s+([A-Za-z0-9+/=]+)'){try{$command+=' '+[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))}catch{}};if($command-match'(?i)Prepare-Installed(?:Audio|Collision)World\.ps1'){$relevant=$true;$reason='RichAudio-preparation-worker'}}
  if($relevant){if(!$p.CreationDate-or!$p.ExecutablePath){throw 'Relevant process identity is unavailable; closure unknown'};$exact=[Diagnostics.Process]::GetProcessById([int]$p.ProcessId);try{if($exact.HasExited-or$exact.ProcessName-ine$name-or[Math]::Abs(($exact.StartTime.ToUniversalTime()-([DateTime]$p.CreationDate).ToUniversalTime()).TotalMilliseconds)-gt1){throw 'Relevant process lifetime changed during inventory'};$creation=$exact.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}finally{$exact.Dispose()};$rows+=[pscustomobject]@{id=[int]$p.ProcessId;name=$name;path=[string]$p.ExecutablePath;creationFileTime=$creation;reason=$reason}}
 };return $rows
}
function Test-StreetTrackedProcessClosure01($Plan) {
 return @(Get-StreetTrackedActiveProcesses01 $Plan).Count-eq0
}
function Assert-StreetTrackedIdentity01([string]$Path,$Expected){
 Assert-Menu02UnlinkedPath $Path;Initialize-Menu02LaunchNativeIdentity;$actual=[Menu02RecoveryLaunch.NativeIdentity]::ReadDirectory($Path)
 if(![string]::Equals($actual[0],[string]$Expected.CanonicalPath,[StringComparison]::OrdinalIgnoreCase)-or$actual[1]-cne$Expected.VolumeSerial-or$actual[2]-cne$Expected.FileId){throw 'Fresh file/directory identity differs from retained reviewed baseline'}
}
function Assert-StreetTrackedFreshPreflight01($Plan,[string]$CandidateSha256,[string]$ReceiptPath,[switch]$Deployed,[switch]$AfterRestoration,[scriptblock]$FixtureProcessClosure){
 # Called only after exact approval by Invoke. Never used by preparation.
 Assert-StreetTrackedPlan01 $Plan;if($Deployed-and$AfterRestoration){throw 'Ambiguous installed state'};if($CandidateSha256-notmatch'^[a-f0-9]{64}$'){throw 'Exact candidate binding required for fresh preflight'};if($ReceiptPath){[void](Assert-StreetTrackedLocal01 $ReceiptPath)}
 Import-StreetTrackedTransaction01
 if($FixtureProcessClosure){if(!$Plan.fixtureOnly){throw 'Production preflight cannot inject process closure'};Assert-StreetTrackedFixture01 $Plan;$processCheck=$FixtureProcessClosure}else{$processCheck={Test-StreetTrackedProcessClosure01 $Plan}}
 Assert-Menu02Closure $processCheck;Assert-StreetTrackedIdentity01 $Plan.gameRoot $Plan.baseline.rootIdentity
 $checks=@();$seen=@{};foreach($pin in @($Plan.baseline.protected)+@($Plan.baseline.settings)+@($Plan.baseline.dependencies)+@($Plan.baseline.gameExecutable,$Plan.baseline.rph)){
  if($seen.ContainsKey($pin.path)){continue};$seen[$pin.path]=$true;$expected=if($pin.PSObject.Properties.Name-contains'exists'){[bool]$pin.exists}else{$true};$limit=$pin.bytes;if($Deployed-and$pin.role-ceq'rph-startup'){$limit=0};if($expected-and(Test-Path -LiteralPath $pin.path)-and(Get-Item -LiteralPath $pin.path).Length-ne$limit){throw 'Protected/settings/dependency size changed before hash read'};$state=Get-Menu02RestoreFileState $pin.path
  $expectedSha=$pin.sha256;$expectedBytes=$pin.bytes;if($Deployed-and[string]::Equals($pin.path,(Join-Path $Plan.gameRoot 'startup.rphs'),[StringComparison]::OrdinalIgnoreCase)){$startup=@($Plan.payload|Where-Object relative -CEQ 'startup.rphs')[0];$expectedSha=$startup.sha256;$expectedBytes=$startup.bytes}
  if($state.exists-ne$expected-or($expected-and($state.sha256-cne$expectedSha-or$state.bytes-ne$expectedBytes))){throw 'Fresh protected/settings/dependency pin differs'};if($expected-and$pin.identityAfter-and!(($Deployed-or$AfterRestoration)-and$pin.role-ceq'rph-startup')){Assert-StreetTrackedIdentity01 $pin.path $pin.identityAfter};$checks+=@{path=$pin.path;exists=$state.exists;sha256=$state.sha256;bytes=$state.bytes}
 }
 Assert-StreetTrackedIdentity01 $Plan.launch.fileName $Plan.launch.cmdIdentity;$cmd=Get-Menu02RestoreFileState $Plan.launch.fileName;if($cmd.sha256-cne$Plan.launch.cmdSha256-or$cmd.bytes-ne$Plan.launch.cmdBytes){throw 'Working CMD launch bytes differ'}
 $q=$Plan.baseline.quarantine;if(Test-Path -LiteralPath $q.originalPath){throw 'OpenIV quarantine original unexpectedly present'};$held=Get-Menu02RestoreFileState $q.held.path;if(!$held.exists-or$held.sha256-cne$q.held.sha256-or$held.bytes-ne$q.held.bytes-or$held.metadata.sddl-cne$q.held.permissionsSddl){throw 'OpenIV quarantine state differs'};Assert-StreetTrackedIdentity01 $q.held.path $q.held.identityAfter
 if(!$Plan.baseline.rootAsiInventory){throw 'Complete retained root ASI inventory is required; no inferred allowlist'}
 $expectedAsi=@($Plan.baseline.rootAsiInventory|Sort-Object name);$names=@($expectedAsi.name);if($Deployed){$names+='RichAudio.StreetTracked01.asi'};$actualAsi=@(Get-ChildItem -LiteralPath $Plan.gameRoot -File -Filter '*.asi'|Sort-Object Name);if(($actualAsi.Name-join'|')-cne(($names|Sort-Object)-join'|')){throw 'Unexpected or missing root ASI; fresh review required'}
 $sessionPins=$null;if($Deployed-or$AfterRestoration){$tx=Join-Path (Split-Path $Plan.payload[0].source -Parent) 'transaction';$binding=Get-Content -LiteralPath (Join-Path $tx 'preflight-binding.json') -Raw|ConvertFrom-Json;$prior=Join-Path $tx 'fresh-preflight.json';if($binding.candidateSha256-cne$CandidateSha256-or$binding.freshPreflightSha256-cne(Get-StreetTrackedHash01 $prior)){throw 'Session ASI baseline receipt differs'};if($Deployed){$installed=Get-Content -LiteralPath (Join-Path $tx 'deployed.json') -Raw|ConvertFrom-Json;if($installed.candidateSha256-cne$CandidateSha256-or$installed.freshPreflightSha256-cne$binding.freshPreflightSha256){throw 'Deployment ASI baseline differs'}};$sessionPins=(Get-Content -LiteralPath $prior -Raw|ConvertFrom-Json).rootAsiPins}
 $observedAsi=@();foreach($pin in $expectedAsi){
  if($pin.name-like'RichAudio*'){throw 'Another RichAudio native producer must not load'}
  $asi=Join-Path $Plan.gameRoot $pin.name
  $policy=@($Plan.rootAsiReadPolicy|Where-Object name -CEQ $pin.name)
  $limit=8388608;$length=(Get-Item -LiteralPath $asi).Length
  if($policy.Count){$limit=[long]$policy[0].maximumBytes;$expectedLength=[long]$policy[0].expectedBytes}else{$expectedLength=if($null-ne$pin.bytes){[long]$pin.bytes}else{$length}}
  if($length-gt$limit){throw 'ASI preflight read exceeds approved per-file bound'}
  $state=Get-StreetTrackedBoundedAsi01 -Path $asi -ExpectedBytes $expectedLength -MaximumBytes $limit -ExpectedIdentity $pin.identityAfter
  if(!$state.complete-or$state.bytesRead-ne$state.bytes){throw 'Incomplete ASI digest refused'}
  if($pin.sha256){if($state.sha256-cne$pin.sha256-or$state.bytes-ne$pin.bytes){throw 'Root ASI content differs'}}elseif($pin.hashStatus-cne'not-retained-preflight-observation-required'){throw 'Unclassified missing ASI content pin'}
  if($Deployed-or$AfterRestoration){
   $prior=@($sessionPins|Where-Object name -CEQ $pin.name)
   if($prior.Count-ne1-or$state.sha256-cne$prior[0].sha256-or$state.bytes-ne$prior[0].bytes-or!$prior[0].complete-or$state.fileId-cne$prior[0].identity.FileId-or$state.volumeSerial-cne$prior[0].identity.VolumeSerial){throw 'Observed session ASI content or identity changed'}
  }
  $observedAsi+=@{name=$pin.name;sha256=$state.sha256;bytes=$state.bytes;bytesRead=$state.bytesRead;complete=$state.complete;maximumBytes=$limit;identity=@{CanonicalPath=$state.canonicalPath;VolumeSerial=$state.volumeSerial;FileId=$state.fileId};basis=$(if($pin.sha256){'matched-retained-pin'}else{'preflight-observed-only; not API authentication'})}
 }
 $allowedManaged=@('RichAudio.dll');if($Deployed){$allowedManaged+='RichAudio.StreetTrackedDiagnostic01.Rph.dll'};$unexpected=@(Get-ChildItem -LiteralPath (Join-Path $Plan.gameRoot 'Plugins') -File -Filter 'RichAudio*.dll'|Where-Object{$_.Name-cnotin$allowedManaged});if($unexpected.Count){throw 'Unexpected RichAudio managed startup target'}
 if(@(Get-ChildItem -LiteralPath $Plan.gameRoot -File -Filter '*.rphs'|Where-Object Name -CNE 'startup.rphs').Count-or@(Get-ChildItem -LiteralPath (Join-Path $Plan.gameRoot 'Plugins') -File -Filter '*.rphs').Count){throw 'Unexpected additional RPH startup script'}
 foreach($p in $Plan.payload){$state=Get-Menu02RestoreFileState (Safe-Path $Plan.gameRoot $p.relative);if($Deployed){if(!$state.exists-or$state.sha256-cne$p.sha256-or$state.bytes-ne$p.bytes){throw 'Staged diagnostic payload differs'}}elseif(!$p.expectedOriginalExists-and$state.exists){throw 'Create-only diagnostic target occupied'}elseif($AfterRestoration-and$p.expectedOriginalExists-and(!$state.exists-or$state.sha256-cne$p.expectedOriginalSha256-or$state.bytes-ne$p.expectedOriginalBytes)){throw 'Original changed target was not restored'}}
 Assert-Menu02Closure $processCheck;$result=[ordered]@{schema=1;kind='RichAudioStreetTrackedFreshPreflight01';candidateSha256=$CandidateSha256;checkedUtc=[DateTime]::UtcNow.ToString('o');deployed=[bool]$Deployed;afterRestoration=[bool]$AfterRestoration;processesAbsent=$true;rootAndCmdIdentityVerified=$true;quarantineVerified=$true;rootAsiInventoryVerified=$true;rootAsiPins=$observedAsi;noUnexpectedRichAudioTarget=$true;protectedSettingsDependencies=$checks;mainServicesMustRemainUnloaded=$true;currentRuntimeApiVerified=$false;requiresManualBatiAcquisitionBeforeDiagnosticLoad=$true};if($ReceiptPath){Write-StreetTrackedNew01 $ReceiptPath $result};return $result
}
function Invoke-StreetTrackedTransaction01 {
 [CmdletBinding()]param([Parameter(Mandatory)][string]$Candidate,[Parameter(Mandatory)][string]$ExpectedCandidateSha256,$Approval,[scriptblock]$AssertProcessClosure,[scriptblock]$AssertFreshInventory,[scriptblock]$CopyPayload)
 $plan=Read-StreetTrackedPinned01 $Candidate $ExpectedCandidateSha256;Assert-StreetTrackedApproval01 $plan $ExpectedCandidateSha256 $Approval
 if(!$plan.fixtureOnly-and($CopyPayload-or$AssertProcessClosure-or$AssertFreshInventory)){throw 'Production preflight cannot use injected inventory/closure/copy callbacks'}
 Import-StreetTrackedTransaction01
 if($plan.fixtureOnly){Assert-StreetTrackedFixture01 $plan}else{$AssertProcessClosure={Test-StreetTrackedProcessClosure01 $plan}}
 Assert-Menu02Closure $AssertProcessClosure
 foreach($p in $plan.sourcePins){if((Get-StreetTrackedHash01 (Join-Path $script:StreetTrackedRepo01 $p.path))-cne$p.sha256){throw 'Reviewed transaction machinery changed'}}
 foreach($p in $plan.payload){[void](Assert-StreetTrackedLocal01 $p.source);if((Get-StreetTrackedHash01 $p.source)-cne$p.sha256-or(Get-Item -LiteralPath $p.source).Length-ne$p.bytes){throw 'Candidate payload drift'}}
 $folder=Split-Path $Candidate -Parent;$transaction=Join-Path $folder 'transaction';if(Test-Path -LiteralPath $transaction){throw 'Single transaction is consumed; no retry'};[IO.Directory]::CreateDirectory($transaction)|Out-Null;Write-StreetTrackedNew01 (Join-Path $transaction 'attempt.json') ([ordered]@{candidateSha256=$ExpectedCandidateSha256;approval=$Approval;maximumLaunches=1;launchPerformed=$false})
 if($plan.fixtureOnly){Assert-Menu02Closure $AssertFreshInventory}else{[void](Assert-StreetTrackedFreshPreflight01 $plan $ExpectedCandidateSha256 (Join-Path $transaction 'fresh-preflight.json'))}
 $fresh=Join-Path $transaction 'fresh-preflight.json';if(Test-Path -LiteralPath $fresh){Write-StreetTrackedNew01 (Join-Path $transaction 'preflight-binding.json') @{candidateSha256=$ExpectedCandidateSha256;freshPreflightSha256=(Get-StreetTrackedHash01 $fresh)}}
 $changes=@();$rollback=@();$plans=@();$backupRoot=Join-Path $transaction 'original';[IO.Directory]::CreateDirectory($backupRoot)|Out-Null
 foreach($p in $plan.payload){$target=Safe-Path $plan.gameRoot $p.relative;$state=Get-Menu02RestoreFileState $target;$backup=Join-Path $backupRoot ([IO.Path]::GetFileName($p.relative));$metadata=$null
  if($p.expectedOriginalExists){if(!$state.exists-or$state.sha256-cne$p.expectedOriginalSha256-or$state.bytes-ne$p.expectedOriginalBytes){throw 'Installed original differs; transaction withheld'};$metadata=$state.metadata;Copy-StreetTrackedNew01 $target $backup $state.sha256 $state.bytes}
  elseif($state.exists){throw 'Create-only diagnostic target is occupied'}
  $change=[ordered]@{target=$target;backup=$backup;expectedOriginalExists=$p.expectedOriginalExists;expectedOriginalSha256=$(if($p.expectedOriginalExists){$p.expectedOriginalSha256}else{$null});expectedOriginalBytes=$(if($p.expectedOriginalExists){$p.expectedOriginalBytes}else{$null});proposedSha256=$p.sha256;proposedBytes=$p.bytes;originalMetadata=$metadata;expectedDeployedMetadata=$null};$changes+=$change;$plans+=@{relative=$p.relative;source=$p.source};$rollback+=@{relative=$p.relative;backup=$(if($p.expectedOriginalExists){'original/'+[IO.Path]::GetFileName($p.relative)}else{$null});sha256=$p.expectedOriginalSha256}
 }
 Write-StreetTrackedNew01 (Join-Path $transaction 'original-state.json') $changes;$setupReceipt=Join-Path $transaction 'setup.json';$receipt=@{complete=$false;files=$changes};Write-StreetTrackedNew01 $setupReceipt $receipt
 try{Assert-Menu02Closure $AssertProcessClosure;if(!$CopyPayload){$CopyPayload={param($from,$to)Copy-Item -LiteralPath $from -Destination $to -Force}};Invoke-InstallTransaction $plan.gameRoot $transaction $plans $rollback $setupReceipt $receipt $CopyPayload
  foreach($c in $changes){$now=Get-Menu02RestoreFileState $c.target;if(!$now.exists-or$now.sha256-cne$c.proposedSha256-or$now.bytes-ne$c.proposedBytes){throw 'Post-deployment payload differs'};$c.expectedDeployedMetadata=$now.metadata}
  $freshPath=Join-Path $transaction 'fresh-preflight.json';Write-StreetTrackedNew01 (Join-Path $transaction 'deployed.json') ([ordered]@{candidateSha256=$ExpectedCandidateSha256;freshPreflightSha256=$(if(Test-Path -LiteralPath $freshPath){Get-StreetTrackedHash01 $freshPath}else{$null});changes=$changes;launchPerformed=$false;requiresCompleteGameProcessExit=$true});return $transaction
 }catch{$cause=$_;Write-StreetTrackedNew01 (Join-Path $transaction 'transaction-failure.json') @{candidateSha256=$ExpectedCandidateSha256;message=$cause.Exception.Message;originalFailureRetained=$true};Invoke-Menu02Restoration -Changes $changes -AllowedRoot $plan.gameRoot -AllowedTargets @($changes.target) -BackupRoot $backupRoot -ReceiptPath (Join-Path $transaction 'failure-restoration.json') -AssertProcessClosure $AssertProcessClosure;if(!$plan.fixtureOnly-or$plan.baseline.rootAsiInventory){$verifyArgs=@{Plan=$plan;CandidateSha256=$ExpectedCandidateSha256;ReceiptPath=(Join-Path $transaction 'failure-restoration-verification.json');AfterRestoration=$true};if($plan.fixtureOnly){$verifyArgs.FixtureProcessClosure=$AssertProcessClosure};[void](Assert-StreetTrackedFreshPreflight01 @verifyArgs)};throw $cause}
}
function Restore-StreetTrackedTransaction01 {
 [CmdletBinding()]param([Parameter(Mandatory)][string]$Candidate,[Parameter(Mandatory)][string]$ExpectedCandidateSha256,[scriptblock]$AssertProcessClosure)
 $plan=Read-StreetTrackedPinned01 $Candidate $ExpectedCandidateSha256;Assert-StreetTrackedPlan01 $plan;Import-StreetTrackedTransaction01;if($plan.fixtureOnly){Assert-StreetTrackedFixture01 $plan}else{if($AssertProcessClosure){throw 'Production closure cannot use an injected callback'};$AssertProcessClosure={Test-StreetTrackedProcessClosure01 $plan}};Assert-Menu02Closure $AssertProcessClosure
 $transaction=Join-Path (Split-Path $Candidate -Parent) 'transaction';$deployed=Get-Content -LiteralPath (Join-Path $transaction 'deployed.json') -Raw|ConvertFrom-Json;if($deployed.candidateSha256-cne$ExpectedCandidateSha256){throw 'Wrong owned deployment receipt'}
 if(Test-Path -LiteralPath (Join-Path $transaction 'launch-intent.json')){$closure=Get-Content -LiteralPath (Join-Path $transaction 'closure-observed.json') -Raw|ConvertFrom-Json;if($closure.candidateSha256-cne$ExpectedCandidateSha256-or$closure.normalProcessClosureObserved-ne$true-or$closure.gameObserved-ne$true-or$closure.absenceObservations-lt2-or$closure.absenceSeparationSeconds-lt2){throw 'Original observed Enhanced lifetime closure required; possible pending launcher keeps restoration withheld'}}
 if(@($deployed.changes).Count-ne4){throw 'Wrong restoration target count'}
 foreach($change in $deployed.changes){$match=@($plan.payload|Where-Object{(Safe-Path $plan.gameRoot $_.relative)-ceq$change.target});if($match.Count-ne1){throw 'Unexpected restoration target'};$p=$match[0];if($change.proposedSha256-cne$p.sha256-or$change.proposedBytes-ne$p.bytes-or$change.expectedOriginalExists-ne$p.expectedOriginalExists-or($p.expectedOriginalExists-and($change.expectedOriginalSha256-cne$p.expectedOriginalSha256-or$change.expectedOriginalBytes-ne$p.expectedOriginalBytes))){throw 'Restoration identity does not match reviewed payload'}}
 Invoke-Menu02Restoration -Changes @($deployed.changes) -AllowedRoot $plan.gameRoot -AllowedTargets @($plan.payload|ForEach-Object{Safe-Path $plan.gameRoot $_.relative}) -BackupRoot (Join-Path $transaction 'original') -ReceiptPath (Join-Path $transaction 'restoration.json') -AssertProcessClosure $AssertProcessClosure
 if(!$plan.fixtureOnly-or$plan.baseline.rootAsiInventory){$verifyArgs=@{Plan=$plan;CandidateSha256=$ExpectedCandidateSha256;ReceiptPath=(Join-Path $transaction 'restoration-verification.json');AfterRestoration=$true};if($plan.fixtureOnly){$verifyArgs.FixtureProcessClosure=$AssertProcessClosure};[void](Assert-StreetTrackedFreshPreflight01 @verifyArgs)}
}
if($FunctionsOnly){return}
New-StreetTrackedCandidate01 -BuildReceipt $BuildReceipt -ReviewedBuildReceiptSha256 $ReviewedBuildReceiptSha256 -HistoricalBaseline $HistoricalBaseline -ReviewedBaselineSha256 $ReviewedBaselineSha256 -AsiInventory $AsiInventory -ReviewedAsiInventorySha256 $ReviewedAsiInventorySha256 -OutputRoot $OutputRoot
