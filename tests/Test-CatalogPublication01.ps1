param([string]$PublicationTestScriptPath='')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$testScript=if($PublicationTestScriptPath){[IO.Path]::GetFullPath($PublicationTestScriptPath)}else{$PSCommandPath}
$repo=Split-Path (Split-Path $testScript -Parent) -Parent
$module=Join-Path $repo 'src/acoustics/startup/CatalogLifecycle.psm1'
Import-Module (New-Module -Name CataloguePublicationRegression01 -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($module)))) -Force
$root=Join-Path $repo ('.local/catalog-publication-tests-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$script:checks=0;$observations=New-Object Collections.Generic.List[object]
function Check01([bool]$v,[string]$why){$script:checks++;if(!$v){throw $why}}
function Reject01([scriptblock]$work,[string]$why){$caught=$null;try{&$work|Out-Null}catch{$caught=$_};Check01 ($null-ne$caught) $why;return $caught}
function Hash01([string]$path){$s=[IO.File]::OpenRead($path);$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($s))).Replace('-','').ToLowerInvariant()}finally{$s.Dispose();$h.Dispose()}}
function Record01([string]$name,$values){$observations.Add([ordered]@{name=$name;values=$values})}
if(!('CataloguePublicationFixture.NativeIdentity01'-as[type])){Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.IO;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
namespace CataloguePublicationFixture {public static class NativeIdentity01 {
 [StructLayout(LayoutKind.Sequential)]struct Info{public uint Attr,CL,CH,AL,AH,WL,WH,Vol,SizeH,SizeL,Links,IndexH,IndexL;}
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 public static string Read(string path){using(var s=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){Info i;if(!GetFileInformationByHandle(s.SafeFileHandle,out i))throw new Win32Exception();return i.Vol.ToString("x8")+":"+(((ulong)i.IndexH<<32)|i.IndexL).ToString("x16");}}
}}
'@|Out-Null}
$private=Join-Path $root 'fresh-private';$path=Join-Path $private 'nested/catalog/archive-cache/bound.json';$script:pendingSeen=$null
$first=Write-CatalogAtomicJson $private $path ([ordered]@{Schema=1;Fingerprint='bound';Value='original'}) -BeforePublish {param($pending)$script:pendingSeen=@{path=$pending;sha256=(Hash01 $pending);bytes=(Get-Item -LiteralPath $pending).Length;json=([IO.File]::ReadAllText($pending)|ConvertFrom-Json)}}
Check01 ($first.Published-and[IO.Directory]::Exists((Split-Path $path -Parent))) 'Fresh nested directory must be intentionally created inside private root'
Check01 ($script:pendingSeen.path-match'\\\.pending-[a-f0-9]{32}$'-and(Split-Path $script:pendingSeen.path -Parent)-ceq(Split-Path $path -Parent)) 'Pending name must be bounded, uniquely owned and beside destination'
Check01 ($script:pendingSeen.json.Value-ceq'original'-and$script:pendingSeen.sha256-ceq(Hash01 $path)-and![IO.File]::Exists($script:pendingSeen.path)) 'Complete pending bytes must become exact published bytes and the owned pending name must be consumed'
$firstIdentity=[CataloguePublicationFixture.NativeIdentity01]::Read($path)
$firstConsumer=Read-CatalogCacheJson $private $path -ExpectedFingerprint 'bound'
Check01 ($firstConsumer.Value-ceq'original'-and[CataloguePublicationFixture.NativeIdentity01]::Read($path)-ceq$firstIdentity) 'Reopened published identity and actual cache-consumer contents must agree'
$original=[IO.File]::ReadAllBytes($path);$originalHash=Hash01 $path
$reader=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite-bor[IO.FileShare]::Delete))
try{
 $second=Write-CatalogAtomicJson $private $path ([ordered]@{Schema=1;Fingerprint='bound';Value='replacement'})
 $buffer=New-Object byte[] $original.Length;$count=$reader.Read($buffer,0,$buffer.Length)
 Check01 ($count-eq$original.Length-and[Convert]::ToBase64String($buffer)-ceq[Convert]::ToBase64String($original)) 'Concurrent delete-sharing reader must retain the previous complete file during atomic replacement'
}finally{$reader.Dispose()}
$replacementIdentity=[CataloguePublicationFixture.NativeIdentity01]::Read($path)
Check01 ($second.Published-and$replacementIdentity-cne$firstIdentity-and(Read-CatalogCacheJson $private $path -ExpectedFingerprint 'bound').Value-ceq'replacement') 'Atomic replacement must expose the new complete identity to new consumers'
$valid=[IO.File]::ReadAllBytes($path);$validHash=Hash01 $path;$script:interruptedPending=$null
$interruption=Reject01 {Write-CatalogAtomicJson $private $path @{Schema=1;Fingerprint='bound';Value='interrupted'} -BeforePublish {param($pending)$script:interruptedPending=$pending;throw [OperationCanceledException]::new('authored cancellation after complete pending preparation')}} 'Cancellation before atomic commit must surface'
Check01 ((Hash01 $path)-ceq$validHash-and[IO.File]::Exists($script:interruptedPending)-and([IO.File]::ReadAllText($script:interruptedPending)|ConvertFrom-Json).Value-ceq'interrupted') 'Interrupted preparation must retain complete owned pending evidence and previous valid file'
$interruptedHash=Hash01 $script:interruptedPending
[void](Write-CatalogAtomicJson $private $path @{Schema=1;Fingerprint='bound';Value='next'})
Check01 ((Hash01 $script:interruptedPending)-ceq$interruptedHash) 'Next publication must not claim or remove interrupted pending ownership'
$cancel=Join-Path $private 'cancel.request';[IO.File]::WriteAllText($cancel,'authored early cancellation')
$cancelledHash=Hash01 $path;$pendingCount=@(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -File -Filter '.pending-*').Count
$earlyCancellation=Reject01 {Write-CatalogAtomicJson $private $path @{Schema=1;Fingerprint='bound';Value='cancelled'} -CancellationPath $cancel} 'An already cancelled publication must reject before preparation'
Check01 ((Hash01 $path)-ceq$cancelledHash-and@(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -File -Filter '.pending-*').Count-eq$pendingCount) 'Early cancellation must not create pending data or change valid publication'
Remove-Item -LiteralPath $cancel
$script:preparationCancelPath=$cancel;$duringValue=[pscustomobject]@{Schema=1;Fingerprint='bound';Value='cancelled-during-serialization'}
$duringValue|Add-Member ScriptProperty CancellationWitness {[IO.File]::WriteAllText($script:preparationCancelPath,'authored cancellation during JSON preparation');return 'prepared'}
$duringCancellation=Reject01 {Write-CatalogAtomicJson $private $path $duringValue -CancellationPath $cancel} 'Cancellation raised during real JSON serialization must reject before directory/pending creation'
Check01 ([IO.File]::Exists($cancel)-and(Hash01 $path)-ceq$cancelledHash-and@(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -File -Filter '.pending-*').Count-eq$pendingCount) 'Preparation-time cancellation must preserve prior state without publishing a partial result'
Remove-Item -LiteralPath $cancel;$script:latePending=$null
$lateCancellation=Reject01 {Write-CatalogAtomicJson $private $path @{Schema=1;Fingerprint='bound';Value='cancelled-before-commit'} -CancellationPath $cancel -BeforePublish {param($pending)$script:latePending=$pending;[IO.File]::WriteAllText($script:preparationCancelPath,'authored late cancellation')}} 'Cancellation after pending flush must reject the atomic commit'
Check01 ((Hash01 $path)-ceq$cancelledHash-and[IO.File]::Exists($script:latePending)) 'Late cancellation must retain complete owned pending evidence and previous valid publication'
Remove-Item -LiteralPath $cancel
$beforeConflict=Hash01 $path;$conflict=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try{$sharing=Reject01 {Write-CatalogAtomicJson $private $path @{Schema=1;Fingerprint='bound';Value='must-not-appear'}} 'Persistent Windows no-delete-sharing conflict must reject replacement'}finally{$conflict.Dispose()}
Check01 ((Hash01 $path)-ceq$beforeConflict) 'Sharing failure must preserve the prior complete state'
$outside=Join-Path $root 'outside';[IO.Directory]::CreateDirectory($outside)|Out-Null
[void](Reject01 {Write-CatalogAtomicJson $private (Join-Path $outside 'forbidden.json') @{Schema=1}} 'Unapproved output path must reject')
[void](Reject01 {Write-CatalogAtomicJson $private $path @{Schema=1} -CancellationPath (Join-Path $outside 'cancel.request')} 'Unapproved cancellation path must reject before following it')
Check01 (![IO.File]::Exists((Join-Path $outside 'forbidden.json'))) 'Rejected outside path must remain untouched'
[void](Reject01 {Write-CatalogAtomicJson 'relative-root' (Join-Path $private 'relative.json') @{Schema=1}} 'Relative private root must reject')
[void](Reject01 {Write-CatalogAtomicJson $private 'relative.json' @{Schema=1}} 'Relative destination must reject')
[void](Reject01 {Write-CatalogAtomicJson $private ($path+[char]0) @{Schema=1}} 'Malformed output path must reject')
$blocked=Join-Path $private 'parent-is-file';[IO.File]::WriteAllText($blocked,'authored file, not directory')
[void](Reject01 {Write-CatalogAtomicJson $private (Join-Path $blocked 'catalog.json') @{Schema=1}} 'Unexpected non-directory ancestor must reject')
Check01 ([IO.File]::ReadAllText($blocked)-ceq'authored file, not directory') 'A rejected parent must not be replaced or reinitialised'
Check01 ($null-eq(Read-CatalogCacheJson $private (Join-Path $private 'missing-cache.json'))) 'Missing input must remain explicitly unavailable'
$broken=Join-Path $private 'nested/broken.json';[IO.File]::WriteAllText($broken,'{"Schema":1,"Fingerprint":')
$brokenBytes=[IO.File]::ReadAllBytes($broken);Check01 ($null-eq(Read-CatalogCacheJson $private $broken -ExpectedFingerprint 'bound')) 'Malformed cache must reject'
$quarantined=@(Get-ChildItem -LiteralPath (Split-Path $broken -Parent) -File -Filter '.invalid-*.json');Check01 ($quarantined.Count-eq1-and[Convert]::ToBase64String([IO.File]::ReadAllBytes($quarantined[0].FullName))-ceq[Convert]::ToBase64String($brokenBytes)) 'Quarantine must preserve exact malformed bytes under a bounded sibling name'
$wrong=Join-Path $private 'nested/wrong-binding.json';[IO.File]::WriteAllText($wrong,'{"Schema":1,"Fingerprint":"foreign","Value":"preserved"}')
$wrongHash=Hash01 $wrong;Check01 ($null-eq(Read-CatalogCacheJson $private $wrong -ExpectedFingerprint 'bound')) 'Foreign source fingerprint must never become valid cache data'
$wrongPreserved=@(Get-ChildItem -LiteralPath (Split-Path $wrong -Parent) -File -Filter '.invalid-*.json'|Where-Object{(Hash01 $_.FullName)-ceq$wrongHash});Check01 ($wrongPreserved.Count-eq1) 'Rejected source identity must retain its original bytes as quarantine evidence'
$link=Join-Path $private 'junction';New-Item -ItemType Junction -Path $link -Target $outside|Out-Null
[void](Reject01 {Write-CatalogAtomicJson $private (Join-Path $link 'escaped.json') @{Schema=1}} 'Reparse ancestor must reject')
Check01 (![IO.File]::Exists((Join-Path $outside 'escaped.json'))) 'Rejected reparse destination cannot escape approved output'
Record01 'fresh-existing-pending-replacement-consumer' @{firstIdentity=$firstIdentity;replacementIdentity=$replacementIdentity;firstPending=$script:pendingSeen;interruptedPending=$script:interruptedPending}
Record01 'safe-errors' @{sharingError=$sharing.Exception.GetType().FullName;cancellationError=$interruption.Exception.GetType().FullName;earlyCancellationError=$earlyCancellation.Exception.GetType().FullName;preparationCancellationError=$duringCancellation.Exception.GetType().FullName;lateCancellationError=$lateCancellation.Exception.GetType().FullName;previousStatePreserved=$true}
$receipt=[ordered]@{schema=1;passed=$true;runtime=$PSVersionTable.PSVersion.ToString();checks=$script:checks;root=$root;observations=$observations.ToArray();fixtureOnly=$true;gameAccessed=$false;audioEndpointOpened=$false;moduleSha256=(Hash01 $module);startupEpochSemantics='Epoch/source-manifest admission is exercised by the separate complete normal-path rehearsal, not invented by this generic writer'}
[IO.File]::WriteAllText((Join-Path $root 'validation.json'),($receipt|ConvertTo-Json -Depth 16),[Text.UTF8Encoding]::new($false))
'PASS actual catalogue publication lifecycle: '+(Join-Path $root 'validation.json')
