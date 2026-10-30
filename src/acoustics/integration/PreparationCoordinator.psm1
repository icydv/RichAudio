Set-StrictMode -Version 2

function Get-PreparationHash([string]$Path) {
    $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
    finally{$stream.Dispose();$sha.Dispose()}
}

function Get-PreparationFingerprint($Value) {
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $Value -Depth 12 -Compress))
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}

function ConvertTo-PreparationLiteral([string]$Value){return "'"+$Value.Replace("'","''")+"'"}

function Get-PreparationField($Object,[string]$Name,$Default=$null) {
    if($null -eq $Object){return $Default}
    if($Object -is [Collections.IDictionary]){if($Object.Contains($Name)){return $Object[$Name]};return $Default}
    $property=$Object.PSObject.Properties[$Name]
    if($null -eq $property){return $Default};return $property.Value
}

function Test-PreparationReceipt {
    param([string]$PrivateRoot,$Receipt,[string]$Fingerprint)
    if($null -eq $Receipt -or (Get-PreparationField $Receipt 'Schema') -ne 1 -or
       (Get-PreparationField $Receipt 'Fingerprint') -cne $Fingerprint -or
       (Get-PreparationField $Receipt 'Completed') -ne $true){return $false}
    $artifacts=@(Get-PreparationField $Receipt 'Artifacts' @())
    if(!$artifacts.Count){return $false}
    foreach($artifact in $artifacts){
        try {
            $relative=[string](Get-PreparationField $artifact 'RelativePath')
            if(!$relative -or [IO.Path]::IsPathRooted($relative)){return $false}
            $path=Assert-CatalogPrivatePath $PrivateRoot ([IO.Path]::GetFullPath((Join-Path $PrivateRoot $relative)))
            if(![IO.File]::Exists($path) -or (Get-PreparationHash $path) -cne (Get-PreparationField $artifact 'SHA256')){return $false}
        }catch{return $false}
    }
    return $true
}

function Get-InstalledPreparationReadiness {
    param($CatalogSummary,$ResolvedCatalog,$GeometrySummary,[bool]$InputsStable=$false,[bool]$StagesCompleted=$false)
    $catalog=(Get-PreparationField $CatalogSummary 'Schema') -eq 1 -and
        (Get-PreparationField $CatalogSummary 'State') -eq 'reference-catalog-complete-with-explicit-gaps'
    $resolved=(Get-PreparationField $ResolvedCatalog 'Schema') -eq 1 -and
        (Get-PreparationField $ResolvedCatalog 'Stage') -eq 'codewalker-resolved-installation-model'
    $geometry=(Get-PreparationField $GeometrySummary 'Schema') -eq 1
    $vehicles=@(Get-PreparationField $ResolvedCatalog 'Vehicles' @())
    $audio=0;$granular=0;$channels=0;$verified=0;$unresolved=0;$unused=0;$channelOccurrences=0
    $seenChannels=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($vehicle in $vehicles){
        if(Get-PreparationField $vehicle 'VehicleAudioRecord'){$audio++}
        if(Get-PreparationField $vehicle 'GranularRecord'){$granular++}
        $sounds=Get-PreparationField $vehicle 'Sounds'
        $soundValues=if($sounds -is [Collections.IDictionary]){@($sounds.Values)}elseif($sounds){@($sounds.PSObject.Properties|ForEach-Object Value)}else{@()}
        foreach($sound in $soundValues){foreach($link in @(Get-PreparationField $sound 'ChannelLinks' @())){
            $channelOccurrences++
            $key=[string](Get-PreparationField $sound 'Hash')+':'+[string](Get-PreparationField $link 'Index')
            if(!$seenChannels.Add($key)){continue}
            $channels++
            # Both exact payload binding and an actual metadata table entry are
            # required; a unique candidate/alias alone does not verify a stream.
            if((Get-PreparationField $link 'AwcSHA256') -match '^[a-fA-F0-9]{64}$' -and
               (Get-PreparationField $link 'Stream') -and
               (Get-PreparationField $link 'State') -eq 'verified-installed-container-and-stream'){$verified++}
            elseif((Get-PreparationField $link 'State') -eq 'unused-channel'){$unused++}else{$unresolved++}
        }}
    }
    return [pscustomobject][ordered]@{
        PreparationCompleted=($InputsStable -and $StagesCompleted -and $catalog -and $resolved -and $geometry)
        InputsStable=$InputsStable;ReferenceCatalogPrepared=[bool]$catalog;ResolvedModelMetadataPrepared=[bool]$resolved;GeometryStagePrepared=[bool]$geometry
        VehicleModels=$vehicles.Count;ModelsWithVehicleAudioRecord=$audio;ModelsWithGranularRecord=$granular
        ChannelLinks=$channels;ModelChannelLinkOccurrences=$channelOccurrences;VerifiedBankStreamLinks=$verified;UnresolvedBankStreamLinks=$unresolved;UnusedBankStreamLinks=$unused
        GeometryProcessedResources=Get-PreparationField $GeometrySummary 'ProcessedResources' 0
        GeometryPendingResources=Get-PreparationField $GeometrySummary 'PendingResources' 0
        GeometryBlockedResources=Get-PreparationField $GeometrySummary 'BlockedResources' 0
        AllSelectedExteriorImported=((Get-PreparationField $GeometrySummary 'AllSelectedExteriorImported') -eq $true)
        FullArchiveContentFreshnessVerified=$false;CustomRuntimeMountsObserved=$false;AudioSourceCoverageComplete=$false
        DecodedSourcesReady=$false;AcousticWorldComplete=$false;StartupPluginHookImplemented=$false
        NativeAudioSuppressionVerified=$false;LiveGainChainVerified=$false;RuntimeReplacementImplemented=$false;ReadyForGameLaunch=$false
        Limitations=@('Archive size/time and loader bindings detect declared changes; same-size same-time content replacement remains unproved',
            'CodeWalker selected dictionaries are an installation model, not observed GTA runtime mounts',
            'Audio graph and stream-table mapping do not decode or validate every vehicle source family',
            'Geometry index/qualified exterior progress does not establish complete world acoustics',
            'Plugin startup, live gain chain, native suppression and restoration are not implemented by preparation')
    }
}

