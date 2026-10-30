# One-time interactive private installer. Does not launch GTA or open audio.
[CmdletBinding()]
param([ValidateSet('Install','Uninstall','Validate')][string]$Mode='Validate',[string]$RphPackage='')
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
$manifestFile=Join-Path $candidate 'playable.json';$m=Read-Json $manifestFile;$manifestSha=Digest $manifestFile
if($m.schema -ne 1 -or $m.gameVersion -ne '1.0.1158.16' -or $m.rphVersion -ne '1.132.1428.17748' -or $m.gameSha256 -ne 'b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'){throw 'Unsupported prepared build'}
$game=[IO.Path]::GetDirectoryName($m.gameExecutable);$gameExe=Safe-Path $game 'GTA5_Enhanced.exe'
$install=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA ('RichAudio\Playable01-'+$manifestSha.Substring(0,12))))
$receiptFile=Safe-Path $install '.local/install-receipt.json'
if($Mode -eq 'Uninstall'){
 $r=Read-Json $receiptFile;if($r.manifestSha256 -ne $manifestSha -or $r.gameRoot -ne $game){throw 'Installation receipt differs'}
 foreach($f in $r.files){$target=Safe-Path $game $f.relative;if(!(Test-Path -LiteralPath $target) -or (Digest $target) -ne $f.installedSha256){throw ('Changed installed file; preserve and resolve manually: '+$f.relative)}}
 if(Get-Process -Name GTA5_Enhanced,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Exit GTA and RAGE Plugin Hook first'}
 foreach($f in $r.files){$target=Safe-Path $game $f.relative;if($f.backup){$backup=Safe-Path $install $f.backup;if((Digest $backup) -ne $f.originalSha256){throw 'Backup changed'};Copy-Item -LiteralPath $backup -Destination $target -Force}else{Remove-Item -LiteralPath $target}}
 $r.uninstalled=$true;Write-Json $receiptFile $r;Write-Output 'RichAudio removed. Original game/loader files restored. Private cache retained.';exit
}
foreach($b in $m.bindings){$file=Safe-Path $candidate $b.file;if((Digest $file) -ne $b.sha256){throw ('Prepared payload changed: '+$b.file)}}
if((Digest $gameExe) -ne $m.gameSha256 -or [Diagnostics.FileVersionInfo]::GetVersionInfo($gameExe).FileVersion -ne $m.gameVersion){throw 'Installed GTA build differs; normal GTA audio remains untouched'}
$prerequisite=Read-Json (Join-Path $candidate 'rph-prerequisite.json')
$missing=@($prerequisite.files|Where-Object{ $p=Safe-Path $game $_.file; !(Test-Path -LiteralPath $p) -or (Digest $p) -ne $_.sha256 })
if($Mode -eq 'Validate'){[ordered]@{schema=1;manifestSha256=$manifestSha;payloadVerified=$true;gameVerified=$true;rphFilesNeeded=$missing.Count;installRoot=$install;nativeReplacement=$false;endpointOpened=$false;installed=$false}|ConvertTo-Json;exit}
if(Get-Process -Name GTA5_Enhanced,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Exit GTA and RAGE Plugin Hook first'}
if(Test-Path -LiteralPath $receiptFile){throw 'This candidate already has an installation receipt. Uninstall it before reinstalling'}
Add-Type -AssemblyName System.Windows.Forms
$answer=[Windows.Forms.MessageBox]::Show('Install the RichAudio supervised validation candidate? This enables EXPERIMENTAL ADDITIVE playback: GTA engine audio remains audible. Native replacement and complete city geometry are not established. No game is launched by setup.','RichAudio one-time setup','YesNo','Warning')
if($answer -ne 'Yes'){Write-Output 'Cancelled; nothing installed.';exit}
if($missing.Count -gt 0){
 if(!$RphPackage){$dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description='Select your authentic extracted RPH 1.132.1428.17748 package (not included with RichAudio)';if($dialog.ShowDialog() -ne 'OK'){throw 'Authentic RPH prerequisite not selected'};$RphPackage=$dialog.SelectedPath}
 $RphPackage=[IO.Path]::GetFullPath($RphPackage)
 foreach($b in $prerequisite.files){$p=Safe-Path $RphPackage $b.file;if(!(Test-Path -LiteralPath $p) -or (Digest $p) -ne $b.sha256){throw 'Separately obtained RPH package does not match reviewed runtime'}}
 foreach($b in $missing){$p=Safe-Path $game $b.file;if(Test-Path -LiteralPath $p){throw ('Conflicting loader dependency, unchanged: '+$b.file)}}
}
# A versioned private cache is populated once. Launches verify and reuse it.
[IO.Directory]::CreateDirectory($install)|Out-Null
foreach($b in $m.bindings){$to=Safe-Path $install $b.file;[IO.Directory]::CreateDirectory((Split-Path -Parent $to))|Out-Null;Copy-Item -LiteralPath (Safe-Path $candidate $b.file) -Destination $to -Force}
Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $install 'playable.json') -Force
$settings=Safe-Path $install '.local/acoustic-settings.json'
if(!(Test-Path -LiteralPath $settings)){Write-Json $settings ([ordered]@{schemaVersion=1;revision=1;acousticQuality='auto';acousticAcceleration='auto';richAudioEnabled=$true;outputLevel=1;earlyReflections=$true;diagnosticsOverlay=$false;integrationMode='experimental-additive';soundMapVisible=$false})}
$pointer=Safe-Path $install '.local/install-payload/RichAudio.Playable.json';Write-Json $pointer ([ordered]@{schema=1;packageRoot=$install;manifestSha256=$manifestSha})
$menu=Safe-Path $install '.local/install-payload/RichAudio.Menu.json';Write-Json $menu ([ordered]@{schemaVersion=1;workspaceRoot=$install;settingsPath='.local/acoustic-settings.json';toggleKey='F10';controllerEnabled=$true;soundMap=[ordered]@{enabled=$true;autoStartService=$true;openWindow=$true;sampleHz=20;port=17833;nodeExecutable=(Join-Path $install 'runtime/node.exe')}})
$startup=Safe-Path $game 'startup.rphs';$old=if(Test-Path -LiteralPath $startup){[IO.File]::ReadAllText($startup)}else{''}
if($old -match '(?i)LoadPlugin[^\r\n]*RichAudio|RICHAUDIO PLAYABLE-01'){throw 'An existing RichAudio startup entry requires review; unchanged'}
$startupPayload=Safe-Path $install '.local/install-payload/startup.rphs';[IO.File]::WriteAllText($startupPayload,$old+"`r`n// RICHAUDIO PLAYABLE-01 BEGIN`r`nLoadPlugin `"RichAudio.dll`"`r`n// RICHAUDIO PLAYABLE-01 END`r`n",(New-Object Text.UTF8Encoding($false)))
$plans=@(@{relative='Plugins/RichAudio.dll';source=(Join-Path $install 'plugin/RichAudio.dll')},@{relative='Plugins/RichAudio.Playable.json';source=$pointer},@{relative='Plugins/RichAudio.Menu.json';source=$menu},@{relative='startup.rphs';source=$startupPayload})
foreach($b in $missing){$plans+=@{relative=$b.file;source=(Safe-Path $RphPackage $b.file)}}
$files=@();$index=0
foreach($p in $plans){$to=Safe-Path $game $p.relative;$backup=$null;$original=$null;if(Test-Path -LiteralPath $to){$backup='.local/install-backups/'+($index++)+'.original';$backupPath=Safe-Path $install $backup;[IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath))|Out-Null;Copy-Item -LiteralPath $to -Destination $backupPath;$original=Digest $to};$files+=@{relative=$p.relative;backup=$backup;originalSha256=$original;installedSha256=(Digest $p.source)}}
$receipt=[ordered]@{schema=1;manifestSha256=$manifestSha;gameRoot=$game;files=$files;uninstalled=$false;complete=$false};Write-Json $receiptFile $receipt
$written=@()
try{foreach($p in $plans){$to=Safe-Path $game $p.relative;[IO.Directory]::CreateDirectory((Split-Path -Parent $to))|Out-Null;Copy-Item -LiteralPath $p.source -Destination $to -Force;$written+=$p.relative};$receipt.complete=$true;Write-Json $receiptFile $receipt}
catch{foreach($relative in $written){$f=$files|Where-Object relative -EQ $relative;$to=Safe-Path $game $relative;if($f.backup){Copy-Item -LiteralPath (Safe-Path $install $f.backup) -Destination $to -Force}else{Remove-Item -LiteralPath $to}};throw}
Write-Output ('Installed. Launch through RAGEPluginHook.exe and load OFFLINE Story Mode. F10 controls. Private cache: '+$install)
