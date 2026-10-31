# One-time interactive private installer. Does not launch GTA or open audio.
[CmdletBinding()]
param([ValidateSet('Install','Uninstall','Validate')][string]$Mode='Validate',[string]$RphPackage='',
 [switch]$Upgrade,[string]$PreviousReviewFile='',[switch]$AcceptExperimentalAdditive,[switch]$FunctionsOnly)
$ErrorActionPreference='Stop'
$candidate=[IO.Path]::GetFullPath($PSScriptRoot)
function Read-Json([string]$p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json}
function Digest([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Safe-Path([string]$root,[string]$relative){
 if([IO.Path]::IsPathRooted($relative)){throw 'Relative path required'}
 $p=[IO.Path]::GetFullPath((Join-Path $root $relative));if(!$p.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped installation root'}
 for($d=$p;$d;$d=[IO.Path]::GetDirectoryName($d)){if((Test-Path -LiteralPath $d) -and ((Get-Item -LiteralPath $d -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked installation paths are unsupported'}}
 return $p
}
function Write-Json([string]$file,$value){$parent=Split-Path -Parent $file;[IO.Directory]::CreateDirectory($parent)|Out-Null;$s=$value|ConvertTo-Json -Depth 20;[IO.File]::WriteAllText($file,$s,(New-Object Text.UTF8Encoding($false)))}
function Invoke-InstallTransaction([string]$gameRoot,[string]$installRoot,$plans,$rollback,[string]$receiptPath,$receipt,
 [scriptblock]$copyPayload={param($from,$to) Copy-Item -LiteralPath $from -Destination $to -Force}){
 $written=@()
 try{
  foreach($p in $plans){$to=Safe-Path $gameRoot $p.relative;[IO.Directory]::CreateDirectory((Split-Path -Parent $to))|Out-Null;$written+=$p.relative;& $copyPayload $p.source $to}
  $receipt.complete=$true;Write-Json $receiptPath $receipt
 }catch{
  $cause=$_;$receipt.complete=$false;$failures=@()
  foreach($relative in $written){
   try{$f=@($rollback|Where-Object relative -EQ $relative);if($f.Count -ne 1){throw 'Ambiguous rollback target'};$f=$f[0];$to=Safe-Path $gameRoot $relative
    if($f.backup){$backup=Safe-Path $installRoot $f.backup;if((Digest $backup) -ne $f.sha256){throw 'Rollback backup changed'};Copy-Item -LiteralPath $backup -Destination $to -Force}
    elseif(Test-Path -LiteralPath $to){Remove-Item -LiteralPath $to}
   }catch{$failures+=('restore '+$relative)}
  }
  # Verify every planned target, including targets not reached by the failed
  # copy. Clear the incomplete receipt only after exact pre-install restoration.
  foreach($f in $rollback){try{$to=Safe-Path $gameRoot $f.relative
   if($f.backup){if(!(Test-Path -LiteralPath $to) -or (Digest $to) -ne $f.sha256){throw 'Rollback bytes differ'}}
   elseif(Test-Path -LiteralPath $to){throw 'New target remains'}
  }catch{$failures+=('verify '+$f.relative)}}
  if($failures.Count){try{Write-Json $receiptPath $receipt}catch{};throw ('Installation failed; rollback incomplete. Receipt and backups retained for review: '+($failures -join ', '))}
  Remove-Item -LiteralPath $receiptPath
  throw $cause
 }
}
function Get-StartupContent([string]$text,[bool]$isUpgrade){
 $ownCommand='(?im)^\s*LoadPlugin\s+(?:"RichAudio\.dll"|RichAudio\.dll)\s*(?:\r?\n|$)'
 $ownMarker='(?im)^[ \t]*//[ \t]*RICHAUDIO PLAYABLE-01 (?:BEGIN|END)[ \t]*(?:\r?\n|$)'
 if(!$isUpgrade -and $text -match '(?i)LoadPlugin[^\r\n]*RichAudio|RICHAUDIO PLAYABLE-01'){throw 'An existing RichAudio startup entry requires -Upgrade and an exact previous review'}
 $baseline=$text
 if($isUpgrade){$baseline=[regex]::Replace([regex]::Replace($text,$ownCommand,''),$ownMarker,'');if($baseline -match '(?i)LoadPlugin[^\r\n]*RichAudio|RICHAUDIO PLAYABLE-01'){throw 'Unrecognised RichAudio startup content; preserve and review manually'}}
 if([string]::IsNullOrWhiteSpace($baseline)){$baseline=''}
 $separator=if($baseline -and !$baseline.EndsWith("`n")){"`r`n"}else{''}
 return [pscustomobject]@{baseline=$baseline;installed=($baseline+$separator+'LoadPlugin "RichAudio.dll"'+"`r`n")}
}
function Get-ReviewedPrevious([string]$gameRoot,[string]$cacheParent,$review){
 if($null -eq $review -or $review.schema -ne 1 -or $review.gameRoot -ne $gameRoot -or $review.previousManifestSha256 -notmatch '^[a-fA-F0-9]{64}$' -or $review.previousReceiptSha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Exact previous-installation review required'}
 $pointer=Read-Json (Safe-Path $gameRoot 'Plugins/RichAudio.Playable.json')
 if($pointer.schema -ne 1 -or $pointer.manifestSha256 -ne $review.previousManifestSha256){throw 'Previous pointer differs from review'}
 $oldRoot=Safe-Path $cacheParent ('Playable01-'+$pointer.manifestSha256.Substring(0,12))
 if([IO.Path]::GetFullPath($pointer.packageRoot) -ne $oldRoot -or (Digest (Safe-Path $oldRoot 'playable.json')) -ne $pointer.manifestSha256){throw 'Previous package binding differs'}
 $oldReceipt=Safe-Path $oldRoot '.local/install-receipt.json'
 if((Digest $oldReceipt) -ne $review.previousReceiptSha256){throw 'Previous receipt differs from review'}
 $r=Read-Json $oldReceipt
 if($r.schema -ne 1 -or !$r.complete -or $r.uninstalled -or $r.gameRoot -ne $gameRoot -or $r.manifestSha256 -ne $pointer.manifestSha256){throw 'Incomplete or different prior installation'}
 $seen=@{};foreach($f in $r.files){$target=Safe-Path $gameRoot $f.relative;if($seen.ContainsKey($f.relative)){throw 'Duplicate prior receipt target'};$seen[$f.relative]=$true
  $approved=@($review.files|Where-Object relative -EQ $f.relative)
  if($approved.Count -ne 1 -or $approved[0].sha256 -notmatch '^[a-fA-F0-9]{64}$' -or !(Test-Path -LiteralPath $target) -or (Digest $target) -ne $approved[0].sha256){throw ('Current installed file is not exactly reviewed: '+$f.relative)}
  if($f.backup -and (Digest (Safe-Path $oldRoot $f.backup)) -ne $f.originalSha256){throw 'Original prior-installation backup changed'}
 }
 if(@($review.files).Count -ne $r.files.Count){throw 'Review must bind exactly the prior owned targets'}
 foreach($b in @($review.preserveDependencies)){
  if($b.relative -ne 'XInput1_4.dll' -or $b.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or (Digest (Safe-Path $gameRoot $b.relative)) -ne $b.sha256){throw 'Only an exact reviewed existing ASI loader may be preserved'}
 }
 return [pscustomobject]@{root=$oldRoot;receipt=$r;receiptFile=$oldReceipt;review=$review}
}
if($FunctionsOnly){return}
$manifestFile=Join-Path $candidate 'playable.json';$m=Read-Json $manifestFile;$manifestSha=Digest $manifestFile
if($m.schema -ne 1 -or $m.gameVersion -ne '1.0.1158.16' -or $m.rphVersion -ne '1.132.1428.17748' -or $m.gameSha256 -ne 'b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'){throw 'Unsupported prepared build'}
$game=[IO.Path]::GetDirectoryName($m.gameExecutable);$gameExe=Safe-Path $game 'GTA5_Enhanced.exe'
$install=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA ('RichAudio\Playable01-'+$manifestSha.Substring(0,12))))
$receiptFile=Safe-Path $install '.local/install-receipt.json'
if($Mode -eq 'Uninstall'){
 $r=Read-Json $receiptFile;if($r.manifestSha256 -ne $manifestSha -or $r.gameRoot -ne $game){throw 'Installation receipt differs'}
 foreach($f in $r.files){$target=Safe-Path $game $f.relative;if(!(Test-Path -LiteralPath $target) -or (Digest $target) -ne $f.installedSha256){throw ('Changed installed file; preserve and resolve manually: '+$f.relative)};if($f.backup -and (Digest (Safe-Path $install $f.backup)) -ne $f.originalSha256){throw 'Backup changed'}}
 if(Get-Process -Name GTA5_Enhanced,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Exit GTA and RAGE Plugin Hook first'}
 foreach($f in $r.files){$target=Safe-Path $game $f.relative;if($f.backup){$backup=Safe-Path $install $f.backup;if((Digest $backup) -ne $f.originalSha256){throw 'Backup changed'};Copy-Item -LiteralPath $backup -Destination $target -Force}else{Remove-Item -LiteralPath $target}}
 $r.uninstalled=$true;Write-Json $receiptFile $r;Write-Output 'RichAudio removed. Original game/loader files restored. Private cache retained.';exit
}
foreach($b in $m.bindings){$file=Safe-Path $candidate $b.file;if((Digest $file) -ne $b.sha256){throw ('Prepared payload changed: '+$b.file)}}
if((Digest $gameExe) -ne $m.gameSha256 -or [Diagnostics.FileVersionInfo]::GetVersionInfo($gameExe).FileVersion -ne $m.gameVersion){throw 'Installed GTA build differs; normal GTA audio remains untouched'}
$prerequisite=Read-Json (Join-Path $candidate 'rph-prerequisite.json')
$previous=$null
if($Upgrade){if(!$PreviousReviewFile){throw '-Upgrade requires -PreviousReviewFile'};$previous=Get-ReviewedPrevious $game (Join-Path $env:LOCALAPPDATA 'RichAudio') (Read-Json $PreviousReviewFile);if($previous.receipt.manifestSha256 -eq $manifestSha){throw 'Upgrade requires a new immutable candidate'}}
elseif($PreviousReviewFile){throw '-PreviousReviewFile is only valid with -Upgrade'}
$preserved=@();$missing=@()
foreach($b in $prerequisite.files){$p=Safe-Path $game $b.file;if((Test-Path -LiteralPath $p) -and (Digest $p) -eq $b.sha256){continue}
 $exception=@();if($previous){$exception=@($previous.review.preserveDependencies|Where-Object relative -EQ $b.file)}
 if(@($exception).Count -eq 1){$preserved+=@{relative=$b.file;sha256=(Digest $p)};continue};$missing+=$b
}
if($Mode -eq 'Validate'){[ordered]@{schema=1;manifestSha256=$manifestSha;payloadVerified=$true;gameVerified=$true;rphFilesNeeded=$missing.Count;preservedDependencies=$preserved;upgrade=[bool]$Upgrade;installRoot=$install;nativeReplacement=$false;endpointOpened=$false;installed=$false}|ConvertTo-Json -Depth 10;exit}
if(Get-Process -Name GTA5_Enhanced,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Exit GTA and RAGE Plugin Hook first'}
if(Test-Path -LiteralPath $receiptFile){throw 'This candidate already has an installation receipt. Uninstall it before reinstalling'}
if(!$AcceptExperimentalAdditive){Add-Type -AssemblyName System.Windows.Forms
 $answer=[Windows.Forms.MessageBox]::Show('Install the RichAudio supervised validation candidate? This enables EXPERIMENTAL ADDITIVE playback: GTA engine audio remains audible. Native replacement and complete city geometry are not established. No game is launched by setup.','RichAudio one-time setup','YesNo','Warning')
 if($answer -ne 'Yes'){Write-Output 'Cancelled; nothing installed.';exit}}
if($missing.Count -gt 0){
 if(!$RphPackage){Add-Type -AssemblyName System.Windows.Forms;$dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description='Select your authentic extracted RPH 1.132.1428.17748 package (not included with RichAudio)';if($dialog.ShowDialog() -ne 'OK'){throw 'Authentic RPH prerequisite not selected'};$RphPackage=$dialog.SelectedPath}
 $RphPackage=[IO.Path]::GetFullPath($RphPackage)
 foreach($b in $prerequisite.files){$p=Safe-Path $RphPackage $b.file;if(!(Test-Path -LiteralPath $p) -or (Digest $p) -ne $b.sha256){throw 'Separately obtained RPH package does not match reviewed runtime'}}
 foreach($b in $missing){$p=Safe-Path $game $b.file;if(Test-Path -LiteralPath $p){throw ('Conflicting loader dependency, unchanged: '+$b.file)}}
}
# A versioned private cache is populated once. Launches verify and reuse it.
[IO.Directory]::CreateDirectory($install)|Out-Null
foreach($b in $m.bindings){$to=Safe-Path $install $b.file;[IO.Directory]::CreateDirectory((Split-Path -Parent $to))|Out-Null;Copy-Item -LiteralPath (Safe-Path $candidate $b.file) -Destination $to -Force}
Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $install 'playable.json') -Force
$settings=Safe-Path $install '.local/acoustic-settings.json'
[IO.Directory]::CreateDirectory((Split-Path -Parent $settings))|Out-Null
if($previous -and (Test-Path -LiteralPath (Safe-Path $previous.root '.local/acoustic-settings.json'))){Copy-Item -LiteralPath (Safe-Path $previous.root '.local/acoustic-settings.json') -Destination $settings -Force}
if(!(Test-Path -LiteralPath $settings)){Write-Json $settings ([ordered]@{schemaVersion=1;revision=1;acousticQuality='auto';acousticAcceleration='auto';richAudioEnabled=$true;outputLevel=1;earlyReflections=$true;diagnosticsOverlay=$false;integrationMode='experimental-additive';soundMapVisible=$false})}
$pointer=Safe-Path $install '.local/install-payload/RichAudio.Playable.json';Write-Json $pointer ([ordered]@{schema=1;packageRoot=$install;manifestSha256=$manifestSha})
$menu=Safe-Path $install '.local/install-payload/RichAudio.Menu.json';Write-Json $menu ([ordered]@{schemaVersion=1;workspaceRoot=$install;settingsPath='.local/acoustic-settings.json';toggleKey='F10';controllerEnabled=$true;soundMap=[ordered]@{enabled=$true;autoStartService=$true;openWindow=$true;sampleHz=20;port=17833;nodeExecutable=(Join-Path $install 'runtime/node.exe')}})
$startup=Safe-Path $game 'startup.rphs';$old=if(Test-Path -LiteralPath $startup){[IO.File]::ReadAllText($startup)}else{''}
$startupContent=Get-StartupContent $old ([bool]$Upgrade)
$startupPayload=Safe-Path $install '.local/install-payload/startup.rphs';[IO.File]::WriteAllText($startupPayload,$startupContent.installed,(New-Object Text.UTF8Encoding($false)))
$plans=@(@{relative='Plugins/RichAudio.dll';source=(Join-Path $install 'plugin/RichAudio.dll')},@{relative='Plugins/RichAudio.Playable.json';source=$pointer},@{relative='Plugins/RichAudio.Menu.json';source=$menu},@{relative='startup.rphs';source=$startupPayload})
foreach($b in $missing){$plans+=@{relative=$b.file;source=(Safe-Path $RphPackage $b.file)}}
if($previous){$previous=Get-ReviewedPrevious $game (Join-Path $env:LOCALAPPDATA 'RichAudio') (Read-Json $PreviousReviewFile)}
$files=@();$rollback=@();$index=0
foreach($p in $plans){$to=Safe-Path $game $p.relative;$backup=$null;$original=$null;$saved=$null
 if(Test-Path -LiteralPath $to){$saved='.local/transaction-backups/'+($index++)+'.current';$savedPath=Safe-Path $install $saved;[IO.Directory]::CreateDirectory((Split-Path -Parent $savedPath))|Out-Null;Copy-Item -LiteralPath $to -Destination $savedPath}
 $rollback+=@{relative=$p.relative;backup=$saved;sha256=if($saved){Digest (Safe-Path $install $saved)}else{$null}}
 $inherited=@();if($previous){$inherited=@($previous.receipt.files|Where-Object relative -EQ $p.relative)}
 if($Upgrade -and $p.relative -eq 'startup.rphs'){
  if($startupContent.baseline){$backup='.local/install-backups/startup.original';$backupPath=Safe-Path $install $backup;[IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath))|Out-Null;[IO.File]::WriteAllText($backupPath,$startupContent.baseline,(New-Object Text.UTF8Encoding($false)));$original=Digest $backupPath}
 }elseif(@($inherited).Count -eq 1){
  if($inherited[0].backup){$backup='.local/install-backups/'+($index++)+'.original';$backupPath=Safe-Path $install $backup;[IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath))|Out-Null;Copy-Item -LiteralPath (Safe-Path $previous.root $inherited[0].backup) -Destination $backupPath;$original=$inherited[0].originalSha256}
 }elseif($saved){$backup='.local/install-backups/'+($index++)+'.original';$backupPath=Safe-Path $install $backup;[IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath))|Out-Null;Copy-Item -LiteralPath (Safe-Path $install $saved) -Destination $backupPath;$original=Digest $backupPath}
 $files+=@{relative=$p.relative;backup=$backup;originalSha256=$original;installedSha256=(Digest $p.source)}
}
if($previous){
 foreach($f in $previous.receipt.files){if(@($files|Where-Object relative -EQ $f.relative).Count){continue};$backup=$null;if($f.backup){$backup='.local/install-backups/'+($index++)+'.original';$backupPath=Safe-Path $install $backup;[IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath))|Out-Null;Copy-Item -LiteralPath (Safe-Path $previous.root $f.backup) -Destination $backupPath};$files+=@{relative=$f.relative;backup=$backup;originalSha256=$f.originalSha256;installedSha256=(Digest (Safe-Path $game $f.relative))}}
 Copy-Item -LiteralPath $previous.receiptFile -Destination (Safe-Path $install '.local/previous-install-receipt.json')
 Copy-Item -LiteralPath $PreviousReviewFile -Destination (Safe-Path $install '.local/previous-install-review.json')
}
$receipt=[ordered]@{schema=1;manifestSha256=$manifestSha;gameRoot=$game;files=$files;uninstalled=$false;complete=$false;upgradedFrom=if($previous){$previous.receipt.manifestSha256}else{$null};preservedDependencies=$preserved;transactionBackups=$rollback};Write-Json $receiptFile $receipt
Invoke-InstallTransaction $game $install $plans $rollback $receiptFile $receipt
Write-Output ('Installed. Launch through RAGEPluginHook.exe and load OFFLINE Story Mode. F10 controls. Private cache: '+$install)
