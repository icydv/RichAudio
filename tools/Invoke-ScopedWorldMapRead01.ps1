[CmdletBinding(DefaultParameterSetName='Verify')]
param(
    [Parameter(Mandatory)][string]$Proposal,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$SealSHA256,
    [Parameter(Mandatory,ParameterSetName='Execute')][string]$FreshAuthorizationFile,
    [Parameter(Mandatory,ParameterSetName='Execute')][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$AuthorizationSHA256
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$private=Join-Path $repo '.local'
$proposalPath=[IO.Path]::GetFullPath($Proposal)
if(!$proposalPath.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'A private proposal is required'}
function Read-PlainBytes([string]$File,[long]$Maximum){
    $item=Get-Item -LiteralPath $File -Force
    if($item.PSIsContainer -or $item.Length -lt 1 -or $item.Length -gt $Maximum){throw 'Bounded review input required'}
    for($part=$item.FullName;$part;$part=Split-Path -Parent $part){
        if((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked review input'}
    }
    $bytes=[IO.File]::ReadAllBytes($item.FullName)
    if($bytes.Length -ne $item.Length){throw 'Incomplete review input'}
    return ,$bytes
}
function Get-ByteHash([byte[]]$Bytes){
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}
    finally{$algorithm.Dispose()}
}
$sealBytes=Read-PlainBytes (Join-Path $proposalPath 'review-seal.json') 65536
$sealPin=$SealSHA256.ToLowerInvariant()
if((Get-ByteHash $sealBytes) -ne $sealPin){throw 'Review seal changed'}
$seal=[Text.Encoding]::UTF8.GetString($sealBytes)|ConvertFrom-Json
$head=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $head -ne $seal.sourceCommit){throw 'Source HEAD differs from review'}
function Get-ReviewFile([string]$Name){
    $entry=$seal.$Name
    $file=[IO.Path]::GetFullPath((Join-Path $proposalPath $entry.file))
    if(!$file.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Review file outside private workspace'}
    if((Get-ByteHash (Read-PlainBytes $file 134217728)) -ne $entry.sha256){throw "Review pin changed: $Name"}
    return $file
}
$node=Get-ReviewFile 'node'
$null=Get-ReviewFile 'runner'
$runner=Join-Path $PSScriptRoot 'run-scoped-world-map-read01.mjs'
if((Get-ByteHash (Read-PlainBytes $runner 1048576)) -ne $seal.runner.sha256){throw 'Running child pin changed'}
$coordinator=Get-ReviewFile 'coordinator'
$selfHash=Get-ByteHash (Read-PlainBytes $PSCommandPath 65536)
if($selfHash -ne $seal.launcher.sha256){throw 'Running launcher pin changed'}
Import-Module (New-Module -Name ScopedWorldMapCoordinator01 -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($coordinator)))) -Force
$winPS=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
$verify=$PSCmdlet.ParameterSetName -eq 'Verify'
$output=Join-Path $proposalPath $(if($verify){'verify-'+[Guid]::NewGuid().ToString('N')}else{'execution-01'})
if(Test-Path -LiteralPath $output){throw 'An existing attempt is single-use'}
if(!$verify){
    $approvedPath=[IO.Path]::GetFullPath($FreshAuthorizationFile)
    if(!$approvedPath.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Private fresh authorization required'}
    $approval=Read-PlainBytes $approvedPath 65536
    $approvedPin=$AuthorizationSHA256.ToLowerInvariant()
    if((Get-ByteHash $approval) -ne $approvedPin -or ![Text.Encoding]::UTF8.GetString($approval).ToLowerInvariant().Contains($sealPin)){
        throw 'Fresh authorization must bind this exact seal'
    }
}
[IO.Directory]::CreateDirectory($output)|Out-Null
if(!$verify){
    $claim=[ordered]@{attempts=1;reviewSealSHA256=$sealPin;sourceCommit=$seal.sourceCommit;
        mode='metadata-only-no-new-runtime-proof';authorizationSHA256=$approvedPin;createdUtc=[DateTime]::UtcNow.ToString('o')}
    $claimBytes=[Text.Encoding]::UTF8.GetBytes(($claim|ConvertTo-Json -Compress))
    $claimFile=[IO.File]::Open((Join-Path $output 'claim.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$claimFile.Write($claimBytes,0,$claimBytes.Length)}finally{$claimFile.Dispose()}
    [IO.File]::WriteAllBytes((Join-Path $output 'authorization.txt'),$approval)
}
$mode=if($verify){'--verify-only'}else{'--owned-installed'}
$arguments=@($node,$runner,$mode,$proposalPath,$sealPin,$output)|ForEach-Object {ConvertTo-PreparationLiteral $_}
$maximum=if($verify){30}else{900}
$job=@{Executable=$winPS;CommandText=('& '+($arguments -join ' ')+';exit $LASTEXITCODE');PrivateRoot=$private;
    StageOutput=(Join-Path $output 'supervised');CancellationPath=(Join-Path $output 'cancel.request');
    MaximumSeconds=$maximum;MaximumMemoryMiB=3072;MaximumOwnedProcesses=3}
$result=Invoke-PreparationProcess @job
$result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'supervision.json') -Encoding utf8NoBOM
Get-Content -LiteralPath (Join-Path $output 'supervised/coordinator.stdout.log')
if(!$result.Completed){
    Get-Content -LiteralPath (Join-Path $output 'supervised/coordinator.stderr.log')
    throw "Scoped read stopped: $($result.State). Private result: $output"
}