function Initialize-PreparationJobType {
    if('RichAudio.Preparation.OwnedJob' -as [type]){return}
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace RichAudio.Preparation {
 public sealed class OwnedJob : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcessTime,PerJobTime; public uint Flags; public UIntPtr MinWorking,MaxWorking; public uint ProcessLimit; public UIntPtr Affinity; public uint Priority,Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public Io Io; public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,IntPtr value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  IntPtr handle;
  public OwnedJob(uint processes,ulong memoryBytes) {
   handle=CreateJobObject(IntPtr.Zero,null); if(handle==IntPtr.Zero)throw new Win32Exception();
   var info=new Extended(); info.Basic.Flags=0x2000|0x8|0x200; info.Basic.ProcessLimit=processes; info.JobMemory=new UIntPtr(memoryBytes);
   int length=Marshal.SizeOf(typeof(Extended)); IntPtr data=Marshal.AllocHGlobal(length);
   try { Marshal.StructureToPtr(info,data,false); if(!SetInformationJobObject(handle,9,data,(uint)length)){int code=Marshal.GetLastWin32Error();Dispose();throw new Win32Exception(code);} }
   finally { Marshal.FreeHGlobal(data); }
  }
  public void Assign(Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new Win32Exception();}
  public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
 }
}
'@ | Out-Null
}

