# Process checks for the operator-controlled SoundMap qualification.
function Initialize-SoundMapOwnership01 {
 if('RichAudio.SoundMap.JobQuery' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace RichAudio.SoundMap {
 public sealed class JobQuery : IDisposable {
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr copy,uint access,bool inherit,uint options);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,IntPtr data,int size,IntPtr returned);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool member);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string command,out int count);
  IntPtr job;
  public JobQuery(Process supervisor,long handle) {
   if(handle<=0 || !DuplicateHandle(supervisor.Handle,new IntPtr(handle),GetCurrentProcess(),out job,4,false,0))throw new Win32Exception();
  }
  public int[] Members(){
   int size=8+IntPtr.Size*16;IntPtr data=Marshal.AllocHGlobal(size);
   try{
    if(!QueryInformationJobObject(job,3,data,size,IntPtr.Zero))throw new Win32Exception();
    int total=Marshal.ReadInt32(data),count=Marshal.ReadInt32(data,4);
    if(total!=count || count<1 || count>16)throw new InvalidOperationException("Incomplete SoundMap job population");
    int[] ids=new int[count];
    for(int i=0;i<count;i++)ids[i]=Marshal.ReadIntPtr(data,8+i*IntPtr.Size).ToInt32();
    return ids;
   }finally{Marshal.FreeHGlobal(data);}
  }
  public bool Contains(Process process){
   bool member;
   if(!IsProcessInJob(process.Handle,job,out member))throw new Win32Exception();
   return member;
  }
  public static string[] Arguments(string command){
   int count;IntPtr argv=CommandLineToArgvW(command,out count);
   if(argv==IntPtr.Zero)throw new Win32Exception();
   try{
    string[] args=new string[count];
    for(int i=0;i<count;i++)args[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv,i*IntPtr.Size));
    return args;
   }finally{LocalFree(argv);}
  }
  public void Dispose(){if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}}
 }
}
'@
}

function Read-SoundMapOwnershipReceipt01($Directory,$Name){
 $file=Join-Path $Directory $Name
 Assert-Menu02UnlinkedPath $file
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing SoundMap ownership receipt $Name"}
 Get-Content -LiteralPath $file -Raw | ConvertFrom-Json -DateKind String
}

function Get-SoundMapProfileProcesses01($Directory){
 $profile=Join-Path $Directory 'browser-profile'
 Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction Stop |
  Where-Object { $_.CommandLine -like ('*'+$profile+'*') } |
  Select-Object @{n='id';e={[int]$_.ProcessId}},Name
}

function Assert-SoundMapProcessLifetime01($Row,$ExpectedCreation){
 if(!$Row.CreationDate -or !$Row.ExecutablePath -or !$Row.CommandLine){throw 'SoundMap process identity is unavailable'}
 $p=Get-Process -Id $Row.ProcessId -ErrorAction Stop
 try{
  $started=$p.StartTime.ToUniversalTime()
  if($p.HasExited -or $p.Path -ine $Row.ExecutablePath -or
     [Math]::Abs(($started-([DateTime]$Row.CreationDate).ToUniversalTime()).TotalMilliseconds) -gt 1 -or
     ($ExpectedCreation -and $started.ToFileTimeUtc().ToString() -cne $ExpectedCreation)){
   throw 'SoundMap process lifetime differs'
  }
  return $p
 }catch{$p.Dispose();throw}
}

function Test-SoundMapArguments01($Actual,$Expected){
 if($Actual.Count -ne ($Expected.Count+1)){return $false}
 for($index=0;$index -lt $Expected.Count;$index++){
  if($Actual[$index+1] -cne $Expected[$index]){return $false}
 }
 return $true
}

