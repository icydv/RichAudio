# Source-only installer/preparation fixtures. All game and parser files below
# are inert authored identities; no vendor assembly or endpoint is opened.
#requires -Version 7.0
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
. (Join-Path $repo 'tools/playable/Setup.ps1') -FunctionsOnly
$root=Join-Path $repo ('.local/street01/installer-'+[Guid]::NewGuid().ToString('N'))
& node (Join-Path $repo 'tests/fixtures/StreetInstallation01.mjs') $root
if($LASTEXITCODE){throw 'Original installation package source closure failed'}
$fixture=Read-Json (Join-Path $root 'fixture.json');$m=Read-Json $fixture.manifest;$checks=0
function Check([bool]$ok,[string]$why){$script:checks++;if(!$ok){throw $why}}
function Reject([scriptblock]$action,[string]$why){$failed=$false;try{& $action|Out-Null}catch{$failed=$true};Check $failed $why}
$power=(Get-Process -Id $PID).Path
$c=New-StreetWorldWarmupConfiguration01 $m $fixture.install $fixture.game $fixture.parser $power
Check ($c.WorkspaceRoot-ceq$fixture.install-and$c.OutputRoot-ceq$fixture.cacheRoot) 'Startup and actual main worker must share the installed private cache'
Check ($c.Sources.Count-eq$m.worldPreparation.sourceFiles.Count-and$c.CodeWalkerDependencies.Count-eq3) 'Every preparation source and required external dependency is pinned'
Check ($c.NodeExecutable-ceq(Join-Path $fixture.install 'runtime/node.exe')) 'Preparation uses the bundled runtime without a developer PATH dependency'
$sidecar=Join-Path $root 'RichAudio.WorldWarmup.json';Write-Json $sidecar $c
$generatedSidecar=Join-Path $root 'generated-world-warmup.json';Copy-Item -LiteralPath $sidecar -Destination $generatedSidecar
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $root 'Supervisor.dll'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /warnaserror+ /r:System.Runtime.Serialization.dll ('/out:'+$binary) (Join-Path $repo 'src/acoustics/integration/WorldWarmupSupervisor.cs')
if($LASTEXITCODE){throw 'Actual startup supervisor compilation failed'}
[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))|Out-Null
$actual=[RichAudio.Preparation.WorldWarmupSupervisor]::ReadConfiguration($sidecar,$m.gameExecutable)
Check ($actual.MaximumGeometryResources-eq262144-and$actual.MaximumStageSeconds-eq1800-and$actual.MaximumBatches-eq4-and$actual.MaximumTotalSeconds-eq7200) 'Normal full queue sidecar reaches the actual supervisor'
$windowsSidecar=Join-Path $root 'windows-powershell5-generated.json'
& (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo 'tests/fixtures/StreetWindowsSetup01.ps1') -Repository $repo -Manifest $fixture.manifest -InstallRoot $fixture.install -GameRoot $fixture.game -ParserRoot $fixture.parser -PowerShell7 $power -Output $windowsSidecar
if($LASTEXITCODE){throw 'Ordinary Setup.cmd Windows PowerShell 5 helper failed'}
$windowsConfig=[RichAudio.Preparation.WorldWarmupSupervisor]::ReadConfiguration($windowsSidecar,$m.gameExecutable)
Check ($windowsConfig.OutputRoot-ceq$actual.OutputRoot-and$windowsConfig.Sources.Length-eq$actual.Sources.Length-and$windowsConfig.MaximumBatches-eq4) 'Windows PowerShell 5 setup path assembles the same accepted sidecar'
$sharp=Join-Path $fixture.parser 'SharpDX.dll';$old=[IO.File]::ReadAllBytes($sharp);[IO.File]::AppendAllText($sharp,'changed')
Reject {[RichAudio.Preparation.WorldWarmupSupervisor]::ReadConfiguration($sidecar,$m.gameExecutable)} 'External SharpDX mutation must fail before startup'
[IO.File]::WriteAllBytes($sharp,$old)
$node=Join-Path $fixture.install 'runtime/node.exe';$old=[IO.File]::ReadAllBytes($node);[IO.File]::AppendAllText($node,'changed')
Reject {New-StreetWorldWarmupConfiguration01 $m $fixture.install $fixture.game $fixture.parser $power} 'Bundled runtime mutation must fail before sidecar creation'
[IO.File]::WriteAllBytes($node,$old)
$m.acousticWorld.cacheRoot='.local/different';Reject {Assert-StreetWorldManifest01 $m} 'Divergent worker cache is refused';$m.acousticWorld.cacheRoot='.local/plugin-world-warmup'
$m.eligible+=@{model=123;context='npc'};Reject {Assert-StreetWorldManifest01 $m} 'Normal STREET-01 source scope remains Bati only';$m.eligible=@($m.eligible|Where-Object model -EQ 4180675781)
# Exercise the existing real transaction with the new sidecar included among
# exactly owned targets. A partially written sidecar restores exact old bytes.
$plugins=Join-Path $fixture.game 'Plugins';[IO.Directory]::CreateDirectory($plugins)|Out-Null
$plugin=Join-Path $plugins 'RichAudio.dll';$world=Join-Path $plugins 'RichAudio.WorldWarmup.json';$rph=Join-Path $fixture.game 'RAGEPluginHook.exe'
[IO.File]::WriteAllText($plugin,'original authored plugin');[IO.File]::WriteAllText($world,'original authored world sidecar');[IO.File]::WriteAllText($rph,'unrelated authored RPH sentinel')
$rollback=@();$plans=@();$files=@();$tx=Join-Path $root 'transaction';[IO.Directory]::CreateDirectory($tx)|Out-Null
foreach($relative in @('Plugins/RichAudio.dll','Plugins/RichAudio.WorldWarmup.json')){$target=Join-Path $fixture.game $relative;$backup=[IO.Path]::GetFileName($relative)+'.original';Copy-Item -LiteralPath $target -Destination (Join-Path $tx $backup);$rollback+=@{relative=$relative;backup=$backup;sha256=(Digest $target)};$plans+=@{relative=$relative;source=$sidecar};$files+=@{relative=$relative;backup=$backup;originalSha256=(Digest $target);installedSha256=(Digest $sidecar)}}
$receipt=Join-Path $tx 'receipt.json';$state=@{complete=$false;files=$files};Write-Json $receipt $state;$rphSha=Digest $rph
Reject {Invoke-InstallTransaction $fixture.game $tx $plans $rollback $receipt $state {param($from,$to)Copy-Item -LiteralPath $from -Destination $to -Force;if([IO.Path]::GetFileName($to)-eq'RichAudio.WorldWarmup.json'){throw 'Original injected sidecar failure'}}} 'Partial sidecar write must trigger exact rollback'
foreach($entry in $rollback){Check ((Digest (Join-Path $fixture.game $entry.relative))-ceq$entry.sha256) 'Plugin and old world sidecar restored exactly'}
Check ((Digest $rph)-ceq$rphSha-and!(Test-Path -LiteralPath $receipt)) 'Unrelated loader remains unchanged and verified rollback permits retry'
$state=@{complete=$false;files=$files};Write-Json $receipt $state;Invoke-InstallTransaction $fixture.game $tx $plans $rollback $receipt $state
Check ((Read-Json $receipt).complete-and@((Read-Json $receipt).files|Where-Object relative -EQ 'Plugins/RichAudio.WorldWarmup.json').Count-eq1) 'Successful transaction records exactly one owned world sidecar'
# The actual owned supervisor starts an authored coordinator that only reports
# command resolution. It never executes the inert Node/game/parser identities.
$coordinator=Join-Path $fixture.install 'tools/Prepare-InstalledAudioWorld.ps1'
[IO.File]::WriteAllText($coordinator,'param($GameRoot,$CodeWalkerRoot,$OutputRoot,$MaximumSeconds,$MaximumStageSeconds,$MaximumMemoryMiB,$MaximumGeometryResources,[switch]$ImportQualifiedGeometry)'+[Environment]::NewLine+'[IO.File]::WriteAllText((Join-Path $OutputRoot ''node-path.txt''),(Get-Command node.exe -ErrorAction Stop).Source)')
$c.Sources=@(@{RelativePath='tools/Prepare-InstalledAudioWorld.ps1';SHA256=(Digest $coordinator)});$c.MaximumSeconds=20;$c.MaximumStageSeconds=5;$c.MaximumMemoryMiB=256;Write-Json $sidecar $c
$worker=[RichAudio.Preparation.WorldWarmupSupervisor]::new();$worker.Start($sidecar,$m.gameExecutable);$clock=[Diagnostics.Stopwatch]::StartNew()
try{while($worker.State-ne'preparation-finished-read-summary'){if($clock.Elapsed.TotalSeconds-gt15-or$worker.State-like'blocked-*'){throw ('Owned preparation fixture failed: '+$worker.State)};Start-Sleep -Milliseconds 50};Check ([IO.File]::ReadAllText((Join-Path $c.OutputRoot 'node-path.txt'))-ceq$c.NodeExecutable) 'Owned PowerShell child resolves exact bundled Node with process-local PATH'}finally{$worker.Stop()}
$result=[ordered]@{schema=1;checks=$checks;copiedActualMainReady=$fixture.copiedActualMainReady;sourceBindings=$fixture.sourceBindings;cacheRoot=$fixture.cacheRoot;configuration='generated-world-warmup.json';configurationSHA256=(Digest $generatedSidecar);configurationBytes=(Get-Item -LiteralPath $generatedSidecar).Length;maximumBatches=$actual.MaximumBatches;maximumTotalSeconds=$actual.MaximumTotalSeconds;transactionRollbackExact=$true;bundledNodeResolved=$true;originalIdentitiesOnly=$true;vendorAssemblyLoaded=$false;installedGameRead=$false;installed=$false;gameLaunched=$false;endpointOpened=$false}
Write-Json (Join-Path $root 'validation.json') $result
Write-Output ('PASS '+$checks+' original STREET-01 installation/preparation checks; '+(Join-Path $root 'validation.json'))
