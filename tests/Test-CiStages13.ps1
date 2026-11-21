#requires -Version 7.0
# Exercise the real stage function without running either validation workload.
$ErrorActionPreference='Stop'
$repo13=Split-Path $PSScriptRoot -Parent
$Mode='authored-stage-control';$out13=Join-Path $repo13 ('.local/world13-stage-control-'+[guid]::NewGuid().ToString('N'))
$artifact13=Join-Path $out13 'artifact';[void][IO.Directory]::CreateDirectory($artifact13)
$stages13=[Collections.Generic.List[object]]::new()
$parse13=$null
$ast13=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo13 'tools/Test-Offline13.ps1'),[ref]$null,[ref]$parse13)
if($parse13.Count){throw 'Controller syntax errors'}
foreach($name13 in @('Hash13','Clean13','Stage13')){
 $definition13=$ast13.FindAll({param($node13) $node13-is[System.Management.Automation.Language.FunctionDefinitionAst]},$false)|Where-Object Name -eq $name13
 if(@($definition13).Count-ne1){throw 'Exact stage definition required'}
 Invoke-Expression $definition13.Extent.Text
}
$failed13=Stage13 'authored-first-failure' {Write-Output 'Output cannot become a truthy result';throw 'Retained intentional first failure'}
$next13=Stage13 'authored-following-stage' {Write-Output 'Independently scheduled control ran'}
if($failed13-isnot[bool]-or$failed13-or$next13-isnot[bool]-or!$next13-or$stages13.Count-ne2-or$stages13[0].passed-or!$stages13[1].passed-or$stages13[0].failure-ne'Retained intentional first failure'){throw 'Required stage failure was masked or blocked independent work'}
if(!(Test-Path -LiteralPath (Join-Path $artifact13 'authored-first-failure.tap'))){throw 'First failure log missing'}
Write-Output '{"kind":"World13StageIsolationControl","passed":true,"retainedFirstFailure":true,"followingStageRan":true}'