function Get-SoundMapOwnedStagingProcesses01($Directory,$Intent,$Seal,$Package,[switch]$Fixture){
 Initialize-SoundMapOwnership01
 $binding=Read-SoundMapOwnershipReceipt01 $Directory 'job-ownership.json'
 $parent=Read-SoundMapOwnershipReceipt01 $Directory 'supervisor-process.json'
 $claim=Read-SoundMapOwnershipReceipt01 $Directory 'service-claim.json'
 $service=Read-SoundMapOwnershipReceipt01 $Directory 'service-process.json'
 $browser=Read-SoundMapOwnershipReceipt01 $Directory 'viewer-process.json'
 $profile=Join-Path $Directory 'browser-profile'
 Assert-Menu02UnlinkedPath $profile
 $node=Join-Path $Package 'runtime/node.exe'
 $shell=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe'
 $config=if($Fixture){Read-SoundMapOwnershipReceipt01 $Directory 'fixture-viewer.json'}else{$Seal}
 $sourceRoot=if($Fixture){Join-Path $Directory 'service-root'}else{$Package}
 $proof=Join-Path $Directory 'current-source-identity.json'
 $proofSha=(Get-FileHash -LiteralPath $proof).Hash.ToLowerInvariant()
 if($binding.schema -ne 1 -or $binding.ownerId -cne $Intent.ownerId -or $parent.ownerId -cne $Intent.ownerId -or
    $claim.ownerId -cne $Intent.ownerId -or $service.ownerId -cne $Intent.ownerId -or
    $binding.sealSHA256 -cne $Intent.sealSHA256 -or $parent.sealSHA256 -cne $Intent.sealSHA256 -or
    $claim.sealSHA256 -cne $Intent.sealSHA256 -or $claim.proofSHA256 -cne $proofSha -or
    $binding.supervisorId -ne $parent.id -or $binding.supervisorCreation -cne $parent.creation -or
    $browser.profile -cne $profile -or $browser.path -ine $Seal.browser -or $service.path -ine $node -or
    $browser.fixtureOnly -ne [bool]$Fixture){throw 'SoundMap ownership receipt binding differs'}

 $supervisor=$null;$controller=$null;$job=$null
 try{
  $supervisorRow=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$parent.id) -ErrorAction Stop
  $controllerRow=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$Intent.controllerPid) -ErrorAction Stop
  if(!$supervisorRow -or !$controllerRow -or $supervisorRow.ParentProcessId -ne $Intent.controllerPid -or
     $supervisorRow.ExecutablePath -ine $controllerRow.ExecutablePath){throw 'SoundMap supervisor parent differs'}
  $controller=Assert-SoundMapProcessLifetime01 $controllerRow $Intent.controllerCreation
  $supervisor=Assert-SoundMapProcessLifetime01 $supervisorRow $parent.creation
  $job=[RichAudio.SoundMap.JobQuery]::new($supervisor,[long]$binding.handle)
  $members=@($job.Members())
  $roots=@{}
  $roots.Add([int]$binding.workerId,[string]$binding.workerCreation)
  $roots.Add([int]$service.id,[string]$service.creationFileTime)
  $roots.Add([int]$browser.id,[string]$browser.creation)
  foreach($id in $roots.Keys){
   if($id -notin $members -or $roots[$id] -cnotmatch '^[0-9]+$'){throw 'SoundMap root escaped the supervisor job or lacks a lifetime'}
  }
  $rows=@{}
  $filter=($members | ForEach-Object {'ProcessId='+$_}) -join ' OR '
  foreach($row in Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop){
   $id=[int]$row.ProcessId
   $process=Assert-SoundMapProcessLifetime01 $row $roots[$id]
   try{
    $time=$process.StartTime.ToUniversalTime()
    if(!$job.Contains($process) -or [DateTimeOffset]::new($time).ToUnixTimeMilliseconds() -lt $Intent.startAt){
     throw 'SoundMap process is outside the live job or session lifetime'
    }
    $rows[$id]=@{id=$id;path=$row.ExecutablePath;parent=[int]$row.ParentProcessId;creation=$time.ToFileTimeUtc().ToString();
     args=[RichAudio.SoundMap.JobQuery]::Arguments($row.CommandLine)}
   }finally{$process.Dispose()}
  }
  if($rows.Count -ne $members.Count){throw 'SoundMap job member disappeared during inspection'}
  $worker=$rows[[int]$binding.workerId];$nodeRow=$rows[[int]$service.id];$browserRoot=$rows[[int]$browser.id]
  if($worker.path -ine $shell -or $worker.parent -ne $parent.id -or
     $nodeRow.path -ine $node -or $nodeRow.parent -ne $worker.id -or $browserRoot.parent -ne $worker.id){
   throw 'SoundMap job root path or ancestry differs'
  }
  $scopeHash=(Get-FileHash -LiteralPath $config.sourceScope).Hash.ToLowerInvariant()
  $nodeArgs=@((Join-Path $Package 'tools/soundmap/server.mjs'),'--root',$sourceRoot,'--port',[string]$config.port,
   '--owner',$Intent.ownerId,'--view-only-map','--operator-map','--installed-context',$config.context,
   '--map-proof-receipt',$proof,'--map-proof-sha256',$proofSha,'--map-source-scope',$config.sourceScope,
   '--map-source-sha256',$scopeHash,'--world-atlas',$config.atlas,'--world-atlas-sha256',$config.atlasSHA256)
  $profileArg='--user-data-dir='+$profile
  $browserArgs=@(('--app=http://127.0.0.1:'+$config.port),$profileArg,'--no-first-run','--no-default-browser-check','--window-size=1440,1000')
  if($Fixture){$browserArgs+=@('--headless=new','--disable-background-networking')}
  if(!(Test-SoundMapArguments01 $nodeRow.args $nodeArgs) -or !(Test-SoundMapArguments01 $browserRoot.args $browserArgs)){
   throw 'SoundMap job root command line differs'
  }
  $profileIds=@(Get-SoundMapProfileProcesses01 $Directory | ForEach-Object id)
  if(@($profileIds | Where-Object {$_ -notin $members}).Count){throw 'Unrelated browser claims the SoundMap profile'}
  $console=Join-Path ([Environment]::SystemDirectory) 'conhost.exe'
  if($Seal.consoleHost -ine $console){throw 'SoundMap system console pin differs'}
  $consoleParents=@{}
  $browserIds=@()
  foreach($row in $rows.Values | Where-Object {$_.id -notin @($worker.id,$nodeRow.id)}){
   if($row.path -ieq $console){
    $creator=$rows[$row.parent]
    if($row.parent -notin @($worker.id,$nodeRow.id,$browserRoot.id) -or
       [long]$creator.creation -gt [long]$row.creation -or $consoleParents.ContainsKey($row.parent) -or
       $row.args.Count -lt 2 -or $row.args.Count -gt 3 -or $row.args[1] -notmatch '^0x[0-9a-f]+$' -or
       ($row.args.Count -eq 3 -and $row.args[2] -cne '-ForceV1')){
     throw "SoundMap console host ancestry or command line differs for $($row.id)"
    }
    $consoleParents.Add($row.parent,$row.id)
    continue
   }
   if($row.path -ine $Seal.browser){throw "Unexpected SoundMap job member $($row.id) at $($row.path)"}
   if($profileArg -cnotin $row.args){
    $reported=@($row.args | Where-Object {$_ -like '--type=*' -or $_ -like '--user-data-dir=*'}) -join ', '
    throw "SoundMap browser profile differs for $($row.id) ($reported)"
   }
   $ancestor=$row
   while($ancestor.id -ne $browserRoot.id){
    $prior=$rows[$ancestor.parent]
    if(!$prior -or $prior.path -ine $Seal.browser -or [long]$prior.creation -ge [long]$ancestor.creation){
     throw 'SoundMap browser child ancestry differs'
    }
    $ancestor=$prior
   }
   $browserIds+=$row.id
  }
  if((($members | Sort-Object) -join ',') -cne (($job.Members() | Sort-Object) -join ',') -or $supervisor.HasExited -or $controller.HasExited){
   throw 'SoundMap job changed during inspection'
  }
  [pscustomobject]@{ownerId=$Intent.ownerId;supervisorId=$parent.id;workerId=$worker.id;serviceId=$nodeRow.id;
   browserRootId=$browserRoot.id;browserIds=@($browserIds | Sort-Object);consoleIds=@($consoleParents.Values | Sort-Object);
   members=@($rows.Values | ForEach-Object {[pscustomobject]$_} | Select-Object id,creation,path,parent | Sort-Object id)}
 }finally{
  if($job){$job.Dispose()}
  if($supervisor){$supervisor.Dispose()}
  if($controller){$controller.Dispose()}
 }
}

