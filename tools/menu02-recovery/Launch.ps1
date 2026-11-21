#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$ManifestPath='',
    [string]$ExpectedManifestSha256='',
    [string]$DeploymentReceiptPath='',
    [Alias('RequiredApprovedReceipt')][string]$ApprovedReceiptPath='',
    [switch]$Execute,
    [switch]$FunctionsOnly
)
$ErrorActionPreference='Stop'

function Get-Menu02LaunchFullPath([string]$Path){
    if(!$Path-or![IO.Path]::IsPathFullyQualified($Path)-or$Path-notmatch'\A[A-Za-z]:[\\/]'){throw 'An absolute fixed-drive launch path is required.'}
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}
function Assert-Menu02LaunchUnlinked([string]$Path){
    for($at=(Get-Menu02LaunchFullPath $Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
        $item=$null
        try{$item=Get-Item -LiteralPath $at -Force -ErrorAction Stop}
        catch{if($_.Exception-isnot[Management.Automation.ItemNotFoundException]-and$_.CategoryInfo.Category-ne[Management.Automation.ErrorCategory]::ObjectNotFound){throw}}
        if($null-ne$item-and($item.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Launch path contains a reparse point.'}
    }
}
function Initialize-Menu02LaunchNativeIdentity {
    if('Menu02RecoveryLaunch.NativeIdentity'-as[type]){return}
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace Menu02RecoveryLaunch {
 public static class NativeIdentity {
  [StructLayout(LayoutKind.Sequential)] struct FileInformation {
   public uint Attributes,CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh;
   public uint VolumeSerial,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle,out FileInformation info);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint capacity,uint flags);
  public static string[] ReadDirectory(string path) {
   using(var handle=CreateFile(path,0x80,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero)) {
    if(handle.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());
    FileInformation info;if(!GetFileInformationByHandle(handle,out info))throw new Win32Exception(Marshal.GetLastWin32Error());
    var final=new StringBuilder(32768);uint count=GetFinalPathNameByHandle(handle,final,32768,0);
    if(count==0||count>=32768)throw new Win32Exception(Marshal.GetLastWin32Error());
    string canonical=final.ToString();if(canonical.StartsWith(@"\\?\"))canonical=canonical.Substring(4);
    ulong index=((ulong)info.IndexHigh<<32)|info.IndexLow;
    return new[]{canonical.TrimEnd('\\'),info.VolumeSerial.ToString("x8"),index.ToString("x16")};
   }
  }
 }
}
'@
}
function Get-Menu02LaunchDirectoryIdentity([string]$Path){
    $full=Get-Menu02LaunchFullPath $Path;Assert-Menu02LaunchUnlinked $full
    $item=Get-Item -LiteralPath $full -Force
    if(!$item.PSIsContainer){throw 'Launch working directory is not a directory.'}
    Initialize-Menu02LaunchNativeIdentity
    $identity=[Menu02RecoveryLaunch.NativeIdentity]::ReadDirectory($full)
    [pscustomobject]@{canonicalPath=$identity[0];volumeSerial=$identity[1];fileId=$identity[2];exists=$true;isDirectory=$true;reparsePoint=$false}
}
function Get-Menu02LaunchMetadata([string]$Path,[string]$Kind){
    $full=Get-Menu02LaunchFullPath $Path;Assert-Menu02LaunchUnlinked $full
    if($Kind-eq'directory'){return Get-Menu02LaunchDirectoryIdentity $full}
    $item=Get-Item -LiteralPath $full -Force
    if($item.PSIsContainer){throw 'Launch executable is a directory.'}
    [pscustomobject]@{canonicalPath=$item.FullName;exists=$true;isDirectory=$false;reparsePoint=$false;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant();version=[Diagnostics.FileVersionInfo]::GetVersionInfo($full).FileVersion}
}
function Assert-Menu02LaunchIdentity {
    param([Parameter(Mandatory)]$Manifest,[scriptblock]$MetadataProvider)
    $launch=$Manifest.launch
    if($null-eq$launch){throw 'The exact manifest launch section is required.'}
    $executable=Get-Menu02LaunchFullPath ([string]$launch.executable)
    $working=Get-Menu02LaunchFullPath ([string]$launch.workingDirectory)
    if(![string]::Equals([IO.Path]::GetFileName($executable),'RAGEPluginHook.exe',[StringComparison]::OrdinalIgnoreCase)){throw 'Only the exact RPH executable name is allowed.'}
    if(![string]::Equals([IO.Path]::GetDirectoryName($executable),$working,[StringComparison]::OrdinalIgnoreCase)){throw 'RPH must run from its exact manifest installation directory.'}
    if($launch.expectedSha256-notmatch'\A[a-f0-9]{64}\z'-or$launch.expectedBytes-le0-or$launch.expectedVersion-notmatch'\A\d+\.\d+\.\d+\.\d+\z'){throw 'Exact executable hash, size and version are required.'}
    if($null-eq$launch.PSObject.Properties['arguments']-or$null-eq$launch.arguments-or@($launch.arguments).Count-ne0){throw 'The preserved original launcher arguments must be an explicit empty array.'}
    $expected=$launch.directoryIdentity
    if($null-eq$expected-or$expected.volumeSerial-notmatch'\A[a-f0-9]{8}\z'-or$expected.fileId-notmatch'\A[a-f0-9]{16}\z'-or![string]::Equals((Get-Menu02LaunchFullPath ([string]$expected.canonicalPath)),$working,[StringComparison]::OrdinalIgnoreCase)){throw 'Pinned canonical directory, volume serial and file ID are required.'}
    if(!$MetadataProvider){$MetadataProvider={param($p,$kind)Get-Menu02LaunchMetadata $p $kind}}
    $directory=& $MetadataProvider $working 'directory'
    if($directory.exists-ne$true-or$directory.isDirectory-ne$true-or$directory.reparsePoint-ne$false-or![string]::Equals([string]$directory.canonicalPath,$working,[StringComparison]::OrdinalIgnoreCase)-or$directory.volumeSerial-cne$expected.volumeSerial-or$directory.fileId-cne$expected.fileId){throw 'Launch working-directory identity mismatch.'}
    $file=& $MetadataProvider $executable 'file'
    if($file.exists-ne$true-or$file.isDirectory-ne$false-or$file.reparsePoint-ne$false-or![string]::Equals([string]$file.canonicalPath,$executable,[StringComparison]::OrdinalIgnoreCase)-or$file.sha256-cne$launch.expectedSha256-or$file.bytes-ne$launch.expectedBytes-or$file.version-cne$launch.expectedVersion){throw 'Launch executable identity mismatch.'}
    [pscustomobject]@{executable=$executable;workingDirectory=$working;file=$file;directory=$directory}
}
function New-Menu02LaunchStartInfo {
    param([Parameter(Mandatory)]$Manifest,[scriptblock]$MetadataProvider)
    $identity=Assert-Menu02LaunchIdentity -Manifest $Manifest -MetadataProvider $MetadataProvider
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$identity.executable
    $info.WorkingDirectory=$identity.workingDirectory
    $info.Arguments=''
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$false
    $info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Normal
    return $info
}
function Read-Menu02LaunchJson([string]$Path){
    Assert-Menu02LaunchUnlinked $Path
    $item=Get-Item -LiteralPath $Path -Force
    if($item.PSIsContainer-or$item.Length-gt262144){throw 'Bounded receipt/manifest file required.'}
    Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json
}
function Write-Menu02LaunchNewJson([string]$Path,$Value){
    Assert-Menu02LaunchUnlinked $Path
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 8))
    $file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
}
function Assert-Menu02LaunchDeployedState {
    param([Parameter(Mandatory)]$Manifest,[scriptblock]$ProcessProvider)
    $pins=@($Manifest.phaseExpectations.deployed)
    if($pins.Count-ne13){throw 'Exactly 13 fresh deployed protected fingerprints are required.'}
    $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach($pin in $pins){
        $path=Get-Menu02LaunchFullPath ([string]$pin.path)
        if(!$seen.Add($path)-or$pin.exists-isnot[bool]){throw 'Duplicate or malformed deployed fingerprint.'}
        Assert-Menu02LaunchUnlinked $path
        $exists=Test-Path -LiteralPath $path
        if($exists-ne$pin.exists){throw 'Deployed protected path presence changed.'}
        if($pin.exists){
            $item=Get-Item -LiteralPath $path -Force
            if($item.PSIsContainer-or$pin.sha256-notmatch'\A[a-f0-9]{64}\z'-or$item.Length-ne$pin.bytes-or(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Deployed protected fingerprint changed.'}
        }
    }
    if(!$ProcessProvider){$ProcessProvider={@(Get-Process -Name GTA5_Enhanced,GTA5,RAGEPluginHook,RichAudio.Acoustics.Host,RichAudio.AcousticGpu -ErrorAction SilentlyContinue)}}
    if(@(&$ProcessProvider).Count-ne0){throw 'GTA/RPH or a RichAudio host/GPU process is already running.'}
}
function Invoke-Menu02LaunchOnce {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ManifestPath,[Parameter(Mandatory)][string]$ExpectedManifestSha256,[string]$DeploymentReceiptPath='',[string]$ApprovedReceiptPath='',[switch]$Execute)
    if($ExpectedManifestSha256-notmatch'\A[a-f0-9]{64}\z'){throw 'An externally pinned manifest SHA-256 is required.'}
    $manifest=Read-Menu02LaunchJson $ManifestPath
    if((Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedManifestSha256){throw 'Manifest differs from its externally pinned hash.'}
    $info=New-Menu02LaunchStartInfo -Manifest $manifest
    if(!$Execute){return [pscustomobject]@{mode='preview';willStart=$false;fileName=$info.FileName;workingDirectory=$info.WorkingDirectory;arguments=@();useShellExecute=$info.UseShellExecute;createNoWindow=$info.CreateNoWindow;windowStyle=[string]$info.WindowStyle;manifestSha256=$ExpectedManifestSha256}}
    $marker=Get-Menu02LaunchFullPath ([string]$manifest.launch.markerPath)
    if([IO.Path]::GetFileName($marker)-cne'launch-intent.json'){throw 'Exact new launch-intent marker path required.'}
    $transaction=[IO.Path]::GetDirectoryName($marker)
    if(![string]::Equals((Get-Menu02LaunchFullPath $ApprovedReceiptPath),(Join-Path $transaction 'approval.json'),[StringComparison]::OrdinalIgnoreCase)-or![string]::Equals((Get-Menu02LaunchFullPath $DeploymentReceiptPath),(Join-Path $transaction 'deployment-complete.json'),[StringComparison]::OrdinalIgnoreCase)){throw 'Only the new transaction approval and deployment receipts are accepted.'}
    if(Test-Path -LiteralPath $marker){throw 'Launch marker already exists; no retry is allowed.'}
    foreach($terminal in @('restoration-started.json','restoration-complete.json','restoration-terminal-failure.json','rollback-started.json','rollback-complete.json','rollback-terminal-failure.json','test-terminal.json','deployment-terminal-failure.json','launch-terminal-failure.json')){
        if(Test-Path -LiteralPath (Join-Path $transaction $terminal)){throw 'A restoration or terminal marker forbids launch from this transaction.'}
    }
    $approval=Read-Menu02LaunchJson $ApprovedReceiptPath
    $approvalHash=(Get-FileHash -LiteralPath $ApprovedReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($approval.schema-ne1-or$approval.kind-cne'Menu02RecoveryApproval'-or$approval.manifestSha256-cne$ExpectedManifestSha256-or$approval.approved-isnot[bool]-or$approval.approved-ne$true-or$approval.scope-cne'one-temporary-deployment-one-launch-one-session-rollback'-or$approval.launches-ne1){throw 'Fresh exact one-session launch approval is required.'}
    $deployment=Read-Menu02LaunchJson $DeploymentReceiptPath
    $deploymentHash=(Get-FileHash -LiteralPath $DeploymentReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($deployment.schema-ne1-or$deployment.kind-cne'Menu02RecoveryDeploymentComplete'-or$deployment.manifestSha256-cne$ExpectedManifestSha256-or$deployment.approvalReceiptSha256-cne$approvalHash-or$deployment.complete-isnot[bool]-or$deployment.complete-ne$true-or$deployment.restored-isnot[bool]-or$deployment.restored-ne$false){throw 'New completed deployment bound to the same approval is required.'}
    # No fixture provider exists on this execution path. The coordinator pins
    # this helper and freshly verifies all protected files before invoking it.
    Assert-Menu02LaunchDeployedState -Manifest $manifest
    $info=New-Menu02LaunchStartInfo -Manifest $manifest
    Write-Menu02LaunchNewJson $marker ([ordered]@{schema=1;kind='Menu02RecoveryLaunchIntent';atUtc=[DateTime]::UtcNow.ToString('o');monotonicStartTicks=[Diagnostics.Stopwatch]::GetTimestamp();monotonicFrequency=[Diagnostics.Stopwatch]::Frequency;startupLimitSeconds=600;manifestSha256=$ExpectedManifestSha256;approvalReceiptSha256=$approvalHash;deploymentReceiptSha256=$deploymentHash;fileName=$info.FileName;workingDirectory=$info.WorkingDirectory;arguments=@();useShellExecute=$false;launches=1})
    # The create-new marker is consumed before Process.Start, including a
    # failed start. There is no fallback, shell route or automatic retry.
    $process=$null
    try{
        $process=[Diagnostics.Process]::Start($info)
        if($null-eq$process){throw 'RPH process creation returned no process.'}
        $creation=$process.StartTime.ToUniversalTime()
        $actualPath=$process.MainModule.FileName
        if(![string]::Equals($actualPath,$info.FileName,[StringComparison]::OrdinalIgnoreCase)){throw 'Created RPH process image path differs from the exact launch path.'}
        $result=[ordered]@{schema=1;kind='Menu02RecoveryLaunchResult';started=$true;atUtc=[DateTime]::UtcNow.ToString('o');pid=$process.Id;processCreationUtc=$creation.ToString('o');processCreationFileTime=$creation.ToFileTimeUtc().ToString();processPath=$actualPath;intendedWorkingDirectory=$info.WorkingDirectory;manifestSha256=$ExpectedManifestSha256;gtaStartupProven=$false}
        Write-Menu02LaunchNewJson (Join-Path $transaction 'launch-result.json') $result
        return [pscustomobject]$result
    }catch{
        Write-Menu02LaunchNewJson (Join-Path $transaction 'launch-terminal-failure.json') ([ordered]@{schema=1;atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;stage='one-process-start';exceptionType=$_.Exception.GetType().FullName;message=$_.Exception.Message;processCreated=($null-ne$process);pid=$(if($process){$process.Id}else{$null});markerConsumed=$true;retryAllowed=$false})
        throw
    }finally{if($process){$process.Dispose()}}
}
if($FunctionsOnly){return}
if(!$ManifestPath-or!$ExpectedManifestSha256){throw 'Supply the exact manifest path and externally pinned hash. Preview is the default; execution requires separate fresh receipts and -Execute.'}
Invoke-Menu02LaunchOnce -ManifestPath $ManifestPath -ExpectedManifestSha256 $ExpectedManifestSha256 -DeploymentReceiptPath $DeploymentReceiptPath -ApprovedReceiptPath $ApprovedReceiptPath -Execute:$Execute
