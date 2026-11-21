#requires -Version 7.0
[CmdletBinding()]
param([string]$Binary='', [string]$Output='')
$ErrorActionPreference='Stop'
# Reuse only the bounded byte parser and generic containment check. Dot sourcing
# does not execute or load the inspected image and does not alter old profiles.
. (Join-Path $PSScriptRoot 'Inspect-ShvProbe.ps1') -Binary $Binary -Output $Output -ProbeProfile playable-07

function Get-ShvHandoffImports {
 @('?nativeInit@@YAX_K@Z','?nativePush64@@YAX_K@Z','?nativeCall@@YAPEA_KXZ',
   '?scriptRegister@@YAXPEAUHINSTANCE__@@P6AXXZ@Z','?scriptUnregister@@YAXPEAUHINSTANCE__@@@Z',
   '?scriptWait@@YAXK@Z','?getScriptHandleBaseAddress@@YAPEAEH@Z')
}
function Get-ShvHandoffExports {
 @('RichAudioShvDescribe','RichAudioShvOpen','RichAudioShvClock','RichAudioShvPeek',
   'RichAudioShvBegin','RichAudioShvReadNext','RichAudioShvStop')
}
function Assert-ShvHandoffOutputPath([string]$Path,[string]$Repository,[string]$GameRoot) {
 $full=Assert-ShvBuildOutputPath $Path $Repository $GameRoot
 $allowed=$false
 foreach($name in @('build/playable-09-shv-handoff','build/playable-09-shv-handoff-final','.local/playable-09')) {
  $root=[IO.Path]::GetFullPath((Join-Path $Repository $name)).TrimEnd('\','/')
  if($full.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){$allowed=$true}
 }
 if(!$allowed){throw 'New handoff output must remain inside a09 handoff build directory or .local/playable-09; prior profiles are immutable.'}
 $snapshot=[IO.Path]::GetFullPath((Join-Path $Repository '.local/playable-09/preserved-playable-08-handoff'))
 if($full.Equals($snapshot,[StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($snapshot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'The historical08 source snapshot is immutable.'}
 return $full
}
function Assert-ShvHandoffImage {
 param([Parameter(Mandatory=$true)]$Image)
 if($Image.Machine -ne 'Amd64' -or $Image.PeKind -ne 'PE32Plus' -or !$Image.IsDll -or !$Image.EntryPointPresent -or !$Image.EntryPointExecutable -or $Image.HasClrMetadata){throw 'Handoff must be a native AMD64 PE32+ DLL with a backed executable entry point.'}
 if(!$Image.GuardCF -or !$Image.DynamicBase -or !$Image.NxCompatible -or !$Image.HighEntropyVa -or $Image.DelayImportDirectoryPresent){throw 'Handoff PE hardening or no-delay-import contract differs.'}
 $expected=@(Get-ShvHandoffExports|Sort-Object);$actual=@($Image.Exports.Name|Sort-Object)
 if($Image.ExportFunctionCount -ne 7 -or $Image.ExportNameCount -ne 7 -or $actual.Count -ne 7 -or @(Compare-Object $expected $actual -CaseSensitive).Count -or @($Image.Exports|Where-Object {$_.Forwarded -or !$_.HasFunction}).Count){throw 'Handoff must export exactly the seven owned C ABI names, without forwards, holes or ordinal-only additions.'}
 $framework=@($Image.Imports|Where-Object {$_.Module -ieq 'ScriptHookV.dll'})
 $expected=@(Get-ShvHandoffImports|Sort-Object)
 if($framework.Count -ne 1 -or $framework[0].Ordinals.Count -or $framework[0].Functions.Count -ne 7 -or @(Compare-Object $expected (@($framework[0].Functions)|Sort-Object) -CaseSensitive).Count){throw 'Handoff must import precisely the seven reviewed public SHV symbols.'}
 $foreground=@($Image.Imports|Where-Object {$_.Module -ieq 'USER32.dll'})
 if($foreground.Count -ne 1 -or $foreground[0].Ordinals.Count -or $foreground[0].Functions.Count -ne 2 -or @(Compare-Object @('GetForegroundWindow','GetWindowThreadProcessId') (@($foreground[0].Functions)|Sort-Object) -CaseSensitive).Count){throw 'User32 must contain only the two foreground readers.'}
 # /MT startup, math classification and error paths pull CRT file/loader
 # helpers. This exact OS allowlist describes the whole image, not authored
 # acquisition I/O. The builder separately checks Producer.obj direct imports.
 $kernel=@('HeapAlloc','WriteConsoleW','CloseHandle','CreateFileW','SetFilePointerEx','QueryPerformanceCounter','QueryPerformanceFrequency','GetProcessTimes','GetCurrentProcess','GetCurrentProcessId','GetModuleHandleExW','GetConsoleMode','GetConsoleOutputCP','WriteFile','RtlCaptureContext','RtlLookupFunctionEntry','RtlVirtualUnwind','UnhandledExceptionFilter','SetUnhandledExceptionFilter','TerminateProcess','IsProcessorFeaturePresent','GetCurrentThreadId','GetSystemTimeAsFileTime','InitializeSListHead','IsDebuggerPresent','GetStartupInfoW','GetModuleHandleW','RtlUnwindEx','InterlockedFlushSList','GetLastError','SetLastError','EncodePointer','RaiseException','EnterCriticalSection','LeaveCriticalSection','DeleteCriticalSection','InitializeCriticalSectionAndSpinCount','TlsAlloc','TlsGetValue','TlsSetValue','TlsFree','FreeLibrary','GetProcAddress','LoadLibraryExW','RtlPcToFileHeader','ExitProcess','GetModuleFileNameW','HeapFree','FindClose','FindFirstFileExW','FindNextFileW','IsValidCodePage','GetACP','GetOEMCP','GetCPInfo','GetCommandLineA','GetCommandLineW','MultiByteToWideChar','WideCharToMultiByte','GetEnvironmentStringsW','FreeEnvironmentStringsW','FlsAlloc','FlsGetValue','FlsSetValue','FlsFree','InitializeCriticalSectionEx','VirtualProtect','LCMapStringW','GetProcessHeap','GetStdHandle','GetFileType','GetStringTypeW','HeapSize','HeapReAlloc','SetStdHandle','FlushFileBuffers')
 foreach($module in $Image.Imports){
  if($module.Ordinals.Count){throw 'Ordinal imports are not permitted.'}
  if($module.Module -ieq 'ScriptHookV.dll'){continue}
  if($module.Module -notmatch '^(KERNEL32|USER32)\.dll$'){throw ('Unexpected handoff dependency: '+$module.Module)}
  if($module.Module -ieq 'KERNEL32.dll'){foreach($name in $module.Functions){if($name -cnotin $kernel){throw ('Unreviewed kernel/CRT import: '+$name)}}}
 }
 return $true
}
function Write-ShvHandoffJsonNew([string]$Path,$Value) {
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 16))
 $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try{$stream.Write($bytes);$stream.Flush($true)}finally{$stream.Dispose()}
}
if($MyInvocation.InvocationName -ne '.' -and $Binary){
 $image=Get-ShvPeImage $Binary;$null=Assert-ShvHandoffImage $image
 if($Output){
  $repo=Split-Path -Parent $PSScriptRoot
  $target=Assert-ShvHandoffOutputPath $Output $repo 'D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
  if(Test-Path -LiteralPath $target){throw 'Inspection output must be new.'}
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null
  Write-ShvHandoffJsonNew $target $image
 }
 Write-Output ('PASS static handoff PE; exact seven SHV imports and seven owned exports. SHA256 '+$image.Sha256+'; no image executed.')
}
