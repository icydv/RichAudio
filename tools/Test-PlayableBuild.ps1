[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RphRuntime,[string]$Binary='')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
if(!$Binary){$Binary=Join-Path $repo 'build/acoustics07/transport/RichAudio.Beacon.Rph.dll'}
# Inspect actual compiled metadata without executing RPH/SDK reference stubs.
Add-Type -Path (Join-Path $RphRuntime 'Mono.Cecil.dll')
$assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly([IO.Path]::GetFullPath($Binary))
$entries=@($assembly.MainModule.Types|ForEach-Object{$_.Methods|Where-Object{$_.IsStatic -and $_.IsPublic -and $_.Name -in @('Main','OnUnload')}})
if($entries.Count -ne 2 -or @($entries|Where-Object{$_.DeclaringType.FullName -ne 'RichAudio.Beacon.Rph.PlayableEntry'}).Count){throw 'Product contains ambiguous lifecycle convention methods'}
$plugin=@($assembly.CustomAttributes|Where-Object{$_.AttributeType.FullName -eq 'Rage.Attributes.PluginAttribute'})
if($plugin.Count -ne 1){throw 'Product plugin identity is ambiguous'}
Write-Output 'PASS compiled gameplay plugin has exactly one Main, one OnUnload and one plugin identity; no SDK/runtime executed.'
