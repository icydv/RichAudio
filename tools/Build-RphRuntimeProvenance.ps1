#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-10/provenance-build-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=@('.local/playable-10','build/playable-10-runtime-provenance')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
if(!@($allowed|Where-Object{($output+'\').StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Only new PLAYABLE-10 build storage is allowed.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build path.'}}
if(Test-Path -LiteralPath $output){throw 'Build output must be new; previous artifacts are never overwritten.'}
$baselinePath=Join-Path $repo '.local/playable-10/baseline.json'
if((Get-FileHash -LiteralPath $baselinePath).Hash.ToLowerInvariant()-ne'773b947526b5b83e8bfa6cdbaabd0b20ce2802ec2b2d523b53dac20fd95bbe28'){throw 'Reviewed initial10 baseline changed.'}
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
foreach($pin in @($baseline.trackedPins)+@($baseline.preserved09PrivatePins)){
 $p=Join-Path $repo $pin.name;if((Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()-ne$pin.sha256-or(Get-Item -LiteralPath $p).Length-ne$pin.bytes){throw ('Preserved input changed: '+$pin.name)}
}
foreach($pin in @($baseline.protected)+@($baseline.settings)){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Protected installation/settings changed.'}}
$old=Get-Content -LiteralPath (Join-Path $repo '.local/playable-09/baseline.json') -Raw|ConvertFrom-Json
if(!$SdkPath){$SdkPath=@($old.existingCompilerAndAuthenticSdkInventory|Where-Object sha256 -eq '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'|Select-Object -First 1 -ExpandProperty path)[0]}
if(!$SdkPath-or(Get-FileHash -LiteralPath $SdkPath).Hash.ToLowerInvariant()-ne'5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'){throw 'Authentic pinned SDK required, no download/substitution.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant()-ne'46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Existing reviewed compiler changed.'}
$gameEntry=@($baseline.protected|Where-Object name -eq 'GTA5_Enhanced.exe')[0]
$game=Split-Path -Parent $gameEntry.path
$policy=[ordered]@{
 WorkspaceRoot=$repo;GamePath=(Join-Path $game 'GTA5_Enhanced.exe');GameSha256='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea';GameVersion='1.0.1158.16'
 LauncherPath=(Join-Path $game 'RAGEPluginHook.exe');LauncherSha256='73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac';LauncherVersion='1.132.1428.17748'
 ShvPath=(Join-Path $game 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f'
 LoaderPath=(Join-Path $game 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d'
 PreservedProducerSha256='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
 LeasePath=(Join-Path $game 'Plugins/RichAudio.RuntimeProvenance.json')
}
[IO.Directory]::CreateDirectory($output)|Out-Null
$policyPath=Join-Path $output 'RphProvenanceBuildPolicy.generated.cs'
$lines=@('namespace RichAudio.Beacon.Provenance { internal static class RphProvenanceBuildPolicy {')
foreach($key in $policy.Keys){$lines+='internal const string '+$key+' = @"'+$policy[$key].Replace('"','""')+'";'}
$lines+='internal const long GameBytes=55819384,LauncherBytes=12237182;'
$lines+='internal const bool FixturePolicy=false;';$lines+='} }'
$lines|Set-Content -LiteralPath $policyPath -Encoding utf8
$sources=@('src/acoustics/bridge/Rph/RphProvenanceEntry.Rph.cs','src/acoustics/bridge/Rph/RphProvenanceBootstrap.Rph.cs','src/acoustics/host/Handoff/RphRuntimeProvenance.cs')|ForEach-Object{Join-Path $repo $_}
$sources+=@($policyPath)
$pins=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$binary=Join-Path $output 'RichAudio.RuntimeProvenance.Rph.dll'
& $compiler /nologo /target:library /platform:x64 /langversion:5 /optimize+ /warnaserror+ /define:SHV_PROVENANCE_10 /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll ('/r:'+$SdkPath) ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Actual diagnostic SDK compilation failed.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Source changed during compilation.'}}
$sha=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant()
$template=[ordered]@{schema=1;profile='PLAYABLE-10';purpose='rph-runtime-provenance-only';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';callerAssemblySha256=$sha
 gamePath=$policy.GamePath;gameSha256=$policy.GameSha256;gameVersion=$policy.GameVersion;launcherPath=$policy.LauncherPath;launcherSha256=$policy.LauncherSha256;launcherVersion=$policy.LauncherVersion
 shvPath=$policy.ShvPath;shvSha256=$policy.ShvSha256;loaderPath=$policy.LoaderPath;loaderSha256=$policy.LoaderSha256;preservedProducerSha256=$policy.PreservedProducerSha256
 diagnosticOnly=$true;sourceAttachmentAllowed=$false;audioPlaybackAllowed=$false;asiDeploymentAllowed=$false;runtimeExpectationState='UNREVIEWED'}
$templatePath=Join-Path $output 'session-lease-template.json';$template|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $templatePath -Encoding utf8
foreach($pin in @($baseline.protected)+@($baseline.settings)){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Protected input changed during build.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-10';kind='authentic-SDK-diagnostic-only-compilation';builtUtc=[DateTime]::UtcNow.ToString('o');pluginPath=$binary;pluginSha256=$sha;pluginBytes=(Get-Item -LiteralPath $binary).Length
 sdkPath=$SdkPath;sdkSha256=(Get-FileHash -LiteralPath $SdkPath).Hash.ToLowerInvariant();compilerPath=$compiler;compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant()
 policySourcePath=$policyPath;policySourceSha256=(Get-FileHash -LiteralPath $policyPath).Hash.ToLowerInvariant();sources=$pins;builderSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
 sessionTemplatePath=$templatePath;sessionTemplateSha256=(Get-FileHash -LiteralPath $templatePath).Hash.ToLowerInvariant();diagnosticOnly=$true;sourceAttachmentAllowed=$false;handoffAllowed=$false;audioPlaybackAllowed=$false;asiDeploymentAllowed=$false;fixturePolicy=$false
 runtimeIdentityAuthenticated=$false;expectedRuntimeState='UNREVIEWED';newCompiledArtifactExecuted=$false;gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;newSystemSoftwareInstalled=$false;staticIsolationValidationRequired=$true}
$path=Join-Path $output 'build-receipt.json';$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS diagnostic-only DLL compiled with authentic SDK; '+$path)
