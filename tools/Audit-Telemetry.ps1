# Run in Windows PowerShell for the Framework-targeted SDK. Metadata inspection only; no RPH API execution.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$sdk=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $repo '.local\rph\sdk\RagePluginHookSDK.dll')))
$resolver=[ResolveEventHandler]{param($sender,$args) if($args.Name.StartsWith('RagePluginHook,')){return $sdk};return $null}
[AppDomain]::CurrentDomain.add_AssemblyResolve($resolver)
try {
 $plugin=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $repo 'build\telemetry\RichAudio.Telemetry.Rph.dll')))
 $entry=$plugin.GetType('RichAudio.Rph.EntryPoint')
 $commands=@(foreach($m in $entry.GetMethods()){foreach($a in [Reflection.CustomAttributeData]::GetCustomAttributes($m)){if($a.AttributeType.FullName -eq 'Rage.Attributes.ConsoleCommandAttribute'){[pscustomobject]@{Method=$m.Name;CommandName=($a.NamedArguments | Where-Object MemberName -eq 'Name').TypedValue.Value}}}})
 if(@($commands | Where-Object {!$_.CommandName}).Count -or $commands.Count -ne 4){throw 'Command metadata check failed'}
 $expected=@('RichAudioMark','RichAudioStart','RichAudioStop','RichAudioStatus')
 if(@($commands | Where-Object {$_.CommandName -notin $expected}).Count){throw 'Wrong compiled console command name'}
 $source=Get-Content (Join-Path $repo 'src\telemetry\Rph\Plugin.cs') -Raw
 $calls=@([regex]::Matches($source,'CallByName<[^>]+>\("([A-Z0-9_]+)"') | ForEach-Object {$_.Groups[1].Value} | Sort-Object -Unique)
 $allowed=@('GET_FINAL_RENDERED_CAM_COORD','GET_FINAL_RENDERED_CAM_ROT','NETWORK_IS_SESSION_STARTED','NETWORK_IS_GAME_IN_PROGRESS')
 if(@($calls | Where-Object {$_ -notin $allowed}).Count -or $calls.Count -ne 4){throw 'Native allowlist audit failed'}
 if($source -match '\bv\.(Position|Velocity|Rotation|Orientation|IsEngineOn|CurrentGear)\s*=' -or $source -match 'DllImport|MemoryAddress|Marshal\.|File\.Write|File\.Create'){throw 'Unexpected mutation/unsafe/IO operation in adapter'}
 $refs=@($plugin.GetReferencedAssemblies().Name)
 if(@($refs | Where-Object {$_ -notin @('mscorlib','System','System.Core','System.Runtime.Serialization','RagePluginHook')}).Count){throw 'Unexpected plugin dependency'}
 [ordered]@{Scope='Compiled attribute/reference metadata and static source audit; not runtime execution';Commands=$commands;NativeCallNames=$calls;PluginReferences=$refs;EntryPoint=$entry.GetMethod('Main').ToString();ExitPoint=$entry.GetMethod('OnUnload').ToString();Passed=$true} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $repo 'evidence\phase2\adapter-audit.json') -Encoding utf8
 [ordered]@{CheckedDate='2026-10-24';Framework='RAGE Plugin Hook';SupportStatus='Author advertises Enhanced 1158.16 support; not live verified';SupportSource='https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/';AuthorReleaseDate='2026-09-17';SdkSource='https://www.lcpdfr.com/forums/topic/154295-rph-sdk/';SdkAttachmentId=239104;SdkArchiveSHA256=(Get-FileHash (Join-Path $repo '.local\rph\RPH_SDK_3717.zip')).Hash;SdkDllSHA256=(Get-FileHash (Join-Path $repo '.local\rph\sdk\RagePluginHookSDK.dll')).Hash;SdkFileVersion='1.124.1393.17586';SdkAssemblyIdentity=$sdk.FullName;RuntimeDownloadAttempt='Official download returned HTTP 403; web redirect loop; no workaround or mirror';RuntimeBinaryAcquired=$false;RuntimeInstalled=$false;LiveGameTest=$false;RedistributedDependency=$false} | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $repo 'evidence\phase2\runtime-research.json') -Encoding utf8
 Get-ChildItem (Join-Path $repo 'build\telemetry') -File | ForEach-Object {[pscustomobject]@{File=$_.Name;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName).Hash}} | ConvertTo-Json | Set-Content (Join-Path $repo 'evidence\phase2\compiled-assemblies.json') -Encoding utf8
 Get-ChildItem (Join-Path $repo 'src\telemetry'),(Join-Path $repo 'tests\telemetry') -Recurse -File -Filter '*.cs' | ForEach-Object {[pscustomobject]@{File=$_.FullName.Substring($repo.Length+1);SHA256=(Get-FileHash -LiteralPath $_.FullName).Hash}} | ConvertTo-Json | Set-Content (Join-Path $repo 'evidence\phase2\source-fingerprints.json') -Encoding utf8
 Write-Output 'PASS: adapter command metadata, dependency references and static read-only API audit.'
} finally {[AppDomain]::CurrentDomain.remove_AssemblyResolve($resolver)}
