# Compiles only original local helpers; does not load CodeWalker or play audio.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$build=Join-Path $repo 'build\audio'
[IO.Directory]::CreateDirectory($build)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
foreach($name in @('ExtractBati','PlayPrivatePreview')) {
    & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+(Join-Path $build ($name+'.exe'))) (Join-Path $PSScriptRoot ('audio\'+$name+'.cs'))
    if($LASTEXITCODE -ne 0){throw ('Offline helper build failed: '+$name)}
}
Write-Output 'Built original offline audio helpers; no game/tool files installed or audio played.'