function Invoke-PreparationProcess {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Executable,
          [Parameter(Mandatory=$true)][string]$CommandText,
          [Parameter(Mandatory=$true)][string]$PrivateRoot,
          [Parameter(Mandatory=$true)][string]$StageOutput,
          [Parameter(Mandatory=$true)][string]$CancellationPath,
          [ValidateRange(0.1,3600)][double]$MaximumSeconds=300,
          [ValidateRange(256,4096)][int]$MaximumMemoryMiB=3072,
          [ValidateRange(2,16)][int]$MaximumOwnedProcesses=8)
    if($PSVersionTable.PSEdition -ne 'Core'){throw 'Run the preparation coordinator with installed PowerShell 7'}
    $folder=Assert-CatalogPrivatePath $PrivateRoot (Join-Path $StageOutput 'placeholder')
    [IO.Directory]::CreateDirectory($StageOutput)|Out-Null
    $cancel=Assert-CatalogPrivatePath $PrivateRoot $CancellationPath
    $stageCancel=Assert-CatalogPrivatePath $PrivateRoot (Join-Path $StageOutput 'cancel.request')
    if([IO.File]::Exists($stageCancel)){
        if([IO.File]::ReadAllText($stageCancel).StartsWith('coordinator:')){
            [IO.File]::Move($stageCancel,$stageCancel+'.acknowledged-'+[Guid]::NewGuid().ToString('N'))
        }else{throw 'Existing independent stage cancellation must be acknowledged explicitly'}
    }
    Initialize-PreparationJobType
    $job=[RichAudio.Preparation.OwnedJob]::new([uint32]$MaximumOwnedProcesses,[uint64]($MaximumMemoryMiB*1MB))
    $permit=Assert-CatalogPrivatePath $PrivateRoot (Join-Path $StageOutput ('start-permit-'+[Guid]::NewGuid().ToString('N')))
    # No stage code can create descendants until it has been assigned to the
    # kill-on-close Windows job. A stale permit is never reused.
    $gated='$permit='+(ConvertTo-PreparationLiteral $permit)+';$gate=[Diagnostics.Stopwatch]::StartNew();while(![IO.File]::Exists($permit)){if($gate.Elapsed.TotalSeconds -gt 10){throw ''Preparation start permit expired''};Start-Sleep -Milliseconds 10};'+$CommandText
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($gated))
    $process=$null;$assigned=$false;$state='failed';$watch=[Diagnostics.Stopwatch]::StartNew();$exitCode=$null
    try {
        $stdout=Assert-CatalogPrivatePath $PrivateRoot (Join-Path $StageOutput 'coordinator.stdout.log')
        $stderr=Assert-CatalogPrivatePath $PrivateRoot (Join-Path $StageOutput 'coordinator.stderr.log')
        $process=Start-Process -FilePath $Executable -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $job.Assign($process)
        $assigned=$true
        [IO.File]::WriteAllText($permit,'assigned-to-owned-job')
        $stopAt=$null
        while(!$process.HasExited){
            if(!$state -or $state -eq 'failed'){
                if([IO.File]::Exists($cancel)){$state='cancelled'}elseif($watch.Elapsed.TotalSeconds -ge $MaximumSeconds){$state='deadline'}else{Start-Sleep -Milliseconds 100;$process.Refresh();continue}
                [IO.File]::WriteAllText($stageCancel,'coordinator:'+[Guid]::NewGuid().ToString('N'))
                $stopAt=$watch.Elapsed.TotalSeconds
            }
            if($watch.Elapsed.TotalSeconds-$stopAt -ge 2){break}
            Start-Sleep -Milliseconds 100;$process.Refresh()
        }
        if($process.HasExited){$process.WaitForExit();$exitCode=$process.ExitCode;if($state -eq 'failed'){$state=if($exitCode -eq 0){'complete'}else{'failed'}}}
    } finally {
        # Closing the job also stops descendants after an early parent exit.
        $job.Dispose()
        if($process){if(!$assigned -and !$process.HasExited){$process.Kill($true)};if(!$process.HasExited){$process.WaitForExit(2000)|Out-Null};$process.Dispose()}
    }
    return [pscustomobject]@{State=$state;Completed=($state -eq 'complete');ExitCode=$exitCode;ElapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds,3);MaximumSeconds=$MaximumSeconds;CleanupGraceSeconds=2;MaximumOwnedProcesses=$MaximumOwnedProcesses;JobMemoryMiB=$MaximumMemoryMiB;Supervision='owned-Windows-job-kill-on-close-and-monotonic-deadline'}
}

Export-ModuleMember -Function Get-PreparationHash,Get-PreparationFingerprint,ConvertTo-PreparationLiteral,Get-PreparationField,Test-PreparationReceipt,Get-InstalledPreparationReadiness,Invoke-PreparationProcess
