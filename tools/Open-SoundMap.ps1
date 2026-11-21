# Independent Windows browser application window. No game or audio endpoint access.
[CmdletBinding()]
param([string]$Url='http://127.0.0.1:17833',[string]$ServiceDescriptor='')
$ErrorActionPreference='Stop'
if($ServiceDescriptor){$descriptor=Get-Content -LiteralPath $ServiceDescriptor -Raw|ConvertFrom-Json;$Url=[string]$descriptor.url}
$uri=[Uri]$Url
if($uri.Scheme-ne'http'-or$uri.Host-ne'127.0.0.1'-or$uri.UserInfo-or$uri.Query-or$uri.Fragment){throw 'SoundMap requires an unauthenticated URL on the local loopback service. Tokens stay in the private descriptor.'}
$candidates=@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Google\Chrome\Application\chrome.exe")
$browser=$candidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1
if(!$browser){throw 'Microsoft Edge or Google Chrome is required for the independent SoundMap window.'}
# The window is explicitly requested and can be moved to any monitor.
Start-Process -FilePath $browser -ArgumentList @('--app='+$uri.AbsoluteUri,'--new-window','--window-size=1280,820')
