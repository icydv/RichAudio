# Shared original research software boundary. This never discovers a tool/game install.
function Get-CodeWalkerResearchInputs10 {
 param([Parameter(Mandatory)][string]$ResearchCoreRoot)
 $repo10=Split-Path $PSScriptRoot -Parent
 $root10=[IO.Path]::GetFullPath($ResearchCoreRoot)
 if(!$root10.StartsWith((Join-Path $repo10 '.local')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Only current-checkout retained research software is admitted; no official DLL is qualified'}
 foreach($path10 in @($root10)){
  for($at10=$path10;$at10;$at10=[IO.Path]::GetDirectoryName($at10)){
   if((Get-Item -LiteralPath $at10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked research software path refused'}
  }
 }
 $receipt10=Join-Path $root10 'provider-build08.json'
 if((Get-Item -LiteralPath $receipt10 -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked research receipt refused'}
 $build10=Get-Content -LiteralPath $receipt10 -Raw|ConvertFrom-Json
 if(!$build10.passed-or$build10.officialBinaryClaimed-or$build10.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or$build10.proprietaryPayloadIncluded-or$build10.coreSHA256-cne'f58d70197c8c8a6d17b36567649d8b799a82a3ae686ee0bab7e87f9d6466c547'){throw 'Exact retained research provenance required'}
 $pins10=@(@{file='CodeWalker.Core.dll';sha256=$build10.coreSHA256})+@($build10.dependencies|ForEach-Object{@{file=$_.file;sha256=$_.sha256}})
 if(($pins10.file|Sort-Object)-join',' -cne 'CodeWalker.Core.dll,SharpDX.dll,SharpDX.Mathematics.dll'){throw 'Exact three research software references required'}
 $expected10=@{'CodeWalker.Core.dll'='f58d70197c8c8a6d17b36567649d8b799a82a3ae686ee0bab7e87f9d6466c547';'SharpDX.dll'='a0af255ea4b09a8cdb995b8c6fd1075e46f098e23c2351c974e6ded9b8b620cf';'SharpDX.Mathematics.dll'='4c9615496970ea84320e2a6e99f8fb828e3c7790384df5585d93fc368885d94e'}
 foreach($pin10 in $pins10){
  if($pin10.sha256-cne$expected10[$pin10.file]){throw 'Exact pinned research dependency identity required'}
  $path10=Join-Path $root10 $pin10.file
  $item10=Get-Item -LiteralPath $path10 -Force
  if(($item10.Attributes-band[IO.FileAttributes]::ReparsePoint)-or$item10.Length-gt33554432){throw 'Bounded nonlinked research software required'}
  if((Get-FileHash -LiteralPath $path10 -Algorithm SHA256).Hash.ToLowerInvariant()-cne$pin10.sha256){throw 'Retained research software changed'}
 }
 [pscustomobject]@{root=$root10;receipt=$receipt10;pins=$pins10;build=$build10}
}
