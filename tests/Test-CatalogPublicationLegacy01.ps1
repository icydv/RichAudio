# Real WindowsPowerShell5.1 children, original files, unchanged production writer.
#requires -Version 7.0
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.local/catalog-publication-legacy-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$framework=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
function Literal01([string]$Value){"'"+$Value.Replace("'","''")+"'"}
function Run01([string]$Name,[string]$Command){
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$framework;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @('-NoProfile','-NonInteractive','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command)))){$info.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info;[void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();if(!$p.WaitForExit(15000)){$p.Kill($true);[void]$p.WaitForExit(2000);throw ('Authored legacy publication child exceeded bound: '+$Name)};$exit=$p.ExitCode;$p.Dispose();$out.Result|Set-Content -LiteralPath (Join-Path $root ($Name+'.stdout.log'));$err.Result|Set-Content -LiteralPath (Join-Path $root ($Name+'.stderr.log'));if($exit-ne0){throw ('Actual legacy publication fixture failed: '+$Name+'; '+$root)};return $out.Result
}
$module=Join-Path $repo 'src/acoustics/startup/CatalogLifecycle.psm1';$worker=Join-Path $repo 'tests/fixtures/CatalogPublicationWorker01.ps1';$cases=@()
foreach($case in @('same-layout-write','same-layout-quarantine')){
 $base=Join-Path $root $case;$parent=Join-Path $base ('p'*(157-$base.Length));[IO.Directory]::CreateDirectory($parent)|Out-Null;$destination=Join-Path $parent (('a'*64)+'.json');$receipt=Join-Path $root ($case+'.json')
 [IO.File]::WriteAllText($destination,'{"Schema":1,"Fingerprint":"wrong","Value":"prior"}',[Text.UTF8Encoding]::new($false))
 $command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+(Literal01 $worker)+'))) -ModulePath '+(Literal01 $module)+' -PrivateRoot '+(Literal01 $base)+' -Destination '+(Literal01 $destination)+' -ReceiptPath '+(Literal01 $receipt)
 if($case-eq'same-layout-quarantine'){$command+=' -Operation read-invalid'}
 [void](Run01 $case $command);$v=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
 if($v.exception-or!$v.parentExistedBefore-or$v.parentLength-ne158-or$v.destinationLength-ne228){throw 'Repaired legacy layout did not preserve expected path relationships'}
 if($case-eq'same-layout-write'){if(!$v.published-or$v.beforePublish.length-ne200-or$v.destinationText-notmatch'"Value":"replacement"'){throw 'Repaired writer did not publish exact complete replacement through short pending name'}}
 else{$q=@(Get-ChildItem -LiteralPath $parent -File -Filter '.invalid-*.json');if($v.destinationExists-or$q.Count-ne1-or[IO.File]::ReadAllText($q[0].FullName)-cne'{"Schema":1,"Fingerprint":"wrong","Value":"prior"}'){throw 'Repaired legacy quarantine lost exact rejected bytes'}}
 $cases+=@{case=$case;receipt=$receipt;passed=$true;runtime=$v.runtime}
}
foreach($test in @(@('existing-lifecycle','tests/Test-CatalogLifecycle.ps1','LifecycleTestScriptPath'),@('full-publication-lifecycle','tests/Test-CatalogPublication01.ps1','PublicationTestScriptPath'))){
 $file=Join-Path $repo $test[1];$command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+(Literal01 $file)+'))) -'+$test[2]+' '+(Literal01 $file);$stdout=Run01 $test[0] $command;$cases+=@{case=$test[0];passed=$true;stdout=$stdout}
}
@{schema=1;passed=$true;root=$root;cases=$cases;childrenClosed=$true;fixtureOnly=$true;gameAccessed=$false}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding utf8
'PASS actual legacy publication and lifecycle: '+(Join-Path $root 'validation.json')
