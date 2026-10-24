# Offline tests: no game or CodeWalker installation required.
[CmdletBinding()]
param([switch]$WithLocalExports,[string]$ReportPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$results=New-Object System.Collections.Generic.List[object]
function Assert-Result([bool]$Condition,[string]$Name) {
    $results.Add([pscustomobject]@{Name=$Name;Passed=$Condition})
    if (!$Condition) { throw ('FAILED: '+$Name) }
}
$required=@('README.md','ARCHITECTURE.md','GTA_AUDIO_RESEARCH.md','TOOL_COMPATIBILITY.md','TELEMETRY_MATRIX.md','ACOUSTIC_DESIGN.md','EXPERIMENT_PLAN.md','ROADMAP.md','RISKS.md','SOURCES.md')
foreach($name in $required){Assert-Result ((Get-Item -LiteralPath (Join-Path $repo $name)).Length -gt 100) ('Document: '+$name)}
foreach($file in Get-ChildItem -Path (Join-Path $repo 'tools'),$PSScriptRoot -Filter '*.ps1') {
    $tokens=$null;$errors=$null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors) | Out-Null
    Assert-Result ($errors.Count -eq 0) ('PowerShell syntax: '+$file.Name)
}
$integrity=Get-Content (Join-Path $repo 'evidence\archive-integrity.json') -Raw | ConvertFrom-Json
Assert-Result ($integrity.Count -eq 10) 'Ten physical archive evidence rows'
Assert-Result (@($integrity | Where-Object {!$_.AllObservedHashesMatch -or $_.SHA256 -notmatch '^[A-F0-9]{64}$'}).Count -eq 0) 'Stored archive before/after observations match'
$finalHashes=Get-Content (Join-Path $repo 'evidence\final-archive-check.json') -Raw | ConvertFrom-Json
Assert-Result ($finalHashes.Count -eq 10 -and @($finalHashes | Where-Object {!$_.MatchesInvestigationBaseline}).Count -eq 0) 'All ten final archive hashes match'
$rel=Get-Content (Join-Path $repo 'evidence\rel-summary.json') -Raw | ConvertFrom-Json
Assert-Result ($rel.Count -eq 45 -and @($rel | Where-Object Error).Count -eq 0) '45 distinct REL parse results without reported errors'
$trace=Get-Content (Join-Path $repo 'evidence\vehicle-trace.json') -Raw | ConvertFrom-Json
$banks=Get-Content (Join-Path $repo 'evidence\bati-awc-summary.json') -Raw | ConvertFrom-Json
Assert-Result ($trace.VehicleRecord -eq 'hash_F9300CC5' -and $trace.GranularRecord -eq 'hash_61F3BD06') 'Bati trace expected identity'
Assert-Result ($trace.Paths.Count -eq 2 -and $banks.Count -eq 2) 'Player and NPC paths plus actual parsed containers'
foreach($path in $trace.Paths){foreach($channel in $path.Channels){
    if(!$channel.Stream){continue}
    $bank=@($banks | Where-Object Path -eq $channel.ContainerMatch.Path)
    Assert-Result ($bank.Count -eq 1 -and @($bank[0].Streams | Where-Object Name -eq $channel.Stream).Count -eq 1) ('Referenced stream exists: '+$path.Layer+'/'+$channel.Stream)
}}
Assert-Result (@($banks | Where-Object Error).Count -eq 0) 'AWC parser reports no errors'
$geo=Get-Content (Join-Path $repo 'evidence\geometry-summary.json') -Raw | ConvertFrom-Json
$collision=@($geo | Where-Object Kind -eq CollisionYbn)
Assert-Result ($collision.Count -eq 1 -and $collision[0].Loaded -and @($collision[0].Nodes | Where-Object {$_.Vertices -gt 0 -and $_.Polygons -gt 0}).Count -eq 6) 'Collision summary has six populated geometry children'

