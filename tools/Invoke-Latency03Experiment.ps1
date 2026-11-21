#requires -Version 7.0
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$CandidateRoot,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovedProposalSha256,
 [Parameter(Mandatory)][string]$IndependentReviewPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$IndependentReviewSha256
)
# No endpoint probing/preflight discovery. This command is solely for a future
# explicitly approved exact candidate, never called by preparation or CI.
$ErrorActionPreference='Stop';$root=[IO.Path]::GetFullPath($CandidateRoot).TrimEnd('\')
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
for($at=$root;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate refused.'}}
$manifestPath=Join-Path $root 'candidate.json';$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.kind-cne'latency-03-original-synthetic-endpoint-proposal'){throw 'Exact isolated experiment candidate required.'}
if((Hash (Join-Path $root 'proposal.md'))-cne$ApprovedProposalSha256-or(Hash $IndependentReviewPath)-cne$IndependentReviewSha256){throw 'Proposal/review drift; STOP without regenerating or substituting.'}
foreach($binding in $manifest.bindings){$p=[IO.Path]::GetFullPath((Join-Path $root $binding.file));if(!$p.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)-or(Hash $p)-cne$binding.sha256){throw 'Candidate binding drift; STOP.'}}
if((Test-Path -LiteralPath (Join-Path $root 'attempt-consumed.json'))-or(Test-Path -LiteralPath (Join-Path $root 'results'))){throw 'Candidate already consumed or contains prior results; no retry.'}
$forbidden=@('GTA5_Enhanced','GTA5','RAGEPluginHook','RichAudio.Acoustics.Host','Latency03.Experiment')
foreach($name in $forbidden){if(Get-Process -Name $name -ErrorAction SilentlyContinue){throw 'Game or audio experiment/host already active; no attempt admitted.'}}
& (Join-Path $root 'runtime/Latency03.Experiment.exe') --supervise-approved $root $ApprovedProposalSha256 ([IO.Path]::GetFullPath($IndependentReviewPath)) $IndependentReviewSha256
if($LASTEXITCODE-ne0){throw 'Experiment did not pass; preserve consumed candidate/results and do not retry.'}
