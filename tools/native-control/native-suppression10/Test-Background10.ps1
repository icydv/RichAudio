param([Parameter(Mandatory)][string]$OutputDirectory,[string[]]$Cases=@('background','wrong-capture','frozen','blank','missing-audio','lost-identity','stale-state','recording-stopped','startup-expiry'))
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private integration directory required'}
if(Get-Process GTA5_Enhanced,PlayGTAV,obs64 -ErrorAction SilentlyContinue){throw 'Game or recorder active'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$candidate=Join-Path $out 'Candidate.cs';'namespace RichAudio.NativeSuppression01 {internal static class Candidate {internal const string SourceCommit="AUTHORED-GTA-OBSERVATIONS-ONLY";}}'|Set-Content -LiteralPath $candidate
$sources=@('tools/native-control/native-suppression08/IdleExperiment.cs','tools/native-control/native-suppression08/AutomaticRun.cs','tools/native-control/native-suppression10/LocalBridge.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestAutomaticNative08.cs','tests/host/BackgroundEntryHost10.cs')|ForEach-Object {Join-Path $repo $_}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll';$exe=Join-Path $out 'BackgroundEntryHost10.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:winexe /main:BackgroundEntryHost10 /langversion:5 /unsafe+ /warnaserror+ /nowarn:0649 /define:AUTOMATION_FIXTURES /r:System.Core.dll /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll ('/r:'+$api) ('/out:'+$exe) @sources $candidate
if($LASTEXITCODE){throw 'Owned window/bridge compilation failed'}
Copy-Item -LiteralPath $api -Destination $out
$obs=Join-Path $env:APPDATA 'obs-studio';$originals=@()
foreach($name in 'user.ini','global.ini'){$p=Join-Path $obs $name;$i=Get-Item -LiteralPath $p;$backup=Join-Path $out ('original-'+$name);[IO.File]::Copy($p,$backup,$false);$originals+=@{path=$p;backup=$backup;sha256=(Get-FileHash -LiteralPath $p).Hash;creation=$i.CreationTimeUtc;write=$i.LastWriteTimeUtc;attributes=$i.Attributes}}
$protected=@('C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\settings.xml','C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\Profiles\99869854\cfg.dat','C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\Profiles\99869854\pc_settings.bin')|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}}
$code=1
try{
 & 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\toolchains\private03f-01\python\python.exe' -I -S -B (Join-Path $PSScriptRoot 'Test-Background10.py') $out $exe @Cases
 $code=$LASTEXITCODE
}finally{
 if(Get-Process obs64,BackgroundEntryHost10 -ErrorAction SilentlyContinue){throw 'Owned process unresolved; retain original settings for checked recovery'}
 foreach($f in $originals){if((Get-FileHash -LiteralPath $f.backup).Hash-cne$f.sha256){throw 'Original OBS backup changed'};[IO.File]::Copy($f.path,(Join-Path $out ('after-'+[IO.Path]::GetFileName($f.path))),$false);[IO.File]::Copy($f.backup,$f.path,$true);$i=Get-Item -LiteralPath $f.path;$i.CreationTimeUtc=$f.creation;$i.LastWriteTimeUtc=$f.write;$i.Attributes=$f.attributes;if((Get-FileHash -LiteralPath $f.path).Hash-cne$f.sha256-or$i.CreationTimeUtc.Ticks-ne$f.creation.Ticks-or$i.LastWriteTimeUtc.Ticks-ne$f.write.Ticks-or$i.Attributes-ne$f.attributes){throw 'OBS restoration differs'}}
 foreach($f in $protected){if((Get-FileHash -LiteralPath $f.path).Hash-cne$f.sha256){throw 'Actual game configuration changed'}}
 @{passed=$true;obsOriginalBytesAndMetadataRestored=$true;gameSettingsUntouched=$true;ownedProcessesClosed=$true;fixtureProfileAbsent=(!(Test-Path -LiteralPath (Join-Path $obs 'basic/profiles/NativeSuppression10Offline')));fixtureSceneAbsent=(!(Test-Path -LiteralPath (Join-Path $obs 'basic/scenes/NativeSuppression10Offline.json')))}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'restoration.json') -Encoding utf8
}
if($code){throw 'Complete background entry test failed; retain all evidence'}
