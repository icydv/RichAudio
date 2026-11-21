# Device-free regression only. Instrument a fresh private copy, never production.
[CmdletBinding()]param([string]$OutputRoot='')
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/host-connection-boundary-03'))
if(!$OutputRoot){$OutputRoot=Join-Path $allowed ([Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private connection-boundary fixture directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
$paths=@('src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/PipeDeadline.cs','tests/host/TestHostConnectionBoundary03.cs','tools/Test-HostConnectionBoundary03.ps1')
$pins=@($paths|ForEach-Object{@{file=$_;sha256=Hash (Join-Path $repo $_)}})
$source=[IO.File]::ReadAllText((Join-Path $repo $paths[0]));$patches=@(
 @{before='public uint PeerProcessId{get;private set;}';after='internal Action ConnectionBoundaryBeforeWait03,ConnectionBoundaryAfterPeer03; public uint PeerProcessId{get;private set;}'},
 @{before='active=pipe;if(stopping)break;var connect=pipe.BeginWaitForConnection';after='active=pipe;if(stopping)break;if(ConnectionBoundaryBeforeWait03!=null)ConnectionBoundaryBeforeWait03();var connect=pipe.BeginWaitForConnection'},
 @{before='PeerProcessId=peer;';after='PeerProcessId=peer;if(ConnectionBoundaryAfterPeer03!=null)ConnectionBoundaryAfterPeer03();'}
)
foreach($patch in $patches){if([regex]::Matches($source,[regex]::Escape($patch.before)).Count-ne1){throw 'Exact unique private instrumentation site required'};$source=$source.Replace($patch.before,$patch.after)}
[IO.Directory]::CreateDirectory($output)|Out-Null
$copy=Join-Path $output 'StatePipe.instrumented.cs';[IO.File]::WriteAllText($copy,$source,(New-Object Text.UTF8Encoding($false)))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';if(!(Test-Path -LiteralPath $compiler)){throw 'Existing .NET Framework compiler required'}
$compilerHash=Hash $compiler;$exe=Join-Path $output 'RichAudio.Host.ConnectionBoundary03.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll ('/out:'+$exe) $copy (Join-Path $repo $paths[1]) (Join-Path $repo $paths[2]) (Join-Path $repo $paths[3]) *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Connection boundary fixture build failed; diagnostics retained'}
$lines=@(& $exe 2>&1);$exitCode=$LASTEXITCODE
$lines|Set-Content -LiteralPath (Join-Path $output 'fixture-output.log') -Encoding utf8
foreach($line in $lines){Write-Output $line}
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256){throw 'Original source changed during fixture'}}
if((Hash $compiler)-cne$compilerHash){throw 'Compiler changed during fixture'}
$result=if($lines.Count-eq1){try{$lines[0]|ConvertFrom-Json}catch{$null}}else{$null}
$receipt=[ordered]@{schema=1;kind='device-free-host-connection-boundary03-receipt';passed=($exitCode-eq0-and$result-and$result.passed);exitCode=$exitCode;sourcePins=$pins;compilerSha256=$compilerHash;instrumentedSha256=Hash $copy;executableSha256=Hash $exe;stdoutSha256=Hash (Join-Path $output 'fixture-output.log');privateControlSites=3;endpointOpened=$false;gameFilesRead=$false;productionSourcesModified=$false;result=$result}
$receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
if(!$receipt.passed){throw 'Connection boundary regression failed; original exit and bounded diagnostics retained'}
Write-Output 'PASS deterministic pre-accept failure and qualified clean EOF; one attempt, original freshness gates, both lifetimes joined; no endpoint.'
