# Actual frozen production writer; original disposable files only.
#requires -Version 7.0
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.local/catalog-publication-repro-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$baseline='26de9ed64db6e445623eb0b65207f92cb4c7abc3'
$module=Join-Path $root 'CatalogLifecycle.before.psm1';$lines=@(git -C $repo show ($baseline+':src/acoustics/startup/CatalogLifecycle.psm1'));if($LASTEXITCODE-ne0){throw 'Exact historical production writer required for reproduction'};[IO.File]::WriteAllText($module,($lines-join"`n")+"`n",[Text.UTF8Encoding]::new($false))
$worker=Join-Path $repo 'tests/fixtures/CatalogPublicationWorker01.ps1'
$pwsh=(Get-Process -Id $PID).Path;$framework=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
function Literal01([string]$Value){"'"+$Value.Replace("'","''")+"'"}
$results=@()
foreach($case in @('legacy-same-layout','core-same-layout','legacy-short-path','legacy-invalid-cache')){
 $base=Join-Path $root $case
 # Preserve the failing layout's exact absolute parent length (158), with an
 # original authored 64hex-style basename. No historical paths are followed.
 $parent=Join-Path $base ('p'*(157-$base.Length));if($case-eq'legacy-short-path'){$parent=Join-Path $base 'cache'}
 [IO.Directory]::CreateDirectory($parent)|Out-Null
 $destination=Join-Path $parent (('a'*64)+'.json');$receipt=Join-Path $root ($case+'.json')
 [IO.File]::WriteAllText($destination,$(if($case-eq'legacy-invalid-cache'){'{"Schema":1,"Fingerprint":"wrong","Value":"prior"}'}else{'{"Schema":1,"Fingerprint":"expected","Value":"prior"}'}),[Text.UTF8Encoding]::new($false))
 $command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+(Literal01 $worker)+'))) -ModulePath '+(Literal01 $module)+' -PrivateRoot '+(Literal01 $base)+' -Destination '+(Literal01 $destination)+' -ReceiptPath '+(Literal01 $receipt)
 if($case-eq'legacy-invalid-cache'){$command+=' -Operation read-invalid'}
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=if($case-eq'core-same-layout'){$pwsh}else{$framework};$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @('-NoProfile','-NonInteractive','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command)))){$info.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info;[void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();if(!$p.WaitForExit(10000)){$p.Kill($true);[void]$p.WaitForExit(2000);throw 'Original writer reproduction child exceeded bound'};$exit=$p.ExitCode;$p.Dispose();$out.Result|Set-Content -LiteralPath (Join-Path $root ($case+'.stdout.log'));$err.Result|Set-Content -LiteralPath (Join-Path $root ($case+'.stderr.log'));if($exit-ne0){throw ('Reproduction harness failed: '+$case)}
 $v=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;$results+=@{case=$case;receipt=$receipt;runtime=$v.runtime;published=$v.published;destinationLength=$v.destinationLength;parentLength=$v.parentLength;parentExistedBefore=$v.parentExistedBefore;parentExistsAfter=$v.parentExistsAfter;exception=$v.exception;beforePublishReached=($null-ne$v.beforePublish)}
}
if($results[0].exception.type-cne'System.IO.DirectoryNotFoundException'-or$results[0].exception.win32Code-ne3-or!$results[0].parentExistedBefore-or!$results[0].parentExistsAfter-or$results[0].beforePublishReached){throw 'Relevant legacy failure was not reproduced at pending create before publication'}
if(!$results[1].published-or!$results[2].published){throw 'Discriminating runtime/short-path controls failed'}
if(!$results[3].exception){throw 'Neighbour quarantine expanded-path defect not reproduced'}
$record=@{schema=1;fixtureOnly=$true;gameAccessed=$false;passed=$true;root=$root;frozenModule=$module;baselineCommit=$baseline;results=$results;mechanism='Legacy .NETFramework path handling rejects expanded pending filename270chars although precreated parent158 and published destination228 are valid; same actual writer works in PowerShellCore and shorter legacy layout';noOtherDirectoryActors=$true;childrenClosed=$true}
$record|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $root 'reproduction.json') -Encoding utf8
'Reproduction retained: '+(Join-Path $root 'reproduction.json')
