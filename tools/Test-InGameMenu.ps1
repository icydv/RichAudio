[CmdletBinding()]
param([string]$Output='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$build=Join-Path $repo 'build\in-game-settings'
[IO.Directory]::CreateDirectory($build)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\settings\InGame') -Filter '*.cs' | Where-Object Name -NotLike '*.Rph.cs' | ForEach-Object FullName)
$sources+=Join-Path $repo 'tests\menu\TestInGameMenu.cs'
$options=@('/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/r:System.Drawing.dll','/r:System.Web.Extensions.dll')
$routerTest=Join-Path $repo 'tests\menu\TestMenuInputRouter.cs'
if(Test-Path -LiteralPath $routerTest){$sources+=$routerTest;$options+='/define:MENU_INPUT_TESTS'}
$statusTest=Join-Path $repo 'tests\menu\TestHostMenuStatus.cs'
if(Test-Path -LiteralPath $statusTest){$sources+=$statusTest;$options+='/define:MENU_STATUS_TESTS'}
$test=Join-Path $build 'RichAudio.InGameMenu.Tests.exe'
& $compiler @options /target:exe /main:TestInGameMenu ('/out:'+$test) @sources
if($LASTEXITCODE-ne0){throw 'In-game menu core/preview fixture compilation failed'}
if(!$Output){$Output=Join-Path $repo ('.local\in-game-menu-'+[guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($Output)){$Output}else{Join-Path $repo $Output}))
& $test $repo $Output
if($LASTEXITCODE-ne0){throw 'In-game menu core/input/preview fixture failed'}
