param([string]$Output=('.local/handoff-'+[guid]::NewGuid().ToString('N')))
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
Set-Location $repo
if($Output -notmatch '^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Private relative output required'}
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output))
for($d=[IO.DirectoryInfo]::new($out);$d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output'}}
if(Test-Path $out){throw 'Fresh output required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@(Get-ChildItem src/acoustics/host/Windows,src/acoustics/host/Transport -Filter '*.cs'|ForEach-Object FullName)+(Join-Path $repo 'tests/host/HostHandoff.cs')
$exe=Join-Path $out 'Handoff.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 /define:STATE_TRANSPORT /main:RichAudio.Beacon.Windows.HostHandoff /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'Harness build'}
foreach($case in @('normal-1','normal-2','normal-3','exit','reject')){
 $mode=$case.Split('-')[0];$dir=Join-Path $out $case;[IO.Directory]::CreateDirectory($dir)|Out-Null;$pipe='RichAudio.Handoff.'+[guid]::NewGuid().ToString('N')
 $hostProcess=Start-Process $exe -ArgumentList @('host',('"'+$repo+'"'),$pipe,('"'+$dir+'"'),$mode) -WindowStyle Hidden -PassThru
 try{
  $wait=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path (Join-Path $dir 'ready')) -and $wait.ElapsedMilliseconds -lt 3000){Start-Sleep -Milliseconds 10};if(!(Test-Path (Join-Path $dir 'ready'))){throw 'Host readiness'}
  $sender=Start-Process $exe -ArgumentList @('sender',$pipe,('"'+(Join-Path $dir 'sender.json')+'"'),$mode) -WindowStyle Hidden -PassThru
  try{if(!$sender.WaitForExit(7000)){throw 'Sender deadline'};if(!$hostProcess.WaitForExit(11000)){throw 'Host deadline'};if($hostProcess.ExitCode -ne 0 -or $sender.ExitCode -ne 0){throw "Case failed: $case; preserve evidence"}}finally{if(!$sender.HasExited){$sender.Kill()}}
 }finally{if(!$hostProcess.HasExited){$hostProcess.Kill()}}
 $tx=Get-Content (Join-Path $dir 'sender.json') -Raw|ConvertFrom-Json
 $rx=Get-Content (Join-Path $dir 'result.json') -Raw|ConvertFrom-Json
 if($tx.attempts -ne 1 -or $rx.connections -ne 1 -or !$rx.producerExited -or !$rx.readerExited -or !$rx.writerExited -or !$rx.diagnosticExited){throw 'Strict lifecycle contract'}
 if($mode -eq 'normal' -and $tx.terminal.Outcome -ne 'deliberate-stop'){throw 'Sender Stop not acknowledged'}
 if($mode -ne 'normal' -and $tx.terminal.Outcome -ne 'failed'){throw 'Fault must terminate sender'}
 if($mode -eq 'reject' -and ($rx.terminal.FirstFrame.AgeClass -ne 'within-bounds' -or $rx.terminal.OffendingFrame.AgeClass -ne 'future-dated')){throw 'Mixed frame attribution'}
 $last=Get-Content (Join-Path $dir 'node.txt')|Where-Object { $_ -like '{"type":"final",*' }|Select-Object -Last 1
 if($mode -eq 'normal'){$node=$last|ConvertFrom-Json;if($node.statistics.listenerMessages -le 0 -or $node.statistics.listenerRejected -ne 0){throw 'Node handoff acceptance'}}
 $result=Get-Content (Join-Path $dir 'result.json') -Raw|ConvertFrom-Json
 [pscustomobject]@{Case=$case;Accepted=$result.accepted;Forwarded=$result.forwarded;Peak=$result.peak;Error=$result.error;MissedBudgets=$result.missedSinkBudgets}|ConvertTo-Json -Compress
}
