param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private fixture directory required'}
if(Get-Process GTA5_Enhanced,PlayGTAV,obs64 -ErrorAction SilentlyContinue){throw 'Game or OBS active; no disposable writer test'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$obs=Join-Path $env:APPDATA 'obs-studio';$profile=Join-Path $obs 'basic\profiles\NativeSuppression09Offline';$scene=Join-Path $obs 'basic\scenes\NativeSuppression09Offline.json'
foreach($p in @($profile,$scene,($scene+'.bak'))){if(Test-Path -LiteralPath $p){throw 'Offline profile already exists'}}
$originals=@();foreach($name in 'user.ini','global.ini'){$p=Join-Path $obs $name;$i=Get-Item -LiteralPath $p;$backup=Join-Path $out ('original-'+$name);[IO.File]::Copy($p,$backup,$false);$originals+=@{path=$p;backup=$backup;sha256=(Get-FileHash -LiteralPath $p).Hash;creation=$i.CreationTimeUtc;write=$i.LastWriteTimeUtc;attributes=$i.Attributes}}
$protected=@('C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\settings.xml','C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\Profiles\99869854\cfg.dat','C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced\Profiles\99869854\pc_settings.bin')|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}}
$code=1
try{
 & 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\toolchains\private03f-01\python\python.exe' -I -S -B (Join-Path $PSScriptRoot 'Test-ObsWriter09.py') $out
 $code=$LASTEXITCODE
}finally{
 if(Get-Process obs64 -ErrorAction SilentlyContinue){throw 'OBS not closed; preserve originals for checked recovery, never overwrite active settings'}
 foreach($f in $originals){if((Get-FileHash -LiteralPath $f.backup).Hash-cne$f.sha256){throw 'Original OBS backup changed'};[IO.File]::Copy($f.path,(Join-Path $out ('after-'+[IO.Path]::GetFileName($f.path))),$false);[IO.File]::Copy($f.backup,$f.path,$true);$i=Get-Item -LiteralPath $f.path;$i.CreationTimeUtc=$f.creation;$i.LastWriteTimeUtc=$f.write;$i.Attributes=$f.attributes;if((Get-FileHash -LiteralPath $f.path).Hash-cne$f.sha256-or$i.CreationTimeUtc.Ticks-ne$f.creation.Ticks-or$i.LastWriteTimeUtc.Ticks-ne$f.write.Ticks-or$i.Attributes-ne$f.attributes){throw 'OBS restoration differs'}}
 foreach($p in @($profile,$scene,($scene+'.bak'))){if(Test-Path -LiteralPath $p){$full=[IO.Path]::GetFullPath($p);$dest=Join-Path $out ('retained-'+[IO.Path]::GetFileName($p));if(!$full.StartsWith($obs+'\',[StringComparison]::OrdinalIgnoreCase)-or![IO.Path]::GetFullPath($dest).StartsWith($out+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $dest)){throw 'Owned fixture move path invalid'};Move-Item -LiteralPath $full -Destination $dest}}
 foreach($f in $protected){if((Get-FileHash -LiteralPath $f.path).Hash-cne$f.sha256){throw 'Actual game setting changed'}}
 @{passed=$true;obsOriginalBytesAndMetadataRestored=$true;gameSettingsUntouched=$true;temporaryProfileAbsent=(!(Test-Path -LiteralPath $profile));temporarySceneAbsent=(!(Test-Path -LiteralPath $scene))}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'restoration.json') -Encoding utf8
}
if($code){throw 'Actual OBS writer fixture refused; retained failure and exact restoration'}
