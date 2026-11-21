# Actual aggregate qualification entry point. A disabled proposal is never approval.
#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ApprovedConfigurationPath,
 [Parameter(Mandatory)][string]$TemplatePath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedTemplateSHA256,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedWrapperSHA256)
$ErrorActionPreference='Stop'
$qualificationRepo=Split-Path -Parent $PSScriptRoot
$qualificationWrapper=$PSCommandPath
function QualificationHash01([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
if((QualificationHash01 $qualificationWrapper)-cne$ExpectedWrapperSHA256-or(QualificationHash01 $TemplatePath)-cne$ExpectedTemplateSHA256){throw 'Exact wrapper/template identities required'}
$qualificationTemplate=[IO.Path]::GetFullPath($TemplatePath)
$qualificationApproved=[IO.Path]::GetFullPath($ApprovedConfigurationPath)
if($qualificationTemplate-ceq$qualificationApproved-or[IO.Path]::GetDirectoryName($qualificationApproved)-cne[IO.Path]::GetDirectoryName($qualificationTemplate)){throw 'New separate approval copy beside disabled template required'}
$qualificationExpected=Get-Content -LiteralPath $qualificationTemplate -Raw|ConvertFrom-Json -AsHashtable -DateKind String
$qualificationConfig=Get-Content -LiteralPath $qualificationApproved -Raw|ConvertFrom-Json -AsHashtable -DateKind String
if($qualificationExpected.ApprovedReadOnly-ne$false-or$qualificationConfig.ApprovedReadOnly-ne$true){throw 'Fresh explicit read-only approval required'}
foreach($pin in $qualificationExpected.SourcePins){
 $file=[IO.Path]::GetFullPath((Join-Path $qualificationRepo $pin.Path))
 if(!$file.StartsWith($qualificationRepo+'\',[StringComparison]::OrdinalIgnoreCase)-or(QualificationHash01 $file)-cne$pin.SHA256){throw ('Executable dependency binding changed: '+$pin.Path)}
}
# Script-relative and pinned, in dependency order. Global visibility is required
# by PreparationCoordinator's exported functions; no interactive state is used.
foreach($relative in @('src/acoustics/startup/CatalogLifecycle.psm1','src/acoustics/integration/PreparationCoordinator.psm1')){
 $file=Join-Path $qualificationRepo $relative
 if(@($qualificationExpected.SourcePins|Where-Object Path -CEQ $relative).Count-ne1){throw 'Required executable dependency pin missing'}
 Import-Module $file -Global -Force
}
foreach($name in @('Assert-CatalogPrivatePath','Get-PreparationFingerprint','ConvertTo-PreparationLiteral','Invoke-PreparationProcess')){if(!(Get-Command $name -CommandType Function -ErrorAction Stop)){throw ('Required command unavailable: '+$name)}}
$qualificationCompare=Get-Content -LiteralPath $qualificationApproved -Raw|ConvertFrom-Json -AsHashtable -DateKind String
foreach($field in @('ApprovedReadOnly','ApprovedStartUtc','ApprovedStopUtc')){[void]$qualificationExpected.Remove($field);[void]$qualificationCompare.Remove($field)}
if((Get-PreparationFingerprint $qualificationExpected)-cne(Get-PreparationFingerprint $qualificationCompare)){throw 'Approval may change only authorization and UTC window'}
$qualificationStart=[DateTimeOffset]::Parse($qualificationConfig.ApprovedStartUtc,[Globalization.CultureInfo]::InvariantCulture)
$qualificationStop=[DateTimeOffset]::Parse($qualificationConfig.ApprovedStopUtc,[Globalization.CultureInfo]::InvariantCulture)
if([DateTimeOffset]::UtcNow-lt$qualificationStart-or$qualificationStop-le$qualificationStart){throw 'Current explicit UTC window required'}
if($qualificationConfig.MaximumSeconds-ne1800-or$qualificationConfig.MaximumMemoryMiB-ne3072-or$qualificationConfig.AggregateJobMemoryMiB-ne4096){throw 'Reviewed resource limits differ'}
foreach($runtime in @($qualificationConfig.Node,$qualificationConfig.PowerShell)){if((QualificationHash01 $runtime.Path)-cne$runtime.SHA256){throw 'Pinned runtime changed'}}
$qualificationBudget=[Math]::Min(1810,[Math]::Floor(($qualificationStop-[DateTimeOffset]::UtcNow).TotalSeconds))
if($qualificationBudget-lt30){throw 'Approval window too short'}
$qualificationFolder=[IO.Path]::GetDirectoryName($qualificationTemplate)
[void](Assert-CatalogPrivatePath (Join-Path $qualificationRepo '.local') (Join-Path $qualificationFolder 'placeholder'))
$qualificationIntent=Join-Path $qualificationFolder 'qualification-wrapper-intent.json'
$qualificationIdentity=[ordered]@{schema=1;proposalIdentity=$qualificationConfig.ProposalIdentity;templateSha256=$ExpectedTemplateSHA256;wrapperSha256=$ExpectedWrapperSHA256;approvedConfigurationSha256=(QualificationHash01 $qualificationApproved);approvedStartUtc=$qualificationConfig.ApprovedStartUtc;approvedStopUtc=$qualificationConfig.ApprovedStopUtc;automaticRetry=$false}
$qualificationStream=[IO.File]::Open($qualificationIntent,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($qualificationIdentity|ConvertTo-Json));$qualificationStream.Write($bytes);$qualificationStream.Flush($true)}finally{$qualificationStream.Dispose()}
$env:RICHAUDIO_WORLD_NODE=$qualificationConfig.Node.Path
$env:RICHAUDIO_QUALIFICATION_TEMPLATE_SHA256=$ExpectedTemplateSHA256
$env:PATH=[IO.Path]::GetDirectoryName($qualificationConfig.Node.Path)+[IO.Path]::PathSeparator+$env:PATH
$qualificationCommand='& '+(ConvertTo-PreparationLiteral $qualificationConfig.Node.Path)+' '+(ConvertTo-PreparationLiteral (Join-Path $qualificationRepo 'tools/Measure-NormalWorldReadiness01.mjs'))+' --run-approved '+(ConvertTo-PreparationLiteral $qualificationApproved)+';if($LASTEXITCODE-ne0){exit $LASTEXITCODE}'
$qualificationProcess=Invoke-PreparationProcess -Executable $qualificationConfig.PowerShell.Path -CommandText $qualificationCommand -PrivateRoot $qualificationFolder -StageOutput (Join-Path $qualificationFolder 'aggregate-job') -CancellationPath (Join-Path $qualificationFolder 'cancel.request') -MaximumSeconds $qualificationBudget -MaximumMemoryMiB 4096
[ordered]@{identity=$qualificationIdentity;process=$qualificationProcess}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $qualificationFolder 'aggregate-process.json') -Encoding utf8
if(!$qualificationProcess.Completed){exit 1}
