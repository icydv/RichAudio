# Disposable worker fixtures only. Never loads GTA/RPH or opens audio.
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$private=Join-Path $repo '.local\startup-supervisor-tests'
$root=Join-Path $private ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$binary=Join-Path $root 'Supervisor.dll'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /warnaserror+ /r:System.Runtime.Serialization.dll ('/out:'+$binary) (Join-Path $repo 'src\acoustics\integration\WorldWarmupSupervisor.cs')
if($LASTEXITCODE){throw 'Supervisor fixture compilation failed'}
[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))|Out-Null
$game=Join-Path $root 'game';$cw=Join-Path $root 'parser';$tools=Join-Path $root 'tools'
foreach($folder in @($game,$cw,$tools)){[IO.Directory]::CreateDirectory($folder)|Out-Null}
$exe=Join-Path $game 'GTA5_Enhanced.exe';$core=Join-Path $cw 'CodeWalker.Core.dll';$script=Join-Path $tools 'Prepare-InstalledAudioWorld.ps1'
[IO.File]::WriteAllText($exe,'inert game-identity fixture, never executed');[IO.File]::WriteAllText($core,'inert parser-identity fixture, never loaded')
$hostPath=(Get-Process -Id $PID).Path
$configuration=Join-Path $root 'RichAudio.WorldWarmup.json'
$workers=New-Object Collections.Generic.List[object]
function Assert($condition,[string]$message){if(!$condition){throw $message}}
function Await($worker,[string[]]$states,[int]$seconds=15){$clock=[Diagnostics.Stopwatch]::StartNew();while($worker.State -notin $states){if($clock.Elapsed.TotalSeconds -gt $seconds){throw ('Unexpected worker state: '+$worker.State)};Start-Sleep -Milliseconds 50}}
function Configure([string]$name,[string]$body){
 $out=Join-Path $root ('.local\'+$name);[IO.Directory]::CreateDirectory($out)|Out-Null
 [IO.File]::WriteAllText($script,'param($GameRoot,$CodeWalkerRoot,$OutputRoot,$MaximumSeconds,$MaximumStageSeconds,$MaximumMemoryMiB,$MaximumGeometryResources,[switch]$ImportQualifiedGeometry)'+[Environment]::NewLine+$body)
 $c=[ordered]@{Schema=1;Enabled=$true;WorkspaceRoot=$root;GameRoot=$game;GameExecutableSHA256=[RichAudio.Preparation.WorldWarmupSupervisor]::Hash($exe);CodeWalkerRoot=$cw;CodeWalkerCoreSHA256=[RichAudio.Preparation.WorldWarmupSupervisor]::Hash($core);PowerShellPath=$hostPath;PowerShellSHA256=[RichAudio.Preparation.WorldWarmupSupervisor]::Hash($hostPath);OutputRoot=$out;Sources=@(@{RelativePath='tools/Prepare-InstalledAudioWorld.ps1';SHA256=[RichAudio.Preparation.WorldWarmupSupervisor]::Hash($script)});MaximumSeconds=20;MaximumStageSeconds=5;MaximumMemoryMiB=256;MaximumGeometryResources=1;ImportQualifiedGeometry=$false}
 [IO.File]::WriteAllText($configuration,($c|ConvertTo-Json -Depth 6));return $c
}
function StartWorker{$w=[RichAudio.Preparation.WorldWarmupSupervisor]::new();$workers.Add($w);$w.Start($configuration,$exe);return $w}
function WaitFile([string]$file){$clock=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path -LiteralPath $file)){if($clock.Elapsed.TotalSeconds -gt 15){throw 'Fixture startup timed out'};Start-Sleep -Milliseconds 50}}
function ChildGone([string]$pidFile){$ownedId=[int][IO.File]::ReadAllText($pidFile);$clock=[Diagnostics.Stopwatch]::StartNew();while(Get-Process -Id $ownedId -ErrorAction SilentlyContinue){if($clock.Elapsed.TotalSeconds -gt 4){throw 'Owned fixture descendant survived job close'};Start-Sleep -Milliseconds 50}}
try{
 Assert ([RichAudio.Preparation.WorldWarmupSupervisor]::ConfigurationForGameExecutable($exe) -eq (Join-Path $game 'Plugins\RichAudio.WorldWarmup.json')) 'cached RPH assembly must not change installed sidecar location'
 $c=Configure 'complete' '[IO.File]::WriteAllText((Join-Path $OutputRoot ''done.txt''),''fixture complete'')'
 $w=StartWorker;Await $w @('preparation-finished-read-summary');Assert (Test-Path -LiteralPath (Join-Path $c.OutputRoot 'done.txt')) 'worker did not execute'
 [IO.File]::AppendAllText($script,'# changed')
 $w=StartWorker;Await $w @('blocked-InvalidDataException');Assert (!(Test-Path -LiteralPath (Join-Path $c.OutputRoot 'cancel.request'))) 'input rejection mutated cancellation'
 $c=Configure 'manual-cancel' 'throw ''must not execute'''
 [IO.File]::WriteAllText((Join-Path $c.OutputRoot 'cancel.request'),'manual-stop')
 $w=StartWorker;Await $w @('cancel-request-pending')
 $c=Configure 'plugin-resume' '[IO.File]::WriteAllText((Join-Path $OutputRoot ''done.txt''),''resumed'')'
 [IO.File]::WriteAllText((Join-Path $c.OutputRoot 'cancel.request'),('plugin-startup:'+[Guid]::NewGuid().ToString('N')))
 $w=StartWorker;Await $w @('preparation-finished-read-summary');Assert (@(Get-ChildItem -LiteralPath $c.OutputRoot -Filter 'cancel.request.acknowledged-*').Count -eq 1) 'own unload marker not retained/acknowledged'
 $c=Configure 'invalid-output' 'throw ''must not execute''';$c.OutputRoot=$game
 [IO.File]::WriteAllText($configuration,($c|ConvertTo-Json -Depth 6));$w=StartWorker;Await $w @('blocked-InvalidDataException')
 $childCommand=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 60'))
 $spawn='$child=Start-Process -FilePath '+("'"+$hostPath.Replace("'","''")+"'")+' -ArgumentList @(''-NoProfile'',''-NonInteractive'',''-EncodedCommand'','''+$childCommand+''') -WindowStyle Hidden -PassThru;[IO.File]::WriteAllText((Join-Path $OutputRoot ''child.pid''),[string]$child.Id);'
 $c=Configure 'orphan' $spawn;$w=StartWorker;Await $w @('preparation-finished-read-summary');ChildGone (Join-Path $c.OutputRoot 'child.pid')
 $c=Configure 'cancel' ($spawn+'Start-Sleep -Seconds 60');$w=StartWorker;WaitFile (Join-Path $c.OutputRoot 'child.pid');$w.Stop();Await $w @('cancelled');ChildGone (Join-Path $c.OutputRoot 'child.pid')
 $c=Configure 'deadline' ($spawn+'Start-Sleep -Seconds 60');$w=StartWorker;Await $w @('deadline') 30;ChildGone (Join-Path $c.OutputRoot 'child.pid')
 'Startup supervisor fixtures passed: exact bindings, private output, own-marker resume, manual cancellation, normal completion, orphan cleanup, cancellation and monotonic deadline. No game/RPH/audio ran.'
}finally{
 foreach($w in $workers){$w.Stop()}
 Start-Sleep -Milliseconds 2200
 $resolved=[IO.Path]::GetFullPath($root);if(!$resolved.StartsWith([IO.Path]::GetFullPath($private)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture cleanup escaped private root'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
