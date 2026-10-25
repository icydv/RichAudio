# Own helper preflight only; no real game/parser/archive or audio endpoint.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path $repo ('.local\audio-reconstruction\guard-test-'+[guid]::NewGuid().ToString('N'))
$game=Join-Path $fixture 'fake-game';$tool=Join-Path $fixture 'fake-tool'
[IO.Directory]::CreateDirectory($game)|Out-Null
[IO.Directory]::CreateDirectory($tool)|Out-Null
[IO.File]::WriteAllText((Join-Path $tool 'CodeWalker.Core.dll'),'Original text fixture, never loaded')
$exe=Join-Path $repo 'build\audio\ExtractBati.exe'
$checks=0
foreach($case in @('game','tool','existing','no-private','wrong-parser')) {
    $out=switch($case){
        game {Join-Path $game 'forbidden'}
        tool {Join-Path $tool 'forbidden'}
        existing {Join-Path $fixture 'existing'}
        no-private {Join-Path $repo 'forbidden-audio-test-output'}
        wrong-parser {Join-Path $fixture 'wrong-parser'}
    }
    if($case -eq 'existing'){[IO.Directory]::CreateDirectory($out)|Out-Null;[IO.File]::WriteAllText((Join-Path $out 'sentinel.txt'),'unchanged')}
    & $exe $game $tool $out *> (Join-Path $fixture ($case+'.txt'))
    if($LASTEXITCODE -eq 0){throw ('Unsafe helper success: '+$case)}
    if($case -eq 'existing'){
        if((Get-Content (Join-Path $out 'sentinel.txt') -Raw) -ne 'unchanged' -or (Get-ChildItem $out).Count -ne 1){throw 'Existing output changed'}
    } elseif(Test-Path -LiteralPath $out){throw ('Failed preflight wrote output: '+$case)}
    $checks++
}
foreach($relative in @('.local/audio-reconstruction/decoded/player/disguised.txt','.local/audio-reconstruction/render/unknown.json','.local/audio-reconstruction/nested/export.wav')) {
    git -C $repo check-ignore --quiet -- $relative
    if($LASTEXITCODE -ne 0){throw 'Private nested output not ignored'};$checks++
}
Write-Output ('PASS: '+$checks+' offline extraction/publication guards; no game/parser/audio execution.')
