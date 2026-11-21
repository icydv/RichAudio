#requires -Version 7.0
param([ValidateSet('Pins','Verify','Service')][string]$Mode='Verify',[Parameter(Mandatory)][string]$SealSHA256,[string]$FixtureName)
$ErrorActionPreference='Stop'
$q=$PSScriptRoot
$repo=[IO.Path]::GetFullPath((Join-Path $q '../../..'))
function AtlasHash($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function J($p){Get-Content -LiteralPath $p -Raw | ConvertFrom-Json -DateKind String}
function Save($p,$v){$f=[IO.File]::Open($p,'CreateNew');try{$b=[Text.Encoding]::UTF8.GetBytes(($v|ConvertTo-Json -Depth 24));$f.Write($b);$f.Flush($true)}finally{$f.Dispose()}}
function Pin($p,$bytes,$sha,[switch]$SystemConsole){
 for($a=$p;$a;$a=[IO.Path]::GetDirectoryName($a)){if((Get-Item -LiteralPath $a -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked input: $a"}}
 $f=Get-Item -LiteralPath $p -Force
 $allowedLink=$SystemConsole -and $f.LinkType -ceq 'HardLink' -and $p -ieq (Join-Path ([Environment]::SystemDirectory) 'conhost.exe')
 if($f.PSIsContainer -or ($f.LinkType -and !$allowedLink) -or $f.Length -le 0 -or $f.Length -gt 134217728 -or ($bytes -and $bytes -ne $f.Length) -or (AtlasHash $p) -cne $sha){throw "Exact review pin differs: $p"}
}
$sealPath=Join-Path $q 'review-seal.json';Pin $sealPath 0 $SealSHA256
$s=J $sealPath
if($s.approved -ne $false -or $s.policy -cne 'operator-controlled' -or $s.sourceCommit -cne (git -C $repo rev-parse HEAD).Trim() -or
 (git -C $repo branch --show-current).Trim() -cne 'feature/street-01-integrated-presence' -or
 (@(git -C $repo status --porcelain=v1 --untracked-files=no) -join '|') -cne ' M tools/Build-Menu02.ps1'){throw 'Exact disabled source or workspace differs'}
foreach($pin in $s.pins){Pin $pin.path $pin.bytes $pin.sha256 -SystemConsole:($pin.path -ieq $s.consoleHost)}
if($Mode -ceq 'Pins'){return @{pins=$s.pins.Count;source=$s.sourceCommit;protectedAccess=0}}
$node=Join-Path $q 'package/runtime/node.exe'
$catalog=Join-Path $repo 'src/acoustics/startup/CatalogLifecycle.psm1'
$coordinator=Join-Path $repo 'src/acoustics/integration/PreparationCoordinator.psm1'
Import-Module (New-Module -Name AtlasOwnedCatalog01 -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($catalog)))) -Global -Force
Import-Module (New-Module -Name AtlasOwnedCoordinator01 -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($coordinator)))) -Global -Force
$exe=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe'
$private=Join-Path $repo '.local'
if($Mode -ceq 'Verify'){
 $out=Join-Path $q ('verify-'+[guid]::NewGuid().ToString('N'));$null=[IO.Directory]::CreateDirectory($out)
 $args01=@($node,(Join-Path $q 'package/tools/soundmap/verify-map-source01.mjs'),'verify',$s.sourceScope,(AtlasHash $s.sourceScope))|ForEach-Object{ConvertTo-PreparationLiteral $_}
 $r=Invoke-PreparationProcess -Executable $exe -CommandText ('& '+($args01 -join ' ')+'; exit $LASTEXITCODE') -PrivateRoot $private -StageOutput (Join-Path $out 'supervised') -CancellationPath (Join-Path $out 'cancel.request') -MaximumSeconds 45 -MaximumMemoryMiB 1536 -MaximumOwnedProcesses 3
 if(!$r.Completed -or !$r.ControlJoined){throw 'Zero-read verifier did not complete and join'}
 $log=Get-Content -LiteralPath (Join-Path $out 'supervised/coordinator.stdout.log') -Raw | ConvertFrom-Json
 if($log.protectedPathsAccessed -ne 0 -or $log.archiveContentBytesRead -ne 0 -or $log.archives -ne 123){throw 'Zero-read verifier evidence differs'}
 Save (Join-Path $out 'verification.json') @{sealSHA256=$SealSHA256;source=$s.sourceCommit;pins=$s.pins.Count;scope=$log;supervision=$r}
 Get-Content -LiteralPath (Join-Path $out 'verification.json') -Raw
 return
}
$out=Join-Path $q 'execution-01'
if($FixtureName){
 if($FixtureName -cnotmatch '^fixture-[a-f0-9]{32}$'){throw 'Invalid fixture identity'}
 $out=Join-Path $q $FixtureName
 $fixture=J (Join-Path $out 'fixture-only.json')
 if($fixture.kind -cne 'SoundMapOrchestrationFixture01' -or $fixture.installedAccessAllowed -ne $false){throw 'Disposable fixture only'}
}
$intent=J (Join-Path $out 'execution-intent.json')
$approval=J (Join-Path $out 'service-approval.json')
$proofPath=Join-Path $out 'current-source-identity.json'
$stage=J (Join-Path $out 'staging-complete.json')
$dispatch=J (Join-Path $out 'viewer-start-intent.json')
if($stage.ownerId -cne $intent.ownerId -or $stage.sealSHA256 -cne $SealSHA256 -or
 $stage.deployedSHA256 -cne (AtlasHash (Join-Path $out 'transaction/deployed.json')) -or
 $dispatch.ownerId -cne $intent.ownerId -or $dispatch.sealSHA256 -cne $SealSHA256 -or
 $dispatch.stagingSHA256 -cne (AtlasHash (Join-Path $out 'staging-complete.json'))){throw 'Exact completed staging required before viewer startup'}
