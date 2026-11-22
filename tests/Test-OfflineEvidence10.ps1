#requires -Version 7.0
[CmdletBinding()]param([string]$OutputRoot)
$ErrorActionPreference='Stop';$repo10=Split-Path $PSScriptRoot -Parent
if(!$OutputRoot){$OutputRoot=Join-Path $repo10 ('.local/world10-evidence-controls-'+[guid]::NewGuid().ToString('N'))}
$out10=[IO.Path]::GetFullPath($OutputRoot)
if(!$out10.StartsWith((Join-Path $repo10 '.local')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out10)){throw 'Fresh owned original control directory required'}
for($at10=$out10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){if((Test-Path -LiteralPath $at10)-and((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked control output refused'}}
[IO.Directory]::CreateDirectory($out10)|Out-Null
$tokens10=$null;$errors10=$null
$source10=Join-Path $repo10 'tools/Test-Offline10.ps1'
$ast10=[Management.Automation.Language.Parser]::ParseFile($source10,[ref]$tokens10,[ref]$errors10)
if($errors10.Count){throw 'Runner syntax error'}
foreach($name10 in @('Sanitize10','Tap10')){
 $function10=@($ast10.FindAll({param($node10)$node10-is[Management.Automation.Language.FunctionDefinitionAst]-and$node10.Name-eq$name10},$true))
 if($function10.Count-ne1){throw 'Exact owned evidence helper required'}
 Invoke-Expression $function10[0].Extent.Text
}
$checks10=0
function Check10([bool]$ok10,[string]$reason10){if(!$ok10){throw $reason10};$script:checks10++}
$text10=@('ok 1 - authored TAP pass','ok 2 - authored TAP skip # SKIP','# tests 2','# pass 1','# fail 0','# cancelled 0','# skipped 1',"$([char]0xFE63) authored SPEC skip (0.25ms) # SKIP","$([char]27)[32m$([char]0x2139) tests 3$([char]27)[0m","$([char]0x2139) pass 2","$([char]0x2139) fail 0","$([char]0x2139) cancelled 0","$([char]0x2139) skipped 1")-join"`r`n"
$input10=Join-Path $out10 'original-crlf.log';[IO.File]::WriteAllText($input10,$text10+"`r`n",[Text.UTF8Encoding]::new($false))
$counts10=Tap10 $input10
Check10 ($counts10.tests-eq5-and$counts10.pass-eq3-and$counts10.skipped-eq2-and$counts10.fail-eq0-and$counts10.cancelled-eq0) 'TAP and colored SPEC CRLF totals must both count'
Check10 (($counts10.skippedCases-join'|')-ceq'authored TAP skip|authored SPEC skip') 'TAP and SPEC skipped names must survive CRLF and duration formatting'
Check10 $counts10.skippedCasesComplete 'Every original skipped case must be named'
foreach($binding10 in @(@{prefix=$repo10;replacement='<repo>'},@{prefix=$env:USERPROFILE;replacement='<user>'})){
 if(!$binding10.prefix){continue}
 foreach($run10 in @(1,2,4,8,16)){
  $value10=($binding10.prefix+'\original').Replace([string][char]92,([string][char]92)*$run10)
  Check10 ((Sanitize10 $value10).Contains($binding10.replacement)) ('Known prefix with '+$run10+' backslashes must be redacted')
 }
 $mixed10=-join @(for($index10=0;$index10-lt$binding10.prefix.Length;$index10++){if($index10%2){[char]::ToUpperInvariant($binding10.prefix[$index10])}else{[char]::ToLowerInvariant($binding10.prefix[$index10])}})
 foreach($value10 in @(('file:///'+$binding10.prefix.Replace([char]92,[char]47)+'/original'),($mixed10+'\original'),(($mixed10+'\original').Replace([string][char]92,'\\//\\')))){
  Check10 ((Sanitize10 $value10).Contains($binding10.replacement)) 'Known file-URL, mixed-case and mixed-separator prefixes must be redacted'
 }
 Check10 ((Sanitize10 ('"'+$binding10.prefix+'"')).Contains($binding10.replacement)) 'A quoted complete known directory must be redacted'
}
Check10 ((Sanitize10 'X:\WhollyAuthored\Unrelated')-ceq'X:\WhollyAuthored\Unrelated') 'Unrelated paths must not be globally normalized'
if($env:USERPROFILE){$different10=$env:USERPROFILE+'-different-user\original';Check10 ((Sanitize10 $different10)-ceq$different10) 'Known profile component must not match a different user name'}
[ordered]@{kind='RichAudioOriginalRunnerEvidenceControls10';passed=$true;checks=$checks10;sourceSHA256=(Get-FileHash -LiteralPath $source10 -Algorithm SHA256).Hash.ToLowerInvariant();originalOnly=$true;gameFilesRead=$false;endpointOpened=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out10 'result.json') -Encoding utf8NoBOM
Write-Output ('PASS '+$checks10+' original runner evidence controls')
