#requires -Version 7.0
[CmdletBinding()]
param([switch]$FunctionsOnly)
$ErrorActionPreference='Stop'

function Get-Menu02RecoveryDeadline {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$LaunchIntent,$StoryReady=$null,[long]$NowTicks=[Diagnostics.Stopwatch]::GetTimestamp(),[long]$Frequency=[Diagnostics.Stopwatch]::Frequency)
    $start=$LaunchIntent.monotonicStartTicks;$recordedFrequency=$LaunchIntent.monotonicFrequency
    foreach($value in @($start,$recordedFrequency)){
        if(($value-isnot[int]-and$value-isnot[long])-or$value-le0){throw 'Positive integer launch clock operands are required.'}
    }
    if($Frequency-le0-or$Frequency-gt1000000000000L-or$recordedFrequency-ne$Frequency-or$NowTicks-lt$start-or$LaunchIntent.startupLimitSeconds-ne600){throw 'Launch clock frequency, ordering or startup limit is invalid.'}
    $startup=[decimal]$start+[decimal]$Frequency*600
    $overall=[decimal]$start+[decimal]$Frequency*1500
    if($overall-gt[long]::MaxValue){throw 'Launch deadline clock overflows.'}
    $phase='startup';$deadline=$startup;$reason='startup-deadline';$observed=$null
    if($null-ne$StoryReady){
        $observed=$StoryReady.monotonicObservedTicks;$storyFrequency=$StoryReady.monotonicFrequency
        foreach($value in @($observed,$storyFrequency)){
            if(($value-isnot[int]-and$value-isnot[long])-or$value-le0){throw 'Positive integer Story Mode clock operands are required.'}
        }
        if($storyFrequency-ne$Frequency-or$observed-lt$start-or$observed-gt$NowTicks){throw 'Story Mode clock frequency or ordering is invalid.'}
        if([decimal]$observed-ge$startup){$reason='late-story-ready-cannot-extend-startup'}
        else{$phase='menu';$deadline=[Math]::Min([decimal]$observed+[decimal]$Frequency*900,$overall);$reason='menu-deadline'}
    }
    $expired=[decimal]$NowTicks-ge$deadline
    if([decimal]$NowTicks-ge$overall){$reason='overall-1500-second-limit'}
    [pscustomobject]@{phase=$phase;expired=$expired;reason=$reason;monotonicStartTicks=[long]$start;monotonicFrequency=$Frequency;deadlineTicks=[long]$deadline;overallDeadlineTicks=[long]$overall;elapsedSinceLaunchSeconds=([double]($NowTicks-$start)/$Frequency);remainingSeconds=[Math]::Max([double]0,[double]($deadline-$NowTicks)/$Frequency);storyObservedTicks=$observed;startupLimitSeconds=600;menuLimitSeconds=900;overallLimitSeconds=1500}
}
function Assert-Menu02SupervisorUnlinked([string]$Path){
    if(!$Path-or![IO.Path]::IsPathFullyQualified($Path)-or$Path-notmatch'\A[A-Za-z]:[\\/]'){throw 'Absolute supervisor path required.'}
    for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
        $item=$null
        try{$item=Get-Item -LiteralPath $at -Force -ErrorAction Stop}
        catch{if($_.Exception-isnot[Management.Automation.ItemNotFoundException]-and$_.CategoryInfo.Category-ne[Management.Automation.ErrorCategory]::ObjectNotFound){throw}}
        if($null-ne$item-and($item.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Supervisor path contains a reparse point.'}
    }
}
function Read-Menu02SupervisorJson([string]$Path){
    Assert-Menu02SupervisorUnlinked $Path
    $item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if($item.PSIsContainer-or$item.Length-gt262144){throw 'Bounded supervisor JSON file required.'}
    Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json
}
function Write-Menu02SupervisorNewJson([string]$Path,$Value){
    Assert-Menu02SupervisorUnlinked $Path
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 8))
    $file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
}
function Watch-Menu02Recovery {
    [CmdletBinding()]
    param($Manifest=$null,[Parameter(Mandatory)][string]$ManifestPath,[Parameter(Mandatory)][string]$ExpectedManifestSha256)
    $transaction=$null
    try{
        if($ExpectedManifestSha256-notmatch'\A[a-f0-9]{64}\z'){throw 'Externally pinned supervisor manifest hash required.'}
        $Manifest=Read-Menu02SupervisorJson $ManifestPath
        if((Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedManifestSha256){throw 'Supervisor manifest hash mismatch.'}
        $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
        $expectedTransaction=[IO.Path]::GetFullPath((Join-Path $repo '.local/menu02-live-02'))
        $marker=[IO.Path]::GetFullPath([string]$Manifest.launch.markerPath)
        if(![string]::Equals($marker,(Join-Path $expectedTransaction 'launch-intent.json'),[StringComparison]::OrdinalIgnoreCase)){throw 'Supervisor accepts only the new exact MENU-02 recovery transaction.'}
        Assert-Menu02SupervisorUnlinked $expectedTransaction
        if(!(Get-Item -LiteralPath $expectedTransaction -Force -ErrorAction Stop).PSIsContainer){throw 'New supervisor transaction directory is missing.'}
        $transaction=$expectedTransaction
        $forbidden=@('supervisor-ready.json','supervisor-stop.json','supervisor-complete.json','supervisor-terminal-failure.json','deadline-expired.json','launch-intent.json','restoration-started.json','restoration-complete.json','restoration-terminal-failure.json','rollback-started.json','rollback-complete.json','rollback-terminal-failure.json','test-terminal.json','deployment-terminal-failure.json','launch-terminal-failure.json')
        foreach($name in $forbidden){$path=Join-Path $transaction $name;Assert-Menu02SupervisorUnlinked $path;if(Test-Path -LiteralPath $path){throw 'Consumed or terminal transaction cannot start a supervisor.'}}
        $approvalPath=Join-Path $transaction 'approval.json';$deploymentPath=Join-Path $transaction 'deployment-complete.json'
        $approval=Read-Menu02SupervisorJson $approvalPath
        $approvalHash=(Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if($approval.schema-ne1-or$approval.kind-cne'Menu02RecoveryApproval'-or$approval.manifestSha256-cne$ExpectedManifestSha256-or$approval.approved-isnot[bool]-or!$approval.approved-or$approval.scope-cne'one-temporary-deployment-one-launch-one-session-rollback'-or$approval.launches-ne1){throw 'Fresh exact supervisor approval is required.'}
        $deployment=Read-Menu02SupervisorJson $deploymentPath
        if($deployment.schema-ne1-or$deployment.kind-cne'Menu02RecoveryDeploymentComplete'-or$deployment.manifestSha256-cne$ExpectedManifestSha256-or$deployment.approvalReceiptSha256-cne$approvalHash-or$deployment.complete-isnot[bool]-or!$deployment.complete-or$deployment.restored-isnot[bool]-or$deployment.restored){throw 'Fresh bound completed deployment is required for supervision.'}
        $frequency=[Diagnostics.Stopwatch]::Frequency;$watchStarted=[Diagnostics.Stopwatch]::GetTimestamp()
        $self=[Diagnostics.Process]::GetCurrentProcess()
        try{$creation=$self.StartTime.ToUniversalTime();$ready=[ordered]@{schema=1;kind='Menu02RecoverySupervisorReady';pid=$self.Id;processCreationUtc=$creation.ToString('o');processCreationFileTime=$creation.ToFileTimeUtc().ToString();manifestSha256=$ExpectedManifestSha256;monotonicObservedTicks=$watchStarted;monotonicFrequency=$frequency;launchWaitLimitSeconds=120;watchLimitSeconds=1680}}finally{$self.Dispose()}
        Write-Menu02SupervisorNewJson (Join-Path $transaction 'supervisor-ready.json') $ready
        $launch=$null;$story=$null
        while($true){
            $now=[Diagnostics.Stopwatch]::GetTimestamp()
            foreach($name in @('supervisor-stop.json','test-terminal.json','restoration-started.json')){
                $path=Join-Path $transaction $name;Assert-Menu02SupervisorUnlinked $path
                if(Test-Path -LiteralPath $path){Write-Menu02SupervisorNewJson (Join-Path $transaction 'supervisor-complete.json') ([ordered]@{schema=1;kind='Menu02RecoverySupervisorStopped';atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;reason=$name;monotonicObservedTicks=$now;monotonicFrequency=$frequency});return}
            }
            if(($now-$watchStarted)/[double]$frequency-ge1680){throw 'Independent 28-minute supervisor clock bound expired.'}
            if($null-eq$launch){
                Assert-Menu02SupervisorUnlinked $marker
                if(Test-Path -LiteralPath $marker){
                    $launch=Read-Menu02SupervisorJson $marker
                    if($launch.kind-cne'Menu02RecoveryLaunchIntent'-or$launch.manifestSha256-cne$ExpectedManifestSha256-or$launch.approvalReceiptSha256-cne$approvalHash-or$launch.monotonicStartTicks-lt$watchStarted){throw 'Launch intent is not fresh and bound to this ready supervisor.'}
                }elseif(($now-$watchStarted)/[double]$frequency-ge120){
                    Write-Menu02SupervisorNewJson (Join-Path $transaction 'deadline-expired.json') ([ordered]@{schema=1;kind='Menu02RecoveryDeadlineExpired';atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;reason='launch-intent-not-observed-within-120-seconds';monotonicObservedTicks=$now;monotonicFrequency=$frequency});return
                }
            }
            if($null-ne$launch){
                $storyPath=Join-Path $transaction 'story-ready.json';Assert-Menu02SupervisorUnlinked $storyPath
                if($null-eq$story-and(Test-Path -LiteralPath $storyPath)){
                    $story=Read-Menu02SupervisorJson $storyPath
                    if($story.manifestSha256-cne$ExpectedManifestSha256){throw 'Story Mode observation is not bound to the exact manifest.'}
                }
                $now=[Diagnostics.Stopwatch]::GetTimestamp()
                $deadline=Get-Menu02RecoveryDeadline -LaunchIntent $launch -StoryReady $story -NowTicks $now -Frequency $frequency
                if($deadline.expired){Write-Menu02SupervisorNewJson (Join-Path $transaction 'deadline-expired.json') ([ordered]@{schema=1;kind='Menu02RecoveryDeadlineExpired';atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;deadline=$deadline;monotonicObservedTicks=$now;monotonicFrequency=$frequency});return}
            }
            Start-Sleep -Milliseconds 500
        }
    }catch{
        $failure=$_
        if($transaction){try{Write-Menu02SupervisorNewJson (Join-Path $transaction 'supervisor-terminal-failure.json') ([ordered]@{schema=1;kind='Menu02RecoverySupervisorFailure';atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;exceptionType=$failure.Exception.GetType().FullName;message=$failure.Exception.Message;noUiInputOrProcessTermination=$true})}catch{}}
        throw $failure
    }
}
# Loading this file only defines functions. The coordinator must explicitly
# invoke Watch after fresh approval/deployment; no process, UI or kill is owned.
if($FunctionsOnly){return}
