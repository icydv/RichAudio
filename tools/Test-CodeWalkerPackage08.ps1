#requires -Version 7.0
# Verify/extract an actual package, then import its control/UI closure using its
# bundled official Node. No parser worker, input plan, game or endpoint is run.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackageDirectory,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Local([string]$p,[bool]$fresh=$false){$p=[IO.Path]::GetFullPath($p);$ok=@('.local','build')|Where-Object{$p.StartsWith([IO.Path]::GetFullPath((Join-Path $repo $_))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)};if(!$ok){throw 'Current checkout original package/test paths required'};for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked package/test path refused'}};if($fresh-and(Test-Path -LiteralPath $p)){throw 'Fresh package-test output required'};$p}
$package=Local $PackageDirectory;$output=Local $OutputRoot $true
$manifestPath=Join-Path $package 'provider-package08.json';if((Get-Item -LiteralPath $manifestPath).Length-gt1048576){throw 'Bounded package manifest required'}
$manifestSHA256=Hash $manifestPath;$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.kind-cne'RichAudioCodeWalkerProviderPackage08'-or!$manifest.passed-or$manifest.files.Count-gt1024-or!$manifest.nodeRuntime.bundled-or!$manifest.nodeRuntime.officialChecksumMatched-or$manifest.controlEntry-cne'tools/Prepare-CodeWalkerWorld08.mjs'){throw 'Complete integrated package with bundled verified Node/CLI required'}
$expected=@{};$total=0L
foreach($f in $manifest.files){if($f.path-match'(^/|\\|:|(^|/)\.\.(/|$))'-or$expected.ContainsKey($f.path)-or$f.sha256-cnotmatch'^[a-f0-9]{64}$'-or$f.bytes-lt1-or$f.bytes-gt134217728){throw 'Bounded literal package files required'};$expected[$f.path]=$f;$p=Local (Join-Path $package $f.path);if((Get-Item -LiteralPath $p).Length-ne$f.bytes-or(Hash $p)-cne$f.sha256){throw 'Package file changed'};$total+=$f.bytes;if($total-gt268435456){throw 'Aggregate package byte cap'}
 if($f.role-in@('control-module','control-ui','prelaunch-entry','runtime-source-binding')){$current=Join-Path $repo $f.path;if((Hash $current)-cne$f.sha256){throw ('Package control source is stale: '+$f.path)}}
}
$expected['provider-package08.json']=@{path='provider-package08.json';sha256=$manifestSHA256;bytes=(Get-Item -LiteralPath $manifestPath).Length}
$zipPath=Join-Path ([IO.Path]::GetDirectoryName($package)) 'WorldProvider08.zip';$zipSHA256=Hash $zipPath
[IO.Directory]::CreateDirectory($output)|Out-Null;$unpacked=Join-Path $output 'unpacked';[IO.Directory]::CreateDirectory($unpacked)|Out-Null
$archive=[IO.Compression.ZipFile]::OpenRead($zipPath);$seen=@{}
try{if($archive.Entries.Count-ne$expected.Count){throw 'Exact ZIP file closure required'};foreach($e in $archive.Entries){if(!$e.FullName.StartsWith('WorldProvider08/',[StringComparison]::Ordinal)){throw 'Literal ZIP root required'};$relative=$e.FullName.Substring(16);if(!$expected.ContainsKey($relative)-or$seen.ContainsKey($relative)-or$e.Length-ne$expected[$relative].bytes){throw 'ZIP entry differs from package binding'};$seen[$relative]=$true;$dest=Join-Path $unpacked $e.FullName;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;$input=$e.Open();$out=[IO.File]::Open($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$input.CopyTo($out)}finally{$input.Dispose();$out.Dispose()};if((Hash $dest)-cne$expected[$relative].sha256){throw 'Extracted ZIP content differs'}}}finally{$archive.Dispose()}
$extracted=Join-Path $unpacked 'WorldProvider08';$node=Join-Path $extracted 'runtime/node.exe';if((Hash $node)-cne$manifest.nodeRuntime.sha256){throw 'Extracted official Node differs'}
$probe=@'
import * as provider from './unpacked/WorldProvider08/src/acoustics/world/codewalker-provider08.mjs';
import * as discovery from './unpacked/WorldProvider08/src/acoustics/world/installation-discovery08.mjs';
import * as view from './unpacked/WorldProvider08/tools/soundmap/provider08.mjs';
import * as preparation from './unpacked/WorldProvider08/tools/Prepare-CodeWalkerWorld08.mjs';
if(typeof provider.buildProviderCatalogue08!=='function'||typeof discovery.discoverInstallationArchives08!=='function'||typeof view.startProviderSoundMap08!=='function'||typeof preparation.runPreparationPlan08!=='function')throw Error('Incomplete extracted control/API closure');
console.log(JSON.stringify({passed:true,imports:4,checkoutFallback:false,endpointOpened:false,gameFilesRead:false}));
'@
[IO.File]::WriteAllText((Join-Path $output 'import-control08.mjs'),$probe,[Text.UTF8Encoding]::new($false))
function Node([string[]]$arguments,[string]$label){$start=[Diagnostics.ProcessStartInfo]::new($node);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;foreach($a in $arguments){$start.ArgumentList.Add($a)};foreach($n in @('NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_REPL_EXTERNAL_MODULE','OPENSSL_CONF','SSL_CERT_FILE','SSL_CERT_DIR')){[void]$start.Environment.Remove($n)};$process=[Diagnostics.Process]::Start($start);try{$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();if(!$process.WaitForExit(10000)){$process.Kill();if(!$process.WaitForExit(5000)){throw 'Owned package probe closure unknown'};throw 'Package probe timeout'};$o=$stdout.GetAwaiter().GetResult();$e=$stderr.GetAwaiter().GetResult();if($o.Length+$e.Length-gt16384){throw 'Package probe diagnostics cap'};[IO.File]::WriteAllText((Join-Path $output ($label+'.stdout.txt')),$o,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $output ($label+'.stderr.txt')),$e,[Text.UTF8Encoding]::new($false));return @{code=$process.ExitCode;stdout=$o;stderr=$e}}finally{$process.Dispose()}}
$import=Node @((Join-Path $output 'import-control08.mjs')) 'imports';if($import.code-ne0-or!($import.stdout|ConvertFrom-Json).passed){throw 'Extracted package import closure failed'}
$usage=Node @((Join-Path $extracted $manifest.controlEntry)) 'unplanned-cli';if($usage.code-ne1-or!$usage.stderr.Contains('Use --plan')){throw 'Unplanned CLI must refuse before resource/endpoint activity'}
if((Hash $manifestPath)-cne$manifestSHA256-or(Hash $zipPath)-cne$zipSHA256){throw 'Original package changed during verification'}
$result=[ordered]@{schema=1;kind='CodeWalkerProviderPackage08Validation';passed=$true;manifestSHA256=$manifestSHA256;zipSHA256=$zipSHA256;verifiedFiles=$expected.Count;packageRelativeImports=4;nodeBundled=$true;officialNodeChecksumMatched=$true;unplannedCliRejected=$true;checkoutFallback=$false;installedResourcesRead=$false;workerInvoked=$false;endpointOpened=$false;gameLaunched=$false}
$result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8NoBOM
Write-Output ('PASS actual ZIP '+$expected.Count+' file bindings, bundled Node/4extractedimports and no-plan CLI refusal; no game or endpoint')
