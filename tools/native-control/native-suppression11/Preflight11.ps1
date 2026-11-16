param([Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$ScopeSha256,[Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$repo='C:\Users\Libby\Documents\RichAudio-NativeSuppressionFixes';$scopePath=Join-Path $repo '.local\native-suppression-01\candidate-11\scope.json'
function Sha($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function NoLinks($p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw "Linked path refused: $p"}}}
NoLinks $scopePath;if((Sha $scopePath)-cne$ScopeSha256){throw 'Scope identity differs'}
$s=Get-Content $scopePath -Raw|ConvertFrom-Json -DateKind String
if((Sha $s.focusConfiguration.helper.path)-cne$s.focusConfiguration.helper.sha256){throw 'Configuration helper drift'}
Import-Module $s.focusConfiguration.helper.path -Force
$configuration=Get-CurrentFocusConfiguration08 $s.focusConfiguration.profile
if($configuration.path-cne$s.focusConfiguration.path-or$configuration.sha256-cne$s.focusConfiguration.originalSha256-or$configuration.value-ne$s.focusConfiguration.originalValue){throw 'Reviewed Enhanced configuration differs'}
if($s.candidateName-cne'candidate-11'-or$s.authorized-or$s.executed){throw 'New automated proposal required'}
$head=(& git -C $repo rev-parse HEAD).Trim();$dirty=@(& git -C $repo status --porcelain)
if($LASTEXITCODE-or$head-cne$s.sourceCommit-or$dirty.Count){throw 'Committed source differs'}
$processes=@(Get-Process GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue)
if($processes.Count){throw 'Game or recorder active'}
$install=@($s.gameInstall)+@($s.capture.install)
$absent=@($install.destination)+@($s.installation.requiredAbsentDirectories)+@($s.installation.additionalRequiredAbsent)+@($s.logBackupsRequired|Where-Object {!$_.exists}|ForEach-Object path)
$absent=@($absent|Sort-Object -Unique);foreach($p in $absent){NoLinks $p;if(Test-Path -LiteralPath $p){throw "Required absent path exists: $p"}}
$originals=@($s.capture.originalSettingsToBackup)+@($s.gameSettingsBackups)+@($s.logBackupsRequired|Where-Object exists|ForEach-Object original)
$pins=@($s.game,$s.capture.executable,$s.parkAndRestore,$s.originalBaseArchive,$s.originalGranularArchive,$s.originalResidentArchive,$s.installation.installerScript,$s.installation.rollbackScript,$s.procedureAddendum,$s.registrationProcedure)+@($s.builds)+@($s.unchangedRootBinaryInventory)+@($originals)+@($install|ForEach-Object source)+@($s.operator.executionFiles|ForEach-Object source)+@($s.operator.dependencies)
$checked=@();foreach($g in $pins|Group-Object path){
 $f=$g.Group[0];if(@($g.Group.sha256|Sort-Object -Unique).Count-ne1){throw 'Conflicting pin'}
 NoLinks $f.path;if((Get-Item -LiteralPath $f.path).Length-ne$f.bytes-or(Sha $f.path)-cne$f.sha256){throw "Identity differs: $($f.path)"}
 $checked+=@{path=$f.path;bytes=$f.bytes;sha256=$f.sha256}
}
$game=Split-Path $s.game.path;$actual=@(Get-ChildItem -LiteralPath $game -File -Force|Where-Object Extension -in '.dll','.asi'|ForEach-Object FullName|Sort-Object)
$diff=@(Compare-Object (@($s.unchangedRootBinaryInventory.path)|Sort-Object) $actual);if($diff.Count){throw 'Root binary inventory differs'}
$required=(@($s.gameInstall.source.bytes)|Measure-Object -Sum).Sum+1073741824
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($s.game.path));if($drive.AvailableFreeSpace-lt$required){throw 'Insufficient installation and capture reserve'}
NoLinks $OutputPath;if(Test-Path -LiteralPath $OutputPath){throw 'Fresh preflight output required'}
$r=@{schema='NativeSuppression01Candidate11FreshLivePreflight';candidate='candidate-11';scopeSha256=$ScopeSha256;sourceCommit=$head;passed=$true;sourceClean=$true;utc=[DateTime]::UtcNow.ToString('o');processes=@();inventoryDiff=@();verifiedAbsent=$absent;checkedIdentities=$checked;gameDriveFreeBytes=$drive.AvailableFreeSpace;minimumFreeBytes=$required;gameLaunched=$false;installed=$false}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath),($r|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{passed=$true;identities=$checked.Count;absent=$absent.Count;receipt=[IO.Path]::GetFullPath($OutputPath);sha256=(Sha $OutputPath)}|ConvertTo-Json
