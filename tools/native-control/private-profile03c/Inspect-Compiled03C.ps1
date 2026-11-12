$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidence=Join-Path $repo '.local/gate-a-shvdne-private-03c/resource-probe/build-01'
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
$apiAssembly=[Reflection.Assembly]::ReflectionOnlyLoadFrom($api)
$file=Join-Path $PSScriptRoot 'build-01/RichAudio.GateAPrivate03.Shvdne.dll'
$asm=[Reflection.Assembly]::ReflectionOnlyLoadFrom($file)
$pending=New-Object 'System.Collections.Generic.Queue[Reflection.Assembly]';$pending.Enqueue($apiAssembly);$pending.Enqueue($asm)
$loaded=New-Object 'System.Collections.Generic.HashSet[string]'
while($pending.Count){$next=$pending.Dequeue();if(!$loaded.Add($next.FullName)){continue};foreach($reference in $next.GetReferencedAssemblies()){$dependency=if($reference.Name-ceq$apiAssembly.GetName().Name){$apiAssembly}elseif($reference.Name-ceq'ScriptHookVDotNet'){[Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path (Split-Path -Parent $api) 'ScriptHookVDotNet.asi'))}else{[Reflection.Assembly]::ReflectionOnlyLoad($reference.FullName)};if(!$loaded.Contains($dependency.FullName)){$pending.Enqueue($dependency)}}}
$ops=@{};foreach($f in [Reflection.Emit.OpCodes].GetFields([Reflection.BindingFlags]'Public,Static')){$op=$f.GetValue($null);$ops[[int]$op.Value-band65535]=$op}
function Decode($method){
 $body=$method.GetMethodBody();if(!$body){return @()};$b=$body.GetILAsByteArray();$list=@();$i=0
 while($i-lt$b.Length){$at=$i;$code=[int]$b[$i++];if($code-eq254){$code=65024+[int]$b[$i++]};$op=$ops[$code];if(!$op){throw 'Unknown IL opcode'};$value=$null;$len=0
  switch($op.OperandType.ToString()){
   'InlineNone'{$len=0};'ShortInlineI'{$len=1;$value=[int]$b[$i]};'ShortInlineBrTarget'{$len=1};'ShortInlineVar'{$len=1};'InlineVar'{$len=2};'InlineI8'{$len=8;$value=[BitConverter]::ToInt64($b,$i)}
   'InlineSwitch'{$count=[BitConverter]::ToInt32($b,$i);$len=4+4*$count;$value=$count}
   'InlineString'{$len=4;$value=$method.Module.ResolveString([BitConverter]::ToInt32($b,$i))}
   'InlineMethod'{$len=4;try{$value=$method.Module.ResolveMethod([BitConverter]::ToInt32($b,$i)).ToString()}catch{$value='unresolved token'}}
   'InlineField'{$len=4;$value=$method.Module.ResolveField([BitConverter]::ToInt32($b,$i)).Name}
   default{$len=4;if($op.OperandType.ToString()-eq'InlineI'){$value=[BitConverter]::ToInt32($b,$i)}}
  }
  $list+=@{offset=$at;op=$op.Name;operand=$value};$i+=$len
 }
 return $list
}
$flags=[Reflection.BindingFlags]'Public,NonPublic,Instance,Static'
$scripts=@($asm.GetTypes()|Where-Object {$_.BaseType-and$_.BaseType.FullName-ceq'GTA.Script'})
if($scripts.Count-ne1-or$scripts[0].FullName-cne'RichAudio.GateA.Private03.GateAPrivate03Script'-or$asm.GetName().Version.ToString()-cne'0.3.1.0'){throw 'Unexpected script/version'}
$apiType=$asm.GetType('RichAudio.GateA.Private03.ShvdneProfileApi')
$assign=Decode ($apiType.GetMethod('AssignPrivateProfile',$flags))
$nativeConstant=[long]0x4F0C413926060B38
if(@($assign|Where-Object {$_.op-ceq'ldc.i8'-and$_.operand-eq$nativeConstant}).Count-ne1){throw 'Expected exactly one fixed native call constant'}
if(@($assign|Where-Object {$_.op-ceq'ldstr'-and$_.operand-ceq'ra_gapriv01_bati'}).Count-ne1-or!@($assign|Where-Object {$_.op-ceq'ldstr'-and$_.operand-ceq'A'}).Count){throw 'Fixed profile and A role required'}
$allConstants=@(foreach($t in $asm.GetTypes()){foreach($m in $t.GetMethods($flags)){foreach($op in (Decode $m)){if($op.op-ceq'ldc.i8'-and$op.operand-eq$nativeConstant){$m.Name}}}})
if($allConstants.Count-ne1){throw 'More than one compiled setter location'}
$keys=Decode ($scripts[0].GetMethod('OnKeyDown',$flags))
if(!@($keys|Where-Object {$_.op-ceq'switch'-and$_.operand-eq6}).Count-or!@($keys|Where-Object {$_.op-ceq'ldc.i4.s'-and$_.operand-eq116}).Count){throw 'Expected Ctrl+Shift F5-F10 six-command range'}
$request=Decode ($asm.GetType('RichAudio.GateA.Private03.ProfileAssignmentController').GetMethod('RequestAssignment',$flags))
if(!@($request|Where-Object {$_.op-ceq'call'-and$_.operand-like'*get_BaselineAccepted*'}).Count){throw 'Compiled baseline entry gate absent'}
$binding=Decode ($asm.GetType('RichAudio.GateA.Private03.PrivateCandidateBinding').TypeInitializer)
foreach($pin in (Get-Content -LiteralPath (Join-Path $repo '.local/gate-a-shvdne-private-03/compiled-resource-pins.json') -Raw|ConvertFrom-Json)){foreach($value in @($pin.relative,$pin.sha256)){if(!@($binding|Where-Object {$_.op-ceq'ldstr'-and$_.operand-ceq$value}).Count){throw 'Compiled resource pin absent'}}}
$ini=Get-Content -LiteralPath (Join-Path $evidence 'RichAudio.GateAPrivate03C.Shvdne.ini') -Raw
if($ini-notmatch'(?m)^Enabled=false\r?$'-or$ini-match'(?m)^Enabled=true\r?$'){throw 'Default config must remain disabled'}
$controllerType=$asm.GetType('RichAudio.GateA.Private03.ProfileAssignmentController')
$spawn=Decode ($controllerType.GetMethod('RequestSpawn',$flags))
$tick=Decode ($controllerType.GetMethod('Tick',$flags))
$baseline=Decode ($controllerType.GetMethod('ConfirmBaseline',$flags))
foreach($cutoff in @('baselineCutoff','assignmentCutoff','retirementCutoff')){if(!@($spawn|Where-Object {$_.op-ceq'stfld'-and$_.operand-ceq$cutoff}).Count){throw ('Compiled phase origin missing: '+$cutoff)}}
foreach($number in @(80,100,140)){if(!@($spawn|Where-Object {$_.op-in@('ldc.i4','ldc.i4.s')-and$_.operand-eq$number}).Count){throw 'Compiled phase duration missing'}}
foreach($reason in @('baseline-decision-80-second-limit','assignment-100-second-limit','retirement-140-second-limit','3-minute-active-limit')){if(!@($tick|Where-Object {$_.op-ceq'ldstr'-and$_.operand-ceq$reason}).Count){throw ('Compiled independent stop missing: '+$reason)}}
if(!@($baseline|Where-Object {$_.op-ceq'ldfld'-and$_.operand-ceq'baselineCutoff'}).Count-or!@($request|Where-Object {$_.op-ceq'ldfld'-and$_.operand-ceq'assignmentCutoff'}).Count){throw 'Compiled command phase gate missing'}
$phase=[ordered]@{passed=$true;candidateSha256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant();assemblyVersion=$asm.GetName().Version.ToString();scope='Reflection-only actual IL; no candidate initialization or game call';baselineCutoffMs=80000;assignmentCutoffMs=100000;normalRetirementMs=140000;absoluteActiveMs=180000;sharedSpawnOriginVerified=$true;commandAndTickGatesVerified=$true;requestSpawnIL=$spawn;tickIL=$tick;baselineIL=$baseline}
if(Test-Path -LiteralPath (Join-Path $evidence 'compiled-phase-inspection.json')){throw 'Fresh inspection output required'}
$phase|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $evidence 'compiled-phase-inspection.json') -Encoding UTF8
[ordered]@{passed=$true;method='Reflection-only metadata and decoded actual IL; no candidate execution';assemblyVersion=$asm.GetName().Version.ToString();scripts=@($scripts|ForEach-Object FullName);setterLocations=$allConstants;fixedNative='4F0C413926060B38';fixedProfile='ra_gapriv01_bati';targetRole='A';commands='Ctrl+Shift+F5 through F10 only; F10 baseline review, F6 arm, F7 confirm, F8 snapshot, F9 stop';defaultEnabled=$false;compiledBaselineGate=$true;compiledPinsVerified=$true;assignmentIL=$assign;commandIL=$keys;candidateSha256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()}|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $evidence 'compiled-inspection.json') -Encoding UTF8
Write-Output 'PASS actual compiled candidate metadata, six-command range, baseline gate, fixed A setter and resource pins.'
