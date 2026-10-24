# Creates a reviewable package under build/. This script has no deployment operation.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$compiled=Get-Content (Join-Path $repo 'evidence\phase2\compiled-assemblies.json') -Raw | ConvertFrom-Json
$pluginPath=Join-Path $repo 'build\telemetry\RichAudio.Telemetry.Rph.dll'
if((Get-FileHash -LiteralPath $pluginPath).Hash -ne ($compiled | Where-Object File -eq 'RichAudio.Telemetry.Rph.dll').SHA256){throw 'Build changed since audit. Run Test-Telemetry.ps1 -BuildAdapter before packaging.'}
$sourceHashes=Get-Content (Join-Path $repo 'evidence\phase2\source-fingerprints.json') -Raw | ConvertFrom-Json
foreach($row in $sourceHashes){if((Get-FileHash -LiteralPath (Join-Path $repo $row.File)).Hash -ne $row.SHA256){throw 'Source changed since audit; rebuild and test first.'}}
$test=Get-Content (Join-Path $repo 'evidence\phase2\test-results.json') -Raw | ConvertFrom-Json
$audit=Get-Content (Join-Path $repo 'evidence\phase2\adapter-audit.json') -Raw | ConvertFrom-Json
if(!$test.Passed -or !$audit.Passed){throw 'Passing offline tests and adapter audit are required.'}
$config=Get-Content (Join-Path $repo 'config\RichAudio.Telemetry.Rph.json') -Raw | ConvertFrom-Json
if($config.StoryModeAcknowledged -or $config.CaptureEnabled){throw 'Review package must have automatic capture and acknowledgement disabled.'}
$package=Join-Path $repo ('build\P2-01-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
$plugins=Join-Path $package 'Plugins'
[IO.Directory]::CreateDirectory($plugins) | Out-Null
Copy-Item -LiteralPath $pluginPath -Destination $plugins
Copy-Item -LiteralPath (Join-Path $repo 'config\RichAudio.Telemetry.Rph.json') -Destination $plugins
Copy-Item -LiteralPath (Join-Path $repo 'docs\DEPLOYMENT.md') -Destination (Join-Path $package 'READ_BEFORE_INSTALL.md')
$files=Get-ChildItem -LiteralPath $package -Recurse -File
$manifest=@($files | ForEach-Object {[pscustomobject]@{Path=$_.FullName.Substring($package.Length+1);Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'manifest.json') -Encoding utf8
$zip=$package+'.zip';Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip
[ordered]@{PackageDirectory=$package;Zip=$zip;Scope='RichAudio-only candidate; no RPH/SDK/ASI loader or game asset included; not installed';Files=$manifest} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $repo 'evidence\phase2\package.json') -Encoding utf8
Write-Output $zip
