#requires -Version 7.0
# Actual resolver Json function from source; authored files only. The full
# startup rehearsal separately executes the entire resolver entry point.
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.local/resolver-publication-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$oldSource=(& git -C $repo show '26de9ed64db6e445623eb0b65207f92cb4c7abc3:tools/Resolve-InstalledGameCache.ps1')-join"`n"
[IO.File]::WriteAllText((Join-Path $root 'resolver-before.ps1'),$oldSource,[Text.UTF8Encoding]::new($false))
$worker=@'
param([string]$Repo,[string]$Root,[string]$Source,[switch]$Before,[ValidateSet('long','short-success','short-sharing-failure')][string]$Control='long')
$ErrorActionPreference='Stop'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($Source,[ref]$tokens,[ref]$errors);if($errors){throw 'Source syntax invalid'}
$function=$ast.Find({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-ceq'Json'},$true)
if(!$function){throw 'Actual resolver Json function absent'}
. ([ScriptBlock]::Create($function.Extent.Text))
$output=Join-Path $Root $(if($Control-ne'long'){$Control}elseif($Before){'old'}else{'current'});if($Control-eq'long'){while($output.Length-lt206){$n=[Math]::Min(24,206-$output.Length-1);if($n-lt1){throw 'Cannot construct exact authored path layout'};$output=Join-Path $output ('p'*$n)}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$path=Join-Path $output 'resolved-catalog.json'
$status=Join-Path $output 'status.json';$cancel=Join-Path $output 'cancel.request'
if(!$Before){$lifecycle=Join-Path $Repo 'src/acoustics/startup/CatalogLifecycle.psm1';Import-Module (New-Module -Name ResolverPublicationActual -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($lifecycle)))) -Force}
$original='{"Schema":1,"Fingerprint":"authored","Value":"original"}'
$replacement='{"Schema":1,"Fingerprint":"authored","Value":"replacement"}'
[IO.File]::WriteAllText($path,$original,[Text.UTF8Encoding]::new($false))
$errorInfo=$null;$published=$false;$held=$null;$baselineOutcome=$null
try{
 if($Control-eq'short-sharing-failure'){$held=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
 try{Json $path ([ordered]@{Schema=1;Fingerprint='authored';Value='replacement'});$published=$true}catch{$inner=$_.Exception.InnerException;$effective=if($inner){$inner}else{$_.Exception};$errorInfo=@{type=$_.Exception.GetType().FullName;message=$_.Exception.Message;innerType=$(if($inner){$inner.GetType().FullName}else{$null});hresult=('{0:x8}'-f$effective.HResult)}}
}finally{if($held){$held.Dispose()}}
if($Before){
 # Legacy long-path support is a platform observation, not a required failure.
 # A successful original writer must still publish the exact expected value;
 # a failed original writer must preserve all prior bytes.
 if($published){if([IO.File]::ReadAllText($path)-cne$replacement){throw 'Frozen original resolver success did not publish the exact expected replacement'};$baselineOutcome='published'}
 else{if([IO.File]::ReadAllText($path)-cne$original){throw 'Frozen original resolver failure did not preserve prior bytes'};$baselineOutcome='rejected-prior-preserved'}
 if($Control-eq'short-success'-and!$published){throw 'Frozen original short-path success control failed'}
 if($Control-eq'short-sharing-failure'-and$published){throw 'Frozen original exclusive-sharing failure control unexpectedly published'}
 if($Control-eq'short-sharing-failure'-and$errorInfo.hresult-cne'80070020'){throw 'Frozen original sharing control did not fail at the actual Windows sharing boundary'}
}
else{
 if(!$published-or[IO.File]::ReadAllText($path)-cne$replacement){throw 'Actual corrected resolver publication failed'}
 $outside=Join-Path $Root 'unapproved.json';$rejected=$false;try{Json $outside @{Schema=1}}catch{$rejected=$true};if(!$rejected-or[IO.File]::Exists($outside)){throw 'Resolver escaped approved output root'}
 $prior=[IO.File]::ReadAllText($path);[IO.File]::WriteAllText($cancel,'original cancellation marker');$rejected=$false;try{Json $path @{Schema=1;Value='must not publish'}}catch{$rejected=$true};if(!$rejected-or[IO.File]::ReadAllText($path)-cne$prior){throw 'Resolver cancelled data publication corrupted prior state'}
 Json $status @{Schema=1;State='cancelled';Completed=$false};if(([IO.File]::ReadAllText($status)|ConvertFrom-Json).State-cne'cancelled'){throw 'Resolver could not publish honest terminal cancellation status'}
}
$result=@{passed=$true;before=[bool]$Before;control=$Control;baselineOutcome=$baselineOutcome;historicalPathFailureReproduced=($Before-and$Control-eq'long'-and!$published-and$errorInfo.hresult-ceq'80070003');framework=$PSVersionTable.PSVersion.ToString();parentLength=$output.Length;destinationLength=$path.Length;parentExisted=$true;published=$published;firstError=$errorInfo;actualResolverFunctionSHA256=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($function.Extent.Text)))).Replace('-','').ToLowerInvariant();fixtureOnly=$true}
[IO.File]::WriteAllText((Join-Path $Root $(if($Control-ne'long'){$Control+'-result.json'}elseif($Before){'before-result.json'}else{'current-result.json'})),($result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
'@
$workerPath=Join-Path $root 'worker.ps1';[IO.File]::WriteAllText($workerPath,$worker,[Text.UTF8Encoding]::new($false))
$framework=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$cases=@(@{before=$true;control='long';label='before'},@{before=$false;control='long';label='current'},@{before=$true;control='short-success';label='short-success'},@{before=$true;control='short-sharing-failure';label='short-sharing-failure'})
$closed=@()
foreach($case in $cases){
 $before=$case.before
 $source=if($before){Join-Path $root 'resolver-before.ps1'}else{Join-Path $repo 'tools/Resolve-InstalledGameCache.ps1'}
 function Literal01($v){"'"+$v.Replace("'","''")+"'"}
 $command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+(Literal01 $workerPath)+'))) -Repo '+(Literal01 $repo)+' -Root '+(Literal01 $root)+' -Source '+(Literal01 $source)+' -Control '+(Literal01 $case.control)+$(if($before){' -Before'}else{''})
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command));$label=$case.label
 $child=Start-Process -FilePath $framework -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root ($label+'.stdout.log')) -RedirectStandardError (Join-Path $root ($label+'.stderr.log'))
 try{
  if(!$child.WaitForExit(15000)){$child.Kill();[void]$child.WaitForExit(2000);throw 'Authored resolver publisher child exceeded bound'}
  $exit=$child.ExitCode;$closed+=@{label=$label;processId=$child.Id;closed=$child.HasExited;exitCode=$exit}
  if($exit-ne0){[string]$failure=Get-Content -LiteralPath (Join-Path $root ($label+'.stderr.log')) -Raw;$excerpt=$failure.Substring(0,[Math]::Min(4096,$failure.Length));throw ('Resolver publication fixture failed at '+$label+'; retained '+$root+'; child stderr: '+$excerpt)}
 }finally{
  try{$joined=$child.HasExited;$closure=@{label=$label;processId=$child.Id;closed=$joined;exitCode=$(if($joined){$child.ExitCode}else{$null});fixtureOnly=$true};[IO.File]::WriteAllText((Join-Path $root ('child-closure-'+$label+'.json')),($closure|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))}finally{$child.Dispose()}
 }
}
@{passed=$true;root=$root;actualResolverFunctionExercised=$true;windowsFrameworkChildClosed=$true;children=$closed;fixtureOnly=$true;installedRead=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding utf8
'PASS actual resolver publication: '+(Join-Path $root 'validation.json')
