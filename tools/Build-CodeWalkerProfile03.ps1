# Explicit public-source build only. No game path, archive, key loader or discovery.
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$SourceRoot,
 [Parameter(Mandatory)][string]$SharpDxRoot,
 [Parameter(Mandatory)][string]$OutputRoot,
 [string]$CompilerPath
)
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
$expected='485d56bec00262ed7fa472261cce7bbc6202b96e'
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function CheckedPrivate([string]$p){$p=[IO.Path]::GetFullPath($p);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))
 if(!$p.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Fresh explicit private world-03 directory required'}
 for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked source/output path refused'}};$p}
$source=CheckedPrivate $SourceRoot;$output=CheckedPrivate $OutputRoot
if(Test-Path -LiteralPath $output){throw 'New private parser profile required; do not replace an existing reviewed parser'}
if((git -C $source rev-parse HEAD)-cne$expected-or$LASTEXITCODE-ne0){throw 'Exact public CodeWalker source commit required'}
if(![string]::IsNullOrWhiteSpace((git -C $source status --porcelain|Out-String))){throw 'Public parser source tree must be unchanged'}
$refs=@(@{file='SharpDX.dll';sha256='a0af255ea4b09a8cdb995b8c6fd1075e46f098e23c2351c974e6ded9b8b620cf'},@{file='SharpDX.Mathematics.dll';sha256='4c9615496970ea84320e2a6e99f8fb828e3c7790384df5585d93fc368885d94e'})
foreach($ref in $refs){if((Hash (Join-Path $SharpDxRoot $ref.file))-cne$ref.sha256){throw 'Reviewed SharpDX dependency differs'}}
if(!$CompilerPath){$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe';if(!(Test-Path -LiteralPath $vswhere)){throw 'Explicit existing Roslyn compiler required'}
 $CompilerPath=(& $vswhere -latest -products '*' -find 'MSBuild\**\Roslyn\csc.exe'|Select-Object -First 1)}
if(!$CompilerPath-or!(Test-Path -LiteralPath $CompilerPath)){throw 'Existing compiler unavailable; this tool installs nothing'}
$files=@(Get-ChildItem -LiteralPath (Join-Path $source 'CodeWalker.Core') -Recurse -File -Filter '*.cs'|Sort-Object FullName)
if($files.Count-ne114){throw 'Pinned public source file closure differs'}
$pins=@($files|ForEach-Object{@{file=[IO.Path]::GetRelativePath($source,$_.FullName).Replace('\','/');sha256=Hash $_.FullName}})
[IO.Directory]::CreateDirectory($output)|Out-Null
$compilerHash=Hash $CompilerPath;$dll=Join-Path $output 'CodeWalker.Core.dll';$rsp=Join-Path $output 'compile.rsp'
$options=@('/nologo','/target:library','/optimize+','/langversion:latest','/unsafe+','/deterministic+',('/out:"'+$dll+'"'),('/pathmap:"'+$source+'=CodeWalker-public-source"'),'/r:System.Runtime.Serialization.dll','/r:System.Xml.Linq.dll','/r:System.Drawing.dll')+
 @($refs|ForEach-Object{'/r:"'+(Join-Path $SharpDxRoot $_.file)+'"'})+@($files|ForEach-Object{'"'+$_.FullName+'"'})
$options|Set-Content -LiteralPath $rsp -Encoding utf8NoBOM
& $CompilerPath ('@'+$rsp) *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Pinned public parser compile failed; output retained without retry'}
foreach($pin in $pins){if((Hash (Join-Path $source $pin.file))-cne$pin.sha256){throw 'Source changed during parser build'}}
foreach($ref in $refs){if((Hash (Join-Path $SharpDxRoot $ref.file))-cne$ref.sha256){throw 'Dependency changed during parser build'};Copy-Item -LiteralPath (Join-Path $SharpDxRoot $ref.file) -Destination (Join-Path $output $ref.file)}
if((Hash $CompilerPath)-cne$compilerHash){throw 'Compiler changed during parser build'}
$receipt=[ordered]@{schema=1;kind='CodeWalker-public-source-private-profile03';passed=$true;sourceCommit=$expected;sourceTreeClean=$true;sourcePins=$pins;parserSha256=Hash $dll;compilerSha256=$compilerHash;dependencies=$refs;
 buildProfile='Roslyn-full-framework-private-resource-subset';gen9SelectorAvailableFromPinnedSource=$true;officialBinaryClaimed=$false;sourceUrl=('https://github.com/dexyfex/CodeWalker/tree/'+$expected);gameFilesRead=$false;endpointOpened=$false;installedResourcesSupported=$false}
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'profile.json') -Encoding utf8NoBOM
Write-Output ('PASS new public-source parser profile; SHA-256 '+$receipt.parserSha256)
