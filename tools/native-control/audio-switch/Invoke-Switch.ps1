[CmdletBinding()]
param([ValidateSet('Status','Ready','Restore','Report')][string]$Operation='Status',
      [switch]$KnownStock, [ValidateLength(0,1024)][string]$Text='')
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'RichAudio/AudioSwitch'
$s=Get-Content -Raw -LiteralPath "$root/status.json" | ConvertFrom-Json
$game=Get-Process -Id $s.Pid -ErrorAction SilentlyContinue
if ($s.Session -notmatch '^[a-f0-9]{32}$' -or !$game -or $game.ProcessName -ne 'GTA5_Enhanced' -or $game.StartTime.ToUniversalTime().Ticks.ToString() -ne $s.ProcessStart) { throw 'No active GTA switch session' }
if ($Operation -eq 'Status') { $s; return }
if ($Operation -eq 'Ready' -and !$KnownStock) { throw 'Confirm this ADDER has known stock audio' }
if ($Operation -eq 'Report' -and !$Text) { throw 'Supply the original listening report' }
if ($Operation -ne 'Report' -and (!$s.Foreground -or !$s.Engine -or !$s.Vehicle)) { throw "Idle. Foreground=$($s.Foreground). $($s.Reason)" }
$id=[guid]::NewGuid().ToString('N')
$dir=Join-Path $root $s.Session
$tmp=Join-Path $dir "$id.tmp"
@{Session=$s.Session;Id=$id;Generation=$s.Generation;Focus=$s.Focus;Operation=$Operation;KnownStock=[bool]$KnownStock;Text=$Text;ExpiresTicks=[Diagnostics.Stopwatch]::GetTimestamp()+3*[Diagnostics.Stopwatch]::Frequency}|ConvertTo-Json|Out-File -Encoding utf8 -LiteralPath $tmp -NoClobber
try { [IO.File]::Move($tmp,"$dir/pending.json") } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp } }
$clock=[Diagnostics.Stopwatch]::StartNew()
while ($clock.Elapsed.TotalSeconds -lt 5) {
    if (Test-Path -LiteralPath "$dir/$id.reply") { Get-Content -LiteralPath "$dir/$id.reply"; return }
    Start-Sleep -Milliseconds 50
}
throw "Outcome unconfirmed. Inspect $dir for $id. No automatic resend."