# Authored minimal XML fixtures validate the tracer independently of proprietary files.
$fixture=Join-Path $repo ('.local\test-fixture-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
[IO.File]::WriteAllText((Join-Path $fixture 'update_update.rpf_common_data_levels_gta5_vehicles.meta.xml'),'<Fixture><InitDatas><Item><modelName>adder</modelName><audioNameHash /></Item></InitDatas></Fixture>')
[IO.File]::WriteAllText((Join-Path $fixture 'update_update.rpf_x64_audio_config_game.dat151.rel.xml'),'<Dat151><Items><Item type="Vehicle"><Name>hash_B779A091</Name><Engine>fixture_engine</Engine><EngineGranular>fixture_granular</EngineGranular></Item><Item type="VehicleEngineGranular"><Name>fixture_granular</Name><EngineAccel>fixture_sound</EngineAccel><ExhaustAccel>fixture_exhaust</ExhaustAccel><EngineAccelNPC>fixture_npc</EngineAccelNPC><ExhaustAccelNPC>fixture_exhaust</ExhaustAccelNPC></Item></Items></Dat151>')
[IO.File]::WriteAllText((Join-Path $fixture 'update_update.rpf_x64_audio_config_sounds.dat54.rel.xml'),'<Dat54><Items><Item type="GranularSound"><Name>fixture_sound</Name><Channel0><ContainerName>hash_8B2BACBC</ContainerName><FileName>test_signal</FileName></Channel0></Item><Item type="GranularSound"><Name>fixture_npc</Name><Channel0><ContainerName>hash_1E71436C</ContainerName><FileName>test_signal</FileName></Channel0></Item><Item type="EnvironmentSound"><Name>fixture_exhaust</Name><ChannelID value="1" /></Item></Items></Dat54>')
@([pscustomobject]@{Archive='streamed_vehicles_granular.rpf';Name='v_twin_2.awc';Path='fixture/player.awc'},[pscustomobject]@{Archive='streamed_vehicles_granular_npc.rpf';Name='v_twin_2_npc.awc';Path='fixture/npc.awc'}) | Export-Csv (Join-Path $fixture 'inventory.csv') -NoTypeInformation
$hostExe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$tracer=Join-Path $repo 'tools\Trace-VehicleAudio.ps1'
$out=Join-Path $fixture 'result.json'
& $hostExe -NoProfile -ExecutionPolicy Bypass -File $tracer -InspectionRoot $fixture -Model adder -OutputPath $out | Out-Null
Assert-Result ($LASTEXITCODE -eq 0) 'Independent authored fixture trace executes'
$fixtureResult=Get-Content -LiteralPath $out -Raw | ConvertFrom-Json
Assert-Result ($fixtureResult.VehicleRecord -eq 'hash_B779A091' -and $fixtureResult.Paths[0].Channels[0].ContainerMatch.Path -eq 'fixture/player.awc') 'Known Jenkins model hash and bank-path hash resolve'
Assert-Result ($fixtureResult.ChannelBindings.Count -eq 2) 'Exhaust channel binding retained separately'
& $hostExe -NoProfile -ExecutionPolicy Bypass -File $tracer -InspectionRoot $fixture -Model missing_model -OutputPath (Join-Path $fixture 'missing.json') *> (Join-Path $fixture 'negative-model.txt')
Assert-Result ($LASTEXITCODE -ne 0 -and !(Test-Path (Join-Path $fixture 'missing.json'))) 'Missing model fails without writing a trace'
foreach($target in @('protected-game','protected-codewalker','protected-openrpf')) {
    $fakeRoot=Join-Path $fixture $target
    $forbidden=Join-Path $fakeRoot 'forbidden'
    & $hostExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'tools\Inspect-GameAudio.ps1') -GameRoot (Join-Path $fixture 'protected-game') -CodeWalkerRoot (Join-Path $fixture 'protected-codewalker') -OpenRpfRoot (Join-Path $fixture 'protected-openrpf') -OutputRoot $forbidden *> (Join-Path $fixture ($target+'.txt'))
    Assert-Result ($LASTEXITCODE -ne 0 -and !(Test-Path $forbidden)) ('Inspector rejects output beneath '+$target)
}
if ($WithLocalExports) {
    $localOut=Join-Path $fixture 'local-trace.json'
    & $hostExe -NoProfile -ExecutionPolicy Bypass -File $tracer -OutputPath $localOut | Out-Null
    Assert-Result ($LASTEXITCODE -eq 0) 'Local actual metadata trace reruns'
    $localResult=Get-Content -LiteralPath $localOut -Raw | ConvertFrom-Json
    Assert-Result ($localResult.VehicleRecord -eq $trace.VehicleRecord -and $localResult.Paths[0].Channels[0].ContainerMatch.Path -eq $trace.Paths[0].Channels[0].ContainerMatch.Path) 'Rerun agrees with stored reference chain'
}
$ignored=@('.local/probe.xml','exports/probe.xml','probe.rpf','probe.awc','probe.rel','probe.ybn','probe.ymt','probe.meta','probe.dll','probe.asi')
foreach($name in $ignored){git -C $repo check-ignore --quiet -- $name;Assert-Result ($LASTEXITCODE -eq 0) ('Git excludes '+$name)}
$tracked=@(git -C $repo ls-files)
Assert-Result (@($tracked | Where-Object {$_ -match '(?i)(^\.local/|\.(rpf|awc|rel|ybn|ymt|meta|dll|exe|asi|wav|flac)$)'}).Count -eq 0) 'No proprietary resource or binary paths tracked'
foreach($name in $required){
    $content=Get-Content -LiteralPath (Join-Path $repo $name) -Raw
    foreach($m in [regex]::Matches($content,'\]\(([^)]+)\)')){
        $target=$m.Groups[1].Value
        if($target -match '^https?://' -or $target.StartsWith('#')){continue}
        Assert-Result (Test-Path -LiteralPath (Join-Path $repo ($target.Split('#')[0]))) ('Local link '+$name+' -> '+$target)
    }
}
$report=[ordered]@{ExecutedAtUTC=[DateTime]::UtcNow.ToString('o');Scope='Repository evidence consistency, authored offline fixture, write-boundary guards, ignore rules; not an in-game/audio test';WithLocalExports=[bool]$WithLocalExports;Passed=$true;Checks=$results.ToArray();FixtureDirectory=$fixture}
if(!$ReportPath){$ReportPath=Join-Path $repo 'evidence\validation.json'}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
Write-Output ('PASS: '+$results.Count+' checks. No runtime/acoustic integration test was performed.')
