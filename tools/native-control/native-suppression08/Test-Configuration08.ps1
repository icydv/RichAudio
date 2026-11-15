param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private output required'}
Import-Module (Join-Path $PSScriptRoot 'FocusConfiguration08.psm1') -Force
[IO.Directory]::CreateDirectory($out)|Out-Null
$checks=[Collections.Generic.List[string]]::new()
function Check($b,$s){if(!$b){throw $s};$checks.Add($s);Write-Output ('PASS '+$s)}
function Refuse([scriptblock]$f,$s){$failed=$false;try{&$f|Out-Null}catch{$failed=$true};Check $failed $s}
$real=Get-CurrentFocusConfiguration08 '99869854';$protected=Get-FocusHash08 $real.path;$original=[IO.File]::ReadAllBytes($real.path)
function Root($name,$value){
 $doc=Join-Path $out $name;$root=Join-Path $doc 'Rockstar Games\GTAV Enhanced';[IO.Directory]::CreateDirectory((Join-Path $root 'Profiles\DEADBEEF'))|Out-Null
 $bytes=[byte[]]$original.Clone();$p=Read-FocusBytes08 $bytes;$bytes[$p.offset]=[byte][char]([string]$value)
 [IO.File]::WriteAllBytes((Join-Path $root 'settings.xml'),$bytes)
 foreach($n in 'cfg.dat','pc_settings.bin'){[IO.File]::WriteAllText((Join-Path $root ('Profiles\DEADBEEF\'+$n)),'AUTOMATED DISPOSABLE FIXTURE')}
 return $doc
}
function Plan($c){$p=Read-FocusBytes08 ([IO.File]::ReadAllBytes($c.path));$h=[Security.Cryptography.SHA256]::Create();try{$hash=[Convert]::ToHexString($h.ComputeHash($p.bytes)).ToLowerInvariant()}finally{$h.Dispose()};@{path=$c.path;originalValue=$c.value;originalSha256=$c.sha256;preparedSha256=$hash;changeNeeded=$c.changeNeeded}}
$doc=Root 'disabled' 0;$c=Resolve-FocusConfiguration08 $doc 'DEADBEEF';$before=(Get-Item -LiteralPath $c.path).LastWriteTimeUtc.Ticks
Set-TemporaryFocus08 (Plan $c) (Join-Path $out 'disabled-receipt.json')
Check ((Get-FocusHash08 $c.path)-ceq$protected-and(Get-Item -LiteralPath $c.path).LastWriteTimeUtc.Ticks-eq$before) 'already-disabled setting has zero writes and unchanged metadata'
$doc=Root 'enabled' 1;$c=Resolve-FocusConfiguration08 $doc 'DEADBEEF';$backup=[IO.File]::ReadAllBytes($c.path);$plan=Plan $c
Set-TemporaryFocus08 $plan (Join-Path $out 'enabled-receipt.json')
$after=[IO.File]::ReadAllBytes($c.path);$diff=@(for($i=0;$i-lt$after.Length;$i++){if($after[$i]-ne$backup[$i]){$i}})
Check ($diff.Count-eq1-and$after.Length-eq$backup.Length-and(Get-FocusHash08 $c.path)-ceq$protected) 'enabled setting changes exactly one existing byte; unrelated settings and encoding exact'
[IO.File]::WriteAllBytes($c.path,$backup);Check ((Get-FocusHash08 $c.path)-ceq$plan.originalSha256) 'disposable original restores exactly'
$doc=Root 'wrong-profile' 0;Refuse {Resolve-FocusConfiguration08 $doc 'BAD0BAD0'} 'wrong Enhanced profile refused'
$doc=Root 'multiple-profiles' 0;[IO.Directory]::CreateDirectory((Join-Path $doc 'Rockstar Games\GTAV Enhanced\Profiles\BAD0BAD0'))|Out-Null
Refuse {Resolve-FocusConfiguration08 $doc 'DEADBEEF'} 'multiple profiles refused without choosing first'
$doc=Root 'conflicting-xml' 0;Copy-Item -LiteralPath (Join-Path $doc 'Rockstar Games\GTAV Enhanced\settings.xml') -Destination (Join-Path $doc 'Rockstar Games\GTAV Enhanced\settings-old.xml')
Refuse {Resolve-FocusConfiguration08 $doc 'DEADBEEF'} 'conflicting settings copy refused'
$doc=Root 'wrong-root' 0;Refuse {Resolve-FocusConfiguration08 (Join-Path $doc 'Legacy') 'DEADBEEF'} 'wrong Documents or Legacy root cannot resolve'
$text=[Text.Encoding]::UTF8.GetString($original)
foreach($case in 'missing','duplicate','malformed','nested','dtd','bad-encoding'){
 $bad=switch($case){
 'missing' {$text.Replace('<PauseOnFocusLoss value="0" />','')}
 'duplicate' {$text.Replace('<PauseOnFocusLoss value="0" />','<PauseOnFocusLoss value="0" /><PauseOnFocusLoss value="1" />')}
 'malformed' {$text.Replace('<PauseOnFocusLoss value="0" />','<PauseOnFocusLoss value="false" />')}
 'nested' {$text.Replace('<PauseOnFocusLoss value="0" />','<outer><PauseOnFocusLoss value="0" /></outer>')}
 'dtd' {$text.Replace('<Settings>','<!DOCTYPE Settings [<!ENTITY x "1">]><Settings>')}
 'bad-encoding' {$text.Replace('encoding="UTF-8"','encoding="UTF-16"')}
 }
 Refuse {Read-FocusBytes08 ([Text.Encoding]::UTF8.GetBytes($bad))} ('reject '+$case+' setting')
}
$bom=[byte[]](@(239,187,191)+@($original));$parsed=Read-FocusBytes08 $bom;Check ($parsed.bytes[0]-eq239-and$parsed.bytes.Length-eq$bom.Length) 'UTF-8 BOM retained'
$doc=Root 'concurrent-edit' 1;$c=Resolve-FocusConfiguration08 $doc 'DEADBEEF';$plan=Plan $c;[IO.File]::AppendAllText($c.path,' ')
Refuse {Set-TemporaryFocus08 $plan (Join-Path $out 'unexpected-receipt.json')} 'unexpected edit refuses before modification'
Check (!(Test-Path -LiteralPath (Join-Path $out 'unexpected-receipt.json'))) 'interrupted or refused write creates no success receipt'
Check ((Get-FocusHash08 $real.path)-ceq$protected) 'actual active configuration unchanged'
@{passed=$true;schema='NativeSuppression08ConfigurationFixtures';checks=@($checks);activeConfigurationWritten=$false;gameLaunched=$false;runtimeHonoursSetting=$false;artifacts=@(@{path=(Join-Path $PSScriptRoot 'FocusConfiguration08.psm1');sha256=(Get-FocusHash08 (Join-Path $PSScriptRoot 'FocusConfiguration08.psm1'))},@{path=$PSCommandPath;sha256=(Get-FocusHash08 $PSCommandPath)})}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
