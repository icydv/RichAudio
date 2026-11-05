#requires -Version 7.0
# Actual resolver Json function from source; authored files only. The full
# startup rehearsal separately executes the entire resolver entry point.
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.local/resolver-publication-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$oldSource=(& git -C $repo show '26de9ed64db6e445623eb0b65207f92cb4c7abc3:tools/Resolve-InstalledGameCache.ps1')-join"`n"
[IO.File]::WriteAllText((Join-Path $root 'resolver-before.ps1'),$oldSource,[Text.UTF8Encoding]::new($false))
$worker=@'
param([string]$Repo,[string]$Root,[string]$Source,[switch]$Before)
$ErrorActionPreference='Stop'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($Source,[ref]$tokens,[ref]$errors);if($errors){throw 'Source syntax invalid'}
$function=$ast.Find({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-ceq'Json'},$true)
if(!$function){throw 'Actual resolver Json function absent'}
. ([ScriptBlock]::Create($function.Extent.Text))
$output=Join-Path $Root $(if($Before){'old'}else{'current'});while($output.Length-lt206){$n=[Math]::Min(24,206-$output.Length-1);if($n-lt1){throw 'Cannot construct exact authored path layout'};$output=Join-Path $output ('p'*$n)}
[IO.Directory]::CreateDirectory($output)|Out-Null
$path=Join-Path $output 'resolved-catalog.json'
$status=Join-Path $output 'status.json';$cancel=Join-Path $output 'cancel.request'
if(!$Before){$lifecycle=Join-Path $Repo 'src/acoustics/startup/CatalogLifecycle.psm1';Import-Module (New-Module -Name ResolverPublicationActual -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($lifecycle)))) -Force}
$original='{"Schema":1,"Fingerprint":"authored","Value":"original"}'
[IO.File]::WriteAllText($path,$original,[Text.UTF8Encoding]::new($false))
$errorInfo=$null;$published=$false
try{Json $path ([ordered]@{Schema=1;Fingerprint='authored';Value='replacement'});$published=$true}catch{$errorInfo=@{type=$_.Exception.GetType().FullName;message=$_.Exception.Message;innerType=$_.Exception.InnerException.GetType().FullName;hresult=('{0:x8}'-f$_.Exception.InnerException.HResult)}}
if($Before){if($published-or[IO.File]::ReadAllText($path)-cne$original){throw 'Frozen original resolver failure did not preserve prior bytes'}}
else{
 if(!$published-or([IO.File]::ReadAllText($path)|ConvertFrom-Json).Value-cne'replacement'){throw 'Actual corrected resolver publication failed'}
 $outside=Join-Path $Root 'unapproved.json';$rejected=$false;try{Json $outside @{Schema=1}}catch{$rejected=$true};if(!$rejected-or[IO.File]::Exists($outside)){throw 'Resolver escaped approved output root'}
 $prior=[IO.File]::ReadAllText($path);[IO.File]::WriteAllText($cancel,'original cancellation marker');$rejected=$false;try{Json $path @{Schema=1;Value='must not publish'}}catch{$rejected=$true};if(!$rejected-or[IO.File]::ReadAllText($path)-cne$prior){throw 'Resolver cancelled data publication corrupted prior state'}
 Json $status @{Schema=1;State='cancelled';Completed=$false};if(([IO.File]::ReadAllText($status)|ConvertFrom-Json).State-cne'cancelled'){throw 'Resolver could not publish honest terminal cancellation status'}
}
$result=@{passed=$true;before=[bool]$Before;framework=$PSVersionTable.PSVersion.ToString();parentLength=$output.Length;destinationLength=$path.Length;parentExisted=$true;published=$published;firstError=$errorInfo;actualResolverFunctionSHA256=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($function.Extent.Text)))).Replace('-','').ToLowerInvariant();fixtureOnly=$true}
[IO.File]::WriteAllText((Join-Path $Root $(if($Before){'before-result.json'}else{'current-result.json'})),($result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
'@
$workerPath=Join-Path $root 'worker.ps1';[IO.File]::WriteAllText($workerPath,$worker,[Text.UTF8Encoding]::new($false))
$framework=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
foreach($before in @($true,$false)){
 $source=if($before){Join-Path $root 'resolver-before.ps1'}else{Join-Path $repo 'tools/Resolve-InstalledGameCache.ps1'}
 function Literal01($v){"'"+$v.Replace("'","''")+"'"}
 $command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+(Literal01 $workerPath)+'))) -Repo '+(Literal01 $repo)+' -Root '+(Literal01 $root)+' -Source '+(Literal01 $source)+$(if($before){' -Before'}else{''})
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command));$label=if($before){'before'}else{'current'}
 $child=Start-Process -FilePath $framework -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root ($label+'.stdout.log')) -RedirectStandardError (Join-Path $root ($label+'.stderr.log'))
 if(!$child.WaitForExit(15000)){$child.Kill();[void]$child.WaitForExit(2000);throw 'Authored resolver publisher child exceeded bound'};if($child.ExitCode-ne0){throw ('Resolver publication fixture failed; retained '+$root)};$child.Dispose()
}
@{passed=$true;root=$root;actualResolverFunctionExercised=$true;windowsFrameworkChildClosed=$true;fixtureOnly=$true;installedRead=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding utf8
'PASS actual resolver publication: '+(Join-Path $root 'validation.json')
