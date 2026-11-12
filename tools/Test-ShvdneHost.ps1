[CmdletBinding()]
param([string]$ApiPath='',[string]$Output='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$ApiPath){$ApiPath=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'}
if(!$Output){$Output=Join-Path $repo ('.local/shvdne-host-tests/'+[Guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($Output)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$Output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $Output)){throw 'Fresh repository-private test output required'}
for($at=$Output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
if((Get-FileHash -LiteralPath $ApiPath).Hash -ne '1E4D0BC4D34D05A6038FC87EEDE492D3DC4265522DE473EC19CDF6746B5B0E48'){throw 'Authentic v1.1.0.6 API3 reference required'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/host/Windows/GameplayRuntime.cs','src/acoustics/host/Windows/AcousticSettings.cs','src/acoustics/bridge/Integration/ShvdneHostController.cs','tests/host/TestShvdneHost.cs')|ForEach-Object{Join-Path $repo $_}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
# This is an authored fixture name/version, never the installed executable.
$binary=Join-Path $Output 'GTA5_Enhanced.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestShvdneHost ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'SHVDNE host fixture compilation failed'}
& $binary $Output ([IO.Path]::GetFullPath($ApiPath)) | Tee-Object -FilePath (Join-Path $Output 'fixture.log')
if($LASTEXITCODE-ne0){throw 'SHVDNE host fixtures failed'}
Write-Output ('SHVDNE host fixture evidence: '+$Output)
