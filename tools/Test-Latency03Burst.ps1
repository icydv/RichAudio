#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo ('.local/latency-03/burst-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$test=Join-Path $repo 'tests/host/TestLatency03Burst.cs';$bus=Join-Path $repo 'src/acoustics/host/Windows/PreparedTransientBus.cs';$ring=Join-Path $repo 'src/acoustics/host/Windows/PcmRing.cs'
$old=@();foreach($name in @('PcmRing','PreparedTransientBus')){$p=Join-Path $out ($name+'.original02.cs');$text=@(& git -C $repo show ('f409aabcfd3c3b3e8ee5506e24585c3a5d3bd527:src/acoustics/host/Windows/'+$name+'.cs'));if($LASTEXITCODE-ne0){throw 'Exact original02 snapshot unavailable.'};[IO.File]::WriteAllText($p,($text-join"`n")+"`n");$old+=$p}
$oldExe=Join-Path $out 'Burst.Original02.exe';& $compiler /nologo /unsafe+ /optimize+ /warnaserror+ /r:System.Web.Extensions.dll /define:ORIGINAL02 ('/out:'+$oldExe) @old $test;if($LASTEXITCODE-ne0){throw 'Original bus compilation failed.'}
$current=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Windows') -Filter '*.cs' -File|ForEach-Object FullName)
$current+=@('src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs' -File|ForEach-Object FullName}
$current+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)};$current+=$test
$pins=@($current|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($repo,$_).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$currentExe=Join-Path $out 'Burst.Current.exe';& $compiler /nologo /unsafe+ /optimize+ /warnaserror+ /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestLatency03Burst ('/out:'+$currentExe) @current;if($LASTEXITCODE-ne0){throw 'Current bus compilation failed.'}
$rawOld=@(& $oldExe);if($LASTEXITCODE-ne0){throw 'Original burst test failed.'};$rawCurrent=@(& $currentExe);if($LASTEXITCODE-ne0){throw 'Current burst test failed.'}
$a=$rawOld|ConvertFrom-Json;$b=$rawCurrent|ConvertFrom-Json;for($i=0;$i-lt2;$i++){if($a.results[$i].pcmSha256-cne$b.results[$i].pcmSha256){throw 'Default original bus PCM differs.'}}
if($b.results[0].pcmSha256-cne$b.results[2].pcmSha256){throw 'Protected policy changes nominal output.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed during burst comparison.'}}
[ordered]@{schema=1;passed=$true;originalCommit='f409aabcfd3c3b3e8ee5506e24585c3a5d3bd527';sourcePins=$pins;original=$a;current=$b;endpointOpened=$false;gameLaunched=$false}|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS original/default parity and bounded protected-tail burst comparison; '+(Join-Path $out 'validation.json'))
