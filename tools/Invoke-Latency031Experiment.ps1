#requires -Version 7.0
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$CandidateRoot,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovedProposalSha256,
 [Parameter(Mandatory)][string]$IndependentReviewPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$IndependentReviewSha256
)
# FUTURE separately approved execution only. Never called by preparation/CI.
$ErrorActionPreference='Stop';$root=[IO.Path]::GetFullPath($CandidateRoot).TrimEnd('\')
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
for($at=$root;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate refused'}}
$manifest=Get-Content -LiteralPath (Join-Path $root 'candidate.json') -Raw|ConvertFrom-Json
if($manifest.schema-ne2-or$manifest.kind-cne'latency-03-1-original-synthetic-endpoint-proposal'-or$manifest.clockPolicy-cne'ArrivedPositionInterval031'){throw 'Exact new031 candidate required; never reuse the consumed03 candidate'}
if((Hash (Join-Path $root 'proposal.md'))-cne$ApprovedProposalSha256-or(Hash $IndependentReviewPath)-cne$IndependentReviewSha256){throw 'Proposal/review drift; stop without regeneration or substitution'}
$review=Get-Content -LiteralPath $IndependentReviewPath -Raw|ConvertFrom-Json
if(!$review.passed-or[string]::IsNullOrWhiteSpace($review.candidateRoot)-or![IO.Path]::IsPathFullyQualified($review.candidateRoot)-or$review.candidateRoot.StartsWith('\\?\')-or$review.candidateRoot.StartsWith('\\.\')-or![string]::Equals([IO.Path]::GetFullPath($review.candidateRoot).TrimEnd('\'),$root,[StringComparison]::OrdinalIgnoreCase)){throw 'Exact independently reviewed candidate path required; no copied approval'}
foreach($binding in $manifest.bindings){$p=[IO.Path]::GetFullPath((Join-Path $root $binding.file));if(!$p.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)-or(Get-Item -LiteralPath $p).Length-ne$binding.bytes-or(Hash $p)-cne$binding.sha256){throw 'Candidate hash/length drift; stop'}}
if((Test-Path -LiteralPath (Join-Path $root 'attempt-consumed.json'))-or(Test-Path -LiteralPath (Join-Path $root 'results'))){throw 'Candidate consumed or contains prior results; no retry'}
foreach($name in @('GTA5_Enhanced','GTA5','RAGEPluginHook','RichAudio.Acoustics.Host','Latency03.Experiment')){if(Get-Process -Name $name -ErrorAction SilentlyContinue){throw 'Forbidden game/host/experiment already active'}}
& (Join-Path $root 'runtime/Latency03.Experiment.exe') --supervise-approved $root $ApprovedProposalSha256 ([IO.Path]::GetFullPath($IndependentReviewPath)) $IndependentReviewSha256
if($LASTEXITCODE-ne0){throw 'Experiment failed or evidence incomplete; preserve consumed candidate/results and do not retry'}
