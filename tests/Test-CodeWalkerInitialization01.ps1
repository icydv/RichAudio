# Original public-API stand-in only. No vendor binary, real executable or key.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot=Join-Path $repo ('.local\initialization01-original-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null
$assertions=0
function Assert($Value,[string]$Message){$script:assertions++;if(!$Value){throw $Message}}
Add-Type -TypeDefinition @'
using System;
namespace CodeWalker.GameFiles {
 public static class GTA5Keys {
  public static byte[] PC_AES_KEY;
  public static byte[] CapturedOriginalExecutable;
  public static int Generates,Loads;
  public static bool FailGeneration;
  public static void GenerateV2(byte[] bytes,Action<string> update) {
   Generates++;CapturedOriginalExecutable=bytes;
   if(bytes.Length!=1048576)throw new InvalidOperationException("original fixture byte count");
   if(FailGeneration)throw new InvalidOperationException("original generator failure");
   PC_AES_KEY=new byte[32]; // authored zeros, never a vendor/game capability
  }
  public static void LoadFromPath(string root,string key) {
   Loads++;if(key.Length!=44)throw new InvalidOperationException("original internal binding");
  }
  public static void SaveToPath(string path){throw new InvalidOperationException("never permitted by this orchestration");}
 }
}
'@
$helper=Join-Path $repo 'src\acoustics\startup\CodeWalkerInitialization01.psm1'
Import-Module (New-Module -Name RichAudioInitialization01Original -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($helper)))) -Force
try {
 $bytes=New-Object byte[] 1048576;$bytes[0]=37;$bytes[999999]=83
 $exe=Join-Path $fixtureRoot 'GTA5_Enhanced.exe';[IO.File]::WriteAllBytes($exe,$bytes)
 $result=Initialize-InstalledCodeWalker01 -GameRoot $fixtureRoot
 Assert ($result.Route -eq 'public-GenerateV2-explicit-Enhanced-memory-and-LoadFromPath') 'Original old-API control must select the explicit-memory Enhanced route'
 Assert ([CodeWalker.GameFiles.GTA5Keys]::Generates -eq 1 -and [CodeWalker.GameFiles.GTA5Keys]::Loads -eq 1) 'Only the two selected public API methods may execute'
 Assert (!$result.SecretValuesPersisted -and !$result.GameWrites -and !$result.EnhancedSelector) 'The old API cannot claim an Enhanced resource selector or persisted capability'
 Assert (@([CodeWalker.GameFiles.GTA5Keys]::CapturedOriginalExecutable|Where-Object {$_ -ne 0}).Count -eq 0) 'Temporary original executable bytes must be cleared after success'
 Assert (([IO.File]::ReadAllBytes($exe))[0] -eq 37) 'Read-only initialization must preserve the original fixture file'
 Assert (@(Get-ChildItem -LiteralPath $fixtureRoot -File).Count -eq 1) 'No renamed executable, bootstrap or key file may be produced'
 [CodeWalker.GameFiles.GTA5Keys]::FailGeneration=$true;$failed=$false
 try{Initialize-InstalledCodeWalker01 -GameRoot $fixtureRoot|Out-Null}catch{$failed=$true}
 Assert $failed 'Public generator failure must stop initialization'
 Assert ([CodeWalker.GameFiles.GTA5Keys]::Loads -eq 1) 'Failed generation must not continue to the loader'
 Assert (@([CodeWalker.GameFiles.GTA5Keys]::CapturedOriginalExecutable|Where-Object {$_ -ne 0}).Count -eq 0) 'Temporary original executable bytes must be cleared after failure'
 [IO.File]::WriteAllBytes($exe,[byte[]]@(1));$failed=$false
 try{Initialize-InstalledCodeWalker01 -GameRoot $fixtureRoot|Out-Null}catch{$failed=$true}
 Assert $failed 'Undersized initializer input must fail before vendor API execution'
 Assert ([CodeWalker.GameFiles.GTA5Keys]::Generates -eq 2) 'Rejected input cannot reach public generation'
 Write-Output ('CodeWalker public initialization original controls passed: '+$assertions+' assertions; no installed input or vendor software used.')
} finally {
 $absolute=[IO.Path]::GetFullPath($fixtureRoot);$expectedPrefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\initialization01-original-'
 if(!$absolute.StartsWith($expectedPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Owned original fixture cleanup path escaped'}
 Remove-Item -LiteralPath $absolute -Recurse -Force
}
