# Preparation only. The supplied source path is treated as literal text.
# Never Test-Path/Get-Item/open/hash the source or any adjacent source file here.
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$OutputRoot,
 [string]$ToolPath,
 [switch]$Synthetic
)
$ErrorActionPreference='Stop'
# Refuse inherited CLR control names before starting a compiler/helper CLR.
# The trusted PowerShell host already exists; no environment values are printed.
foreach($entry in Get-ChildItem Env:){
 $name=$entry.Name.ToUpperInvariant()
 if($name-in@('DOTNET_CLI_TELEMETRY_OPTOUT','DOTNET_NOLOGO')){continue}
 if($name-match'^(COR_|CORECLR_|COMPLUS_|DOTNET_)|^(APPDOMAIN_MANAGER_ASM|APPDOMAIN_MANAGER_TYPE|DEVPATH)$'){throw ('CLR injection/override environment refused before compiler/helper launch: '+$entry.Name)}
}
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private tool candidate directory required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'No-follow preparation output path required'}}
if($Synthetic){$sourceFile=Join-Path $output 'original-tool.exe';$mode='synthetic-offline-test'}else{
 if([string]::IsNullOrWhiteSpace($ToolPath)){throw 'Exact supplied source path required; preparation never inspects it'}
 $sourceFile=[IO.Path]::GetFullPath($ToolPath)
 if($sourceFile.Length-gt512-or$sourceFile.Length-lt4-or$sourceFile[1]-ne':'-or$sourceFile[2]-ne[IO.Path]::DirectorySeparatorChar-or!$sourceFile.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)-or$sourceFile.Substring(2).Contains(':')){throw 'One literal local-drive executable path required'}
 $mode='tool-metadata-proposed'
}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$source=Join-Path $PSScriptRoot 'world05-tool-metadata-candidate.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sourceHash=Hash $source;$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'world05-tool-metadata.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Tool metadata helper compile failed; retain failure without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Tool metadata build source/compiler drift'}
$runtimeJson=& $exe --runtime-pins
if($LASTEXITCODE-ne0){throw 'Tool metadata runtime pinning failed; supplied source remains unopened'}
$runtimePins=$runtimeJson|ConvertFrom-Json
$manifest=[ordered]@{
 kind='world05-one-shot-tool-metadata-candidate-v1';attemptId=[guid]::NewGuid().ToString('N');mode=$mode
 sourceFile=$sourceFile;outputDirectory=(Join-Path $output 'result');exeSHA256=(Hash $exe);runtimePins=@($runtimePins)
 sourceIdentityBasis='unknown-until-approved-first-observation';expectedSourceSHA256=$null;expectedSourceBytes=$null
 maximumSourceBytes=33554432;maximumSourceReadBytes=65536;maximumSourceReadCalls=16;headerPrefixBytes=4096;maximumVersionPayloadBytes=16384
 sourceAllowlist=@($sourceFile);adjacentFileAllowlist=@();sourceCodeExecutionAllowed=$false;sourceAssemblyLoadAllowed=$false;otherResourcePayloadsAllowed=$false;keyAccessAllowed=$false
 retryAllowed=$false;independentReviewRequired=$true;additionalUserApprovalRequired=$false;authorizationBasis='existing-offline-tool-research-exact-supplied-tool-metadata-only'
}
$manifestPath=Join-Path $output 'manifest.json'
$manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$preparation=[ordered]@{
 kind='world05-tool-metadata-preparation';sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);manifestSHA256=(Hash $manifestPath)
 preparerSHA256=(Hash $PSCommandPath);runtimePinCount=@($runtimePins).Count;sourceOpened=$false;sourceStatted=$false;adjacentFilesOpened=0;gameFilesRead=$false;keysRead=0;audioEndpointOpened=$false
 executorInvoked=$false;independentReviewRequired=$true;additionalUserApprovalRequired=$false;runtimeClosureQualification='actual loaded managed/module files plus machine.config pinned; trusted Windows platform, not complete OS closure'
 command=@($exe,'--supervise',$manifestPath,(Hash $manifestPath))
}
$preparation|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'preparation.json') -Encoding utf8NoBOM
Write-Output ('Prepared '+$mode+' candidate without source access; manifest SHA-256 '+(Hash $manifestPath))
