#requires -Version 7.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'playable/QualificationTransaction01.ps1')
$root=Join-Path (Split-Path -Parent $PSScriptRoot) ('.local/qualification-transaction-fixture-'+[guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($root)
foreach($kind in @('phase1','marker-a')){
 $pack=if($kind -ceq 'marker-a'){'raprobe_0123abcd'}else{''}
 $fixture=Join-Path $root $kind
 $game=Join-Path $fixture 'disposable-install'
 $null=[IO.Directory]::CreateDirectory((Join-Path $game 'Plugins'))
 $startup=Join-Path $game 'startup.rphs'
 [IO.File]::WriteAllText($startup,'fixture startup')
 $protectedHash=Digest $startup
 $relative=@(Get-QualificationTargets01 $kind $pack)
 $plan=@()
 for($i=0;$i -lt $relative.Count;$i++){
  $target=Safe-Path $game $relative[$i]
  $existing=$i -eq 0 -or ($kind -ceq 'phase1' -and $i -eq 1)
  if($existing){[IO.File]::WriteAllText($target,"original $i")}
  $original=Get-Menu02RestoreFileState $target
  $payload=Join-Path $fixture "payload-$i"
  [IO.File]::WriteAllText($payload,"candidate $i")
  $plan+=@{relative=$relative[$i];source=$payload;bytes=(Get-Item -LiteralPath $payload).Length;sha256=(Digest $payload)
   originalExists=$existing;originalSha256=$original.sha256;originalBytes=$original.bytes}
 }
 $originalCheck={
  if((Digest $startup) -cne $protectedHash){return $false}
  foreach($p in $plan){
   $state=Get-Menu02RestoreFileState (Safe-Path $game $p.relative)
   if($state.exists -ne $p.originalExists -or $state.sha256 -cne $p.originalSha256){return $false}
  }
  return $true
 }
 $tx=Join-Path $fixture 'transaction'
 $args01=@{GameRoot=$game;Transaction=$tx;Kind=$kind;Pack=$pack;Plan=$plan;ProcessClosure={$true}}
 $rejected=$false
 try{Install-Qualification01 @args01 -AssertBaseline {$false}}catch{$rejected=$true}
 if(!$rejected -or (Test-Path -LiteralPath $tx)){throw 'Changed baseline acquired a transaction'}
 Install-Qualification01 @args01 -AssertBaseline $originalCheck
 foreach($p in $plan){if((Digest (Safe-Path $game $p.relative)) -cne $p.sha256){throw 'Staged fixture mismatch'}}
 $rejected=$false
 try{
  Restore-Qualification01 -GameRoot $game -Transaction $tx -Kind $kind -Pack $pack -Plan $plan -ProcessClosure {$false} -AssertRestoredBaseline $originalCheck
 }catch{$rejected=$true}
 if(!$rejected -or (Test-Path -LiteralPath (Join-Path $tx 'restored.json'))){throw 'Restored while process closure was uncertain'}
 Restore-Qualification01 @args01 -AssertRestoredBaseline $originalCheck
 if(!(Test-Path -LiteralPath (Join-Path $tx 'independent-baseline.json'))){throw 'Missing independent baseline evidence'}
 if($pack -and (Test-Path -LiteralPath (Join-Path $game 'mods'))){throw 'Owned temporary overlay directories remain'}
}
Write-Output "PASS both exact qualification transactions, closure refusal and independent rollback. $root"