function Assert-SoundMapOwnedJobClosed01($Directory,$Intent){
 $joined=Read-SoundMapOwnershipReceipt01 $Directory 'supervision.json'
 $binding=Read-SoundMapOwnershipReceipt01 $Directory 'job-ownership.json'
 $parent=Read-SoundMapOwnershipReceipt01 $Directory 'supervisor-process.json'
 if($joined.ControlJoined -ne $true -or $joined.UnknownClosure -ne $false -or $joined.ownerId -cne $Intent.ownerId -or
    $joined.sealSHA256 -cne $Intent.sealSHA256 -or $joined.supervisorId -ne $parent.id -or
    $joined.supervisorCreation -cne $parent.creation -or $joined.workerId -ne $binding.workerId -or
    $joined.workerCreation -cne $binding.workerCreation -or $binding.ownerId -cne $Intent.ownerId -or
    $binding.sealSHA256 -cne $Intent.sealSHA256){throw 'Owned SoundMap closure unavailable'}
 $service=Read-SoundMapOwnershipReceipt01 $Directory 'service-process.json'
 $viewer=Read-SoundMapOwnershipReceipt01 $Directory 'viewer-process.json'
 $snapshots=@(Read-SoundMapOwnershipReceipt01 $Directory 'staging-closure.json')
 $known=@(
   @{id=$parent.id;creation=$parent.creation},
   @{id=$binding.workerId;creation=$binding.workerCreation},
   @{id=$service.id;creation=$service.creationFileTime},
   @{id=$viewer.id;creation=$viewer.creation}
  )+@($snapshots | ForEach-Object {$_.owned.members})
 foreach($identity in $known){
  $p=Get-Process -Id $identity.id -ErrorAction SilentlyContinue
  if($p){try{
   if(!$p.HasExited -and $p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ceq $identity.creation){
    throw 'Owned SoundMap closure is still active'
   }
  }finally{$p.Dispose()}}
 }
}
