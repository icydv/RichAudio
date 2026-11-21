# Device-free installer contract tests. All writes stay under one temporary root.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../tools/playable/Setup.ps1') -FunctionsOnly
$checks=0
function Check([bool]$ok,[string]$why){$script:checks++;if(!$ok){throw $why}}
function Reject([scriptblock]$action,[string]$why){$failed=$false;try{& $action|Out-Null}catch{$failed=$true};Check $failed $why}
$fixture=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('RichAudio-Installer-'+[guid]::NewGuid().ToString('N'))))
try{
 [IO.Directory]::CreateDirectory($fixture)|Out-Null
 $text="LoadPlugin Other.dll`r`n// RICHAUDIO PLAYABLE-01 BEGIN`r`n// RICHAUDIO PLAYABLE-01 END`r`nLoadPlugin `"RichAudio.dll`"`r`nSetVariable Value`r`n"
 $startup=Get-StartupContent $text $true
 Check ($startup.baseline -eq "LoadPlugin Other.dll`r`nSetVariable Value`r`n") 'Upgrade must preserve unrelated commands'
 Check ($startup.installed -eq ($startup.baseline+'LoadPlugin "RichAudio.dll"'+"`r`n")) 'One supported LoadPlugin entry without unknown comment commands'
 Check (([regex]::Matches($startup.installed,'(?i)LoadPlugin[^\r\n]*RichAudio')).Count -eq 1) 'Exactly one RichAudio entry'
 Check ((Get-StartupContent '' $false).baseline -eq '') 'Empty first install has no fabricated baseline'
 Reject {Get-StartupContent $text $false} 'An existing entry requires explicit upgrade'
 Reject {Get-StartupContent 'LoadPlugin RichAudio.Other.dll' $true} 'Unknown RichAudio command cannot be silently removed'
 $game=Join-Path $fixture 'game';$cache=Join-Path $fixture 'RichAudio';[IO.Directory]::CreateDirectory((Join-Path $game 'Plugins'))|Out-Null
 $manifest='{"schema":1,"kind":"independent installer fixture"}';$manifestTemp=Join-Path $fixture 'manifest.json';[IO.File]::WriteAllText($manifestTemp,$manifest);$sha=Digest $manifestTemp
 $oldRoot=Join-Path $cache ('Playable01-'+$sha.Substring(0,12));[IO.Directory]::CreateDirectory((Join-Path $oldRoot '.local/install-backups'))|Out-Null;Copy-Item -LiteralPath $manifestTemp -Destination (Join-Path $oldRoot 'playable.json')
 Write-Json (Join-Path $game 'Plugins/RichAudio.Playable.json') @{schema=1;packageRoot=$oldRoot;manifestSha256=$sha}
 [IO.File]::WriteAllText((Join-Path $game 'Plugins/RichAudio.dll'),'reviewed changed current plugin')
 [IO.File]::WriteAllText((Join-Path $game 'Plugins/RichAudio.Menu.json'),'independent menu fixture')
 [IO.File]::WriteAllText((Join-Path $game 'startup.rphs'),$text)
 [IO.File]::WriteAllText((Join-Path $game 'XInput1_4.dll'),'independent exact loader fixture')
 $original=Join-Path $oldRoot '.local/install-backups/plugin.original';[IO.File]::WriteAllText($original,'original before initial installation')
 $files=@('Plugins/RichAudio.dll','Plugins/RichAudio.Playable.json','Plugins/RichAudio.Menu.json','startup.rphs')|ForEach-Object{@{relative=$_;installedSha256=('0'*64);backup=if($_ -eq 'Plugins/RichAudio.dll'){'.local/install-backups/plugin.original'}else{$null};originalSha256=if($_ -eq 'Plugins/RichAudio.dll'){Digest $original}else{$null}}}
 $receipt=Join-Path $oldRoot '.local/install-receipt.json';Write-Json $receipt @{schema=1;complete=$true;uninstalled=$false;gameRoot=$game;manifestSha256=$sha;files=$files}
 $review=[pscustomobject]@{schema=1;gameRoot=$game;previousManifestSha256=$sha;previousReceiptSha256=(Digest $receipt);files=@($files|ForEach-Object{@{relative=$_.relative;sha256=(Digest (Join-Path $game $_.relative))}});preserveDependencies=@(@{relative='XInput1_4.dll';sha256=(Digest (Join-Path $game 'XInput1_4.dll'))})}
 $state=Get-ReviewedPrevious $game $cache $review
 Check ($state.root -eq $oldRoot) 'Pinned previous root accepted'
 Check ($state.receipt.files.Count -eq 4) 'Every previous owned target retained'
 Check ($state.receipt.files[0].originalSha256 -eq (Digest $original)) 'Original uninstall backup survives review'
 $plugin=Join-Path $game 'Plugins/RichAudio.dll';[IO.File]::AppendAllText($plugin,'unreviewed mutation')
 Reject {Get-ReviewedPrevious $game $cache $review} 'Mutation after review must fail closed'
 [IO.File]::WriteAllText($plugin,'reviewed changed current plugin')
 $review.files[0].sha256='0'*64;Reject {Get-ReviewedPrevious $game $cache $review} 'Current hashes require exact approval';$review.files[0].sha256=Digest $plugin
 $review.preserveDependencies[0].relative='Other.dll';Reject {Get-ReviewedPrevious $game $cache $review} 'Exception cannot preserve arbitrary runtime dependency';$review.preserveDependencies[0].relative='XInput1_4.dll'
 [IO.File]::AppendAllText($original,'unreviewed backup mutation');Reject {Get-ReviewedPrevious $game $cache $review} 'Original backup corruption blocks upgrade'
 Reject {Safe-Path $game '../escape'} 'Package paths remain within target root'
 # Exercise actual transaction writes, a partially written new target, exact
 # byte restoration and retry. No game/build manifests or mocked filesystem.
 $txRoot=Join-Path $fixture 'transaction';$txGame=Join-Path $txRoot 'game';$txCache=Join-Path $txRoot 'cache'
 [IO.Directory]::CreateDirectory($txGame)|Out-Null;[IO.Directory]::CreateDirectory($txCache)|Out-Null
 $one=Join-Path $txGame 'one.bin';$three=Join-Path $txGame 'three.bin'
 [IO.File]::WriteAllBytes($one,[byte[]]@(0,255,13,10,200));[IO.File]::WriteAllBytes($three,[byte[]]@(99,0,128,1))
 Copy-Item -LiteralPath $one -Destination (Join-Path $txCache 'one.original');Copy-Item -LiteralPath $three -Destination (Join-Path $txCache 'three.original')
 $oneSha=Digest $one;$threeSha=Digest $three;$payload=Join-Path $txCache 'payload';[IO.File]::WriteAllText($payload,'replacement bytes')
 $txPlans=@('one.bin','two.bin','three.bin')|ForEach-Object{@{relative=$_;source=$payload}}
 $txRollback=@(@{relative='one.bin';backup='one.original';sha256=$oneSha},@{relative='two.bin';backup=$null;sha256=$null},@{relative='three.bin';backup='three.original';sha256=$threeSha})
 $txReceipt=Join-Path $txCache 'receipt.json';$txState=@{complete=$false};Write-Json $txReceipt $txState
 Reject {Invoke-InstallTransaction $txGame $txCache $txPlans $txRollback $txReceipt $txState {
  param($from,$to) if([IO.Path]::GetFileName($to) -eq 'two.bin'){[IO.File]::WriteAllText($to,'partial');throw 'injected failure after partial write'};Copy-Item -LiteralPath $from -Destination $to -Force
 }} 'Partial write failure must be reported after rollback'
 Check ((Digest $one) -eq $oneSha -and (Digest $three) -eq $threeSha) 'Rollback restores exact original bytes and leaves unreached targets intact'
 Check (!(Test-Path -LiteralPath (Join-Path $txGame 'two.bin'))) 'Rollback removes a partially written newly created target'
 Check (!(Test-Path -LiteralPath $txReceipt)) 'Verified rollback clears the incomplete receipt so retry remains possible'
 $txState=@{complete=$false};Write-Json $txReceipt $txState;Invoke-InstallTransaction $txGame $txCache $txPlans $txRollback $txReceipt $txState
 Check ((Read-Json $txReceipt).complete -and (Digest $one) -eq (Digest $payload) -and (Digest (Join-Path $txGame 'two.bin')) -eq (Digest $payload)) 'Retry completes the real transaction and receipt'
 # A locked rollback backup cannot be restored. Retain the incomplete receipt
 # and report the failure instead of incorrectly unlocking another retry.
 Copy-Item -LiteralPath (Join-Path $txCache 'one.original') -Destination $one -Force
 Remove-Item -LiteralPath (Join-Path $txGame 'two.bin');Copy-Item -LiteralPath (Join-Path $txCache 'three.original') -Destination $three -Force
 $txState=@{complete=$false};Write-Json $txReceipt $txState;$lock=$null
 try{
  Reject {Invoke-InstallTransaction $txGame $txCache $txPlans $txRollback $txReceipt $txState {
   param($from,$to) Copy-Item -LiteralPath $from -Destination $to -Force
   $script:lock=[IO.File]::Open((Join-Path $txCache 'one.original'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
   throw 'injected failure with unavailable rollback backup'
  }} 'Failed rollback must be reported'
  Check ((Test-Path -LiteralPath $txReceipt) -and !(Read-Json $txReceipt).complete) 'Failed rollback retains its incomplete receipt for manual recovery'
  Check ((Digest $one) -ne $oneSha) 'Fixture proves the unavailable backup prevented restoration'
 }finally{if($lock){$lock.Dispose();$lock=$null}}
 Write-Output ("PASS: $checks installer upgrade/review/startup/backup contract checks; temporary files only, no GTA or endpoint.")
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if(!$resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'RichAudio-Installer-*'){throw 'Temporary cleanup target differs'}
 if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
