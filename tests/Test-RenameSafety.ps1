# Authored text files in development only. Never renames or writes a game executable.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$probe=Join-Path $repo ('.local\phase2.2\rename-probe-'+[guid]::NewGuid().ToString('N'))
if(!$probe.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Probe escapes workspace.'}
for($d=[IO.DirectoryInfo]::new($probe);$null -ne $d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point test output.'}}
[IO.Directory]::CreateDirectory($probe) | Out-Null
$source=Join-Path $probe 'original.txt';$target=Join-Path $probe '_original.txt'
[IO.File]::WriteAllText($source,'Authored rename-safety fixture; not GTA data.')
[IO.File]::WriteAllText($target,'Authored destination conflict.')
$hash=(Get-FileHash -LiteralPath $source).Hash;$otherHash=(Get-FileHash -LiteralPath $target).Hash
$meta=Get-Item -LiteralPath $source
$originalCreation=$meta.CreationTimeUtc;$originalWrite=$meta.LastWriteTimeUtc
$checks=[Collections.Generic.List[object]]::new()
function Check([bool]$Ok,[string]$Name){$checks.Add([pscustomobject]@{Name=$Name;Passed=$Ok});if(!$Ok){throw $Name}}
$refused=$false;try{[IO.File]::Move($source,$target)}catch [IO.IOException]{$refused=$true}
Check $refused 'Two-argument move refuses an occupied rename target'
Check ((Get-FileHash -LiteralPath $source).Hash -eq $hash) 'Refused rename preserves source bytes'
Check ((Get-FileHash -LiteralPath $target).Hash -eq $otherHash) 'Refused rename preserves conflicting destination bytes'
[IO.File]::Move($target,(Join-Path $probe 'initial-conflict-preserved.txt'))
[IO.File]::Move($source,$target)
Check (!(Test-Path -LiteralPath $source)) 'Same-volume rename removes only the old name'
Check ((Get-FileHash -LiteralPath $target).Hash -eq $hash) 'Renamed file has identical content hash'
[IO.File]::WriteAllText($source,'Authored new file simulating an external restore collision.')
$collisionHash=(Get-FileHash -LiteralPath $source).Hash
$refused=$false;try{[IO.File]::Move($target,$source)}catch [IO.IOException]{$refused=$true}
Check $refused 'Restoration refuses a newly occupied original path'
Check (((Get-FileHash -LiteralPath $source).Hash -eq $collisionHash) -and ((Get-FileHash -LiteralPath $target).Hash -eq $hash)) 'Refused restoration preserves both files'
[IO.File]::Move($source,(Join-Path $probe 'restore-conflict-preserved.txt'))
[IO.File]::Move($target,$source)
Check ((Get-FileHash -LiteralPath $source).Hash -eq $hash) 'Conflict-free restoration is byte-for-byte identical'
$restored=Get-Item -LiteralPath $source
Check ($restored.CreationTimeUtc -eq $originalCreation) 'Same-volume round trip preserves creation timestamp in this probe'
Check ($restored.LastWriteTimeUtc -eq $originalWrite) 'Same-volume round trip preserves last-write timestamp in this probe'
[ordered]@{ExecutedUtc=[DateTime]::UtcNow.ToString('o');Passed=$true;Assertions=$checks.Count;Scope='Authored development text files only; no actual game-file rename. Verifies Windows no-overwrite move and restoration behavior.';ProbeDirectory=$probe;Tests=@($checks)} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $repo 'evidence\phase2.2\rename-safety-tests.json') -Encoding utf8
Write-Output ('PASS: '+$checks.Count+' rename-safety checks; actual executables untouched.')
