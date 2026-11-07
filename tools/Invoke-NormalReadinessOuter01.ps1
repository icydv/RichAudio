# Actual inner measurement wrapper; imports definitions before creating its Job.
#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BindingPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedBindingSHA256,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedWrapperSHA256)
$ErrorActionPreference='Stop'
$outerRepo=Split-Path -Parent $PSScriptRoot
function OuterHash01([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
if((OuterHash01 $PSCommandPath)-cne$ExpectedWrapperSHA256-or(OuterHash01 $BindingPath)-cne$ExpectedBindingSHA256){throw 'Exact inner wrapper/binding identities required'}
$outerBinding=Get-Content -LiteralPath $BindingPath -Raw|ConvertFrom-Json
foreach($pin in $outerBinding.SourcePins){$file=[IO.Path]::GetFullPath((Join-Path $outerRepo $pin.Path));if(!$file.StartsWith($outerRepo+'\',[StringComparison]::OrdinalIgnoreCase)-or(OuterHash01 $file)-cne$pin.SHA256){throw 'Inner executable dependency binding changed'}}
foreach($relative in @('src/acoustics/startup/CatalogLifecycle.psm1','src/acoustics/integration/PreparationCoordinator.psm1')){
 if(@($outerBinding.SourcePins|Where-Object Path -CEQ $relative).Count-ne1){throw 'Required inner dependency pin missing'}
 Import-Module (Join-Path $outerRepo $relative) -Global -Force
}
foreach($name in @('Assert-CatalogPrivatePath','ConvertTo-PreparationLiteral','Invoke-PreparationProcess')){[void](Get-Command $name -CommandType Function -ErrorAction Stop)}
foreach($check in $outerBinding.Software){if((OuterHash01 $check.Path)-cne$check.SHA256){throw 'Approved software identity changed; no initializer started'}}
[void](Assert-CatalogPrivatePath (Join-Path $outerRepo '.local') $BindingPath)
if($outerBinding.MaximumMemoryMiB-ne3072-or$outerBinding.MaximumSeconds-lt1-or$outerBinding.MaximumSeconds-gt1800){throw 'Inner resource limits differ'}
$env:RICHAUDIO_WORLD_START_UTC=$outerBinding.EpochUtc
$outerProcess=Invoke-PreparationProcess -Executable (Get-Process -Id $PID).Path -CommandText $outerBinding.CommandText -PrivateRoot $outerBinding.PrivateRoot -StageOutput $outerBinding.StageOutput -CancellationPath $outerBinding.CancellationPath -MaximumSeconds $outerBinding.MaximumSeconds -MaximumMemoryMiB 3072
[ordered]@{templateSha256=$outerBinding.TemplateSHA256;proposalIdentity=$outerBinding.ProposalIdentity;bindingSha256=$ExpectedBindingSHA256;wrapperSha256=$ExpectedWrapperSHA256;process=$outerProcess}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $outerBinding.IdentityReceiptPath -Encoding utf8
$outerProcess|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $outerBinding.ReceiptPath -Encoding utf8
if(!$outerProcess.Completed){exit 1}
