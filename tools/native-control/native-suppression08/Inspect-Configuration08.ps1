param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'FocusConfiguration08.psm1') -Force
$c=Get-CurrentFocusConfiguration08 '99869854'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if(!$OutputPath.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $OutputPath)){throw 'Fresh task-private inspection output required'}
function Pin($p){@{path=$p;bytes=(Get-Item -LiteralPath $p).Length;sha256=(Get-FocusHash08 $p)}}
$past='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-07'
$backup=Join-Path $past 'backups\02-settings.xml';$retained=Join-Path $past 'retained-runtime\previously-existing-2-settings.xml'
if((Get-FocusHash08 $backup)-cne$c.sha256-or(Get-FocusHash08 $retained)-cne$c.sha256){throw 'Historical configuration identity requires review'}
$other=@(Get-ChildItem -LiteralPath (Join-Path $c.documents 'Rockstar Games') -Directory|Where-Object {$_.Name-match'(?i)gta' -and $_.FullName-cne$c.root}|ForEach-Object FullName)
$r=[ordered]@{schema='NativeSuppression08ConfigurationInspection';utc=[DateTime]::UtcNow.ToString('o');passed=$true;configuration=$c;otherGtaDirectories=$other;settingsFiles=@(Get-ChildItem -LiteralPath $c.root -File|Where-Object Name -Match '^settings.*\.xml$'|ForEach-Object FullName);profiles=@($c.profile);historicalBackup=(Pin $backup);retainedAfterLaunch=(Pin $retained);historicalRetentionReceipt=(Pin (Join-Path $past 'runtime-retention.json'));historicalResult=(Pin (Join-Path $past 'RESULT.json'));launcherEvidence=(Pin (Join-Path $c.documents 'Rockstar Games\Launcher\launcher.log'));steamManifest=(Pin 'D:\Games\steamapps\appmanifest_3240220.acf');interpretation='Intended Enhanced configuration selected from resolved Known Documents, sole Enhanced root/profile, retained exact installation transaction and prior launch. Current, backup and postlaunch retained XML agree. Disk configuration does not prove runtime honours it. Historical menu-input failure cause remains unknown.';activeConfigurationWritten=$false}
[IO.Directory]::CreateDirectory((Split-Path $OutputPath))|Out-Null
[IO.File]::WriteAllText($OutputPath,($r|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));$r|ConvertTo-Json -Depth 8
