[CmdletBinding()]
param([ValidateSet('Status','Ready','Restore','Report','ReadyPowertrain','MutePowertrain','ResumePowertrain','RestorePowertrain')][string]$Operation='Status',
      [switch]$KnownStock, [ValidateLength(0,1024)][string]$Text='',
      [ValidateSet('VOLTIC','RCBANDITO','RA_RC_AUDIBLE','RA_RC_QUIET')][string]$Donor='VOLTIC',
      [ValidateSet('Engine','Exhaust','Horn')][string]$Cue,
      [ValidateSet('RecognisedPrivateMotor','PrivateMotorUnresolved','StockReturned','StockReturnUnresolved', IgnoreCase=$false)][string]$Finding)
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'RichAudio/AudioSwitch'
$s=Get-Content -Raw -LiteralPath "$root/status.json" | ConvertFrom-Json
$game=Get-Process -Id $s.Pid -ErrorAction SilentlyContinue
if ($s.Session -notmatch '^[a-f0-9]{32}$' -or !$game -or $game.ProcessName -ne 'GTA5_Enhanced' -or $game.StartTime.ToUniversalTime().Ticks.ToString() -ne $s.ProcessStart) { throw 'No active GTA switch session' }
if ($Operation -eq 'Status') { $s; return }
if ($Operation -in 'Ready','ReadyPowertrain' -and !$KnownStock) { throw 'Confirm this ADDER has known stock audio' }
if ($Operation -eq 'Report' -and !$Text) { throw 'Supply the original listening report' }
if ($Operation -notin 'Report','MutePowertrain','RestorePowertrain' -and (!$s.Foreground -or !$s.Engine -or !$s.Vehicle)) { throw "Idle. Foreground=$($s.Foreground). $($s.Reason)" }
if ($Finding -and $Operation -ne 'Report') { throw 'Record a listening finding with Report' }
$id=[guid]::NewGuid().ToString('N')
$dir=Join-Path $root $s.Session
$tmp=Join-Path $dir "$id.tmp"
@{Session=$s.Session;Id=$id;Generation=$s.Generation;Focus=$s.Focus;Operation=$Operation;Donor=$Donor.ToUpperInvariant();Cue=$Cue;Finding=$Finding;KnownStock=[bool]$KnownStock;Text=$Text;ExpiresTicks=[Diagnostics.Stopwatch]::GetTimestamp()+3*[Diagnostics.Stopwatch]::Frequency}|ConvertTo-Json|Out-File -Encoding utf8 -LiteralPath $tmp -NoClobber
try { [IO.File]::Move($tmp,"$dir/pending.json") } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp } }
$clock=[Diagnostics.Stopwatch]::StartNew()
while ($clock.Elapsed.TotalSeconds -lt 5) {
    if (Test-Path -LiteralPath "$dir/$id.reply") {
        $reply = (Get-Content -Raw -LiteralPath "$dir/$id.reply").Trim()
        break
    }
    Start-Sleep -Milliseconds 50
}
if (!$reply) { throw "Outcome unconfirmed. Inspect $dir for $id. No automatic resend." }
$expected = @{ReadyPowertrain='Active'; MutePowertrain='Muted'; ResumePowertrain='Active'; RestorePowertrain='Restored'}
if (!$expected.ContainsKey($Operation) -or $reply -cne 'accepted') { $reply; return }
# Host preparation and endpoint drainage continue on workers. Polling here never reissues the command.
while ($clock.Elapsed.TotalSeconds -lt 30) {
    $state = Get-Content -Raw -LiteralPath "$root/status.json" | ConvertFrom-Json
    if ($state.Session -cne $s.Session -or $state.Generation -cne $s.Generation) { throw "Target changed after $Operation. Inspect $dir for $id." }
    if ($state.PowertrainCommandId -ceq $id -and
        ($state.Powertrain -ceq $expected[$Operation] -or $state.Powertrain -cin 'Failed','Lost','Uncertain','Restored')) {
        $state | Select-Object Powertrain,PowertrainReason,Vehicle,Engine
        return
    }
    Start-Sleep -Milliseconds 100
}
throw "Completion unconfirmed for $Operation. Read Status and $dir for $id before further commands."
