# Read-only inputs; writes evidence and a verified backup only in RichAudio.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$game='__GAME_ROOT__'
$output=Join-Path $repo 'evidence\phase2.2'
$backupRoot=Join-Path $repo '.local\phase2.2\pre-rename'
function Parents([string]$Path){for($d=[IO.DirectoryInfo]::new($Path);$null -ne $d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point path rejected.'}}}
Parents $game;Parents $output;Parents $backupRoot
[IO.Directory]::CreateDirectory($output) | Out-Null
$pins=@{ 'GTA5.exe'='FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF';'GTA5_Enhanced.exe'='69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5'}
$binaries=@(foreach($name in @('GTA5.exe','GTA5_Enhanced.exe')){
    $path=Join-Path $game $name;$file=Get-Item -LiteralPath $path
    if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Executable is a reparse point.'}
    $hash=(Get-FileHash -LiteralPath $path).Hash;if($hash -ne $pins[$name]){throw 'Executable changed since the stopped attempt.'}
    $sig=Get-AuthenticodeSignature -LiteralPath $path;$version=[Diagnostics.FileVersionInfo]::GetVersionInfo($path)
    [pscustomobject]@{Path=$path;Bytes=$file.Length;SHA256=$hash;FileVersion=$version.FileVersion;ProductVersion=$version.ProductVersion;OriginalFilename=$version.OriginalFilename;FileDescription=$version.FileDescription
        CreationUtc=$file.CreationTimeUtc.ToString('o');LastWriteUtc=$file.LastWriteTimeUtc.ToString('o');Attributes=[string]$file.Attributes
        SignatureStatus=[string]$sig.Status;Signer=$sig.SignerCertificate.Subject;SignerThumbprint=$sig.SignerCertificate.Thumbprint;TimestampSigner=$sig.TimeStamperCertificate.Subject
        Streams=@(Get-Item -LiteralPath $path -Stream * | Select-Object Stream,Length);HardLinks=@(& fsutil hardlink list $path)}
})
$source=Join-Path $game 'GTA5.exe';$target=Join-Path $game '_GTA5.exe';$backup=Join-Path $backupRoot 'GTA5.exe'
if(Test-Path -LiteralPath $target){throw 'Proposed rename target exists; no rename proposal can proceed.'}
[IO.Directory]::CreateDirectory($backupRoot) | Out-Null
if(!(Test-Path -LiteralPath $backup)){
    $inputStream=[IO.File]::OpenRead($source)
    try{$outputStream=[IO.File]::Open($backup,[IO.FileMode]::CreateNew);try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose()}}finally{$inputStream.Dispose()}
}
if((Get-FileHash -LiteralPath $backup).Hash -ne $pins['GTA5.exe']){throw 'Backup does not match original bytes.'}
$openivPath='__USER_HOME__\AppData\Local\New Technology Studio\OpenIV\Application.xml'
$openivGamePath=$null
if(Test-Path -LiteralPath $openivPath){$xml=[xml](Get-Content -LiteralPath $openivPath -Raw);$openivGamePath=@($xml.SelectNodes('//*[local-name()="path"]') | ForEach-Object InnerText | Where-Object {$_ -like '*Grand Theft Auto V Enhanced*'})}
$logs=@(foreach($file in Get-ChildItem -LiteralPath '__USER_HOME__\Documents\Rockstar Games\Launcher' -File -Filter 'launcher*.log'){
    $lines=[IO.File]::ReadAllLines($file.FullName)
    for($i=0;$i -lt $lines.Length;$i++){
        # Narrow allowlist: never export raw command lines, account identifiers or authentication fields.
        if($lines[$i] -match '(?i)(Launch Path:.*GTA5_Enhanced\.exe|File version 1\.0\.1158\.16.*GTA5_Enhanced\.exe|Grand Theft Auto V Enhanced is up to date)' -and $lines[$i] -notmatch '(?i)(token|password|ticket|auth|account|email|session|userid)'){
            [pscustomobject]@{File=$file.Name;Line=$i+1;Text=$lines[$i]}
        }
    }
})
$manifest=Get-Content (Join-Path $repo 'evidence\phase2.1\deployment-manifest.json') -Raw | ConvertFrom-Json
$steam=Get-Content (Join-Path $output 'steam-origin.json') -Raw | ConvertFrom-Json
if(!$steam.AllInstalledDepotsInspected -or $steam.OldGta5ExeListed -or !@($steam.ExecutableEntries | Where-Object {$_.Name -eq 'GTA5_Enhanced.exe' -and $_.ContentMatches}).Count){throw 'Steam ownership evidence does not support the proposed experiment; repeat Steam inspection.'}
$files=@(foreach($f in $manifest.Files){if((Get-FileHash -LiteralPath $f.Source).Hash -ne $f.SHA256){throw 'Runtime/plugin/config source drift.'};$present=Test-Path -LiteralPath $f.Destination;[pscustomobject]@{Source=$f.Source;Destination=$f.Destination;SHA256=$f.SHA256;Bytes=$f.Bytes;DestinationAbsent=(!$present)}})
$probe=@(foreach($n in @('RagePluginHook.ini','RagePluginHook.log','RagePluginHookLauncher.log','startup.rphs','commandline.txt')){[pscustomobject]@{Path=(Join-Path $game $n);Present=(Test-Path -LiteralPath (Join-Path $game $n))}})
[ordered]@{SchemaVersion=1;InspectedUtc=[DateTime]::UtcNow.ToString('o');Binaries=$binaries;Backup=[ordered]@{Path=$backup;SHA256=(Get-FileHash -LiteralPath $backup).Hash;Bytes=(Get-Item -LiteralPath $backup).Length;MatchesOriginal=$true};ProposedRename=[ordered]@{Source=$source;Destination=$target;DestinationAbsent=$true;Method='System.IO.File.Move(source,destination), two-argument no-overwrite same-volume rename; not executed';RestoreMethod='After game/RPH exit and hash checks, same no-overwrite rename back; refuse an occupied GTA5.exe'};OpenIV=[ordered]@{ConfigPath=$openivPath;ConfiguredGamePaths=$openivGamePath;CreatorOfCompatibilityFile='UNKNOWN; user states they did not create it'};RockstarLauncherEvidence=@($logs);AvailableRphFiles=$probe;RunningRelevantProcesses=@(Get-Process -Name GTA5,GTA5_Enhanced,RAGEPluginHook,OpenIV,CodeWalker -ErrorAction SilentlyContinue | Select-Object Id,ProcessName);GameWritesPerformed=$false;RenamePerformed=$false;RuntimeStarted=$false} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $output 'executable-inspection.json') -Encoding utf8
[ordered]@{SchemaVersion=1;PreparedUtc=[DateTime]::UtcNow.ToString('o');Status='AWAITING_NEW_EXPLICIT_APPROVAL';InstallationAuthorised=$false;RenameAuthorised=$false;GameRoot=$game;ExpectedEnhancedVersion='1.0.1158.16';ExpectedEnhancedSHA256=$pins['GTA5_Enhanced.exe'];RenameSource=$source;RenameDestination=$target;RenameSHA256=$pins['GTA5.exe'];VerifiedBackup=$backup;FileAdditions=$files;OriginalManifestPath=(Join-Path $repo 'evidence\phase2.1\deployment-manifest.json');OriginalManifestSHA256=(Get-FileHash (Join-Path $repo 'evidence\phase2.1\deployment-manifest.json')).Hash;Prerequisite='VC2010 x64 already installed; do not reinstall';ProposedNewGameFileCount=$files.Count;RequiredPreconditions=@('New user approval for rename and redeployment; no game/tool processes; no original or destination hash drift.','Check all 26 destinations absent immediately before CreateNew copies.','Check _GTA5.exe absent and the independent backup hash before the no-overwrite rename.','Keep OpenIV/CodeWalker closed while the compatibility name is hidden.','No Steam verification/update, file replacement, security changes or additional compatibility fixes.');PositiveEvidenceRequired=@('RPH explicitly reports Enhanced 1.0.1158.16 as supported; capture its UI and launcher/runtime logs.','Actual running process path is the unchanged GTA5_Enhanced.exe, with expected SHA256/version and supported Story Mode launch.','RPH runtime log identifies Enhanced; RichAudio header records the exact game/framework versions.');LoggingPlan='Enable startup logging through the previously observed publisher Restart with logging settings button before the single game launch; capture any emitted RPH logs locally. No fabricated INI selector or extra commandline file.';StopConditions=@('Unexpected target/version, unsupported condition, DirectStorage/security/loader warning, crash or file conflict: exit, collect diagnostics, roll back additions, restore the old executable name.');FinalRestoration='Exit game/RPH before restoration. Move only unchanged introduced runtime files to development quarantine; restore _GTA5.exe to GTA5.exe only if target absent and bytes match. Verify both original executable hashes and archive baseline. Never overwrite a file created while the experiment was running; preserve both and request review.';SelectionStatus='Community-described filename-priority mechanism, corroborated by local version evidence; not yet demonstrated on this host';TelemetryScope='One authorised Enhanced smoke test, then A-E only on success and continuing compatible deployment. No Phase 3.'} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $output 'controlled-test-plan.json') -Encoding utf8
[pscustomobject]@{BothOriginalHashesMatch=$true;BackupMatches=$true;RenameTargetAbsent=$true;AvailableLauncherEvidence=$logs.Count;ProposedAdditions=$files.Count;AllDeploymentDestinationsAbsent=(@($files | Where-Object {!$_.DestinationAbsent}).Count -eq 0);GameWritesPerformed=$false} | ConvertTo-Json
