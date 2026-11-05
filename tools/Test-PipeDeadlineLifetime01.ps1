# Original, device-free regression only. No game, SDK, endpoint or archive access.
[CmdletBinding()]param([string]$OutputRoot='')
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/street01-completion/pipe-lifetime01'))
if(!$OutputRoot){$OutputRoot=Join-Path $allowed ([Guid]::NewGuid().ToString('N'))}
$out=[IO.Path]::GetFullPath($OutputRoot)
if(!$out.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private original-fixture output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/host/Transport','src/acoustics/geometry')|ForEach-Object{Get-ChildItem (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sources+=Join-Path $repo 'tests/host/TestPipeDeadlineLifetime01.cs'
$paths=@($sources)+@($PSCommandPath)
function Pins { @($paths|ForEach-Object{@{path=$_.Substring($repo.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}) }
$before=Pins
$helper=Join-Path $repo 'src/acoustics/host/Transport/PipeDeadline.cs'
$original=[IO.File]::ReadAllText($helper);$copy=$original
$patches=@(
 @{before='internal static class PipeDeadline {';after='internal static class PipeDeadline { internal static Action<bool,bool> StartedObserved01; internal static Action<bool,bool,int,Exception,bool> FinishedObserved01;'},
 @{before='lock(gate){complete=true;if(abandoned)done.Dispose();else done.Set();}';after='lock(gate){complete=true;if(abandoned)done.Dispose();else done.Set();} if(FinishedObserved01!=null)FinishedObserved01(connection,write,count,error,abandoned);'},
 @{before='bool signalled=false;';after='if(StartedObserved01!=null)StartedObserved01(connection,write); bool signalled=false;'}
)
foreach($patch in $patches){if([regex]::Matches($copy,[regex]::Escape($patch.before)).Count-ne1){throw 'Exact unique private observation site required'};$copy=$copy.Replace($patch.before,$patch.after)}
$private=Join-Path $out 'PipeDeadline.Observed01.cs';[IO.File]::WriteAllText($private,$copy,[Text.UTF8Encoding]::new($false))
$sources=@($sources|Where-Object{$_-ne$helper})+@($private)
$geometry=Join-Path $repo 'src/acoustics/geometry/GeometryPipe.cs';$geometryCopy=[IO.File]::ReadAllText($geometry)
$geometryPatches=@(
 @{before='private readonly string name;private readonly Action<GeometryPacket,uint> consumer;';after='internal static Action BeforeActiveObserved01,StoppedObserved01; private readonly string name;private readonly Action<GeometryPacket,uint> consumer;'},
 @{before='StatePipeServer.CurrentUserSecurity())){active=p;';after='StatePipeServer.CurrentUserSecurity())){if(BeforeActiveObserved01!=null)BeforeActiveObserved01();active=p;'},
 @{before='public void Dispose(){stopped=true;';after='public void Dispose(){stopped=true;if(StoppedObserved01!=null)StoppedObserved01();'}
)
foreach($patch in $geometryPatches){if([regex]::Matches($geometryCopy,[regex]::Escape($patch.before)).Count-ne1){throw 'Exact unique geometry observation site required'};$geometryCopy=$geometryCopy.Replace($patch.before,$patch.after)}
$privateGeometry=Join-Path $out 'GeometryPipe.Observed01.cs';[IO.File]::WriteAllText($privateGeometry,$geometryCopy,[Text.UTF8Encoding]::new($false))
$sources=@($sources|Where-Object{$_-ne$geometry})+@($privateGeometry)
$exe=Join-Path $out 'Original.PipeLifetime01.exe';$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /langversion:5 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:TestPipeDeadlineLifetime01 ('/out:'+$exe) @sources *> (Join-Path $out 'build.log')
if($LASTEXITCODE-ne0){throw ('Original pipe-lifetime fixture compilation failed: '+(Join-Path $out 'build.log'))}
$results=@();$scenarios=@('geometry-timeout','read-timeout','write-timeout','connect-timeout','geometry-server-stop','state-server-stop','geometry-server-stop-before-active','peer-close','partial-peer-close','success-framing','success-connection','late-stream-write','inline-stream-write')
foreach($scenario in $scenarios){
 $stdout=Join-Path $out ($scenario+'.stdout.log');$stderr=Join-Path $out ($scenario+'.stderr.log')
 $p=Start-Process -FilePath $exe -ArgumentList @($scenario) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
 $joined=$p.WaitForExit(10000);$forced=$false;if(!$joined){$forced=$true;$p.Kill();$joined=$p.WaitForExit(3000)}
 $p.Refresh();$exitCode=if($joined){$p.ExitCode}else{-1};$p.Dispose()
 $line=[IO.File]::ReadAllText($stdout);$errorText=[IO.File]::ReadAllText($stderr);$parsed=$null;try{$parsed=$line|ConvertFrom-Json}catch{}
 $entry=@{scenario=$scenario;joined=$joined;forcedKill=$forced;exitCode=$exitCode;result=$parsed;stderr=$errorText};$results+=@($entry)
 $entry|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $out ($scenario+'.json')) -Encoding UTF8
 if($exitCode-ne0-or!$parsed-or!$parsed.passed-or!$joined-or$forced){Write-Output $line;Write-Output $errorText}
}
$after=Pins;$stable=($before|ConvertTo-Json -Depth 3 -Compress)-ceq($after|ConvertTo-Json -Depth 3 -Compress)
$passed=$stable-and@($results|Where-Object{!$_.joined-or$_.forcedKill-or$_.exitCode-ne0-or!$_.result.passed-or$_.stderr}).Count-eq0
@{schema=1;kind='original-production-pipe-lifetime01';passed=$passed;sourcePinsUnchanged=$stable;sourcePinsBefore=$before;sourcePinsAfter=$after;privateObservationSites=6;privateHelperSHA256=(Get-FileHash -LiteralPath $private -Algorithm SHA256).Hash.ToLowerInvariant();privateGeometrySHA256=(Get-FileHash -LiteralPath $privateGeometry -Algorithm SHA256).Hash.ToLowerInvariant();results=$results;gameFilesRead=$false;vendorLoaded=$false;endpointOpened=$false;unchangedProductionReadAndConnectDeadlines=$true}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding UTF8
if(!$passed){throw ('Original pipe-lifetime controls failed; retained '+(Join-Path $out 'validation.json'))}
Write-Output ('PASS '+$scenarios.Count+' original pipe lifetime scenarios; '+(Join-Path $out 'validation.json'))
