# Build the production supervisor without fixture symbols and exercise its real
# candidate-only admission method. No monitor, UI or game process is started.
param([string]$Manifest)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$Manifest){$Manifest=Join-Path $repo '.local/gate-a-shvdne-private-03i/execution-manifest.json'}
$Manifest=(Resolve-Path -LiteralPath $Manifest).Path
$output=Join-Path $repo ('.local/native-suppression-01/manifest-reader-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if((Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant()-ne'46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Compiler identity differs'}
$sources=@(
 'tools/native-control/private-profile03d/SupervisorPolicy03D.cs',
 'tools/native-control/private-profile/SupervisorProtocol.cs',
 'tools/native-control/private-profile03d/ExactIdentity.cs',
 'tools/native-control/private-profile03i/SupervisorMonitor03I.cs',
 'tools/native-control/private-profile03i/FailureNotice03I.cs',
 'tools/native-control/private-profile03i/NoticeDelivery.cs'
) | ForEach-Object {Join-Path $repo $_}
$binary=Join-Path $output 'RichAudio.Private03D.Supervisor.exe'
$common=@('/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:exe','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:System.Drawing.dll')
& $compiler @common '/main:RichAudio.GateA.Private01.Supervision.SupervisorMonitor' ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Production supervisor compilation failed'}
$test=Join-Path $output 'TestPrivateCandidateManifest01.exe'
$testSource=Join-Path $repo 'tests/host/TestPrivateCandidateManifest01.cs'
& $compiler @common ('/r:'+$binary) ('/out:'+$test) $testSource
if($LASTEXITCODE-ne0){throw 'Manifest regression compilation failed'}
$result=& $test $Manifest (Join-Path $output 'cases')
if($LASTEXITCODE-ne0){throw 'Candidate manifest regression failed'}
$parsed=$result|ConvertFrom-Json
if(!$parsed.passed-or!$parsed.productionCandidateValidate-or$parsed.fixtureMode){throw 'Candidate admission result missing'}
[IO.File]::WriteAllText((Join-Path $output 'result.json'),($result -join "`n"),[Text.UTF8Encoding]::new($false))
$pins=@($sources)+@($testSource,$PSCommandPath,$compiler,$binary,$test)|ForEach-Object {@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
[IO.File]::WriteAllText((Join-Path $output 'build.json'),(@{sourcesAndArtifacts=$pins;fixtureSymbols=$false;gameLaunched=$false;liveAuthorized=$false}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output ('PASS '+$parsed.checks+' candidate-manifest checks; '+(Join-Path $output 'result.json'))
