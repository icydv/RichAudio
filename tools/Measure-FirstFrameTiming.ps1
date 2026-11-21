param([string]$Output='.local/first-frame-baseline')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
Set-Location $repo
if([IO.Path]::IsPathRooted($Output) -or $Output -notmatch '^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Output must be a fresh direct child of ignored .local'}
if((Test-Path .local) -and ((Get-Item .local).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse output forbidden'}
if(Test-Path -LiteralPath $Output){throw 'Fresh output required'}
[IO.Directory]::CreateDirectory((Join-Path $repo $Output))|Out-Null
$out=Join-Path $repo $Output
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $out 'Timing.exe'
$sources=@(Get-ChildItem src/acoustics/host/Transport -Filter '*.cs'|ForEach-Object FullName)+(Join-Path $repo 'tests/host/FirstFrameTiming.cs')
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'Build failed'}
foreach($s in @('cold','warm')){foreach($r in @('cold','warm')){foreach($i in 1..3){
 $name="$s-$r-$i";$pipe='RichAudio.Timing.'+[guid]::NewGuid().ToString('N');$receiverFile=Join-Path $out "$name-receiver.json";$senderFile=Join-Path $out "$name-sender.json"
 $receiver=Start-Process -FilePath $exe -ArgumentList @('receive',$pipe,$r,('"'+$receiverFile+'"')) -PassThru -WindowStyle Hidden
 try{
  $wait=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path ($receiverFile+'.ready')) -and $wait.ElapsedMilliseconds -lt 3000){Start-Sleep -Milliseconds 10}
  if(!(Test-Path ($receiverFile+'.ready'))){throw 'Receiver readiness deadline'}
  $sender=Start-Process -FilePath $exe -ArgumentList @('send',$pipe,$s,('"'+$senderFile+'"')) -PassThru -WindowStyle Hidden
  try{if(!$sender.WaitForExit(5000)){throw 'Sender lifetime'};if(!$receiver.WaitForExit(7000)){throw 'Receiver lifetime'};if($sender.ExitCode -ne 0 -or $receiver.ExitCode -ne 0){throw 'Child failure'}; $rx=Get-Content $receiverFile -Raw|ConvertFrom-Json; $tx=Get-Content $senderFile -Raw|ConvertFrom-Json; if($rx.connections -ne 1 -or $tx.attempts -ne 1 -or $rx.diagnostic.Outcome -ne 'deliberate-stop' -or $tx.diagnostic.Outcome -ne 'deliberate-stop'){throw 'Fresh-process contract failed; result retained'}}finally{if(!$sender.HasExited){$sender.Kill()}}
 }finally{if(!$receiver.HasExited){$receiver.Kill()}}
}}
}
Get-ChildItem $out -Filter '*receiver.json'|ForEach-Object {Get-Content $_.FullName}
