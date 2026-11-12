[CmdletBinding()]
param([string]$Output='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$allowed=Join-Path $repo '.local/gate-a-shvdne-private-01/supervision'
if(!$Output){$Output=Join-Path $allowed ('build-'+[Guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($Output)
if(!$Output.StartsWith(([IO.Path]::GetFullPath($allowed).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $Output)){throw 'Fresh private supervision build output required'}
for($at=$Output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked supervision output refused'}}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('SupervisorProtocol.cs','SupervisorPolicy.cs','SupervisorMonitor.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
$binary=Join-Path $Output 'RichAudio.Private01.Supervisor.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /main:RichAudio.GateA.Private01.Supervision.SupervisorMonitor ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Independent supervisor compilation failed'}
[ordered]@{schema=1;builtUtc=[DateTime]::UtcNow.ToString('o');kind='offline-prepared-independent-supervisor';binary=$binary;sha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();sources=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});gameLaunched=$false;authorizedForLive=$false;performance10ms='FAILED_UNCHANGED'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'build-receipt.json') -Encoding utf8
Write-Output $Output