$proof=J $proofPath;$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if($intent.sealSHA256 -cne $SealSHA256 -or $intent.policy -cne 'operator-controlled' -or $null -ne $intent.stopAt -or
 $intent.ownerId -cnotmatch '^[a-f0-9]{32}$' -or $intent.ownerId -cne $approval.ownerId -or $proof.ownerId -cne $intent.ownerId -or
 $approval.sealSHA256 -cne $SealSHA256 -or $approval.proofSHA256 -cne (AtlasHash $proofPath) -or $proof.policy -cne 'operator-controlled' -or $null -ne $proof.stopAt -or
 $now -lt $proof.checkedAt -or $now-$proof.checkedAt -ge 120000){throw 'Fresh exact single-use service proof required'}
if(!$FixtureName -and ((AtlasHash (Join-Path $out 'authorization.txt')) -cne $intent.authorizationSHA256 -or
 !(Get-Content -LiteralPath (Join-Path $out 'authorization.txt') -Raw).Contains($SealSHA256))){throw 'Explicit seal authorization required'}
Save (Join-Path $out 'service-claim.json') @{policy='operator-controlled';sealSHA256=$SealSHA256;proofSHA256=$approval.proofSHA256;ownerId=$intent.ownerId}
$worker=Join-Path $q 'Run-OwnedViewer.ps1'
$parts=@($q,$out,$SealSHA256)|ForEach-Object{ConvertTo-PreparationLiteral $_}
$read='$ErrorActionPreference=''Stop'';$b=[IO.File]::ReadAllBytes('+(ConvertTo-PreparationLiteral $worker)+');'
$bind='$h=[Security.Cryptography.SHA256]::Create();try{$pin=[BitConverter]::ToString($h.ComputeHash($b)).Replace(''-'','''').ToLowerInvariant()}finally{$h.Dispose()};'
$command=$read+$bind+'if($pin -cne '+(ConvertTo-PreparationLiteral (AtlasHash $worker))+'){throw ''Owned viewer script pin differs''};& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString($b))) '+($parts -join ' ')+$(if($FixtureName){' -Fixture'}else{''})+'; if($?){exit 0}else{exit 1}'
$ownership=@{schema=1;ownerId=$intent.ownerId;sealSHA256=$SealSHA256;supervisorId=$PID;
 supervisorCreation=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}
$r=Invoke-PreparationProcess -Executable $exe -CommandText $command -PrivateRoot $private -StageOutput (Join-Path $out 'supervised') -CancellationPath (Join-Path $out 'cancel.request') -OperatorControlled -MaximumMemoryMiB 3072 -MaximumOwnedProcesses 16 -OnOwnedJobReady {
 param($handle,$process)
 $ownership.handle=$handle
 $ownership.workerId=$process.Id
 $ownership.workerCreation=$process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()
 Save (Join-Path $out 'job-ownership.json') $ownership
}
foreach($key in 'ownerId','sealSHA256','supervisorId','supervisorCreation','workerId','workerCreation'){
 $r | Add-Member -NotePropertyName $key -NotePropertyValue $ownership[$key]
}
Save (Join-Path $out 'supervision.json') $r
if(!$r.ControlJoined -or !$r.Completed){throw ('Owned viewer/service completion failed: '+$r.State)}
